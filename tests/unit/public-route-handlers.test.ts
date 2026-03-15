import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthSession = vi.fn();
const mockGetPublicSponsorLink = vi.fn();
const mockDeactivateSponsorLink = vi.fn();
const mockCreateOrder = vi.fn();
const mockRupeesToPaise = vi.fn((amount: number) => amount * 100);
const mockVerifyPaymentSignature = vi.fn();
const mockRateLimit = vi.fn();
const mockGetRateLimitKey = vi.fn(() => "rl-key");
const mockGetTransaction = vi.fn();
const mockUpdateTransaction = vi.fn();
const mockDeleteTransaction = vi.fn();
const mockGetMembership = vi.fn();
const mockApproveMembership = vi.fn();
const mockRejectMembership = vi.fn();

const mockPrisma = {
  sponsorLink: {
    findUnique: vi.fn(),
  },
  transaction: {
    findFirst: vi.fn(),
  },
  member: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
};

vi.mock("@/lib/auth", () => ({
  getAuthSession: (request: NextRequest | Request) => mockGetAuthSession(request),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/services/sponsor-service", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/services/sponsor-service")>(
      "@/lib/services/sponsor-service"
    );

  return {
    ...actual,
    getPublicSponsorLink: (...args: unknown[]) => mockGetPublicSponsorLink(...args),
    deactivateSponsorLink: (...args: unknown[]) => mockDeactivateSponsorLink(...args),
  };
});

vi.mock("@/lib/razorpay", () => ({
  createOrder: (...args: unknown[]) => mockCreateOrder(...args),
  rupeesToPaise: (amount: number) => mockRupeesToPaise(amount),
  verifyPaymentSignature: (...args: unknown[]) => mockVerifyPaymentSignature(...args),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: mockRateLimit,
  getRateLimitKey: mockGetRateLimitKey,
  PUBLIC_RATE_LIMIT: { maxAttempts: 30, windowMs: 60_000 },
}));

vi.mock("@/lib/services/transaction-service", () => ({
  getTransaction: (...args: unknown[]) => mockGetTransaction(...args),
  updateTransaction: (...args: unknown[]) => mockUpdateTransaction(...args),
  deleteTransaction: (...args: unknown[]) => mockDeleteTransaction(...args),
}));

vi.mock("@/lib/services/membership-service", () => ({
  getMembership: (...args: unknown[]) => mockGetMembership(...args),
  approveMembership: (...args: unknown[]) => mockApproveMembership(...args),
  rejectMembership: (...args: unknown[]) => mockRejectMembership(...args),
}));

const adminSession = {
  user: {
    id: "admin-id",
    name: "Admin",
    email: "admin@test.com",
    role: "ADMIN",
    isTempPassword: false,
    isSubMember: false,
  },
};

const operatorSession = {
  user: {
    id: "operator-id",
    name: "Operator",
    email: "operator@test.com",
    role: "OPERATOR",
    isTempPassword: false,
    isSubMember: false,
  },
};

const memberSession = {
  user: {
    id: "member-id",
    name: "Member",
    email: "member@test.com",
    role: "MEMBER",
    isTempPassword: false,
    isSubMember: false,
  },
};

const tempAdminSession = {
  user: {
    ...adminSession.user,
    isTempPassword: true,
  },
};

function nextRequest(method: string, path: string, body?: unknown): NextRequest {
  const url = new URL(path, "http://localhost:3000");
  return new NextRequest(url, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
  });
}

