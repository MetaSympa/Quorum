/**
 * Notification Service — high-level WhatsApp notification functions.
 *
 * Each function:
 *   1. Resolves the entity from the DB
 *   2. Determines the recipient set (admins, operators, member, sub-members)
 *   3. Calls whatsapp.sendMessage for each recipient
 *   4. Logs the outcome to ActivityLog (regardless of WhatsApp success)
 *   5. Returns { sent, failed }
 *
 * Design rules:
 *   - Never throws — all DB and WhatsApp failures are caught and logged
 *   - If WhatsApp is not configured, messages are skipped silently (log debug only)
 *   - All notifications are logged to ActivityLog so there's an audit trail
 *     even when WhatsApp is not set up
 */

import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { sendMessage } from "@/lib/whatsapp";
import type { Approval, Transaction, Sponsor, User } from "@prisma/client";

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

/**
 * Pre-approved Meta WhatsApp Business template names and their parameter order.
 * Template bodies must be registered in the Meta Business Manager before use.
 *
 * Parameter substitution: each string in `params` maps to {{1}}, {{2}}, … in
 * the template body in the order listed.
 */
export const TEMPLATES = {
  NEW_APPROVAL: {
    name: "new_approval_request",
    params: ["entity_type", "requester_name"] as const,
  },
  PAYMENT_RECEIVED: {
    name: "payment_received",
    params: ["amount", "member_name", "payment_mode"] as const,
  },
  NEW_MEMBER: {
    name: "new_member_registration",
    params: ["member_name", "member_id"] as const,
  },
  MEMBERSHIP_APPROVED: {
    name: "membership_approved",
    params: ["member_name", "login_url", "email", "temp_password"] as const,
  },
  EXPIRY_REMINDER: {
    name: "expiry_reminder",
    params: ["member_name", "days_left", "expiry_date"] as const,
  },
  MEMBERSHIP_EXPIRED: {
    name: "membership_expired",
    params: ["member_name", "member_id"] as const,
  },
  SPONSOR_PAYMENT: {
    name: "sponsor_payment",
    params: ["sponsor_name", "amount", "purpose"] as const,
  },
  REJECTION: {
    name: "rejection_notice",
    params: ["entity_type", "reason"] as const,
  },
} as const;

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface NotificationResult {
  sent: number;
  failed: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Fetch all admin and operator users with a phone number. */
async function getAdminsAndOperators(): Promise<
  Array<{ id: string; phone: string; name: string }>
> {
  return prisma.user.findMany({
    where: { role: { in: ["ADMIN", "OPERATOR"] } },
    select: { id: true, phone: true, name: true },
  });
}

/** Find a system user for activity logging when no actor is known. */
async function getSystemUserId(): Promise<string> {
  const systemUser = await prisma.user.findFirst({
    where: { email: "SYSTEM@dps-dashboard.internal" },
    select: { id: true },
  });
  // Fall back to first admin if system user doesn't exist yet
  if (systemUser) return systemUser.id;
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  return admin?.id ?? "system";
}

/**
 * Sends to a list of (id, phone) recipients and returns { sent, failed }.
 * Each WhatsApp failure is caught individually so one bad number doesn't
 * stop the others.
 */
async function sendToRecipients(
  recipients: Array<{ phone: string }>,
  templateName: string,
  params: string[]
): Promise<NotificationResult> {
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const result = await sendMessage(recipient.phone, templateName, params);
    if (result.success) {
      sent++;
    } else {
      failed++;
    }
  }

  return { sent, failed };
}

