/**
 * Audit + Activity log helpers.
 *
 * Both AuditLog and ActivityLog are append-only — no update/delete endpoints.
 * These helpers are called from the service layer after any state-changing operation.
 *
 * logAudit()    — approved-transaction audit log (AuditLog table)
 * logActivity() — system-wide activity log (ActivityLog table)
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditLogParams {
  transactionId: string;
  transactionSnapshot: Record<string, unknown>;
  performedById: string;
}

export interface ActivityLogParams {
  userId: string;
  action: string;
  description: string;
  metadata?: Record<string, unknown> | null;
}

export interface TransactionAuditSnapshotSource {
  id: string;
  type: string;
  category: string;
  amount: string | number | Prisma.Decimal;
  paymentMode: string;
  description: string;
  sponsorPurpose?: string | null;
  approvalStatus: string;
  approvalSource: string;
  enteredById?: string | null;
  approvedById?: string | null;
  approvedAt?: Date | string | null;
  razorpayPaymentId?: string | null;
  razorpayOrderId?: string | null;
  senderName?: string | null;
  senderPhone?: string | null;
  senderUpiId?: string | null;
  senderBankAccount?: string | null;
  senderBankName?: string | null;
  receiptNumber?: string | null;
  memberId?: string | null;
  sponsorId?: string | null;
  createdAt?: Date | string | null;
}

interface ApprovedTransactionSnapshot {
  approvalStatus?: unknown;
}

interface AuditSnapshotRecord {
  transactionSnapshot?: Record<string, unknown> | null;
  transaction?: TransactionAuditSnapshotSource | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function buildTransactionAuditSnapshot(
  transaction: TransactionAuditSnapshotSource
): Record<string, unknown> {
  const decimalCtor = (Prisma as { Decimal?: typeof Prisma.Decimal }).Decimal;
  const toIso = (value: Date | string | null | undefined) => {
    if (value == null) return null;
    return value instanceof Date ? value.toISOString() : value;
  };

  return {
    id: transaction.id,
    type: transaction.type,
    category: transaction.category,
    amount:
      typeof transaction.amount === "number"
        ? transaction.amount.toString()
        : decimalCtor && transaction.amount instanceof decimalCtor
        ? transaction.amount.toString()
        : transaction.amount,
    paymentMode: transaction.paymentMode,
    description: transaction.description,
    sponsorPurpose: transaction.sponsorPurpose ?? null,
    approvalStatus: transaction.approvalStatus,
    approvalSource: transaction.approvalSource,
    enteredById: transaction.enteredById ?? null,
    approvedById: transaction.approvedById ?? null,
    approvedAt: toIso(transaction.approvedAt),
    razorpayPaymentId: transaction.razorpayPaymentId ?? null,
    razorpayOrderId: transaction.razorpayOrderId ?? null,
    senderName: transaction.senderName ?? null,
    senderPhone: transaction.senderPhone ?? null,
    senderUpiId: transaction.senderUpiId ?? null,
    senderBankAccount: transaction.senderBankAccount ?? null,
    senderBankName: transaction.senderBankName ?? null,
    receiptNumber: transaction.receiptNumber ?? null,
    memberId: transaction.memberId ?? null,
    sponsorId: transaction.sponsorId ?? null,
    createdAt: toIso(transaction.createdAt),
  };
}

export function resolveAuditSnapshot(
  entry: AuditSnapshotRecord
): Record<string, unknown> {
  if (
    entry.transactionSnapshot &&
    typeof entry.transactionSnapshot === "object" &&
    !Array.isArray(entry.transactionSnapshot)
  ) {
    return entry.transactionSnapshot;
  }

  if (entry.transaction) {
    return buildTransactionAuditSnapshot(entry.transaction);
  }

  return {};
}

/**
 * Append an entry to the approved-transaction AuditLog.
 * Never throws — failures are logged to console to avoid disrupting the
 * primary operation.
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    const snapshot = params.transactionSnapshot as ApprovedTransactionSnapshot;
    if (snapshot.approvalStatus !== "APPROVED") {
      console.warn(
        `[audit] Skipping AuditLog for transaction ${params.transactionId} because approvalStatus is not APPROVED`
      );
      return;
    }

    await prisma.auditLog.create({
      data: {
        transactionId: params.transactionId,
        transactionSnapshot: params.transactionSnapshot as Prisma.InputJsonValue,
        performedById: params.performedById,
      },
    });
  } catch (err) {
    console.error("[audit] Failed to write AuditLog:", err);
  }
}

/**
 * Append an entry to the system-wide ActivityLog.
 * Never throws — failures are logged to console to avoid disrupting the
 * primary operation.
 */
export async function logActivity(params: ActivityLogParams): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        description: params.description,
        metadata:
          params.metadata != null
            ? (params.metadata as Prisma.InputJsonValue)
            : undefined,
      },
    });
  } catch (err) {
    console.error("[audit] Failed to write ActivityLog:", err);
  }
}