function plainRequest(method: string, path: string, body?: string | object): Request {
  const payload =
    typeof body === "string" || body === undefined ? body : JSON.stringify(body);

  return new Request(new URL(path, "http://localhost:3000"), {
    method,
    body: payload,
    headers: payload !== undefined ? { "Content-Type": "application/json" } : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockReturnValue({
    success: true,
    remaining: 29,
    resetAt: new Date(Date.now() + 60_000),
  });
});

describe("GET /api/sponsor-links/[token]", () => {
  it("returns active sponsor link data", async () => {
    const { GET } = await import("@/app/api/sponsor-links/[token]/route");
    mockGetPublicSponsorLink.mockResolvedValue({
      success: true,
      data: {
        token: "tok-1",
        sponsorName: "Acme",
        sponsorCompany: "Acme Corp",
        amount: 5000,
        purpose: "TITLE_SPONSOR",
        purposeLabel: "Title Sponsor",
        upiId: "club@upi",
        bankDetails: null,
        isActive: true,
        isExpired: false,
        clubName: "DPS",
      },
    });

    const res = await GET(nextRequest("GET", "/api/sponsor-links/tok-1"), {
      params: { token: "tok-1" },
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      sponsorName: "Acme",
      amount: 5000,
    });
  });

  it("returns 410 when the public link is expired", async () => {
    const { GET } = await import("@/app/api/sponsor-links/[token]/route");
    mockGetPublicSponsorLink.mockResolvedValue({
      success: true,
      data: {
        token: "tok-2",
        sponsorName: null,
        sponsorCompany: null,
        amount: null,
        purpose: "GOLD_SPONSOR",
        purposeLabel: "Gold Sponsor",
        upiId: "club@upi",
        bankDetails: null,
        isActive: true,
        isExpired: true,
        clubName: "DPS",
      },
    });

    const res = await GET(nextRequest("GET", "/api/sponsor-links/tok-2"), {
      params: { token: "tok-2" },
    });

    expect(res.status).toBe(410);
    await expect(res.json()).resolves.toMatchObject({
      error: "This payment link has expired",
    });
  });

  it("forwards service lookup failures", async () => {
    const { GET } = await import("@/app/api/sponsor-links/[token]/route");
    mockGetPublicSponsorLink.mockResolvedValue({
      success: false,
      error: "Sponsor link not found",
      status: 404,
    });

    const res = await GET(nextRequest("GET", "/api/sponsor-links/missing"), {
      params: { token: "missing" },
    });

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/sponsor-links/[token]", () => {
  it("returns 401 when unauthenticated", async () => {
    const { PATCH } = await import("@/app/api/sponsor-links/[token]/route");
    mockGetAuthSession.mockResolvedValue(null);

    const res = await PATCH(nextRequest("PATCH", "/api/sponsor-links/tok-1"), {
      params: { token: "tok-1" },
    });

    expect(res.status).toBe(401);
  });

  it("returns 403 when the password must be changed", async () => {
    const { PATCH } = await import("@/app/api/sponsor-links/[token]/route");
    mockGetAuthSession.mockResolvedValue(tempAdminSession);

    const res = await PATCH(nextRequest("PATCH", "/api/sponsor-links/tok-1"), {
      params: { token: "tok-1" },
    });

    expect(res.status).toBe(403);
  });

  it("returns 404 when the token does not map to a sponsor link", async () => {
    const { PATCH } = await import("@/app/api/sponsor-links/[token]/route");
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockPrisma.sponsorLink.findUnique.mockResolvedValue(null);

    const res = await PATCH(nextRequest("PATCH", "/api/sponsor-links/missing"), {
      params: { token: "missing" },
    });

    expect(res.status).toBe(404);
  });

  it("deactivates the link for authorized users", async () => {
    const { PATCH } = await import("@/app/api/sponsor-links/[token]/route");
    mockGetAuthSession.mockResolvedValue(operatorSession);
    mockPrisma.sponsorLink.findUnique.mockResolvedValue({ id: "link-1" });
    mockDeactivateSponsorLink.mockResolvedValue({ success: true, data: { linkId: "link-1" } });

    const res = await PATCH(nextRequest("PATCH", "/api/sponsor-links/tok-1"), {
      params: { token: "tok-1" },
    });

    expect(res.status).toBe(200);
    expect(mockDeactivateSponsorLink).toHaveBeenCalledWith("link-1", {
      id: "operator-id",
      name: "Operator",
    });
  });
});

describe("GET /api/sponsor-links/[token]/receipt", () => {
  it("requires a paymentId query parameter", async () => {
    const { GET } = await import("@/app/api/sponsor-links/[token]/receipt/route");

    const res = await GET(
      nextRequest("GET", "/api/sponsor-links/tok-1/receipt"),
      { params: { token: "tok-1" } }
    );

    expect(res.status).toBe(400);
  });

  it("returns 404 when the sponsor link token is missing", async () => {
    const { GET } = await import("@/app/api/sponsor-links/[token]/receipt/route");
    mockPrisma.sponsorLink.findUnique.mockResolvedValue(null);

    const res = await GET(
      nextRequest("GET", "/api/sponsor-links/tok-1/receipt?paymentId=pay_12345678"),
      { params: { token: "tok-1" } }
    );

    expect(res.status).toBe(404);
  });

  it("rejects non-sponsorship transactions", async () => {
    const { GET } = await import("@/app/api/sponsor-links/[token]/receipt/route");
    mockPrisma.sponsorLink.findUnique.mockResolvedValue({
      sponsorId: null,
      bankDetails: null,
      sponsor: null,
    });
    mockPrisma.transaction.findFirst.mockResolvedValue({
      category: "OTHER",
    });

    const res = await GET(
      nextRequest("GET", "/api/sponsor-links/tok-1/receipt?paymentId=pay_12345678"),
      { params: { token: "tok-1" } }
    );

    expect(res.status).toBe(400);
  });

  it("rejects payments that belong to another sponsor", async () => {
    const { GET } = await import("@/app/api/sponsor-links/[token]/receipt/route");
    mockPrisma.sponsorLink.findUnique.mockResolvedValue({
      sponsorId: "sponsor-a",
      bankDetails: null,
      sponsor: { id: "sponsor-a", name: "A", company: null },
    });
    mockPrisma.transaction.findFirst.mockResolvedValue({
      category: "SPONSORSHIP",
      sponsorId: "sponsor-b",
    });

    const res = await GET(
      nextRequest("GET", "/api/sponsor-links/tok-1/receipt?paymentId=pay_12345678"),
      { params: { token: "tok-1" } }
    );

    expect(res.status).toBe(404);
  });

  it("builds a fallback receipt payload when the payment is valid", async () => {
    const { GET } = await import("@/app/api/sponsor-links/[token]/receipt/route");
    mockPrisma.sponsorLink.findUnique.mockResolvedValue({
      sponsorId: null,
      bankDetails: { sponsorPurpose: "FOOD_PARTNER" },
      sponsor: null,
    });
    mockPrisma.transaction.findFirst.mockResolvedValue({
      id: "txn-1",
      amount: 2500,
      paymentMode: "UPI",
      receiptNumber: null,
      description: "Sponsor payment",
      sponsorPurpose: null,
      sponsorId: null,
      senderName: "Guest Sponsor",
      createdAt: new Date("2026-03-15T10:00:00Z"),
      approvalStatus: "APPROVED",
      category: "SPONSORSHIP",
      sponsor: null,
    });

    const res = await GET(
      nextRequest("GET", "/api/sponsor-links/tok-1/receipt?paymentId=pay_1234abcd5678"),
      { params: { token: "tok-1" } }
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      receiptNumber: "DPS-PAY-1234ABCD",
      sponsorName: "Guest Sponsor",
      purpose: "FOOD_PARTNER",
      purposeLabel: "Food Partner",
      paymentRef: "pay_1234abcd5678",
    });
  });
});

describe("POST /api/payments/sponsor-order", () => {
  it("returns 429 when the public endpoint is rate limited", async () => {
    const { POST } = await import("@/app/api/payments/sponsor-order/route");
    mockRateLimit.mockReturnValue({
      success: false,
      resetAt: new Date(Date.now() + 10_000),
    });

    const res = await POST(
      plainRequest("POST", "/api/payments/sponsor-order", {
        token: "tok-1",
        amount: 1000,
      })
    );

    expect(res.status).toBe(429);
  });

  it("requires an amount for open-ended sponsor links", async () => {
    const { POST } = await import("@/app/api/payments/sponsor-order/route");
    mockGetPublicSponsorLink.mockResolvedValue({
      success: true,
      data: {
        token: "tok-1",
        amount: null,
        purpose: "GOLD_SPONSOR",
        bankDetails: null,
        isActive: true,
        isExpired: false,
      },
    });

    const res = await POST(
      plainRequest("POST", "/api/payments/sponsor-order", { token: "tok-1" })
    );

    expect(res.status).toBe(400);
  });

  it("rejects expired sponsor links", async () => {
    const { POST } = await import("@/app/api/payments/sponsor-order/route");
    mockGetPublicSponsorLink.mockResolvedValue({
      success: true,
      data: {
        token: "tok-1",
        amount: 5000,
        purpose: "TITLE_SPONSOR",
        bankDetails: null,
        isActive: true,
        isExpired: true,
      },
    });

    const res = await POST(
      plainRequest("POST", "/api/payments/sponsor-order", { token: "tok-1" })
    );

    expect(res.status).toBe(410);
  });

  it("creates an order using the fixed link amount and sponsor metadata", async () => {
    const { POST } = await import("@/app/api/payments/sponsor-order/route");
    mockGetPublicSponsorLink.mockResolvedValue({
      success: true,
      data: {
        token: "tok-1",
        amount: 7500,
        purpose: "TITLE_SPONSOR",
        bankDetails: { sponsorPurpose: "TITLE_SPONSOR" },
        isActive: true,
        isExpired: false,
      },
    });
    mockCreateOrder.mockResolvedValue({
      id: "order_1",
      amount: 750000,
      currency: "INR",
      receipt: "receipt_1",
    });

    const res = await POST(
      plainRequest("POST", "/api/payments/sponsor-order", {
        token: "tok-1",
        amount: 1,
      })
    );

    expect(res.status).toBe(200);
    expect(mockRupeesToPaise).toHaveBeenCalledWith(7500);
    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 750000,
        notes: expect.objectContaining({
          sponsorLinkToken: "tok-1",
          sponsorPurpose: "TITLE_SPONSOR",
        }),
      })
    );
  });

  it("returns 502 when Razorpay order creation fails", async () => {
    const { POST } = await import("@/app/api/payments/sponsor-order/route");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetPublicSponsorLink.mockResolvedValue({
      success: true,
      data: {
        token: "tok-1",
        amount: 5000,
        purpose: "TITLE_SPONSOR",
        bankDetails: null,
        isActive: true,
        isExpired: false,
      },
    });
    mockCreateOrder.mockRejectedValue(new Error("gateway down"));

    const res = await POST(
      plainRequest("POST", "/api/payments/sponsor-order", { token: "tok-1" })
    );

    expect(res.status).toBe(502);
    consoleError.mockRestore();
  });
});

