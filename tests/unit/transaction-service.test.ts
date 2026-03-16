/**
 * Unit tests for transaction service and validators.
 *
 * Tests cover:
 *   - Validator schemas (createTransactionSchema, updateTransactionSchema, transactionListQuerySchema)
 *   - Service approval gating logic (admin = direct, operator = pending_approval)
 *   - Razorpay-sourced transaction guard (403 on edit/delete)
 *   - Summary aggregation logic
 */

import { describe, it, expect } from "vitest";
import {
  createTransactionSchema,
  updateTransactionSchema,
  transactionListQuerySchema,
} from "@/lib/validators";

// ---------------------------------------------------------------------------
// createTransactionSchema
// ---------------------------------------------------------------------------

describe("createTransactionSchema", () => {
  const validBase = {
    type: "CASH_IN",
    category: "MEMBERSHIP_FEE",
    amount: 250,
    paymentMode: "CASH",
    description: "Monthly membership fee",
  };

  it("accepts a minimal valid payload", () => {
    const result = createTransactionSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("accepts full valid payload with all optional fields", () => {
    const result = createTransactionSchema.safeParse({
      ...validBase,
      category: "SPONSORSHIP",
      sponsorPurpose: "GOLD_SPONSOR",
      memberId: "550e8400-e29b-41d4-a716-446655440000",
      sponsorId: "550e8400-e29b-41d4-a716-446655440001",
      senderName: "Ramesh Kumar",
      senderPhone: "+919876543210",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid type", () => {
    const result = createTransactionSchema.safeParse({
      ...validBase,
      type: "TRANSFER",
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero amount", () => {
    const result = createTransactionSchema.safeParse({ ...validBase, amount: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects negative amount", () => {
    const result = createTransactionSchema.safeParse({
      ...validBase,
      amount: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-number amount", () => {
    const result = createTransactionSchema.safeParse({
      ...validBase,
      amount: "250",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid category", () => {
    const result = createTransactionSchema.safeParse({
      ...validBase,
      category: "DONATION",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid paymentMode", () => {
    const result = createTransactionSchema.safeParse({
      ...validBase,
      paymentMode: "CHEQUE",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty description", () => {
    const result = createTransactionSchema.safeParse({
      ...validBase,
      description: "",
    });
    expect(result.success).toBe(false);
  });

  it("requires sponsorPurpose when category is SPONSORSHIP", () => {
    const result = createTransactionSchema.safeParse({
      ...validBase,
      category: "SPONSORSHIP",
      sponsorPurpose: undefined,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      const sponsorPurposeIssue = issues.find(
        (i) => i.path[0] === "sponsorPurpose"
      );
      expect(sponsorPurposeIssue).toBeDefined();
    }
  });

  it("does not require sponsorPurpose for non-SPONSORSHIP categories", () => {
    const result = createTransactionSchema.safeParse({
      ...validBase,
      category: "EXPENSE",
    });
    expect(result.success).toBe(true);
  });

  it("rejects senderPhone in wrong format", () => {
    const result = createTransactionSchema.safeParse({
      ...validBase,
      senderPhone: "9876543210", // missing +91
    });
    expect(result.success).toBe(false);
  });

  it("accepts senderPhone in correct +91 format", () => {
    const result = createTransactionSchema.safeParse({
      ...validBase,
      senderPhone: "+919876543210",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null for optional nullable fields", () => {
    const result = createTransactionSchema.safeParse({
      ...validBase,
      sponsorPurpose: null,
      memberId: null,
      sponsorId: null,
      senderName: null,
      senderPhone: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts all valid transaction types", () => {
    for (const type of ["CASH_IN", "CASH_OUT"]) {
      const result = createTransactionSchema.safeParse({ ...validBase, type });
      expect(result.success).toBe(true);
    }
  });

  it("accepts all valid categories", () => {
    const sponsorshipBase = {
      ...validBase,
      category: "SPONSORSHIP",
      sponsorPurpose: "TITLE_SPONSOR",
    };
    for (const category of [
      "MEMBERSHIP_FEE",
      "APPLICATION_FEE",
      "EXPENSE",
      "OTHER",
    ]) {
      const result = createTransactionSchema.safeParse({
        ...validBase,
        category,
      });
      expect(result.success).toBe(true);
    }
    const sponsorResult = createTransactionSchema.safeParse(sponsorshipBase);
    expect(sponsorResult.success).toBe(true);
  });

  it("accepts all valid sponsor purposes", () => {
    const purposes = [
      "TITLE_SPONSOR",
      "GOLD_SPONSOR",
      "SILVER_SPONSOR",
      "FOOD_PARTNER",
      "MEDIA_PARTNER",
      "STALL_VENDOR",
      "MARKETING_PARTNER",
    ];
    for (const sponsorPurpose of purposes) {
      const result = createTransactionSchema.safeParse({
        ...validBase,
        category: "SPONSORSHIP",
        sponsorPurpose,
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts all valid payment modes", () => {
    for (const paymentMode of ["UPI", "BANK_TRANSFER", "CASH"]) {
      const result = createTransactionSchema.safeParse({
        ...validBase,
        paymentMode,
      });
      expect(result.success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// updateTransactionSchema
// ---------------------------------------------------------------------------

describe("updateTransactionSchema", () => {
  it("accepts empty object (all optional)", () => {
    const result = updateTransactionSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial update with only description", () => {
    const result = updateTransactionSchema.safeParse({
      description: "Updated description",
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with amount", () => {
    const result = updateTransactionSchema.safeParse({ amount: 500 });
    expect(result.success).toBe(true);
  });

  it("rejects negative amount in update", () => {
    const result = updateTransactionSchema.safeParse({ amount: -50 });
    expect(result.success).toBe(false);
  });

  it("rejects invalid type in update", () => {
    const result = updateTransactionSchema.safeParse({ type: "INVALID" });
    expect(result.success).toBe(false);
  });

  it("allows null sponsorPurpose for non-sponsorship update", () => {
    // Setting sponsorPurpose to null when not changing category is OK
    const result = updateTransactionSchema.safeParse({
      sponsorPurpose: null,
      category: "EXPENSE",
    });
    // When category is explicitly EXPENSE, null sponsorPurpose is fine
    expect(result.success).toBe(true);
  });

  it("disallows null sponsorPurpose when category is SPONSORSHIP", () => {
    const result = updateTransactionSchema.safeParse({
      category: "SPONSORSHIP",
      sponsorPurpose: null,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// transactionListQuerySchema
// ---------------------------------------------------------------------------

describe("transactionListQuerySchema", () => {
  it("accepts empty object (all optional, defaults applied)", () => {
    const result = transactionListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it("coerces page and limit from strings", () => {
    const result = transactionListQuerySchema.safeParse({
      page: "2",
      limit: "50",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(50);
    }
  });

  it("rejects limit over 100", () => {
    const result = transactionListQuerySchema.safeParse({ limit: "200" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid type filter", () => {
    const result = transactionListQuerySchema.safeParse({ type: "WIRE" });
    expect(result.success).toBe(false);
  });

  it("accepts valid type filter", () => {
    const result = transactionListQuerySchema.safeParse({ type: "CASH_IN" });
    expect(result.success).toBe(true);
  });

  it("accepts valid status filter", () => {
    for (const status of ["PENDING", "APPROVED", "REJECTED"]) {
      const result = transactionListQuerySchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  it("accepts dateFrom and dateTo as strings", () => {
    const result = transactionListQuerySchema.safeParse({
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Service-level tests (mocked Prisma)
// ---------------------------------------------------------------------------

import { vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    transaction: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
    approval: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/audit", () => ({
  buildTransactionAuditSnapshot: vi.fn().mockReturnValue({}),
  logAudit: vi.fn(),
  logActivity: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
const mockPrisma = vi.mocked(prisma);

import {
  listTransactions,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getTransactionSummary,
} from "@/lib/services/transaction-service";

const admin = { id: "admin-1", role: "ADMIN", name: "Admin" };
const operator = { id: "op-1", role: "OPERATOR", name: "Operator" };

const validInput = {
  type: "CASH_IN" as const,
  category: "MEMBERSHIP_FEE",
  amount: 250,
  paymentMode: "UPI",
  description: "Test transaction",
};

const existingTransaction = {
  id: "txn-1",
  type: "CASH_IN",
  category: "MEMBERSHIP_FEE",
  amount: new Prisma.Decimal(250),
  paymentMode: "UPI",
  description: "Test",
  approvalStatus: "APPROVED",
  approvalSource: "MANUAL",
  sponsorPurpose: null,
  memberId: null,
  sponsorId: null,
  senderName: null,
  senderPhone: null,
};

const razorpayTransaction = {
  ...existingTransaction,
  id: "txn-rp",
  approvalSource: "RAZORPAY_WEBHOOK",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma));
});

// ---------------------------------------------------------------------------
// createTransaction
// ---------------------------------------------------------------------------

describe("createTransaction — service", () => {
  it("admin creates auto-approved transaction with MANUAL source", async () => {
    const created = { ...existingTransaction, id: "txn-new", member: null, sponsor: null, enteredBy: { id: "admin-1", name: "Admin", email: "a@a.com" }, approvedBy: null };
    mockPrisma.transaction.create.mockResolvedValue(created);

    const result = await createTransaction(validInput, admin);

    expect(result.success).toBe(true);
    expect(result.action).toBe("direct");
    expect(result.status).toBe(201);
    const createData = mockPrisma.transaction.create.mock.calls[0][0].data;
    expect(createData.approvalStatus).toBe("APPROVED");
    expect(createData.approvalSource).toBe("MANUAL");
    expect(createData.approvedById).toBe("admin-1");
  });

  it("operator creates approval record instead of writing transaction", async () => {
    mockPrisma.approval.create.mockResolvedValue({ id: "approval-1" });

    const result = await createTransaction(validInput, operator);

    expect(result.success).toBe(true);
    expect(result.action).toBe("pending_approval");
    expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateTransaction
// ---------------------------------------------------------------------------

describe("updateTransaction — service", () => {
  it("admin updates directly", async () => {
    mockPrisma.transaction.findUnique.mockResolvedValue(existingTransaction);
    mockPrisma.transaction.update.mockResolvedValue({});

    const result = await updateTransaction("txn-1", { description: "Updated" }, admin);

    expect(result.success).toBe(true);
    expect(result.action).toBe("direct");
  });

  it("operator creates approval for edit", async () => {
    mockPrisma.transaction.findUnique.mockResolvedValue(existingTransaction);
    mockPrisma.approval.create.mockResolvedValue({ id: "approval-2" });

    const result = await updateTransaction("txn-1", { description: "Updated" }, operator);

    expect(result.success).toBe(true);
    expect(result.action).toBe("pending_approval");
  });

  it("blocks edit on Razorpay-sourced transaction (403)", async () => {
    mockPrisma.transaction.findUnique.mockResolvedValue(razorpayTransaction);

    const result = await updateTransaction("txn-rp", { description: "Hack" }, admin);

    expect(result.success).toBe(false);
    expect(result.status).toBe(403);
    expect(result.error).toMatch(/Razorpay/);
  });

  it("returns 404 for non-existent transaction", async () => {
    mockPrisma.transaction.findUnique.mockResolvedValue(null);
    const result = await updateTransaction("bad", { description: "X" }, admin);
    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// deleteTransaction
// ---------------------------------------------------------------------------

describe("deleteTransaction — service", () => {
  it("admin soft-deletes by setting approvalStatus=REJECTED", async () => {
    mockPrisma.transaction.findUnique.mockResolvedValue(existingTransaction);

    const result = await deleteTransaction("txn-1", admin);

    expect(result.success).toBe(true);
    expect(result.action).toBe("direct");
    expect(mockPrisma.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { approvalStatus: "REJECTED" } })
    );
  });

  it("operator creates approval for delete", async () => {
    mockPrisma.transaction.findUnique.mockResolvedValue(existingTransaction);
    mockPrisma.approval.create.mockResolvedValue({ id: "approval-3" });

    const result = await deleteTransaction("txn-1", operator);

    expect(result.success).toBe(true);
    expect(result.action).toBe("pending_approval");
  });

  it("blocks delete on Razorpay-sourced transaction (403)", async () => {
    mockPrisma.transaction.findUnique.mockResolvedValue(razorpayTransaction);

    const result = await deleteTransaction("txn-rp", admin);

    expect(result.success).toBe(false);
    expect(result.status).toBe(403);
    expect(result.error).toMatch(/Razorpay/);
  });

  it("returns 404 for non-existent transaction", async () => {
    mockPrisma.transaction.findUnique.mockResolvedValue(null);
    const result = await deleteTransaction("bad", admin);
    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// getTransactionSummary
// ---------------------------------------------------------------------------

describe("getTransactionSummary — math", () => {
  it("computes correct totals", async () => {
    mockPrisma.transaction.aggregate
      .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(5000) } })
      .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(2000) } })
      .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(1000) } });

    const result = await getTransactionSummary();

    expect(result.success).toBe(true);
    expect(result.data!.totalIncome).toBe(5000);
    expect(result.data!.totalExpenses).toBe(2000);
    expect(result.data!.pendingAmount).toBe(1000);
    expect(result.data!.netBalance).toBe(3000);
  });

  it("handles null sums (no transactions)", async () => {
    mockPrisma.transaction.aggregate
      .mockResolvedValueOnce({ _sum: { amount: null } })
      .mockResolvedValueOnce({ _sum: { amount: null } })
      .mockResolvedValueOnce({ _sum: { amount: null } });

    const result = await getTransactionSummary();

    expect(result.data!.totalIncome).toBe(0);
    expect(result.data!.totalExpenses).toBe(0);
    expect(result.data!.netBalance).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// listTransactions — filter/date behavior
// ---------------------------------------------------------------------------

describe("listTransactions — filters", () => {
  beforeEach(() => {
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.transaction.count.mockResolvedValue(0);
  });

  it("returns paginated results", async () => {
    const result = await listTransactions({ page: 1, limit: 10 });
    expect(result.success).toBe(true);
    expect(result.data!.data).toEqual([]);
  });

  it("applies type filter", async () => {
    await listTransactions({ type: "CASH_IN", page: 1, limit: 10 });
    const where = mockPrisma.transaction.findMany.mock.calls[0][0].where;
    expect(where.type).toBe("CASH_IN");
  });

  it("applies date range with end-of-day for dateTo", async () => {
    await listTransactions({ dateFrom: "2026-01-01", dateTo: "2026-01-31", page: 1, limit: 10 });
    const where = mockPrisma.transaction.findMany.mock.calls[0][0].where;
    expect(where.createdAt.gte).toBeInstanceOf(Date);
    expect(where.createdAt.lte.getHours()).toBe(23);
  });

  it("applies status filter as approvalStatus", async () => {
    await listTransactions({ status: "PENDING", page: 1, limit: 10 });
    const where = mockPrisma.transaction.findMany.mock.calls[0][0].where;
    expect(where.approvalStatus).toBe("PENDING");
  });
});

// ---------------------------------------------------------------------------
// getTransaction
// ---------------------------------------------------------------------------

describe("getTransaction — service", () => {
  it("returns transaction when found", async () => {
    mockPrisma.transaction.findUnique.mockResolvedValue(existingTransaction);
    const result = await getTransaction("txn-1");
    expect(result.success).toBe(true);
  });

  it("returns 404 when not found", async () => {
    mockPrisma.transaction.findUnique.mockResolvedValue(null);
    const result = await getTransaction("bad");
    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });
});
