/**
 * POST /api/webhooks/razorpay
 *
 * Razorpay webhook handler — T13 / T25.
 *
 * NO SESSION AUTH — verified by HMAC-SHA256 signature instead.
 *
 * Security (T25):
 *   - Raw body is read with request.text() BEFORE any JSON parsing.
 *   - HMAC-SHA256 verification (verifyWebhookSignature) is called as the FIRST
 *     processing step — before any DB access or payload parsing.
 *   - Timing-safe comparison is used inside verifyWebhookSignature (Buffer timingSafeEqual).
 *   - Invalid signatures return HTTP 401 (not 200) to signal rejection to the caller.
 *     NOTE: Razorpay will retry on non-200, so 401 is intentional — it lets us audit
 *     rejected attempts while preventing replay of malformed payloads.
 *   - Rejected webhook attempts are logged to the ActivityLog (system user) so
 *     administrators can detect replay/spoofing attempts.
 *
 * For valid captured payments:
 *   1. Verify HMAC signature — 401 on failure.
 *   2. Check idempotency — skip if razorpayPaymentId already in Transaction table.
 *   3. Parse order notes to determine payment purpose (membership vs. sponsor).
 *   4. Create Transaction record (approvalSource=RAZORPAY_WEBHOOK, auto-approved).
 *   5. If membership payment: create/update Membership + update User subscription fields.
 *   6. Auto-generate receipt number.
 *   7. Log to AuditLog + ActivityLog.
 *
 * System user:
 *   Auto-detected payments are entered by the SYSTEM user
 *   (email: system@dps-dashboard.internal). This user is fetched once per
 *   webhook invocation and cached in module scope.
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature, paiseToRupees } from "@/lib/razorpay";
import { logAudit, logActivity } from "@/lib/audit";
import { MEMBERSHIP_FEES, APPLICATION_FEE } from "@/types";
import type { MembershipType, SponsorPurpose } from "@/types";
import {
  rateLimit,
  getRateLimitKey,
  WEBHOOK_RATE_LIMIT,
} from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Special memberId used for the system account that auto-records Razorpay payments. */
const SYSTEM_MEMBER_ID = "SYSTEM-0000-0000-00";

/** Email address of the system user — matches seed.ts / find-or-create logic below. */
const SYSTEM_EMAIL = "system@dps-dashboard.internal";

// ---------------------------------------------------------------------------
// Razorpay webhook payload shapes (minimum fields we use)
// ---------------------------------------------------------------------------

interface RazorpayPaymentEntity {
  id: string;
  order_id: string;
  amount: number; // paise
  currency: string;
  status: string;
  method: "upi" | "card" | "netbanking" | "bank_transfer" | "wallet" | string;
  vpa?: string; // UPI VPA
  bank?: string; // bank name for bank transfer
  contact?: string; // phone
  description?: string;
  notes?: Record<string, string>;
  acquirer_data?: {
    bank_transaction_id?: string;
    upi_transaction_id?: string;
  };
  bank_transfer?: {
    id?: string;
    bank_account?: {
      id?: string;
      account_number?: string;
      name?: string;
      ifsc?: string;
      bank_name?: string;
    };
    payer_bank_account?: {
      id?: string;
      account_number?: string;
      name?: string;
      ifsc?: string;
      bank_name?: string;
    };
  };
}

interface RazorpayWebhookPayload {
  event: string;
  payload: {
    payment?: {
      entity: RazorpayPaymentEntity;
    };
    virtual_account?: {
      entity: {
        id: string;
        description?: string;
        amount_expected?: number;
        close_by?: number;
      };
    };
  };
  created_at: number;
}

// ---------------------------------------------------------------------------
// System user helper
// ---------------------------------------------------------------------------

let systemUserId: string | null = null;

/**
 * Find or create the SYSTEM user that owns all auto-detected Razorpay transactions.
 * Result is cached in module scope for the lifetime of the process.
 */