describe("POST /api/payments/sponsor-verify", () => {
  it("returns 429 when rate limited", async () => {
    const { POST } = await import("@/app/api/payments/sponsor-verify/route");
    mockRateLimit.mockReturnValue({
      success: false,
      resetAt: new Date(Date.now() + 5_000),
    });

    const res = await POST(
      plainRequest("POST", "/api/payments/sponsor-verify", {
        razorpay_order_id: "order_1",
        razorpay_payment_id: "pay_1",
        razorpay_signature: "sig_1",
      })
    );

    expect(res.status).toBe(429);
  });

  it("returns 400 when the signature is invalid", async () => {
    const { POST } = await import("@/app/api/payments/sponsor-verify/route");
    mockVerifyPaymentSignature.mockReturnValue(false);

    const res = await POST(
      plainRequest("POST", "/api/payments/sponsor-verify", {
        razorpay_order_id: "order_1",
        razorpay_payment_id: "pay_1",
        razorpay_signature: "sig_1",
      })
    );

    expect(res.status).toBe(400);
  });

  it("returns verified=true for a valid sponsor payment signature", async () => {
    const { POST } = await import("@/app/api/payments/sponsor-verify/route");
    mockVerifyPaymentSignature.mockReturnValue(true);

    const res = await POST(
      plainRequest("POST", "/api/payments/sponsor-verify", {
        razorpay_order_id: "order_1",
        razorpay_payment_id: "pay_1",
        razorpay_signature: "sig_1",
      })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ verified: true });
  });
});

