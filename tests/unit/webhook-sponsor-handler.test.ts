/**
 * Unit tests for webhook-sponsor-handler.ts
 *
 * Covers:
 *   - Invalid/missing sponsorPurpose
 *   - Idempotency (duplicate payment)
 *   - Missing sponsor fallback
 *   - UPI vs bank-transfer metadata mapping
 *   - Receipt number generation
 *   - Audit/activity logging
 *   - isSponsorPayment helper
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/prisma", () => ({
  prisma: {
    transaction: { findFirst: vi.fn(), create: vi.fn() },
    sponsor: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/audit", () => ({
  buildTransactionAuditSnapshot: vi.fn().mockReturnValue({}),
  logAudit: vi.fn(),
  logActivity: vi.fn(),
}));
vi.mock("@/lib/receipt", () => ({
  generateReceiptNumber: vi.fn().mockResolvedValue("DPS-REC-2026-0001"),
}));

import { prisma } from "@/lib/prisma";
const mockPrisma = vi.mocked(prisma);

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  handleSponsorWebhookPayment,
  isSponsorPayment,
} from "@/lib/services/webhook-sponsor-handler";
import { logAudit, logActivity } from "@/lib/audit";
import type { RazorpayPaymentPayload } from "@/lib/services/webhook-sponsor-handler";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const systemUserId = "system-1";

function makePayload(overrides: Partial<RazorpayPaymentPayload> = {}): RazorpayPaymentPayload {
  return {
    razorpayPaymentId: "pay_sponsor_001",
    razorpayOrderId: "order_001",
    amountPaise: 5000000, // 50000 INR
    method: "upi",
    upiVpa: "sponsor@upi",
    notes: {
      sponsorId: "sponsor-1",
      sponsorPurpose: "GOLD_SPONSOR",
      sponsorName: "Big Corp",
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma));
  mockPrisma.transaction.findFirst.mockResolvedValue(null); // no duplicate
  mockPrisma.sponsor.findUnique.mockResolvedValue({ id: "sponsor-1" }); // sponsor exists
  mockPrisma.transaction.create.mockResolvedValue({
    id: "txn-sponsor",
    amount: new Prisma.Decimal(50000),
    receiptNumber: "DPS-REC-2026-0001",
  });
});

// ---------------------------------------------------------------------------
// Invalid/missing sponsorPurpose
// ---------------------------------------------------------------------------

describe("handleSponsorWebhookPayment — invalid sponsorPurpose", () => {
  it("returns error for missing sponsorPurpose", async () => {
    const payload = makePayload({ notes: { sponsorId: "s1" } });

    const result = await handleSponsorWebhookPayment(payload, systemUserId);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid or missing sponsorPurpose/);
  });

  it("returns error for invalid sponsorPurpose value", async () => {
    const payload = makePayload({
      notes: { sponsorPurpose: "INVALID_PURPOSE", sponsorId: "s1" },
    });

    const result = await handleSponsorWebhookPayment(payload, systemUserId);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid or missing sponsorPurpose/);
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe("handleSponsorWebhookPayment — idempotency", () => {
  it("returns alreadyProcessed=true for duplicate payment", async () => {
    mockPrisma.transaction.findFirst.mockResolvedValue({
      id: "existing-txn",
      receiptNumber: "DPS-REC-2026-0005",
    });

    const result = await handleSponsorWebhookPayment(makePayload(), systemUserId);

    expect(result.success).toBe(true);
    expect(result.alreadyProcessed).toBe(true);
    expect(result.transactionId).toBe("existing-txn");
    expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Missing sponsor fallback
// ---------------------------------------------------------------------------

describe("handleSponsorWebhookPayment — missing sponsor fallback", () => {
  it("creates transaction without sponsor link when sponsorId not in DB", async () => {
    mockPrisma.sponsor.findUnique.mockResolvedValue(null);
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await handleSponsorWebhookPayment(makePayload(), systemUserId);

    expect(result.success).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("not found in DB")
    );
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UPI vs bank-transfer metadata mapping
// ---------------------------------------------------------------------------

describe("handleSponsorWebhookPayment — metadata mapping", () => {
  it("maps UPI payment metadata", async () => {
    const payload = makePayload({ method: "upi", upiVpa: "test@ybl" });

    const result = await handleSponsorWebhookPayment(payload, systemUserId);

    expect(result.success).toBe(true);
    const createData = mockPrisma.transaction.create.mock.calls[0][0].data;
    expect(createData.paymentMode).toBe("UPI");
    expect(createData.senderUpiId).toBe("test@ybl");
    expect(createData.senderBankAccount).toBeNull();
  });

  it("maps bank transfer metadata", async () => {
    const payload = makePayload({
      method: "netbanking",
      upiVpa: undefined,
      bankName: "SBI",
      senderBankAccount: "XXXX1234",
    });

    const result = await handleSponsorWebhookPayment(payload, systemUserId);

    expect(result.success).toBe(true);
    const createData = mockPrisma.transaction.create.mock.calls[0][0].data;
    expect(createData.paymentMode).toBe("BANK_TRANSFER");
    expect(createData.senderBankName).toBe("SBI");
    expect(createData.senderBankAccount).toBe("XXXX1234");
    expect(createData.senderUpiId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Receipt number generation
// ---------------------------------------------------------------------------

describe("handleSponsorWebhookPayment — receipt number", () => {
  it("generates receipt number inside transaction", async () => {
    // The receipt is generated inside $transaction
    mockPrisma.transaction.findFirst
      .mockResolvedValueOnce(null)  // idempotency check (outside $transaction)
      .mockResolvedValueOnce({ receiptNumber: "DPS-REC-2026-0003" }); // receipt lookup (inside)

    const result = await handleSponsorWebhookPayment(makePayload(), systemUserId);

    expect(result.success).toBe(true);
    expect(result.receiptNumber).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Audit/activity logging
// ---------------------------------------------------------------------------

describe("handleSponsorWebhookPayment — logging", () => {
  it("logs to both audit and activity logs", async () => {
    await handleSponsorWebhookPayment(makePayload(), systemUserId);

    expect(vi.mocked(logAudit)).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: "txn-sponsor" })
    );
    expect(vi.mocked(logActivity)).toHaveBeenCalledWith(
      expect.objectContaining({ action: "sponsor_payment_received" })
    );
  });
});

// ---------------------------------------------------------------------------
// isSponsorPayment helper
// ---------------------------------------------------------------------------

describe("isSponsorPayment", () => {
  it("returns true when notes has valid sponsorPurpose", () => {
    expect(isSponsorPayment({ sponsorPurpose: "GOLD_SPONSOR" })).toBe(true);
  });

  it("returns false when sponsorPurpose is missing", () => {
    expect(isSponsorPayment({})).toBe(false);
  });

  it("returns false for invalid sponsorPurpose", () => {
    expect(isSponsorPayment({ sponsorPurpose: "INVALID" })).toBe(false);
  });

  it("returns false when sponsorPurpose is undefined", () => {
    expect(isSponsorPayment({ sponsorPurpose: undefined })).toBe(false);
  });
});