/** Formats a JS Date as DD/MM/YYYY for display in messages. */
function formatDate(date: Date): string {
  const d = date.getDate().toString().padStart(2, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

// ---------------------------------------------------------------------------
// Public notification functions
// ---------------------------------------------------------------------------

/**
 * Notify admins and operators about a new approval request.
 *
 * @param approval  The newly created Approval record (must include requestedBy relation)
 */
export async function notifyNewApprovalRequest(
  approval: Approval & { requestedBy?: { name: string } | null }
): Promise<NotificationResult> {
  const systemUserId = await getSystemUserId();
  const result: NotificationResult = { sent: 0, failed: 0 };

  try {
    const recipients = await getAdminsAndOperators();
    if (recipients.length > 0) {
      const entityType = approval.entityType.replace(/_/g, " ");
      const requesterName = approval.requestedBy?.name ?? "Unknown";

      const r = await sendToRecipients(
        recipients,
        TEMPLATES.NEW_APPROVAL.name,
        [entityType, requesterName]
      );
      result.sent += r.sent;
      result.failed += r.failed;
    }
  } catch (err) {
    console.error("[notifications] notifyNewApprovalRequest error:", err);
  }

  await logActivity({
    userId: systemUserId,
    action: "whatsapp_notification_sent",
    description: `New approval request notification: sent=${result.sent} failed=${result.failed}`,
    metadata: { approvalId: approval.id, entityType: approval.entityType, sent: result.sent, failed: result.failed },
  });

  return result;
}

/**
 * Notify admins and operators that a payment was received.
 *
 * @param transaction  The Transaction record (may include member relation)
 */
export async function notifyPaymentReceived(
  transaction: Transaction & { member?: { name: string } | null }
): Promise<NotificationResult> {
  const systemUserId = await getSystemUserId();
  const result: NotificationResult = { sent: 0, failed: 0 };

  try {
    const recipients = await getAdminsAndOperators();
    if (recipients.length > 0) {
      const amount = `Rs. ${Number(transaction.amount).toFixed(2)}`;
      const memberName = transaction.member?.name ?? transaction.senderName ?? "Unknown";
      const paymentMode = transaction.paymentMode;

      const r = await sendToRecipients(
        recipients,
        TEMPLATES.PAYMENT_RECEIVED.name,
        [amount, memberName, paymentMode]
      );
      result.sent += r.sent;
      result.failed += r.failed;
    }
  } catch (err) {
    console.error("[notifications] notifyPaymentReceived error:", err);
  }

  await logActivity({
    userId: systemUserId,
    action: "whatsapp_notification_sent",
    description: `Payment received notification: sent=${result.sent} failed=${result.failed}`,
    metadata: { transactionId: transaction.id, amount: transaction.amount.toString(), sent: result.sent, failed: result.failed },
  });

  return result;
}

/**
 * Notify admins and operators about a new member registration.
 *
 * @param member  User record of the new member
 */
export async function notifyNewMemberRegistration(
  member: User
): Promise<NotificationResult> {
  const systemUserId = await getSystemUserId();
  const result: NotificationResult = { sent: 0, failed: 0 };

  try {
    const recipients = await getAdminsAndOperators();
    if (recipients.length > 0) {
      const r = await sendToRecipients(
        recipients,
        TEMPLATES.NEW_MEMBER.name,
        [member.name, member.memberId]
      );
      result.sent += r.sent;
      result.failed += r.failed;
    }
  } catch (err) {
    console.error("[notifications] notifyNewMemberRegistration error:", err);
  }

  await logActivity({
    userId: systemUserId,
    action: "whatsapp_notification_sent",
    description: `New member registration notification: sent=${result.sent} failed=${result.failed}`,
    metadata: { memberId: member.id, memberMemberId: member.memberId, sent: result.sent, failed: result.failed },
  });

  return result;
}

/**
 * Notify admins, operators, the member, and all sub-members that a membership
 * was approved. The member notification includes their login URL, email, and
 * temporary password.
 *
 * @param user          The approved User record (must include phone)
 * @param tempPassword  Plaintext temporary password generated for the member
 * @param loginUrl      Full URL to the login page (e.g. https://dps.example.com/login)
 */
export async function notifyMembershipApproved(
  user: User,
  tempPassword: string,
  loginUrl: string
): Promise<NotificationResult> {
  const systemUserId = await getSystemUserId();
  const result: NotificationResult = { sent: 0, failed: 0 };

  try {
    // Admin + operator
    const staff = await getAdminsAndOperators();
    if (staff.length > 0) {
      const r = await sendToRecipients(
        staff,
        TEMPLATES.MEMBERSHIP_APPROVED.name,
        [user.name, loginUrl, user.email, tempPassword]
      );
      result.sent += r.sent;
      result.failed += r.failed;
    }

    // Member themselves
    const memberResult = await sendMessage(
      user.phone,
      TEMPLATES.MEMBERSHIP_APPROVED.name,
      [user.name, loginUrl, user.email, tempPassword]
    );
    memberResult.success ? result.sent++ : result.failed++;

    // Sub-members
    const subMembers = await prisma.subMember.findMany({
      where: { parentUserId: user.id },
      select: { phone: true },
    });
    for (const sub of subMembers) {
      const r = await sendMessage(
        sub.phone,
        TEMPLATES.MEMBERSHIP_APPROVED.name,
        [user.name, loginUrl, user.email, tempPassword]
      );
      r.success ? result.sent++ : result.failed++;
    }
  } catch (err) {
    console.error("[notifications] notifyMembershipApproved error:", err);
  }

  await logActivity({
    userId: systemUserId,
    action: "whatsapp_notification_sent",
    description: `Membership approved notification: sent=${result.sent} failed=${result.failed}`,
    metadata: { userId: user.id, memberId: user.memberId, sent: result.sent, failed: result.failed },
  });

  return result;
}

/**
 * Remind a member and their sub-members that their membership is expiring soon.
 *
 * @param user      The User record (with membershipExpiry)
 * @param daysLeft  Number of days until expiry
 */
export async function notifyMembershipExpiryReminder(
  user: User,
  daysLeft: number
): Promise<NotificationResult> {
  const systemUserId = await getSystemUserId();
  const result: NotificationResult = { sent: 0, failed: 0 };

  try {
    const expiryDate = user.membershipExpiry
      ? formatDate(user.membershipExpiry)
      : "N/A";

    // Member
    const memberResult = await sendMessage(
      user.phone,
      TEMPLATES.EXPIRY_REMINDER.name,
      [user.name, String(daysLeft), expiryDate]
    );
    memberResult.success ? result.sent++ : result.failed++;

    // Sub-members
    const subMembers = await prisma.subMember.findMany({
      where: { parentUserId: user.id },
      select: { phone: true },
    });
    for (const sub of subMembers) {
      const r = await sendMessage(
        sub.phone,
        TEMPLATES.EXPIRY_REMINDER.name,
        [user.name, String(daysLeft), expiryDate]
      );
      r.success ? result.sent++ : result.failed++;
    }
  } catch (err) {
    console.error("[notifications] notifyMembershipExpiryReminder error:", err);
  }

  await logActivity({
    userId: systemUserId,
    action: "whatsapp_notification_sent",
    description: `Membership expiry reminder notification (${daysLeft} days): sent=${result.sent} failed=${result.failed}`,
    metadata: { userId: user.id, memberId: user.memberId, daysLeft, sent: result.sent, failed: result.failed },
  });

  return result;
}

/**
 * Notify a member, sub-members, admins, and operators that a membership has expired.
 *
 * @param user  The User record whose membership expired
 */
export async function notifyMembershipExpired(
  user: User
): Promise<NotificationResult> {
  const systemUserId = await getSystemUserId();
  const result: NotificationResult = { sent: 0, failed: 0 };

  try {
    // Member
    const memberResult = await sendMessage(
      user.phone,
      TEMPLATES.MEMBERSHIP_EXPIRED.name,
      [user.name, user.memberId]
    );
    memberResult.success ? result.sent++ : result.failed++;

    // Sub-members
    const subMembers = await prisma.subMember.findMany({
      where: { parentUserId: user.id },
      select: { phone: true },
    });
    for (const sub of subMembers) {
      const r = await sendMessage(
        sub.phone,
        TEMPLATES.MEMBERSHIP_EXPIRED.name,
        [user.name, user.memberId]
      );
      r.success ? result.sent++ : result.failed++;
    }

    // Admin + operator
    const staff = await getAdminsAndOperators();
    if (staff.length > 0) {
      const r = await sendToRecipients(
        staff,
        TEMPLATES.MEMBERSHIP_EXPIRED.name,
        [user.name, user.memberId]
      );
      result.sent += r.sent;
      result.failed += r.failed;
    }
  } catch (err) {
    console.error("[notifications] notifyMembershipExpired error:", err);
  }

  await logActivity({
    userId: systemUserId,
    action: "whatsapp_notification_sent",
    description: `Membership expired notification: sent=${result.sent} failed=${result.failed}`,
    metadata: { userId: user.id, memberId: user.memberId, sent: result.sent, failed: result.failed },
  });

  return result;
}

/**
 * Notify admins and operators about a sponsor payment.
 *
 * @param transaction  The sponsorship Transaction record
 * @param sponsor      The Sponsor record linked to the transaction
 */
export async function notifySponsorPayment(
  transaction: Transaction,
  sponsor: Sponsor
): Promise<NotificationResult> {
  const systemUserId = await getSystemUserId();
  const result: NotificationResult = { sent: 0, failed: 0 };

  try {
    const recipients = await getAdminsAndOperators();
    if (recipients.length > 0) {
      const amount = `Rs. ${Number(transaction.amount).toFixed(2)}`;
      const purpose = transaction.sponsorPurpose
        ? transaction.sponsorPurpose.replace(/_/g, " ")
        : "Sponsorship";

      const r = await sendToRecipients(
        recipients,
        TEMPLATES.SPONSOR_PAYMENT.name,
        [sponsor.name, amount, purpose]
      );
      result.sent += r.sent;
      result.failed += r.failed;
    }
  } catch (err) {
    console.error("[notifications] notifySponsorPayment error:", err);
  }

  await logActivity({
    userId: systemUserId,
    action: "whatsapp_notification_sent",
    description: `Sponsor payment notification: sent=${result.sent} failed=${result.failed}`,
    metadata: { transactionId: transaction.id, sponsorId: sponsor.id, amount: transaction.amount.toString(), sent: result.sent, failed: result.failed },
  });

  return result;
}

/**
 * Notify the operator who submitted an approval request that it was rejected.
 *
 * @param approval   The rejected Approval record (must include requestedBy + requestedBy.phone)
 * @param operator   The User record of the operator who submitted the request
 */
export async function notifyRejection(
  approval: Approval,
  operator: { id: string; phone: string; name: string }
): Promise<NotificationResult> {
  const systemUserId = await getSystemUserId();
  const result: NotificationResult = { sent: 0, failed: 0 };

  try {
    const entityType = approval.entityType.replace(/_/g, " ");
    const reason = approval.notes ?? "No reason provided";

    const r = await sendMessage(
      operator.phone,
      TEMPLATES.REJECTION.name,
      [entityType, reason]
    );
    r.success ? result.sent++ : result.failed++;
  } catch (err) {
    console.error("[notifications] notifyRejection error:", err);
  }

  await logActivity({
    userId: systemUserId,
    action: "whatsapp_notification_sent",
    description: `Rejection notification to operator: sent=${result.sent} failed=${result.failed}`,
    metadata: { approvalId: approval.id, operatorId: operator.id, entityType: approval.entityType, sent: result.sent, failed: result.failed },
  });

  return result;
}
