/**
 * Unit tests for the Razorpay webhook route handler (POST /api/webhooks/razorpay).
 *
 * Covers:
 *   - Rate limiting
 *   - Invalid signature → 401
 *   - Invalid JSON after valid signature → 200
 *   - Idempotent duplicate payment handling
 *   - payment.captured
 *   - virtual_account.credited
 *   - payment.failed
 *   - Amount mismatch rejection
 *   - Membership/user/member updates
 *   - Receipt generation/logging
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — declared before imports
// ---------------------------------------------------------------------------

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    transaction: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    member: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    membership: {
      create: vi.fn(),
    },
    activityLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/razorpay", () => ({
  verifyWebhookSignature: vi.fn(),
  paiseToRupees: vi.fn((p: number) => p / 100),
}));

vi.mock("@/lib/audit", () => ({
  buildTransactionAuditSnapshot: vi.fn().mockReturnValue({}),
  logAudit: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(),
  getRateLimitKey: vi.fn().mockReturnValue("webhook:127.0.0.1"),
  WEBHOOK_RATE_LIMIT: { maxAttempts: 50, windowMs: 60000 },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/webhooks/razorpay/route";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { logActivity } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("http://localhost/api/webhooks/razorpay", {
    method: "POST",
    body: bodyStr,
    headers: {
      "content-type": "application/json",
      "x-razorpay-signature": "valid-sig",
      ...headers,
    },
  });
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_123",
          order_id: "order_456",
          amount: 25000,  // 250 INR in paise
          currency: "INR",
          status: "captured",
          method: "upi",
          vpa: "test@upi",
          notes: {
            memberId: "member-1",
            membershipType: "MONTHLY",
            memberName: "Test",
          },
          ...overrides,
        },
      },
    },
    created_at: Date.now() / 1000,
  };
}

const systemUser = { id: "system-1" };

beforeEach(() => {
  vi.clearAllMocks();
  // Default: rate limit passes
  vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 49, resetAt: new Date() });
  // Default: signature valid
  vi.mocked(verifyWebhookSignature).mockReturnValue(true);
  // Default: system user exists
  vi.mocked(prisma.user.findUnique).mockResolvedValue(systemUser as never);
  // Default: no duplicate
  vi.mocked(prisma.transaction.findFirst).mockResolvedValue(null);
  // Default: $transaction passes through
  vi.mocked(prisma.$transaction).mockImplementation(async (cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma as never));
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

describe("webhook — rate limiting", () => {
  it("returns 429 when rate limited", async () => {
    vi.mocked(rateLimit).mockReturnValue({
      success: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 30000),
    });

    const res = await POST(makeRequest(validPayload()));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/Too many/);
  });
});

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

describe("webhook — signature verification", () => {
  it("returns 401 for invalid signature", async () => {
    vi.mocked(verifyWebhookSignature).mockReturnValue(false);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(systemUser as never);

    const res = await POST(makeRequest(validPayload()));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid signature/);
  });
});

// ---------------------------------------------------------------------------
// Invalid JSON after valid signature
// ---------------------------------------------------------------------------

describe("webhook — invalid JSON", () => {
  it("returns 200 for invalid JSON after valid signature", async () => {
    const res = await POST(makeRequest("not valid json {{{"));

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Idempotent duplicate handling
// ---------------------------------------------------------------------------

describe("webhook — idempotent duplicate", () => {
  it("skips duplicate payment without creating new transaction", async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({
      id: "existing-txn",
    } as never);

    const res = await POST(makeRequest(validPayload()));

    expect(res.status).toBe(200);
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// payment.captured
// ---------------------------------------------------------------------------

describe("webhook — payment.captured", () => {
  it("creates transaction and membership for valid membership payment", async () => {
    const memberData = {
      id: "member-1",
      userId: "user-1",
      user: { id: "user-1", membershipExpiry: null, applicationFeePaid: false, totalPaid: { toString: () => "0" } },
    };
    vi.mocked(prisma.member.findUnique).mockResolvedValue(memberData as never);
    vi.mocked(prisma.transaction.create).mockResolvedValue({
      id: "txn-new",
      type: "CASH_IN",
      category: "MEMBERSHIP_FEE",
      amount: { toString: () => "250" },
    } as never);
    vi.mocked(prisma.transaction.findFirst)
      .mockResolvedValueOnce(null)  // idempotency check
      .mockResolvedValueOnce(null)  // receipt number lookup (inside $transaction)
      .mockResolvedValueOnce({      // post-transaction lookup
        id: "txn-new",
        type: "CASH_IN",
        category: "MEMBERSHIP_FEE",
        amount: { toString: () => "250" },
        paymentMode: "UPI",
        approvalStatus: "APPROVED",
        approvalSource: "RAZORPAY_WEBHOOK",
        receiptNumber: "DPS-REC-2026-0001",
        memberId: "member-1",
        sponsorId: null,
      } as never);

    const res = await POST(makeRequest(validPayload()));

    expect(res.status).toBe(200);
    expect(prisma.transaction.create).toHaveBeenCalled();
    const createData = vi.mocked(prisma.transaction.create).mock.calls[0][0].data;
    expect(createData.approvalStatus).toBe("APPROVED");
    expect(createData.approvalSource).toBe("RAZORPAY_WEBHOOK");
    expect(prisma.membership.create).toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalled();
    expect(prisma.member.update).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// virtual_account.credited
// ---------------------------------------------------------------------------

describe("webhook — virtual_account.credited", () => {
  it("handles bank transfer via virtual account same as payment.captured", async () => {
    const payload = validPayload();
    payload.event = "virtual_account.credited";

    vi.mocked(prisma.transaction.create).mockResolvedValue({ id: "txn-va" } as never);
    vi.mocked(prisma.member.findUnique).mockResolvedValue({
      id: "member-1",
      userId: "user-1",
      user: { id: "user-1", membershipExpiry: null, applicationFeePaid: false, totalPaid: { toString: () => "0" } },
    } as never);
    vi.mocked(prisma.transaction.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "txn-va", type: "CASH_IN", category: "MEMBERSHIP_FEE", amount: { toString: () => "250" }, paymentMode: "UPI", approvalStatus: "APPROVED", approvalSource: "RAZORPAY_WEBHOOK", receiptNumber: "DPS-REC-2026-0001", memberId: "member-1", sponsorId: null } as never);

    const res = await POST(makeRequest(payload));

    expect(res.status).toBe(200);
    expect(prisma.transaction.create).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// payment.failed
// ---------------------------------------------------------------------------

describe("webhook — payment.failed", () => {
  it("logs failed payment without creating transaction", async () => {
    const payload = validPayload();
    payload.event = "payment.failed";

    const res = await POST(makeRequest(payload));

    expect(res.status).toBe(200);
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(vi.mocked(logActivity)).toHaveBeenCalledWith(
      expect.objectContaining({ action: "razorpay_payment_failed" })
    );
  });
});

// ---------------------------------------------------------------------------
// Amount mismatch
// ---------------------------------------------------------------------------

describe("webhook — amount mismatch", () => {
  it("rejects when amount does not match expected fee", async () => {
    // MONTHLY fee is 250 INR = 25000 paise, but we send 50000 paise (500 INR)
    const payload = validPayload({ amount: 50000 });

    const res = await POST(makeRequest(payload));

    expect(res.status).toBe(200); // still returns 200 to prevent retry storms
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(vi.mocked(logActivity)).toHaveBeenCalledWith(
      expect.objectContaining({ action: "payment_amount_mismatch" })
    );
  });
});

// ---------------------------------------------------------------------------
// Receipt generation
// ---------------------------------------------------------------------------

describe("webhook — receipt generation", () => {
  it("assigns receipt number inside transaction", async () => {
    vi.mocked(prisma.member.findUnique).mockResolvedValue({
      id: "member-1",
      userId: "user-1",
      user: { id: "user-1", membershipExpiry: null, applicationFeePaid: false, totalPaid: { toString: () => "0" } },
    } as never);
    vi.mocked(prisma.transaction.create).mockResolvedValue({ id: "txn-rec" } as never);
    vi.mocked(prisma.transaction.findFirst)
      .mockResolvedValueOnce(null) // idempotency
      .mockResolvedValueOnce({ receiptNumber: "DPS-REC-2026-0005" }) // receipt lookup
      .mockResolvedValueOnce({ id: "txn-rec", receiptNumber: "DPS-REC-2026-0006", type: "CASH_IN", category: "MEMBERSHIP_FEE", amount: { toString: () => "250" }, paymentMode: "UPI", approvalStatus: "APPROVED", approvalSource: "RAZORPAY_WEBHOOK", memberId: "member-1", sponsorId: null } as never);

    const res = await POST(makeRequest(validPayload()));

    expect(res.status).toBe(200);
    // Receipt number assigned via transaction.update
    expect(prisma.transaction.update).toHaveBeenCalled();
  });
});