async function getOrCreateSystemUser(): Promise<string> {
  if (systemUserId) return systemUserId;

  const existing = await prisma.user.findUnique({
    where: { email: SYSTEM_EMAIL },
    select: { id: true },
  });

  if (existing) {
    systemUserId = existing.id;
    return systemUserId;
  }

  // Create the system user — this should only happen once per fresh database
  const created = await prisma.user.create({
    data: {
      memberId: SYSTEM_MEMBER_ID,
      name: "SYSTEM",
      email: SYSTEM_EMAIL,
      phone: "+910000000000",
      address: "System",
      password: "NOT_A_REAL_PASSWORD",
      isTempPassword: false,
      role: "ADMIN", // ADMIN role so it can approve its own transactions
      membershipStatus: "ACTIVE",
      applicationFeePaid: true,
    },
    select: { id: true },
  });

  systemUserId = created.id;
  return systemUserId;
}

// ---------------------------------------------------------------------------
// Payment mode mapping
// ---------------------------------------------------------------------------

function mapMethodToPaymentMode(
  method: string
): "UPI" | "BANK_TRANSFER" {
  if (method === "upi") return "UPI";
  if (method === "bank_transfer") return "BANK_TRANSFER";
  // Default unmapped methods (card, netbanking, wallet) to UPI as the closest
  // CASH_IN mode — the caller can always correct it via admin edit if needed.
  return "UPI";
}

// ---------------------------------------------------------------------------
// Membership duration helper (duplicated from membership-service to avoid
// circular imports — keep in sync)
// ---------------------------------------------------------------------------

const MEMBERSHIP_DURATION_DAYS: Record<MembershipType, number> = {
  MONTHLY: 30,
  HALF_YEARLY: 180,
  ANNUAL: 365,
};

function calculateMembershipDates(
  type: MembershipType,
  currentExpiry: Date | null
): { startDate: Date; endDate: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let startDate: Date;
  if (currentExpiry && currentExpiry >= today) {
    startDate = new Date(currentExpiry);
    startDate.setDate(startDate.getDate() + 1);
  } else {
    startDate = today;
  }

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + MEMBERSHIP_DURATION_DAYS[type] - 1);

  return { startDate, endDate };
}

// ---------------------------------------------------------------------------
// Receipt number helper (duplicated from receipt.ts to avoid circular imports)
// ---------------------------------------------------------------------------

async function assignReceiptNumber(
  transactionId: string,
  tx: Prisma.TransactionClient
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `DPS-REC-${year}-`;

  const last = await tx.transaction.findFirst({
    where: { receiptNumber: { startsWith: prefix } },
    orderBy: { receiptNumber: "desc" },
    select: { receiptNumber: true },
  });

  let counter = 1;
  if (last?.receiptNumber) {
    const parts = last.receiptNumber.split("-");
    const parsed = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(parsed)) counter = parsed + 1;
  }

  const receiptNumber = `${prefix}${String(counter).padStart(4, "0")}`;

  await tx.transaction.update({
    where: { id: transactionId },
    data: { receiptNumber },
  });

  return receiptNumber;
}

// ---------------------------------------------------------------------------
// Core payment handler — called for both payment.captured and virtual_account.credited
// ---------------------------------------------------------------------------