describe("POST /api/payments/create-order", () => {
  it("returns 401 when the user is not authenticated", async () => {
    const { POST } = await import("@/app/api/payments/create-order/route");
    mockGetAuthSession.mockResolvedValue(null);

    const res = await POST(
      nextRequest("POST", "/api/payments/create-order", {
        memberId: "550e8400-e29b-41d4-a716-446655440000",
        membershipType: "ANNUAL",
      })
    );

    expect(res.status).toBe(401);
  });

  it("returns 404 when the member does not exist", async () => {
    const { POST } = await import("@/app/api/payments/create-order/route");
    mockGetAuthSession.mockResolvedValue(memberSession);
    mockPrisma.member.findUnique.mockResolvedValue(null);

    const res = await POST(
      nextRequest("POST", "/api/payments/create-order", {
        memberId: "550e8400-e29b-41d4-a716-446655440000",
        membershipType: "ANNUAL",
      })
    );

    expect(res.status).toBe(404);
  });

  it("rejects duplicate application fee payments", async () => {
    const { POST } = await import("@/app/api/payments/create-order/route");
    mockGetAuthSession.mockResolvedValue(memberSession);
    mockPrisma.member.findUnique.mockResolvedValue({
      id: "member-1",
      name: "Member One",
      user: {
        id: "user-1",
        applicationFeePaid: true,
        memberId: "DPC-2026-0001-00",
      },
    });

    const res = await POST(
      nextRequest("POST", "/api/payments/create-order", {
        memberId: "550e8400-e29b-41d4-a716-446655440000",
        membershipType: "ANNUAL",
        isApplicationFee: true,
      })
    );

    expect(res.status).toBe(400);
  });

  it("creates an order with the server-calculated membership fee", async () => {
    const { POST } = await import("@/app/api/payments/create-order/route");
    mockGetAuthSession.mockResolvedValue(memberSession);
    mockPrisma.member.findUnique.mockResolvedValue({
      id: "member-1",
      name: "Member One",
      user: {
        id: "user-1",
        applicationFeePaid: false,
        memberId: "DPC-2026-0001-00",
      },
    });
    mockCreateOrder.mockResolvedValue({
      id: "order_2",
      amount: 300000,
      currency: "INR",
      receipt: "receipt_2",
    });

    const res = await POST(
      nextRequest("POST", "/api/payments/create-order", {
        memberId: "550e8400-e29b-41d4-a716-446655440000",
        membershipType: "ANNUAL",
      })
    );

    expect(res.status).toBe(200);
    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 300000,
        notes: expect.objectContaining({
          memberId: "550e8400-e29b-41d4-a716-446655440000",
          membershipType: "ANNUAL",
          memberName: "Member One",
          userMemberId: "DPC-2026-0001-00",
        }),
      })
    );
  });
});

