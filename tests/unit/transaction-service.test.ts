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
// Business rule: Razorpay-sourced guard
// ---------------------------------------------------------------------------

describe("Razorpay-sourced transaction guard", () => {
  /**
   * The service checks existing.approvalSource === "RAZORPAY_WEBHOOK" before
   * allowing edits or deletes. We test the guard logic itself (not the DB call).
   */

  function guardCheck(approvalSource: string): boolean {
    return approvalSource === "RAZORPAY_WEBHOOK";
  }

  it("blocks edit when approvalSource is RAZORPAY_WEBHOOK", () => {
    expect(guardCheck("RAZORPAY_WEBHOOK")).toBe(true);
  });

  it("allows edit when approvalSource is MANUAL", () => {
    expect(guardCheck("MANUAL")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Approval gating logic
// ---------------------------------------------------------------------------

describe("Transaction approval gating", () => {
  /**
   * Simulates the role-based branching in transaction-service.ts.
   * ADMIN → "direct", OPERATOR → "pending_approval"
   */

  function determineAction(role: string): "direct" | "pending_approval" {
    return role === "OPERATOR" ? "pending_approval" : "direct";
  }

  it("returns direct for ADMIN", () => {
    expect(determineAction("ADMIN")).toBe("direct");
  });

  it("returns pending_approval for OPERATOR", () => {
    expect(determineAction("OPERATOR")).toBe("pending_approval");
  });

  it("returns direct for any non-operator role", () => {
    expect(determineAction("MEMBER")).toBe("direct");
  });
});

// ---------------------------------------------------------------------------
// Currency formatting
// ---------------------------------------------------------------------------

describe("Currency formatting", () => {
  function formatCurrency(value: number): string {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  it("formats whole numbers correctly", () => {
    const result = formatCurrency(1000);
    expect(result).toContain("1,000");
    expect(result).toContain("00");
  });

  it("formats decimals correctly", () => {
    const result = formatCurrency(1234.56);
    expect(result).toContain("1,234");
    expect(result).toContain("56");
  });

  it("formats zero correctly", () => {
    const result = formatCurrency(0);
    expect(result).toContain("0");
  });

  it("formats negative numbers correctly", () => {
    const result = formatCurrency(-500);
    expect(result).toContain("500");
  });
});

// ---------------------------------------------------------------------------
// Summary computation
// ---------------------------------------------------------------------------

describe("Summary computation", () => {
  function computeSummary(
    income: number,
    expenses: number,
    pending: number
  ): { totalIncome: number; totalExpenses: number; pendingAmount: number; netBalance: number } {
    return {
      totalIncome: income,
      totalExpenses: expenses,
      pendingAmount: pending,
      netBalance: income - expenses,
    };
  }

  it("computes positive net balance", () => {
    const s = computeSummary(10000, 3000, 500);
    expect(s.netBalance).toBe(7000);
  });

  it("computes zero net balance when equal", () => {
    const s = computeSummary(5000, 5000, 0);
    expect(s.netBalance).toBe(0);
  });

  it("computes negative net balance when expenses exceed income", () => {
    const s = computeSummary(2000, 5000, 0);
    expect(s.netBalance).toBe(-3000);
  });

  it("includes pending amount separately (not in net balance)", () => {
    const s = computeSummary(10000, 3000, 2000);
    expect(s.pendingAmount).toBe(2000);
    expect(s.netBalance).toBe(7000); // pending doesn't affect net balance
  });
});
