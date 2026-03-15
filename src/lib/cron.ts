/**
 * Membership Expiry Cron — daily check for expiring/expired memberships.
 *
 * Workflow (project plan §6.5):
 *   1. Find all users where membershipStatus = ACTIVE and membershipExpiry is not null.
 *   2. Users whose expiry is <= EXPIRY_REMINDER_DAYS (15) days away → send reminder notification.
 *   3. Users whose expiry date < today → mark EXPIRED, update sub-member statuses,
 *      send expired notification, log to audit + activity.
 *
 * Exports:
 *   checkMembershipExpiry() — main expiry check
 *   runDailyCron()          — wrapper that calls checkMembershipExpiry + future daily tasks
 */

import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { EXPIRY_REMINDER_DAYS } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CronResult {
  /** Total ACTIVE users with a non-null expiry date examined */
  processed: number;
  /** Users whose reminder was triggered (expiry within 15 days, not yet expired) */
  reminded: number;
  /** Users who were just moved to EXPIRED status */
  expired: number;
}

// ---------------------------------------------------------------------------
// Helper: get or create a SYSTEM user for automated log entries
// ---------------------------------------------------------------------------

/**
 * Returns the SYSTEM user for automated action attribution.
 * The SYSTEM user is guaranteed to exist after the seed or first run.
 */
async function getSystemUser(): Promise<{ id: string }> {
  const existing = await prisma.user.findUnique({
    where: { email: "SYSTEM@dps-dashboard.internal" },
    select: { id: true },
  });
  if (existing) return existing;

  // Create on first run — this path is only hit before seed runs
  return prisma.user.create({
    data: {
      email: "SYSTEM@dps-dashboard.internal",
      name: "System",
      memberId: "DPS-SYSTEM-0000-00",
      phone: "+910000000000",
      address: "System",
      password: "",
      isTempPassword: false,
      role: "ADMIN",
      membershipStatus: "ACTIVE",
      applicationFeePaid: false,
    },
  });
}

// ---------------------------------------------------------------------------
// Helper: call notification service if available — graceful skip otherwise
// ---------------------------------------------------------------------------

/**
 * Attempt to call notification-service functions for expiry reminders.
 * Gracefully no-ops if the notification service is not yet implemented
 * (T18 may still be a placeholder when this runs).
 */
async function tryNotifyExpiryReminder(
  userId: string,
  daysLeft: number
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;
    const mod = await import("@/lib/services/notification-service").catch(
      () => null
    );
    if (mod && typeof mod.notifyMembershipExpiryReminder === "function") {
      await mod.notifyMembershipExpiryReminder(user, daysLeft);
    } else {
      console.info(
        `[cron] Expiry reminder notification skipped for user ${userId} — notification service not configured`
      );
    }
  } catch (err) {
    // Never throw from notification calls — log and continue
    console.error(
      `[cron] Failed to send expiry reminder for user ${userId}:`,
      err
    );
  }
}

/**
 * Attempt to call notification-service functions for expired memberships.
 * Gracefully no-ops if the notification service is not yet implemented.
 */
async function tryNotifyMembershipExpired(userId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;
    const mod = await import("@/lib/services/notification-service").catch(
      () => null
    );
    if (mod && typeof mod.notifyMembershipExpired === "function") {
      await mod.notifyMembershipExpired(user);
    } else {
      console.info(
        `[cron] Expiry notification skipped for user ${userId} — notification service not configured`
      );
    }
  } catch (err) {
    console.error(
      `[cron] Failed to send expiry notification for user ${userId}:`,
      err
    );
  }
}

// ---------------------------------------------------------------------------
// Main cron logic
// ---------------------------------------------------------------------------

/**
 * Returns today's date at midnight UTC — used for expiry comparisons.
 * Exported so tests can spy on it.
 */
export function getTodayUTC(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

/**
 * Returns a date that is `days` days after `from`, at midnight UTC.
 */
export function addDaysUTC(from: Date, days: number): Date {
  const result = new Date(from.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Checks all active memberships and:
 *   - Sends 15-day expiry reminder for users expiring soon.
 *   - Marks expired users (and their sub-members) as EXPIRED.
 *   - Writes audit + activity log entries.
 *
 * @returns Summary counts of processed / reminded / expired users.
 */
export async function checkMembershipExpiry(): Promise<CronResult> {
  const systemUser = await getSystemUser();

  const today = getTodayUTC();
  const reminderCutoff = addDaysUTC(today, EXPIRY_REMINDER_DAYS);

  // Fetch all ACTIVE users with a non-null expiry date
  const activeUsers = await prisma.user.findMany({
    where: {
      membershipStatus: "ACTIVE",
      membershipExpiry: { not: null },
    },
    select: {
      id: true,
      memberId: true,
      name: true,
      membershipExpiry: true,
      membershipStatus: true,
      subMembers: {
        select: { id: true, memberId: true, name: true },
      },
    },
  });

  let reminded = 0;
  let expired = 0;

  for (const user of activeUsers) {
    const expiry = user.membershipExpiry!;
    // Normalise to midnight UTC for comparison
    const expiryUTC = new Date(
      Date.UTC(expiry.getFullYear(), expiry.getMonth(), expiry.getDate())
    );

    if (expiryUTC < today) {
      // ----- User has expired -----
      await prisma.$transaction(async (tx) => {
        // Update user status
        await tx.user.update({
          where: { id: user.id },
          data: { membershipStatus: "EXPIRED" },
        });

        // Update sub-members' parent user status is on User, not SubMember.
        // The Member record (if linked) should also be updated.
        await tx.member.updateMany({
          where: { userId: user.id },
          data: { membershipStatus: "EXPIRED" },
        });
      });

      // Write activity log
      await logActivity({
        userId: systemUser.id,
        action: "membership_expired",
        description: `Membership expired for ${user.name} (${user.memberId})`,
        metadata: {
          userId: user.id,
          memberId: user.memberId,
          membershipExpiry: user.membershipExpiry?.toISOString(),
        },
      });

      // Notify member + sub-members + admin + operator
      await tryNotifyMembershipExpired(user.id);

      expired++;
    } else if (expiryUTC <= reminderCutoff) {
      // ----- Expiry within reminder window (not yet expired) -----

      // Write activity log for reminder
      await logActivity({
        userId: systemUser.id,
        action: "membership_expiry_reminder_sent",
        description: `Membership expiry reminder sent to ${user.name} (${user.memberId}) — expires ${expiry.toISOString().split("T")[0]}`,
        metadata: {
          userId: user.id,
          memberId: user.memberId,
          membershipExpiry: user.membershipExpiry?.toISOString(),
          daysUntilExpiry: Math.ceil(
            (expiryUTC.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
          ),
        },
      });

      // Notify member + sub-members
      const daysLeft = Math.ceil(
        (expiryUTC.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      await tryNotifyExpiryReminder(user.id, daysLeft);

      reminded++;
    }
    // else: more than EXPIRY_REMINDER_DAYS away — no action
  }

  return {
    processed: activeUsers.length,
    reminded,
    expired,
  };
}

/**
 * Daily cron wrapper — calls checkMembershipExpiry and any future daily tasks.
 * Designed to be triggered by:
 *   - External cron service via POST /api/cron (with x-cron-secret header)
 *   - Manual admin trigger via the same API route
 */
export async function runDailyCron(): Promise<CronResult> {
  console.info("[cron] Running daily membership expiry check…");
  const result = await checkMembershipExpiry();
  console.info(
    `[cron] Completed — processed: ${result.processed}, reminded: ${result.reminded}, expired: ${result.expired}`
  );
  return result;
}