async function handlePaymentCaptured(
  payment: RazorpayPaymentEntity,
  systemUid: string
): Promise<void> {
  const paymentId = payment.id;

  // ---- Idempotency check ----
  const existing = await prisma.transaction.findFirst({
    where: { razorpayPaymentId: paymentId },
    select: { id: true },
  });

  if (existing) {
    console.log(`[webhook] Payment ${paymentId} already processed — skipping (idempotent)`);
    return;
  }

  // ---- Parse notes from order ----
  const notes = payment.notes ?? {};
  const memberId = notes.memberId ?? null;
  const sponsorId = notes.sponsorId ?? null;
  const membershipType = (notes.membershipType ?? null) as MembershipType | null;
  const isApplicationFee = notes.isApplicationFee === "true";
  const sponsorPurpose = (notes.sponsorPurpose ?? null) as SponsorPurpose | null;

  // ---- Determine category ----
  let category: "MEMBERSHIP_FEE" | "APPLICATION_FEE" | "SPONSORSHIP";
  if (sponsorId) {
    category = "SPONSORSHIP";
  } else if (isApplicationFee) {
    category = "APPLICATION_FEE";
  } else {
    category = "MEMBERSHIP_FEE";
  }

  // ---- Map payment method → PaymentMode ----
  const paymentMode = mapMethodToPaymentMode(payment.method);

  // ---- Convert paise → rupees ----
  const amountINR = paiseToRupees(payment.amount);

  // ---- Extract payer info ----
  const senderName: string | null =
    notes.memberName ?? notes.sponsorName ?? null;
  const senderUpiId: string | null =
    paymentMode === "UPI" ? (payment.vpa ?? null) : null;
  const senderBankName: string | null =
    paymentMode === "BANK_TRANSFER"
      ? (payment.bank_transfer?.payer_bank_account?.bank_name ?? payment.bank ?? null)
      : null;
  const senderBankAccount: string | null =
    paymentMode === "BANK_TRANSFER"
      ? (payment.bank_transfer?.payer_bank_account?.account_number ?? null)
      : null;
  const senderPhone: string | null = payment.contact ?? null;

  // ---- Validate amount vs. expected fee ----
  if (memberId && membershipType) {
    const expectedFee = MEMBERSHIP_FEES[membershipType];
    const expectedTotal = isApplicationFee
      ? expectedFee + APPLICATION_FEE
      : expectedFee;

    if (amountINR !== expectedTotal) {
      console.error(
        `[webhook] Amount mismatch for payment ${paymentId}: ` +
        `received ₹${amountINR}, expected ₹${expectedTotal} ` +
        `(${membershipType}${isApplicationFee ? " + application fee" : ""}). ` +
        `Transaction NOT created.`
      );
      await logActivity({
        userId: systemUid,
        action: "payment_amount_mismatch",
        description: `Razorpay payment ${paymentId} rejected: amount ₹${amountINR} does not match expected ₹${expectedTotal} for ${membershipType}`,
        metadata: { paymentId, amountReceived: amountINR, amountExpected: expectedTotal },
      });
      return;
    }
  }

  // ---- Atomic DB write ----
  await prisma.$transaction(async (tx) => {
    // 1. Create Transaction
    const transaction = await tx.transaction.create({
      data: {
        type: "CASH_IN",
        category,
        amount: new Prisma.Decimal(amountINR),
        paymentMode,
        description:
          payment.description ??
          (sponsorId
            ? `Razorpay sponsor payment — ${paymentId}`
            : `Razorpay membership payment — ${paymentId}`),
        sponsorPurpose: sponsorPurpose ?? null,
        memberId: memberId ?? null,
        sponsorId: sponsorId ?? null,
        enteredById: systemUid,
        approvalStatus: "APPROVED",
        approvalSource: "RAZORPAY_WEBHOOK",
        approvedById: null, // auto-approved, no individual approver
        approvedAt: new Date(),
        razorpayPaymentId: paymentId,
        razorpayOrderId: payment.order_id ?? null,
        senderName,
        senderPhone: senderPhone ?? null,
        senderUpiId,
        senderBankAccount,
        senderBankName,
      },
    });

    // 2. If membership payment — create Membership + update User subscription
    if (memberId && membershipType) {
      // Fetch Member (with linked User) inside the transaction
      const member = await tx.member.findUnique({
        where: { id: memberId },
        include: {
          user: {
            select: {
              id: true,
              membershipExpiry: true,
              applicationFeePaid: true,
              totalPaid: true,
            },
          },
        },
      });

      if (member) {
        const currentExpiry = member.user?.membershipExpiry ?? null;
        const { startDate, endDate } = calculateMembershipDates(
          membershipType,
          currentExpiry
        );

        // Create Membership record (status=APPROVED)
        await tx.membership.create({
          data: {
            memberId,
            type: membershipType,
            amount: new Prisma.Decimal(amountINR),
            startDate,
            endDate,
            isApplicationFee,
            status: "APPROVED",
          },
        });

        // Update User subscription fields if there is a linked User
        if (member.userId) {
          const userUpdate: Prisma.UserUpdateInput = {
            membershipStatus: "ACTIVE",
            membershipType,
            membershipStart: startDate,
            membershipExpiry: endDate,
            totalPaid: {
              increment: new Prisma.Decimal(amountINR),
            },
          };

          if (isApplicationFee && !member.user?.applicationFeePaid) {
            userUpdate.applicationFeePaid = true;
          }

          await tx.user.update({
            where: { id: member.userId },
            data: userUpdate,
          });
        }

        // Update Member.membershipStatus
        await tx.member.update({
          where: { id: memberId },
          data: { membershipStatus: "ACTIVE" },
        });
      }
    }

    // 3. Auto-generate receipt number inside the transaction
    const receiptNumber = await assignReceiptNumber(transaction.id, tx);

    // 4. Audit log — inside the same Prisma transaction is not supported for
    //    non-interactive client operations, so we defer this to after the commit.
    //    Store the receipt number for use below.
    (transaction as unknown as Record<string, unknown>).__receiptNumber = receiptNumber;
  });

  // ---- Post-transaction logs ----
  // Fetch the created transaction for logging
  const created = await prisma.transaction.findFirst({
    where: { razorpayPaymentId: paymentId },
    select: {
      id: true,
      type: true,
      category: true,
      amount: true,
      paymentMode: true,
      approvalStatus: true,
      approvalSource: true,
      receiptNumber: true,
      memberId: true,
      sponsorId: true,
    },
  });

  if (created) {
    await Promise.all([
      logAudit({
        entityType: "Transaction",
        entityId: created.id,
        action: "razorpay_payment_captured",
        previousData: null,
        newData: {
          id: created.id,
          type: created.type,
          category: created.category,
          amount: created.amount.toString(),
          paymentMode: created.paymentMode,
          approvalStatus: created.approvalStatus,
          approvalSource: created.approvalSource,
          razorpayPaymentId: paymentId,
          razorpayOrderId: payment.order_id ?? null,
          senderName,
          senderUpiId,
          senderBankAccount,
          senderBankName,
          receiptNumber: created.receiptNumber,
          memberId: created.memberId,
          sponsorId: created.sponsorId,
          enteredById: systemUid,
        },
        transactionId: created.id,
        performedById: systemUid,
      }),
      logActivity({
        userId: systemUid,
        action: "razorpay_payment_captured",
        description:
          `Razorpay payment ${paymentId} captured: ₹${amountINR} ` +
          `(${category}, ${paymentMode}) — Transaction ${created.id} auto-approved. ` +
          `Receipt: ${created.receiptNumber ?? "pending"}`,
        metadata: {
          transactionId: created.id,
          paymentId,
          orderId: payment.order_id ?? null,
          amount: amountINR,
          category,
          paymentMode,
          memberId: memberId ?? null,
          sponsorId: sponsorId ?? null,
          membershipType: membershipType ?? null,
          isApplicationFee,
          receiptNumber: created.receiptNumber,
        },
      }),
    ]);
  }
}

