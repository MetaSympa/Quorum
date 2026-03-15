/**
 * POST /api/notifications/whatsapp
 *
 * Manually trigger a WhatsApp notification re-send.
 * Admin only.
 *
 * Request body:
 *   {
 *     type: "approval" | "payment" | "new_member" | "membership_approved"
 *           | "expiry_reminder" | "membership_expired" | "sponsor_payment"
 *           | "rejection",
 *     entityId: string   // UUID of the entity to re-notify about
 *   }
 *
 * Response:
 *   200 { success: true, sent: number, failed: number }
 *   400 { error: "Validation failed", details: ... }
 *   401 { error: "Unauthorized" }
 *   403 { error: "Forbidden" }
 *   404 { error: "Entity not found" }
 *   500 { error: "Internal server error" }
 */

import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import { requireRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  notifyNewApprovalRequest,
  notifyPaymentReceived,
  notifyNewMemberRegistration,
  notifyMembershipApproved,
  notifyMembershipExpiryReminder,
  notifyMembershipExpired,
  notifySponsorPayment,
  notifyRejection,
} from "@/lib/services/notification-service";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const triggerNotificationSchema = z.object({
  type: z.enum([
    "approval",
    "payment",
    "new_member",
    "membership_approved",
    "expiry_reminder",
    "membership_expired",
    "sponsor_payment",
    "rejection",
  ]),
  entityId: z.string().uuid("entityId must be a valid UUID"),
  /** Optional: temp password to include in membership_approved re-sends */
  tempPassword: z.string().optional(),
  /** Optional: operator user ID for rejection re-sends */
  operatorId: z.string().uuid().optional(),
});

export type TriggerNotificationInput = z.infer<typeof triggerNotificationSchema>;

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    // --- Auth ---
    const session = await getAuthSession(request);
    requireRole(session, "ADMIN");

    // --- Parse + validate body ---
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parsed = triggerNotificationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { type, entityId, tempPassword, operatorId } = parsed.data;

    // --- Dispatch by type ---
    let result = { sent: 0, failed: 0 };

    switch (type) {
      case "approval": {
        const approval = await prisma.approval.findUnique({
          where: { id: entityId },
          include: { requestedBy: { select: { name: true } } },
        });
        if (!approval) {
          return NextResponse.json({ error: "Approval not found" }, { status: 404 });
        }
        result = await notifyNewApprovalRequest(approval);
        break;
      }

      case "payment": {
        const transaction = await prisma.transaction.findUnique({
          where: { id: entityId },
          include: { member: { select: { name: true } } },
        });
        if (!transaction) {
          return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
        }
        result = await notifyPaymentReceived(transaction);
        break;
      }

      case "new_member": {
        const user = await prisma.user.findUnique({
          where: { id: entityId },
        });
        if (!user) {
          return NextResponse.json({ error: "User not found" }, { status: 404 });
        }
        result = await notifyNewMemberRegistration(user);
        break;
      }

      case "membership_approved": {
        const user = await prisma.user.findUnique({
          where: { id: entityId },
        });
        if (!user) {
          return NextResponse.json({ error: "User not found" }, { status: 404 });
        }
        const loginUrl =
          process.env.NEXT_PUBLIC_APP_URL
            ? `${process.env.NEXT_PUBLIC_APP_URL}/login`
            : "https://dps-dashboard.example.com/login";
        const password = tempPassword ?? "(check with admin)";
        result = await notifyMembershipApproved(user, password, loginUrl);
        break;
      }

      case "expiry_reminder": {
        const user = await prisma.user.findUnique({
          where: { id: entityId },
        });
        if (!user) {
          return NextResponse.json({ error: "User not found" }, { status: 404 });
        }
        const today = new Date();
        const expiry = user.membershipExpiry ?? today;
        const msPerDay = 1000 * 60 * 60 * 24;
        const daysLeft = Math.ceil(
          (expiry.getTime() - today.getTime()) / msPerDay
        );
        result = await notifyMembershipExpiryReminder(user, Math.max(daysLeft, 0));
        break;
      }

      case "membership_expired": {
        const user = await prisma.user.findUnique({
          where: { id: entityId },
        });
        if (!user) {
          return NextResponse.json({ error: "User not found" }, { status: 404 });
        }
        result = await notifyMembershipExpired(user);
        break;
      }

      case "sponsor_payment": {
        const transaction = await prisma.transaction.findUnique({
          where: { id: entityId },
          include: { sponsor: true },
        });
        if (!transaction) {
          return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
        }
        if (!transaction.sponsor) {
          return NextResponse.json(
            { error: "Transaction has no linked sponsor" },
            { status: 400 }
          );
        }
        result = await notifySponsorPayment(transaction, transaction.sponsor);
        break;
      }

      case "rejection": {
        const approval = await prisma.approval.findUnique({
          where: { id: entityId },
        });
        if (!approval) {
          return NextResponse.json({ error: "Approval not found" }, { status: 404 });
        }
        if (!operatorId) {
          return NextResponse.json(
            { error: "operatorId is required for rejection notifications" },
            { status: 400 }
          );
        }
        const operator = await prisma.user.findUnique({
          where: { id: operatorId },
          select: { id: true, phone: true, name: true },
        });
        if (!operator) {
          return NextResponse.json({ error: "Operator not found" }, { status: 404 });
        }
        result = await notifyRejection(approval, operator);
        break;
      }
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const error = err as Error & { status?: number };
    if (error.status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error.status === 403) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[api/notifications/whatsapp] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
