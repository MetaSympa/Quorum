/**
 * Transaction Service — business logic for cash in/out transaction management.
 *
 * Approval gating rules:
 *   ADMIN    → direct DB write for all operations (create, update, delete)
 *   OPERATOR → creates an Approval record instead of writing directly
 *              (change is only applied when an admin approves via T09)
 *
 * Special rules:
 *   - Razorpay-sourced transactions (approvalSource=RAZORPAY_WEBHOOK) cannot
 *     be updated or deleted by any user (even admin) — 403 returned.
 *   - Admin-created transactions are auto-approved (approvalStatus=APPROVED).
 *   - Operator-created transactions start as PENDING in the Approval queue.
 *   - All mutations are logged to both AuditLog and ActivityLog.
 *   - Amounts stored as Decimal(12,2) — passed in as numbers from Zod.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit, logActivity } from "@/lib/audit";
import type {
  CreateTransactionInput,
  UpdateTransactionInput,
  TransactionListQuery,
} from "@/lib/validators";

// ---------------------------------------------------------------------------
// Re-export ServiceResult from member-service (shared pattern)
// ---------------------------------------------------------------------------

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  /** HTTP status code hint for the route layer */
  status?: number;
  /** "direct" = change applied immediately; "pending_approval" = queued for admin */
  action?: "direct" | "pending_approval";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransactionWithRelations {
  id: string;
  type: string;
  category: string;
  amount: unknown; // Prisma Decimal — toString() before sending to client
  paymentMode: string;
  description: string;
  sponsorPurpose: string | null;
  memberId: string | null;
  sponsorId: string | null;
  enteredById: string;
  approvalStatus: string;
  approvalSource: string;
  approvedById: string | null;
  approvedAt: Date | null;
  razorpayPaymentId: string | null;
  razorpayOrderId: string | null;
  senderName: string | null;
  senderPhone: string | null;
  senderUpiId: string | null;
  senderBankAccount: string | null;
  senderBankName: string | null;
  receiptNumber: string | null;
  createdAt: Date;
  member: { id: string; name: string; email: string } | null;
  sponsor: { id: string; name: string; company: string | null } | null;
  enteredBy: { id: string; name: string; email: string };
  approvedBy: { id: string; name: string } | null;
}

