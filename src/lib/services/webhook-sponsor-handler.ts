/**
 * Webhook Sponsor Payment Handler — T15
 *
 * This helper is called from the main Razorpay webhook handler
 * (src/app/api/webhooks/razorpay/route.ts) when a payment contains
 * sponsor-related metadata in the notes field.
 *
 * Integration instructions for T13 webhook handler:
 *   After checking `notes.memberId` / membership logic, also check:
 *     if (notes.sponsorId || notes.sponsorPurpose) {
 *       await handleSponsorWebhookPayment(payload, systemUserId);
 *     }
 *
 * The Razorpay payment/order must have notes set to:
 *   {
 *     sponsorId: "<UUID of Sponsor>",         // optional
 *     sponsorPurpose: "<SponsorPurpose enum>", // required
 *     sponsorName: "<payer name>",             // optional
 *   }
 *
 * On success:
 *   - Creates Transaction (category=SPONSORSHIP, auto-approved, approvalSource=RAZORPAY_WEBHOOK)
 *   - Generates receipt number
 *   - Logs to AuditLog + ActivityLog
 *   - Returns created transaction ID + receipt number
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit, logActivity } from "@/lib/audit";
import { generateReceiptNumber } from "@/lib/receipt";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Subset of Razorpay payment event payload used by this handler */
export interface RazorpayPaymentPayload {
  /** Razorpay payment ID (e.g. "pay_XXXXXXXXXX") */
  razorpayPaymentId: string;
  /** Razorpay order ID (e.g. "order_XXXXXXXXXX") */
  razorpayOrderId?: string;
  /** Amount in paise from Razorpay — converted to INR by this handler */
  amountPaise: number;
  /** Payment method: "upi" | "netbanking" | "wallet" etc. */
  method: string;
  /** UPI VPA if method === "upi" */
  upiVpa?: string;
  /** Bank name if netbanking */
  bankName?: string;
  /** Masked account number if bank transfer */
  senderBankAccount?: string;
  /** Payer contact (phone) */
  contact?: string;
  /** Payer email */
  email?: string;
  /** Notes object from Razorpay order */
  notes: Record<string, string | undefined>;
}

export interface SponsorWebhookResult {
  success: boolean;
  transactionId?: string;
  receiptNumber?: string;
  error?: string;
  /** True if this payment was already processed (idempotency) */
  alreadyProcessed?: boolean;
}

// ---------------------------------------------------------------------------
// Valid sponsor purpose values
// ---------------------------------------------------------------------------

const VALID_SPONSOR_PURPOSES = [
  "TITLE_SPONSOR",
  "GOLD_SPONSOR",
  "SILVER_SPONSOR",
  "FOOD_PARTNER",
  "MEDIA_PARTNER",
  "STALL_VENDOR",
  "MARKETING_PARTNER",
] as const;

type SponsorPurposeValue = typeof VALID_SPONSOR_PURPOSES[number];

function isValidSponsorPurpose(value: string): value is SponsorPurposeValue {
  return VALID_SPONSOR_PURPOSES.includes(value as SponsorPurposeValue);
}

// ---------------------------------------------------------------------------
// Payment method → PaymentMode enum mapper
// ---------------------------------------------------------------------------

function toPaymentMode(method: string): "UPI" | "BANK_TRANSFER" | "CASH" {
  if (method === "upi") return "UPI";
  if (method === "netbanking") return "BANK_TRANSFER";
  return "UPI"; // Default for other Razorpay methods (wallet, card etc.)
}

// ---------------------------------------------------------------------------
// handleSponsorWebhookPayment
// ---------------------------------------------------------------------------

/**
 * Process a Razorpay payment webhook event for a sponsor payment.
 *
 * Idempotent: checks razorpayPaymentId for duplicates before creating a transaction.
 *
 * @param payload      - parsed webhook payment data
 * @param systemUserId - UUID of the SYSTEM user (used as enteredById)
 */