describe("POST /api/payments/verify", () => {
  it("returns 401 when unauthenticated", async () => {
    const { POST } = await import("@/app/api/payments/verify/route");
    mockGetAuthSession.mockResolvedValue(null);

    const res = await POST(
      nextRequest("POST", "/api/payments/verify", {
        razorpay_order_id: "order_1",
        razorpay_payment_id: "pay_1",
        razorpay_signature: "sig_1",
      })
    );

    expect(res.status).toBe(401);
  });

  it("returns 400 when verification fails", async () => {
    const { POST } = await import("@/app/api/payments/verify/route");
    mockGetAuthSession.mockResolvedValue(memberSession);
    mockVerifyPaymentSignature.mockReturnValue(false);

    const res = await POST(
      nextRequest("POST", "/api/payments/verify", {
        razorpay_order_id: "order_1",
        razorpay_payment_id: "pay_1",
        razorpay_signature: "sig_1",
      })
    );

    expect(res.status).toBe(400);
  });

  it("returns verified=true when the signature is valid", async () => {
    const { POST } = await import("@/app/api/payments/verify/route");
    mockGetAuthSession.mockResolvedValue(memberSession);
    mockVerifyPaymentSignature.mockReturnValue(true);

    const res = await POST(
      nextRequest("POST", "/api/payments/verify", {
        razorpay_order_id: "order_1",
        razorpay_payment_id: "pay_1",
        razorpay_signature: "sig_1",
      })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ verified: true });
  });
});