export interface PaginatedTransactions {
  data: TransactionWithRelations[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TransactionSummary {
  totalIncome: number;
  totalExpenses: number;
  pendingAmount: number;
  netBalance: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Standard Prisma include for transactions — returns full relational data. */
const transactionInclude = {
  member: {
    select: { id: true, name: true, email: true },
  },
  sponsor: {
    select: { id: true, name: true, company: true },
  },
  enteredBy: {
    select: { id: true, name: true, email: true },
  },
  approvedBy: {
    select: { id: true, name: true },
  },
} satisfies Prisma.TransactionInclude;

// ---------------------------------------------------------------------------
// List transactions
// ---------------------------------------------------------------------------

/**
 * List transactions with optional filters, paginated.
 * Admin and Operator can see all transactions.
 */
export async function listTransactions(
  filters: TransactionListQuery
): Promise<ServiceResult<PaginatedTransactions>> {
  const { type, category, paymentMode, status, dateFrom, dateTo, page, limit } =
    filters;
  const skip = (page - 1) * limit;

  const where: Prisma.TransactionWhereInput = {};

  if (type) where.type = type;
  if (category) where.category = category;
  if (paymentMode) where.paymentMode = paymentMode;
  if (status) where.approvalStatus = status;

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) {
      // Include the entire dateTo day
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: transactionInclude,
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    success: true,
    data: {
      data: transactions as unknown as TransactionWithRelations[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ---------------------------------------------------------------------------
// Get single transaction
// ---------------------------------------------------------------------------

/**
 * Retrieve a single Transaction by UUID with related member/sponsor/user data.
 */
export async function getTransaction(
  id: string
): Promise<ServiceResult<TransactionWithRelations>> {
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: transactionInclude,
  });

  if (!transaction) {
    return { success: false, error: "Transaction not found", status: 404 };
  }

  return {
    success: true,
    data: transaction as unknown as TransactionWithRelations,
  };
}

// ---------------------------------------------------------------------------
// Create transaction
// ---------------------------------------------------------------------------

/**
 * Create a new transaction.
 *
 * Admin: creates directly with approvalStatus=APPROVED, approvedBy=admin,
 *        approvedAt=now, approvalSource=MANUAL.
 * Operator: creates an Approval record (TRANSACTION), does not write to
 *           Transaction table yet.
 *
 * @param data        - validated transaction input
 * @param requestedBy - the session user performing the action
 */
export async function createTransaction(
  data: CreateTransactionInput,
  requestedBy: { id: string; role: string; name: string }
): Promise<ServiceResult<{ transactionId?: string; approvalId?: string }>> {
  if (requestedBy.role === "OPERATOR") {
    // Operator path: queue for admin approval
    // entityId is a placeholder UUID — real Transaction ID assigned on approval
    const approval = await prisma.approval.create({
      data: {
        entityType: "TRANSACTION",
        entityId: "00000000-0000-0000-0000-000000000000",
        action: "add_transaction",
        previousData: Prisma.DbNull,
        newData: data as Prisma.InputJsonValue,
        requestedById: requestedBy.id,
        status: "PENDING",
      },
    });

    await logActivity({
      userId: requestedBy.id,
      action: "transaction_add_requested",
      description: `Operator ${requestedBy.name} submitted new transaction request: ${data.type} ₹${data.amount} (${data.category})`,
      metadata: {
        approvalId: approval.id,
        type: data.type,
        amount: data.amount,
        category: data.category,
      },
    });

    return {
      success: true,
      data: { approvalId: approval.id },
      action: "pending_approval",
    };
  }

  // Admin path: direct create, auto-approved
  const transaction = await prisma.$transaction(async (tx) => {
    return tx.transaction.create({
      data: {
        type: data.type,
        category: data.category,
        amount: new Prisma.Decimal(data.amount),
        paymentMode: data.paymentMode,
        description: data.description,
        sponsorPurpose: data.sponsorPurpose ?? null,
        memberId: data.memberId ?? null,
        sponsorId: data.sponsorId ?? null,
        enteredById: requestedBy.id,
        approvalStatus: "APPROVED",
        approvalSource: "MANUAL",
        approvedById: requestedBy.id,
        approvedAt: new Date(),
        senderName: data.senderName ?? null,
        senderPhone: data.senderPhone ?? null,
      },
      include: transactionInclude,
    });
  });

  // Log to both audit and activity (non-blocking)
  await Promise.all([
    logAudit({
      entityType: "Transaction",
      entityId: transaction.id,
      action: "transaction_created",
      previousData: null,
      newData: {
        id: transaction.id,
        type: transaction.type,
        category: transaction.category,
        amount: transaction.amount.toString(),
        paymentMode: transaction.paymentMode,
        description: transaction.description,
        approvalStatus: transaction.approvalStatus,
        approvalSource: transaction.approvalSource,
        enteredById: transaction.enteredById,
        approvedById: transaction.approvedById,
        approvedAt: transaction.approvedAt?.toISOString(),
      },
      transactionId: transaction.id,
      performedById: requestedBy.id,
    }),
    logActivity({
      userId: requestedBy.id,
      action: "transaction_created",
      description: `Admin ${requestedBy.name} created ${transaction.type} transaction ₹${transaction.amount} (${transaction.category})`,
      metadata: {
        transactionId: transaction.id,
        type: transaction.type,
        amount: transaction.amount.toString(),
        category: transaction.category,
      },
    }),
  ]);

  return {
    success: true,
    data: { transactionId: transaction.id },
    action: "direct",
    status: 201,
  };
}

// ---------------------------------------------------------------------------
// Update transaction
// ---------------------------------------------------------------------------

/**
 * Update an existing transaction.
 *
 * Admin: applies update directly and logs to audit/activity.
 * Operator: creates an Approval record (TRANSACTION edit) with previousData/newData.
 *
 * Razorpay-sourced transactions (approvalSource=RAZORPAY_WEBHOOK) cannot be
 * updated by anyone — returns 403.
 */
export async function updateTransaction(
  id: string,
  data: UpdateTransactionInput,
  requestedBy: { id: string; role: string; name: string }
): Promise<ServiceResult<{ approvalId?: string }>> {
  const existing = await prisma.transaction.findUnique({ where: { id } });

  if (!existing) {
    return { success: false, error: "Transaction not found", status: 404 };
  }

  // Block edits to Razorpay-sourced transactions
  if (existing.approvalSource === "RAZORPAY_WEBHOOK") {
    return {
      success: false,
      error: "Razorpay-sourced transactions cannot be edited",
      status: 403,
    };
  }

  if (requestedBy.role === "OPERATOR") {
    const previousData = {
      type: existing.type,
      category: existing.category,
      amount: existing.amount.toString(),
      paymentMode: existing.paymentMode,
      description: existing.description,
      sponsorPurpose: existing.sponsorPurpose,
      memberId: existing.memberId,
      sponsorId: existing.sponsorId,
      senderName: existing.senderName,
      senderPhone: existing.senderPhone,
    };

    const approval = await prisma.approval.create({
      data: {
        entityType: "TRANSACTION",
        entityId: id,
        action: "edit_transaction",
        previousData: previousData as Prisma.InputJsonValue,
        newData: data as Prisma.InputJsonValue,
        requestedById: requestedBy.id,
        status: "PENDING",
      },
    });

    await logActivity({
      userId: requestedBy.id,
      action: "transaction_edit_requested",
      description: `Operator ${requestedBy.name} submitted edit request for transaction ${id}`,
      metadata: {
        approvalId: approval.id,
        transactionId: id,
        changes: data,
      },
    });

    return {
      success: true,
      data: { approvalId: approval.id },
      action: "pending_approval",
    };
  }

  // Admin path: direct update
  const previousSnapshot = {
    type: existing.type,
    category: existing.category,
    amount: existing.amount.toString(),
    paymentMode: existing.paymentMode,
    description: existing.description,
    sponsorPurpose: existing.sponsorPurpose,
  };

  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      ...(data.type && { type: data.type }),
      ...(data.category && { category: data.category }),
      ...(data.amount !== undefined && {
        amount: new Prisma.Decimal(data.amount),
      }),
      ...(data.paymentMode && { paymentMode: data.paymentMode }),
      ...(data.description && { description: data.description }),
      // Allow explicit null to clear sponsorPurpose
      ...(data.sponsorPurpose !== undefined && {
        sponsorPurpose: data.sponsorPurpose ?? null,
      }),
      ...(data.memberId !== undefined && { memberId: data.memberId ?? null }),
      ...(data.sponsorId !== undefined && { sponsorId: data.sponsorId ?? null }),
      ...(data.senderName !== undefined && {
        senderName: data.senderName ?? null,
      }),
      ...(data.senderPhone !== undefined && {
        senderPhone: data.senderPhone ?? null,
      }),
    },
  });

  await Promise.all([
    logAudit({
      entityType: "Transaction",
      entityId: id,
      action: "transaction_updated",
      previousData: previousSnapshot,
      newData: {
        type: updated.type,
        category: updated.category,
        amount: updated.amount.toString(),
        paymentMode: updated.paymentMode,
        description: updated.description,
        sponsorPurpose: updated.sponsorPurpose,
      },
      transactionId: id,
      performedById: requestedBy.id,
    }),
    logActivity({
      userId: requestedBy.id,
      action: "transaction_updated",
      description: `Admin ${requestedBy.name} updated transaction ${id}`,
      metadata: { transactionId: id, changes: data },
    }),
  ]);

  return { success: true, data: {}, action: "direct" };
}

// ---------------------------------------------------------------------------
// Delete transaction
// ---------------------------------------------------------------------------

/**
 * Delete (void) a transaction.
 *
 * Admin: soft-delete by setting approvalStatus=REJECTED to void the transaction
 *        without removing the audit trail. Logs to audit/activity.
 * Operator: creates an Approval record (TRANSACTION delete).
 *
 * Razorpay-sourced transactions cannot be deleted by anyone — returns 403.
 */
export async function deleteTransaction(
  id: string,
  requestedBy: { id: string; role: string; name: string }
): Promise<ServiceResult<{ approvalId?: string }>> {
  const existing = await prisma.transaction.findUnique({ where: { id } });

  if (!existing) {
    return { success: false, error: "Transaction not found", status: 404 };
  }

  // Block deletes on Razorpay-sourced transactions
  if (existing.approvalSource === "RAZORPAY_WEBHOOK") {
    return {
      success: false,
      error: "Razorpay-sourced transactions cannot be deleted",
      status: 403,
    };
  }

  if (requestedBy.role === "OPERATOR") {
    const previousData = {
      type: existing.type,
      category: existing.category,
      amount: existing.amount.toString(),
      paymentMode: existing.paymentMode,
      description: existing.description,
      sponsorPurpose: existing.sponsorPurpose,
      senderName: existing.senderName,
      senderPhone: existing.senderPhone,
      memberId: existing.memberId,
    };

    const approval = await prisma.approval.create({
      data: {
        entityType: "TRANSACTION",
        entityId: id,
        action: "delete_transaction",
        previousData: previousData as Prisma.InputJsonValue,
        newData: {
          deleted: true,
          transactionId: id,
        } as Prisma.InputJsonValue,
        requestedById: requestedBy.id,
        status: "PENDING",
      },
    });

    await logActivity({
      userId: requestedBy.id,
      action: "transaction_delete_requested",
      description: `Operator ${requestedBy.name} submitted delete request for transaction ${id}`,
      metadata: { approvalId: approval.id, transactionId: id },
    });

    return {
      success: true,
      data: { approvalId: approval.id },
      action: "pending_approval",
    };
  }

  // Admin path: soft-delete (mark as REJECTED to void the transaction)
  const snapshot = {
    id: existing.id,
    type: existing.type,
    category: existing.category,
    amount: existing.amount.toString(),
    paymentMode: existing.paymentMode,
    description: existing.description,
    approvalStatus: existing.approvalStatus,
  };

  await prisma.transaction.update({
    where: { id },
    data: { approvalStatus: "REJECTED" },
  });

  await Promise.all([
    logAudit({
      entityType: "Transaction",
      entityId: id,
      action: "transaction_deleted",
      previousData: snapshot,
      newData: {
        ...snapshot,
        approvalStatus: "REJECTED",
        deletedBy: requestedBy.id,
      },
      transactionId: id,
      performedById: requestedBy.id,
    }),
    logActivity({
      userId: requestedBy.id,
      action: "transaction_deleted",
      description: `Admin ${requestedBy.name} voided (soft-deleted) transaction ${id}`,
      metadata: { transactionId: id },
    }),
  ]);

  return { success: true, data: {}, action: "direct" };
}

// ---------------------------------------------------------------------------
// Summary stats
// ---------------------------------------------------------------------------

/**
 * Compute summary totals for the Cash Management page header cards.
 * Income and expenses only count APPROVED transactions.
 * Pending amount counts all PENDING transactions regardless of type.
 */
export async function getTransactionSummary(): Promise<
  ServiceResult<TransactionSummary>
> {
  const [incomeAgg, expenseAgg, pendingAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: { type: "CASH_IN", approvalStatus: "APPROVED" },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { type: "CASH_OUT", approvalStatus: "APPROVED" },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { approvalStatus: "PENDING" },
      _sum: { amount: true },
    }),
  ]);

  const totalIncome = Number(incomeAgg._sum.amount ?? 0);
  const totalExpenses = Number(expenseAgg._sum.amount ?? 0);
  const pendingAmount = Number(pendingAgg._sum.amount ?? 0);
  const netBalance = totalIncome - totalExpenses;

  return {
    success: true,
    data: { totalIncome, totalExpenses, pendingAmount, netBalance },
  };
}