// ---------------------------------------------------------------------------
// Webhook endpoint
// ---------------------------------------------------------------------------

/**
 * Razorpay sends all webhook events to this endpoint.
 * We must respond 200 quickly — Razorpay retries up to 15 times if we don't.
 */
export async function POST(request: Request) {
  // 0. Rate limiting: 50 req/min per IP — reject early to prevent DDoS
  const rlKey = getRateLimitKey(request, "webhook");
  const rl = rateLimit(rlKey, WEBHOOK_RATE_LIMIT.maxAttempts, WEBHOOK_RATE_LIMIT.windowMs);
  if (!rl.success) {
    console.warn(`[webhook] Rate limit exceeded for key ${rlKey}`);
    return NextResponse.json(
      { received: false, error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)),
        },
      }
    );
  }

  // 1. Read raw body (must not be JSON.parse'd before HMAC verification)
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    // If we can't read the body, return 200 anyway
    console.error("[webhook] Failed to read request body");
    return NextResponse.json({ received: false }, { status: 200 });
  }

  // 2. Verify HMAC signature BEFORE any processing (T25)
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const signatureValid = verifyWebhookSignature(rawBody, signature);

  if (!signatureValid) {
    // Log the rejected attempt to ActivityLog for security auditing (T25).
    // We do a best-effort DB write — if the system user does not exist yet
    // (e.g., fresh DB) we skip the log rather than crashing.
    try {
      const systemUser = await prisma.user.findUnique({
        where: { email: SYSTEM_EMAIL },
        select: { id: true },
      });
      if (systemUser) {
        await logActivity({
          userId: systemUser.id,
          action: "webhook_rejected_invalid_signature",
          description: "Razorpay webhook rejected — HMAC signature verification failed. Possible replay or spoofing attempt.",
          metadata: {
            ip: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown",
            userAgent: request.headers.get("user-agent") ?? "unknown",
            signaturePresent: signature.length > 0,
            bodyLength: rawBody.length,
          },
        });
      }
    } catch (logErr) {
      console.error("[webhook] Failed to log rejected webhook attempt:", logErr);
    }

    console.error("[webhook] Invalid HMAC signature — rejecting webhook with 401");
    // Return 401 to signal rejection. Razorpay will retry, which is acceptable
    // because genuine Razorpay requests will always have a valid signature.
    // A persistent 401 stream indicates a misconfigured RAZORPAY_WEBHOOK_SECRET.
    return NextResponse.json({ received: false, error: "Invalid signature" }, { status: 401 });
  }

  // 3. Parse payload
  let payload: RazorpayWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as RazorpayWebhookPayload;
  } catch {
    console.error("[webhook] Failed to parse webhook payload JSON");
    return NextResponse.json({ received: false }, { status: 200 });
  }

  const eventType = payload.event;
  console.log(`[webhook] Received event: ${eventType}`);

  try {
    // 4. Get or create system user (needed for enteredById)
    const systemUid = await getOrCreateSystemUser();

    // 5. Dispatch by event type
    if (eventType === "payment.captured") {
      const payment = payload.payload.payment?.entity;
      if (!payment) {
        console.error("[webhook] payment.captured event missing payment entity");
        return NextResponse.json({ received: true }, { status: 200 });
      }
      await handlePaymentCaptured(payment, systemUid);
    } else if (eventType === "virtual_account.credited") {
      // Bank transfer via Virtual Account Number
      // The payment entity is embedded in the same payload for this event type
      const payment = payload.payload.payment?.entity;
      if (!payment) {
        console.error("[webhook] virtual_account.credited event missing payment entity");
        return NextResponse.json({ received: true }, { status: 200 });
      }
      await handlePaymentCaptured(payment, systemUid);
    } else if (eventType === "payment.failed") {
      // Log failed payment to activity log — no Transaction created
      const payment = payload.payload.payment?.entity;
      const paymentId = payment?.id ?? "unknown";
      const amountINR = payment ? paiseToRupees(payment.amount) : 0;
      const systemUidForLog = systemUid;

      await logActivity({
        userId: systemUidForLog,
        action: "razorpay_payment_failed",
        description: `Razorpay payment ${paymentId} failed. Amount: ₹${amountINR}`,
        metadata: {
          paymentId,
          orderId: payment?.order_id ?? null,
          amount: amountINR,
          method: payment?.method ?? null,
          notes: payment?.notes ?? null,
        },
      });

      console.log(`[webhook] Payment failed: ${paymentId}`);
    } else {
      // Unknown event — log and acknowledge
      console.log(`[webhook] Unhandled event type: ${eventType} — acknowledged`);
    }
  } catch (err) {
    // Catch-all: log error but always return 200 so Razorpay does not retry indefinitely
    console.error("[webhook] Unhandled error processing webhook:", err);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