describe("transaction and membership detail routes", () => {
  it("GET /api/transactions/[id] returns transaction data for staff", async () => {
    const { GET } = await import("@/app/api/transactions/[id]/route");
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockGetTransaction.mockResolvedValue({
      success: true,
      data: { id: "txn-1", amount: 1000 },
    });

    const res = await GET(nextRequest("GET", "/api/transactions/txn-1"), {
      params: { id: "txn-1" },
    });

    expect(res.status).toBe(200);
  });

  it("PUT /api/transactions/[id] rejects empty update payloads", async () => {
    const { PUT } = await import("@/app/api/transactions/[id]/route");
    mockGetAuthSession.mockResolvedValue(adminSession);

    const res = await PUT(nextRequest("PUT", "/api/transactions/txn-1", {}), {
      params: { id: "txn-1" },
    });

    expect(res.status).toBe(400);
  });

  it("DELETE /api/transactions/[id] surfaces operator approval messaging", async () => {
    const { DELETE } = await import("@/app/api/transactions/[id]/route");
    mockGetAuthSession.mockResolvedValue(operatorSession);
    mockDeleteTransaction.mockResolvedValue({
      success: true,
      data: { approvalId: "approval-1" },
      action: "pending_approval",
    });

    const res = await DELETE(nextRequest("DELETE", "/api/transactions/txn-1"), {
      params: { id: "txn-1" },
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      message: "Transaction delete request submitted for admin approval",
    });
  });

  it("GET /api/memberships/[id] blocks members from viewing someone else's record", async () => {
    const { GET } = await import("@/app/api/memberships/[id]/route");
    mockGetAuthSession.mockResolvedValue(memberSession);
    mockGetMembership.mockResolvedValue({
      success: true,
      data: { id: "membership-1", member: { id: "member-other" } },
    });
    mockPrisma.member.findFirst.mockResolvedValue({ id: "member-self" });

    const res = await GET(nextRequest("GET", "/api/memberships/membership-1"), {
      params: { id: "membership-1" },
    });

    expect(res.status).toBe(403);
  });

  it("PUT /api/memberships/[id] approves memberships for admins", async () => {
    const { PUT } = await import("@/app/api/memberships/[id]/route");
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockApproveMembership.mockResolvedValue({
      success: true,
      data: { id: "membership-1", status: "APPROVED" },
    });

    const res = await PUT(
      nextRequest("PUT", "/api/memberships/membership-1", { status: "APPROVED" }),
      { params: { id: "membership-1" } }
    );

    expect(res.status).toBe(200);
    expect(mockApproveMembership).toHaveBeenCalledWith("membership-1", {
      id: "admin-id",
      name: "Admin",
    });
  });

  it("PUT /api/memberships/[id] rejects memberships with notes", async () => {
    const { PUT } = await import("@/app/api/memberships/[id]/route");
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockRejectMembership.mockResolvedValue({
      success: true,
      data: { id: "membership-1", status: "REJECTED" },
    });

    const res = await PUT(
      nextRequest("PUT", "/api/memberships/membership-1", {
        status: "REJECTED",
        notes: "Duplicate payment",
      }),
      { params: { id: "membership-1" } }
    );

    expect(res.status).toBe(200);
    expect(mockRejectMembership).toHaveBeenCalledWith(
      "membership-1",
      { id: "admin-id", name: "Admin" },
      "Duplicate payment"
    );
  });
});