export async function handleSponsorWebhookPayment(
  payload: RazorpayPaymentPayload,
  systemUserId: string
): Promise<SponsorWebhookResult> {
  const { notes, razorpayPaymentId } = payload;

  // Extract sponsor fields from notes
  const sponsorId = notes.sponsorId ?? null;
  const sponsorPurpose = notes.sponsorPurpose;
  const senderName = notes.sponsorName ?? notes.name ?? null;

  // Validate sponsorPurpose
  if (!sponsorPurpose || !isValidSponsorPurpose(sponsorPurpose)) {
    return {
      success: false,
      error: `Invalid or missing sponsorPurpose in webhook notes: ${sponsorPurpose ?? "(none)"}`,
    };
  }

  // Idempotency: check if this payment was already processed
  const existing = await prisma.transaction.findFirst({
    where: { razorpayPaymentId },
    select: { id: true, receiptNumber: true },
  });

  if (existing) {
    return {
      success: true,
      transactionId: existing.id,
      receiptNumber: existing.receiptNumber ?? undefined,
      alreadyProcessed: true,
    };
  }

  // Validate sponsorId if provided
  if (sponsorId) {
    const sponsorExists = await prisma.sponsor.findUnique({
      where: { id: sponsorId },
    });
    if (!sponsorExists) {
      // Log but don't block — create transaction without sponsor link
      console.warn(
        `[webhook-sponsor] Sponsor ID ${sponsorId} from notes not found in DB — creating transaction without sponsor link`
      );
    }
  }

  const amountINR = new Prisma.Decimal(payload.amountPaise / 100);
  const paymentMode = toPaymentMode(payload.method);

  // Wrap in a Prisma $transaction for atomicity (receipt number + transaction creation)
  const result = await prisma.$transaction(async (tx) => {
    // Generate receipt number inside transaction to avoid races
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

    const transaction = await tx.transaction.create({
      data: {
        type: "CASH_IN",
        category: "SPONSORSHIP",
        amount: amountINR,
        paymentMode,
        description: `Sponsor payment via Razorpay — ${sponsorPurpose.replace(/_/g, " ")}`,
        sponsorPurpose: sponsorPurpose as SponsorPurposeValue,
        sponsorId: sponsorId ?? null,
        enteredById: systemUserId,
        approvalStatus: "APPROVED",
        approvalSource: "RAZORPAY_WEBHOOK",
        approvedById: null,
        approvedAt: new Date(),
        razorpayPaymentId,
        razorpayOrderId: payload.razorpayOrderId ?? null,
        senderName: senderName ?? null,
        senderPhone: payload.contact ?? null,
        senderUpiId: paymentMode === "UPI" ? (payload.upiVpa ?? null) : null,
        senderBankAccount:
          paymentMode === "BANK_TRANSFER" ? (payload.senderBankAccount ?? null) : null,
        senderBankName:
          paymentMode === "BANK_TRANSFER" ? (payload.bankName ?? null) : null,
        receiptNumber,
      },
    });

    return { transaction, receiptNumber };
  });

  // Log to both audit and activity logs (non-blocking)
  await Promise.all([
    logAudit({
      entityType: "Transaction",
      entityId: result.transaction.id,
      action: "sponsor_payment_received",
      previousData: null,
      newData: {
        id: result.transaction.id,
        type: "CASH_IN",
        category: "SPONSORSHIP",
        amount: result.transaction.amount.toString(),
        paymentMode,
        sponsorPurpose,
        sponsorId: sponsorId ?? null,
        approvalStatus: "APPROVED",
        approvalSource: "RAZORPAY_WEBHOOK",
        razorpayPaymentId,
        receiptNumber: result.receiptNumber,
        senderName: senderName ?? null,
      },
      transactionId: result.transaction.id,
      performedById: systemUserId,
    }),
    logActivity({
      userId: systemUserId,
      action: "sponsor_payment_received",
      description: `Sponsor payment received via Razorpay: ₹${result.transaction.amount} — ${sponsorPurpose.replace(/_/g, " ")}${senderName ? ` from ${senderName}` : ""}`,
      metadata: {
        transactionId: result.transaction.id,
        razorpayPaymentId,
        amount: result.transaction.amount.toString(),
        sponsorPurpose,
        sponsorId: sponsorId ?? null,
        receiptNumber: result.receiptNumber,
        paymentMode,
      },
    }),
  ]);

  return {
    success: true,
    transactionId: result.transaction.id,
    receiptNumber: result.receiptNumber,
    alreadyProcessed: false,
  };
}

// ---------------------------------------------------------------------------
// isSponsorPayment
// ---------------------------------------------------------------------------

/**
 * Check if a Razorpay webhook payment notes object indicates a sponsor payment.
 * Returns true if notes contains a sponsorPurpose field.
 *
 * Usage in webhook handler:
 *   const notes = payload.payment?.entity?.notes ?? {};
 *   if (isSponsorPayment(notes)) {
 *     await handleSponsorWebhookPayment(...)
 *   }
 */
export function isSponsorPayment(notes: Record<string, string | undefined>): boolean {
  return Boolean(notes.sponsorPurpose && isValidSponsorPurpose(notes.sponsorPurpose));
}
