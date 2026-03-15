/**
 * Receipt library for DPS Dashboard — SERVER ONLY.
 *
 * Contains DB-dependent receipt generation logic.
 * Client-safe types and utilities are in receipt-utils.ts.
 */

import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";

// Re-export client-safe parts so existing server imports keep working
export {
  CLUB_NAME,
  CLUB_ADDRESS,
  CLUB_PHONE,
  amountToWords,
  type ReceiptData,
} from "@/lib/receipt-utils";

import type { ReceiptData } from "@/lib/receipt-utils";

// ---------------------------------------------------------------------------
// Receipt number generation
// ---------------------------------------------------------------------------

export async function generateReceiptNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `DPS-REC-${year}-`;

  const lastTransaction = await prisma.transaction.findFirst({
    where: { receiptNumber: { startsWith: prefix } },
    orderBy: { receiptNumber: "desc" },
    select: { receiptNumber: true },
  });

  let nextCounter = 1;
  if (lastTransaction?.receiptNumber) {
    const parts = lastTransaction.receiptNumber.split("-");
    const lastCounter = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastCounter)) nextCounter = lastCounter + 1;
  }

  return `${prefix}${String(nextCounter).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Label helpers (server-side only)
// ---------------------------------------------------------------------------

function paymentModeLabel(mode: string): string {
  const map: Record<string, string> = {
    UPI: "UPI",
    BANK_TRANSFER: "Bank Transfer",
    CASH: "Cash",
  };
  return map[mode] ?? mode;
}

function categoryLabel(category: string): string {
  const map: Record<string, string> = {
    MEMBERSHIP_FEE: "Membership Fee",
    APPLICATION_FEE: "Application Fee",
    SPONSORSHIP: "Sponsorship",
    EXPENSE: "Expense",
    OTHER: "Other",
  };
  return map[category] ?? category;
}

function sponsorPurposeLabel(purpose: string | null): string {
  if (!purpose) return "";
  const map: Record<string, string> = {
    TITLE_SPONSOR: "Title Sponsor",
    GOLD_SPONSOR: "Gold Sponsor",
    SILVER_SPONSOR: "Silver Sponsor",
    FOOD_PARTNER: "Food Partner",
    MEDIA_PARTNER: "Media Partner",
    STALL_VENDOR: "Stall Vendor",
    MARKETING_PARTNER: "Marketing Partner",
  };
  return map[purpose] ?? purpose;
}

// ---------------------------------------------------------------------------
// Main receipt generator
// ---------------------------------------------------------------------------

export async function generateReceipt(
  transactionId: string,
  performedById: string
): Promise<
  | { success: true; data: ReceiptData }
  | { success: false; error: string; status: number }
> {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      member: {
        select: {
          id: true,
          name: true,
          email: true,
          user: {
            select: {
              memberId: true,
              membershipStart: true,
              membershipExpiry: true,
            },
          },
        },
      },
      sponsor: { select: { id: true, name: true, company: true } },
      enteredBy: { select: { id: true, name: true } },
    },
  });

  if (!transaction) {
    return { success: false, error: "Transaction not found", status: 404 };
  }

  if (transaction.approvalStatus !== "APPROVED") {
    return {
      success: false,
      error: "Receipt can only be generated for approved transactions",
      status: 400,
    };
  }

  let receiptNumber = transaction.receiptNumber;
  const isNew = !receiptNumber;

  if (isNew) {
    await prisma.$transaction(async (tx) => {
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

      receiptNumber = `${prefix}${String(counter).padStart(4, "0")}`;
      await tx.transaction.update({
        where: { id: transactionId },
        data: { receiptNumber },
      });
    });
  }

  if (isNew) {
    await logActivity({
      userId: performedById,
      action: "receipt_generated",
      description: `Receipt ${receiptNumber} generated for transaction ${transactionId} (${transaction.category}, ₹${transaction.amount})`,
      metadata: {
        transactionId,
        receiptNumber,
        category: transaction.category,
        amount: transaction.amount.toString(),
      },
    });
  }

  const isSponsor = transaction.category === "SPONSORSHIP";

  const { CLUB_NAME, CLUB_ADDRESS } = await import("@/lib/receipt-utils");

  const receiptData: ReceiptData = {
    receiptNumber: receiptNumber!,
    date: transaction.approvedAt ?? transaction.createdAt,
    type: isSponsor ? "SPONSOR" : "MEMBER",
    amount: Number(transaction.amount),
    paymentMode: paymentModeLabel(transaction.paymentMode),
    category: categoryLabel(transaction.category),
    description: transaction.description,
    receivedBy: transaction.enteredBy.name,
    clubName: CLUB_NAME,
    clubAddress: CLUB_ADDRESS,
  };

  if (isSponsor && transaction.sponsor) {
    receiptData.sponsorName = transaction.sponsor.name;
    receiptData.sponsorCompany = transaction.sponsor.company ?? undefined;
    receiptData.sponsorPurpose = sponsorPurposeLabel(transaction.sponsorPurpose ?? null);
  } else if (transaction.member) {
    receiptData.memberName = transaction.member.name;
    if (transaction.member.user?.memberId) receiptData.memberId = transaction.member.user.memberId;
    if (transaction.member.user?.membershipStart) receiptData.membershipStart = transaction.member.user.membershipStart;
    if (transaction.member.user?.membershipExpiry) receiptData.membershipEnd = transaction.member.user.membershipExpiry;
  } else if (transaction.senderName) {
    receiptData.memberName = transaction.senderName;
  }

  return { success: true, data: receiptData };
}
