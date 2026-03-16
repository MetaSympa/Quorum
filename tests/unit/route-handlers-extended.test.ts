/**
 * Route handler tests for extended API routes.
 *
 * Tests actual exported handler functions (GET, POST, PUT, DELETE) from
 * route.ts files. Uses vi.mock for auth, services, prisma, and audit —
 * but lets real permission functions run against mocked sessions.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Global mocks — must be declared before any dynamic imports
// ---------------------------------------------------------------------------

const mockGetAuthSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getAuthSession: (...args: unknown[]) => mockGetAuthSession(...args) }));

// Let real permission functions operate on the mocked session
// (no mock for @/lib/permissions)

// Prisma mock
const mockPrisma = {
  user: { count: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  transaction: { aggregate: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  approval: { count: vi.fn(), findUnique: vi.fn() },
  activityLog: { count: vi.fn(), findMany: vi.fn() },
  auditLog: { count: vi.fn(), findMany: vi.fn() },
  member: { findFirst: vi.fn() },
  subMember: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@prisma/client", () => ({ Prisma: {} }));

// Audit mock
vi.mock("@/lib/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit")>();
  return {
    ...actual,
    logAudit: vi.fn().mockResolvedValue(undefined),
    logActivity: vi.fn().mockResolvedValue(undefined),
  };
});

// Service mocks
const mockListSponsors = vi.fn();
const mockCreateSponsor = vi.fn();
const mockGetSponsor = vi.fn();
const mockUpdateSponsor = vi.fn();
const mockDeleteSponsor = vi.fn();
const mockListSponsorLinks = vi.fn();
const mockGenerateSponsorLink = vi.fn();
vi.mock("@/lib/services/sponsor-service", () => ({
  listSponsors: (...args: unknown[]) => mockListSponsors(...args),
  createSponsor: (...args: unknown[]) => mockCreateSponsor(...args),
  getSponsor: (...args: unknown[]) => mockGetSponsor(...args),
  updateSponsor: (...args: unknown[]) => mockUpdateSponsor(...args),
  deleteSponsor: (...args: unknown[]) => mockDeleteSponsor(...args),
  listSponsorLinks: (...args: unknown[]) => mockListSponsorLinks(...args),
  generateSponsorLink: (...args: unknown[]) => mockGenerateSponsorLink(...args),
}));

const mockListMemberships = vi.fn();
const mockCreateMembership = vi.fn();
const mockGetMyMembership = vi.fn();
vi.mock("@/lib/services/membership-service", () => ({
  listMemberships: (...args: unknown[]) => mockListMemberships(...args),
  createMembership: (...args: unknown[]) => mockCreateMembership(...args),
  getMyMembership: (...args: unknown[]) => mockGetMyMembership(...args),
}));

const mockRunDailyCron = vi.fn();
vi.mock("@/lib/cron", () => ({
  runDailyCron: (...args: unknown[]) => mockRunDailyCron(...args),
}));

const mockGenerateReceipt = vi.fn();
vi.mock("@/lib/receipt", () => ({
  generateReceipt: (...args: unknown[]) => mockGenerateReceipt(...args),
}));

// Notification service mocks
const mockNotifyNewApprovalRequest = vi.fn();
const mockNotifyPaymentReceived = vi.fn();
const mockNotifyNewMemberRegistration = vi.fn();
const mockNotifyMembershipApproved = vi.fn();
const mockNotifyMembershipExpiryReminder = vi.fn();
const mockNotifyMembershipExpired = vi.fn();
const mockNotifySponsorPayment = vi.fn();
const mockNotifyRejection = vi.fn();
vi.mock("@/lib/services/notification-service", () => ({
  notifyNewApprovalRequest: (...args: unknown[]) => mockNotifyNewApprovalRequest(...args),
  notifyPaymentReceived: (...args: unknown[]) => mockNotifyPaymentReceived(...args),
  notifyNewMemberRegistration: (...args: unknown[]) => mockNotifyNewMemberRegistration(...args),
  notifyMembershipApproved: (...args: unknown[]) => mockNotifyMembershipApproved(...args),
  notifyMembershipExpiryReminder: (...args: unknown[]) => mockNotifyMembershipExpiryReminder(...args),
  notifyMembershipExpired: (...args: unknown[]) => mockNotifyMembershipExpired(...args),
  notifySponsorPayment: (...args: unknown[]) => mockNotifySponsorPayment(...args),
  notifyRejection: (...args: unknown[]) => mockNotifyRejection(...args),
}));

// bcryptjs mock
vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn().mockResolvedValue("$2a$12$hashedpassword"),
  },
}));

// Rate limit mock — always allow
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockReturnValue({ success: true, remaining: 4, resetAt: new Date() }),
  getRateLimitKeyForUser: vi.fn().mockReturnValue("test-key"),
  LOGIN_RATE_LIMIT: { maxAttempts: 5, windowMs: 900000 },
}));

// Validators: use real validators — do not mock
// vi.mock("@/lib/validators") — intentionally NOT mocked

// ---------------------------------------------------------------------------
// Session fixtures
// ---------------------------------------------------------------------------

const adminSession = {
  user: {
    id: "admin-id",
    email: "admin@test.com",
    name: "Admin",
    role: "ADMIN",
    memberId: "DPC-2026-0001-00",
    isTempPassword: false,
    isSubMember: false,
  },
  expires: new Date(Date.now() + 3600000).toISOString(),
};

const operatorSession = {
  user: {
    id: "op-id",
    email: "op@test.com",
    name: "Operator",
    role: "OPERATOR",
    memberId: "DPC-2026-0002-00",
    isTempPassword: false,
    isSubMember: false,
  },
  expires: new Date(Date.now() + 3600000).toISOString(),
};

const memberSession = {
  user: {
    id: "member-id",
    email: "member@test.com",
    name: "Member",
    role: "MEMBER",
    memberId: "DPC-2026-0003-00",
    isTempPassword: false,
    isSubMember: false,
  },
  expires: new Date(Date.now() + 3600000).toISOString(),
};

const tempPasswordSession = {
  user: {
    ...adminSession.user,
    id: "temp-id",
    isTempPassword: true,
  },
  expires: new Date(Date.now() + 3600000).toISOString(),
};

// ---------------------------------------------------------------------------
// Request helper
// ---------------------------------------------------------------------------

function mockRequest(method: string, path: string, body?: unknown): NextRequest {
  const url = new URL(path, "http://localhost:3000");
  const init: { method: string; body?: string; headers?: Record<string, string> } = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(url, init);
}

function mockRequestWithHeaders(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): NextRequest {
  const url = new URL(path, "http://localhost:3000");
  const hdrs = { ...headers };
  if (body !== undefined) {
    hdrs["Content-Type"] = "application/json";
  }
  return new NextRequest(url, {
    method,
    headers: hdrs,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// Reset all mocks before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CRON_SECRET;
});

// =========================================================================
// 1. GET /api/sponsors
// =========================================================================

describe("GET /api/sponsors", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/app/api/sponsors/route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthSession.mockResolvedValue(null);
    const res = await GET(mockRequest("GET", "/api/sponsors"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for MEMBER role", async () => {
    mockGetAuthSession.mockResolvedValue(memberSession);
    const res = await GET(mockRequest("GET", "/api/sponsors"));
    expect(res.status).toBe(403);
  });

  it("returns 403 when isTempPassword is true", async () => {
    mockGetAuthSession.mockResolvedValue(tempPasswordSession);
    const res = await GET(mockRequest("GET", "/api/sponsors"));
    expect(res.status).toBe(403);
  });

  it("returns sponsors list for admin", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockListSponsors.mockResolvedValue({ success: true, data: { data: [], total: 0 } });
    const res = await GET(mockRequest("GET", "/api/sponsors"));
    expect(res.status).toBe(200);
    expect(mockListSponsors).toHaveBeenCalled();
  });

  it("returns sponsors list for operator", async () => {
    mockGetAuthSession.mockResolvedValue(operatorSession);
    mockListSponsors.mockResolvedValue({ success: true, data: { data: [], total: 0 } });
    const res = await GET(mockRequest("GET", "/api/sponsors"));
    expect(res.status).toBe(200);
  });
});

// =========================================================================
// 2. POST /api/sponsors
// =========================================================================

describe("POST /api/sponsors", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/app/api/sponsors/route");
    POST = mod.POST;
  });

  const validBody = { name: "Test Sponsor", phone: "+911234567890", email: "s@test.com" };

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthSession.mockResolvedValue(null);
    const res = await POST(mockRequest("POST", "/api/sponsors", validBody));
    expect(res.status).toBe(401);
  });

  it("returns 403 for MEMBER role", async () => {
    mockGetAuthSession.mockResolvedValue(memberSession);
    const res = await POST(mockRequest("POST", "/api/sponsors", validBody));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    const res = await POST(mockRequest("POST", "/api/sponsors", { name: "" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/[Vv]alidation/);
  });

  it("creates sponsor with valid body", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockCreateSponsor.mockResolvedValue({ success: true, data: { id: "s1" }, status: 201 });
    const res = await POST(mockRequest("POST", "/api/sponsors", validBody));
    expect(res.status).toBe(201);
    expect(mockCreateSponsor).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Test Sponsor" }),
      { id: "admin-id", name: "Admin" },
    );
  });
});

// =========================================================================
// 3. GET /api/sponsors/[id]
// =========================================================================

describe("GET /api/sponsors/[id]", () => {
  let GET: (req: NextRequest, ctx: { params: { id: string } }) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/app/api/sponsors/[id]/route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthSession.mockResolvedValue(null);
    const res = await GET(mockRequest("GET", "/api/sponsors/abc"), { params: { id: "abc" } });
    expect(res.status).toBe(401);
  });

  it("returns 403 for MEMBER role", async () => {
    mockGetAuthSession.mockResolvedValue(memberSession);
    const res = await GET(mockRequest("GET", "/api/sponsors/abc"), { params: { id: "abc" } });
    expect(res.status).toBe(403);
  });

  it("returns sponsor data for admin", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockGetSponsor.mockResolvedValue({ success: true, data: { id: "abc", name: "S" } });
    const res = await GET(mockRequest("GET", "/api/sponsors/abc"), { params: { id: "abc" } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("abc");
  });

  it("returns error when sponsor not found", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockGetSponsor.mockResolvedValue({ success: false, error: "Not found", status: 404 });
    const res = await GET(mockRequest("GET", "/api/sponsors/xyz"), { params: { id: "xyz" } });
    expect(res.status).toBe(404);
  });
});

// =========================================================================
// 3b. PUT /api/sponsors/[id]
// =========================================================================

describe("PUT /api/sponsors/[id]", () => {
  let PUT: (req: NextRequest, ctx: { params: { id: string } }) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/app/api/sponsors/[id]/route");
    PUT = mod.PUT;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthSession.mockResolvedValue(null);
    const res = await PUT(mockRequest("PUT", "/api/sponsors/abc", { name: "X" }), { params: { id: "abc" } });
    expect(res.status).toBe(401);
  });

  it("returns 400 for empty update body", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    const res = await PUT(mockRequest("PUT", "/api/sponsors/abc", {}), { params: { id: "abc" } });
    expect(res.status).toBe(400);
  });

  it("updates sponsor with valid body", async () => {
    mockGetAuthSession.mockResolvedValue(operatorSession);
    mockUpdateSponsor.mockResolvedValue({ success: true, data: { id: "abc" } });
    const res = await PUT(mockRequest("PUT", "/api/sponsors/abc", { name: "Updated" }), { params: { id: "abc" } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe("Sponsor updated successfully");
  });
});

// =========================================================================
// 3c. DELETE /api/sponsors/[id]
// =========================================================================

describe("DELETE /api/sponsors/[id]", () => {
  let DELETE: (req: NextRequest, ctx: { params: { id: string } }) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/app/api/sponsors/[id]/route");
    DELETE = mod.DELETE;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthSession.mockResolvedValue(null);
    const res = await DELETE(mockRequest("DELETE", "/api/sponsors/abc"), { params: { id: "abc" } });
    expect(res.status).toBe(401);
  });

  it("returns 403 for MEMBER role", async () => {
    mockGetAuthSession.mockResolvedValue(memberSession);
    const res = await DELETE(mockRequest("DELETE", "/api/sponsors/abc"), { params: { id: "abc" } });
    expect(res.status).toBe(403);
  });

  it("deletes sponsor successfully", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockDeleteSponsor.mockResolvedValue({ success: true });
    const res = await DELETE(mockRequest("DELETE", "/api/sponsors/abc"), { params: { id: "abc" } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe("Sponsor deleted successfully");
  });
});

// =========================================================================
// 4. GET /api/sponsor-links
// =========================================================================

describe("GET /api/sponsor-links", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/app/api/sponsor-links/route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthSession.mockResolvedValue(null);
    const res = await GET(mockRequest("GET", "/api/sponsor-links"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for MEMBER role", async () => {
    mockGetAuthSession.mockResolvedValue(memberSession);
    const res = await GET(mockRequest("GET", "/api/sponsor-links"));
    expect(res.status).toBe(403);
  });

  it("returns links for admin", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockListSponsorLinks.mockResolvedValue({ success: true, data: { data: [], total: 0 } });
    const res = await GET(mockRequest("GET", "/api/sponsor-links"));
    expect(res.status).toBe(200);
  });
});

// =========================================================================
// 5. POST /api/sponsor-links
// =========================================================================

describe("POST /api/sponsor-links", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/app/api/sponsor-links/route");
    POST = mod.POST;
  });

  const validBody = {
    upiId: "test@upi",
    sponsorPurpose: "TITLE_SPONSOR",
  };

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthSession.mockResolvedValue(null);
    const res = await POST(mockRequest("POST", "/api/sponsor-links", validBody));
    expect(res.status).toBe(401);
  });

  it("returns 403 for MEMBER role", async () => {
    mockGetAuthSession.mockResolvedValue(memberSession);
    const res = await POST(mockRequest("POST", "/api/sponsor-links", validBody));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    const res = await POST(mockRequest("POST", "/api/sponsor-links", { upiId: "" }));
    expect(res.status).toBe(400);
  });

  it("creates sponsor link successfully", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockGenerateSponsorLink.mockResolvedValue({ success: true, data: { token: "tok-1" } });
    const res = await POST(mockRequest("POST", "/api/sponsor-links", validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.message).toBe("Sponsor payment link generated successfully");
  });
});

// =========================================================================
// 6. GET /api/dashboard/stats
// =========================================================================

describe("GET /api/dashboard/stats", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/app/api/dashboard/stats/route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthSession.mockResolvedValue(null);
    const res = await GET(mockRequest("GET", "/api/dashboard/stats"));
    expect(res.status).toBe(401);
  });

  it("returns admin stats for ADMIN role", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockPrisma.user.count.mockResolvedValue(10);
    mockPrisma.transaction.aggregate.mockResolvedValue({ _sum: { amount: 5000 } });
    mockPrisma.approval.count.mockResolvedValue(3);
    mockPrisma.activityLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.findMany.mockResolvedValue([]);

    const res = await GET(mockRequest("GET", "/api/dashboard/stats"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("members");
    expect(json).toHaveProperty("financial");
    expect(json).toHaveProperty("approvals");
    expect(json).toHaveProperty("recentActivity");
    expect(json).toHaveProperty("recentAudit");
  });

  it("returns admin stats for OPERATOR role", async () => {
    mockGetAuthSession.mockResolvedValue(operatorSession);
    mockPrisma.user.count.mockResolvedValue(5);
    mockPrisma.transaction.aggregate.mockResolvedValue({ _sum: { amount: null } });
    mockPrisma.approval.count.mockResolvedValue(0);
    mockPrisma.activityLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.findMany.mockResolvedValue([]);

    const res = await GET(mockRequest("GET", "/api/dashboard/stats"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.financial.totalIncome).toBe(0);
  });

  it("builds recent audit snapshots from linked transactions", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockPrisma.user.count.mockResolvedValue(10);
    mockPrisma.transaction.aggregate.mockResolvedValue({ _sum: { amount: 5000 } });
    mockPrisma.approval.count.mockResolvedValue(3);
    mockPrisma.activityLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.findMany.mockResolvedValue([
      {
        id: "audit-1",
        createdAt: new Date("2026-03-15T10:00:00.000Z"),
        performedBy: {
          id: "admin-id",
          name: "Admin",
          role: "ADMIN",
          memberId: "DPC-2026-0001-00",
        },
        transaction: {
          id: "txn-1",
          type: "CASH_IN",
          category: "SPONSORSHIP",
          amount: 2500,
          paymentMode: "UPI",
          description: "Sponsor payment",
          sponsorPurpose: "GOLD_SPONSOR",
          approvalStatus: "APPROVED",
          approvalSource: "MANUAL",
          enteredById: "op-id",
          approvedById: "admin-id",
          approvedAt: new Date("2026-03-15T09:00:00.000Z"),
          razorpayPaymentId: null,
          razorpayOrderId: null,
          senderName: "Acme Corp",
          senderPhone: null,
          senderUpiId: null,
          senderBankAccount: null,
          senderBankName: null,
          receiptNumber: "RCPT-1",
          memberId: null,
          sponsorId: "sponsor-1",
          createdAt: new Date("2026-03-15T08:00:00.000Z"),
        },
      },
    ]);

    const res = await GET(mockRequest("GET", "/api/dashboard/stats"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.recentAudit[0].transactionSnapshot).toMatchObject({
      category: "SPONSORSHIP",
      amount: "2500",
      senderName: "Acme Corp",
      approvalStatus: "APPROVED",
    });
  });

  it("returns member stats for MEMBER role", async () => {
    mockGetAuthSession.mockResolvedValue(memberSession);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "member-id",
      memberId: "DPC-2026-0003-00",
      name: "Member",
      membershipStatus: "ACTIVE",
      membershipType: "ANNUAL",
      membershipExpiry: new Date(Date.now() + 86400000 * 30),
      membershipStart: new Date(),
      totalPaid: 1000,
    });
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.subMember.findMany.mockResolvedValue([]);

    const res = await GET(mockRequest("GET", "/api/dashboard/stats"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("membership");
    expect(json).toHaveProperty("payments");
    expect(json).toHaveProperty("subMembers");
  });

  it("returns 404 when member user not found in DB", async () => {
    mockGetAuthSession.mockResolvedValue(memberSession);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.subMember.findMany.mockResolvedValue([]);

    const res = await GET(mockRequest("GET", "/api/dashboard/stats"));
    expect(res.status).toBe(404);
  });
});

// =========================================================================
// 7. GET /api/activity-log
// =========================================================================

describe("GET /api/activity-log", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/app/api/activity-log/route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthSession.mockResolvedValue(null);
    const res = await GET(mockRequest("GET", "/api/activity-log"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for MEMBER role", async () => {
    mockGetAuthSession.mockResolvedValue(memberSession);
    const res = await GET(mockRequest("GET", "/api/activity-log"));
    expect(res.status).toBe(403);
  });

  it("returns 403 when isTempPassword is true", async () => {
    mockGetAuthSession.mockResolvedValue(tempPasswordSession);
    const res = await GET(mockRequest("GET", "/api/activity-log"));
    expect(res.status).toBe(403);
  });

  it("returns paginated activity log for admin", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockPrisma.activityLog.count.mockResolvedValue(1);
    mockPrisma.activityLog.findMany.mockResolvedValue([
      { id: "a1", action: "login", description: "User logged in", createdAt: new Date(), user: { id: "u1", name: "X", role: "ADMIN", memberId: "M1" } },
    ]);

    const res = await GET(mockRequest("GET", "/api/activity-log"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("data");
    expect(json).toHaveProperty("pagination");
    expect(json.pagination.total).toBe(1);
  });
});

// =========================================================================
// 8-11. POST/PUT/PATCH/DELETE /api/activity-log — 405 handlers
// =========================================================================

describe("activity-log 405 handlers", () => {
  let POST: () => Promise<Response>;
  let PUT: () => Promise<Response>;
  let PATCH: () => Promise<Response>;
  let DELETE: () => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/app/api/activity-log/route");
    POST = mod.POST;
    PUT = mod.PUT;
    PATCH = mod.PATCH;
    DELETE = mod.DELETE;
  });

  it("POST returns 405", async () => {
    const res = await POST();
    expect(res.status).toBe(405);
    const json = await res.json();
    expect(json.error).toContain("Method Not Allowed");
  });

  it("PUT returns 405", async () => {
    const res = await PUT();
    expect(res.status).toBe(405);
  });

  it("PATCH returns 405", async () => {
    const res = await PATCH();
    expect(res.status).toBe(405);
  });

  it("DELETE returns 405", async () => {
    const res = await DELETE();
    expect(res.status).toBe(405);
  });
});

// =========================================================================
// 12. GET /api/audit-log
// =========================================================================

describe("GET /api/audit-log", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/app/api/audit-log/route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthSession.mockResolvedValue(null);
    const res = await GET(mockRequest("GET", "/api/audit-log"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for MEMBER role", async () => {
    mockGetAuthSession.mockResolvedValue(memberSession);
    const res = await GET(mockRequest("GET", "/api/audit-log"));
    expect(res.status).toBe(403);
  });

  it("returns paginated audit log for operator", async () => {
    mockGetAuthSession.mockResolvedValue(operatorSession);
    mockPrisma.auditLog.count.mockResolvedValue(2);
    mockPrisma.auditLog.findMany.mockResolvedValue([
      {
        id: "al1",
        transactionSnapshot: { category: "SPONSORSHIP", amount: "5000" },
        transactionId: "t1",
        performedById: "u1",
        createdAt: new Date(),
        performedBy: { id: "u1", name: "Admin", role: "ADMIN", memberId: "M1" },
        transaction: null,
      },
    ]);

    const res = await GET(mockRequest("GET", "/api/audit-log"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("data");
    expect(json).toHaveProperty("pagination");
  });

  it("hydrates audit log snapshots from transactions when needed", async () => {
    mockGetAuthSession.mockResolvedValue(operatorSession);
    mockPrisma.auditLog.count.mockResolvedValue(1);
    mockPrisma.auditLog.findMany.mockResolvedValue([
      {
        id: "al2",
        transactionId: "t2",
        performedById: "u1",
        createdAt: new Date("2026-03-15T11:00:00.000Z"),
        performedBy: { id: "u1", name: "Admin", role: "ADMIN", memberId: "M1" },
        transaction: {
          id: "t2",
          type: "CASH_OUT",
          category: "EXPENSE",
          amount: 1250,
          paymentMode: "BANK_TRANSFER",
          description: "Venue advance",
          sponsorPurpose: null,
          approvalStatus: "APPROVED",
          approvalSource: "MANUAL",
          senderName: "Venue Vendor",
          senderPhone: null,
          senderUpiId: null,
          senderBankAccount: null,
          senderBankName: "Axis Bank",
          razorpayPaymentId: null,
          razorpayOrderId: null,
          receiptNumber: "RCPT-2",
          createdAt: new Date("2026-03-15T10:30:00.000Z"),
        },
      },
    ]);

    const res = await GET(mockRequest("GET", "/api/audit-log"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data[0].transactionSnapshot).toMatchObject({
      category: "EXPENSE",
      amount: "1250",
      senderName: "Venue Vendor",
      approvalStatus: "APPROVED",
    });
  });

  it("applies transaction category filter", async () => {
    mockGetAuthSession.mockResolvedValue(operatorSession);
    mockPrisma.auditLog.count.mockResolvedValue(0);
    mockPrisma.auditLog.findMany.mockResolvedValue([]);

    const res = await GET(mockRequest("GET", "/api/audit-log?category=SPONSORSHIP"));
    expect(res.status).toBe(200);
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          transaction: {
            is: {
              approvalStatus: "APPROVED",
              category: "SPONSORSHIP",
            },
          },
        }),
      })
    );
  });

  it("includes only approved transactions in audit results", async () => {
    mockGetAuthSession.mockResolvedValue(operatorSession);
    mockPrisma.auditLog.count.mockResolvedValue(0);
    mockPrisma.auditLog.findMany.mockResolvedValue([]);

    const res = await GET(mockRequest("GET", "/api/audit-log"));
    expect(res.status).toBe(200);
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          transaction: {
            is: expect.objectContaining({
              approvalStatus: "APPROVED",
            }),
          },
        }),
      })
    );
  });

});

// =========================================================================
// 13-14. POST/PUT /api/audit-log — 405 handlers
// =========================================================================

describe("audit-log 405 handlers", () => {
  let POST: () => Promise<Response>;
  let PUT: () => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/app/api/audit-log/route");
    POST = mod.POST;
    PUT = mod.PUT;
  });

  it("POST returns 405", async () => {
    const res = await POST();
    expect(res.status).toBe(405);
    const json = await res.json();
    expect(json.error).toContain("Method Not Allowed");
  });

  it("PUT returns 405", async () => {
    const res = await PUT();
    expect(res.status).toBe(405);
  });
});

// =========================================================================
// 15. POST /api/auth/change-password
// =========================================================================

describe("POST /api/auth/change-password", () => {
  let POST: (req: NextRequest) => Promise<Response>;
  let bcrypt: { compare: ReturnType<typeof vi.fn>; hash: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    const mod = await import("@/app/api/auth/change-password/route");
    POST = mod.POST;
    bcrypt = (await import("bcryptjs")).default as unknown as typeof bcrypt;
  });

  const validBody = { currentPassword: "OldPass123!", newPassword: "NewPass456!" };

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthSession.mockResolvedValue(null);
    const res = await POST(mockRequest("POST", "/api/auth/change-password", validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body (short password)", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    const res = await POST(mockRequest("POST", "/api/auth/change-password", { currentPassword: "short", newPassword: "s" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when current password is wrong", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "admin-id", password: "$2a$12$hash" });
    bcrypt.compare.mockResolvedValue(false);

    const res = await POST(mockRequest("POST", "/api/auth/change-password", validBody));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("incorrect");
  });

  it("changes password successfully for user", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "admin-id", password: "$2a$12$hash" });
    bcrypt.compare.mockResolvedValue(true);
    mockPrisma.user.update.mockResolvedValue({});

    const res = await POST(mockRequest("POST", "/api/auth/change-password", validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("returns 404 when user not found in DB", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await POST(mockRequest("POST", "/api/auth/change-password", validBody));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain("not found");
  });
});

// =========================================================================
// 16. GET /api/memberships
// =========================================================================

describe("GET /api/memberships", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/app/api/memberships/route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthSession.mockResolvedValue(null);
    const res = await GET(mockRequest("GET", "/api/memberships"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when isTempPassword is true", async () => {
    mockGetAuthSession.mockResolvedValue(tempPasswordSession);
    const res = await GET(mockRequest("GET", "/api/memberships"));
    expect(res.status).toBe(403);
  });

  it("returns memberships for admin", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockListMemberships.mockResolvedValue({ success: true, data: { data: [], total: 0 } });
    const res = await GET(mockRequest("GET", "/api/memberships"));
    expect(res.status).toBe(200);
  });

  it("scopes to own member record for MEMBER role", async () => {
    mockGetAuthSession.mockResolvedValue(memberSession);
    const memberRecordId = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";
    mockPrisma.member.findFirst.mockResolvedValue({ id: memberRecordId });
    mockListMemberships.mockResolvedValue({ success: true, data: { data: [], total: 0 } });

    const res = await GET(mockRequest("GET", "/api/memberships"));
    expect(res.status).toBe(200);
    expect(mockPrisma.member.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "member-id" } }),
    );
  });

  it("returns empty for MEMBER with no member record", async () => {
    mockGetAuthSession.mockResolvedValue(memberSession);
    mockPrisma.member.findFirst.mockResolvedValue(null);

    const res = await GET(mockRequest("GET", "/api/memberships"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual([]);
  });
});

// =========================================================================
// 17. POST /api/memberships
// =========================================================================

describe("POST /api/memberships", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/app/api/memberships/route");
    POST = mod.POST;
  });

  const validBody = {
    memberId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    type: "ANNUAL",
    amount: "10000",
  };

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthSession.mockResolvedValue(null);
    const res = await POST(mockRequest("POST", "/api/memberships", validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    const res = await POST(mockRequest("POST", "/api/memberships", { type: "INVALID" }));
    expect(res.status).toBe(400);
  });

  it("creates membership for admin", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockCreateMembership.mockResolvedValue({
      success: true,
      data: { id: "ms1" },
      action: "approved",
      status: 201,
    });

    const res = await POST(mockRequest("POST", "/api/memberships", validBody));
    expect(res.status).toBe(201);
    expect(mockCreateMembership).toHaveBeenCalled();
  });

  it("returns 403 when MEMBER creates for different member", async () => {
    mockGetAuthSession.mockResolvedValue(memberSession);
    mockPrisma.member.findFirst.mockResolvedValue({ id: "different-member" });

    const res = await POST(mockRequest("POST", "/api/memberships", validBody));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Forbidden");
  });

  it("allows MEMBER to create own membership", async () => {
    mockGetAuthSession.mockResolvedValue(memberSession);
    const memberId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    mockPrisma.member.findFirst.mockResolvedValue({ id: memberId });
    mockCreateMembership.mockResolvedValue({
      success: true,
      data: { id: "ms2" },
      action: "pending_approval",
      status: 202,
    });

    const res = await POST(mockRequest("POST", "/api/memberships", { ...validBody, memberId }));
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.message).toContain("submitted for admin approval");
  });
});

// =========================================================================
// 18. GET /api/my-membership
// =========================================================================

describe("GET /api/my-membership", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/app/api/my-membership/route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthSession.mockResolvedValue(null);
    const res = await GET(mockRequest("GET", "/api/my-membership"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when isTempPassword is true", async () => {
    mockGetAuthSession.mockResolvedValue(tempPasswordSession);
    const res = await GET(mockRequest("GET", "/api/my-membership"));
    expect(res.status).toBe(403);
  });

  it("returns membership data for authenticated member", async () => {
    mockGetAuthSession.mockResolvedValue(memberSession);
    mockGetMyMembership.mockResolvedValue({
      success: true,
      data: { user: { name: "Member" }, member: null, subMembers: [], payments: [] },
    });

    const res = await GET(mockRequest("GET", "/api/my-membership"));
    expect(res.status).toBe(200);
    expect(mockGetMyMembership).toHaveBeenCalledWith("member-id", false, undefined);
  });

  it("returns error when service fails", async () => {
    mockGetAuthSession.mockResolvedValue(memberSession);
    mockGetMyMembership.mockResolvedValue({ success: false, error: "Not found", status: 404 });

    const res = await GET(mockRequest("GET", "/api/my-membership"));
    expect(res.status).toBe(404);
  });
});

// =========================================================================
// 19. POST /api/cron
// =========================================================================

describe("POST /api/cron", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/app/api/cron/route");
    POST = mod.POST;
  });

  it("returns 401 when unauthenticated and no cron secret", async () => {
    mockGetAuthSession.mockResolvedValue(null);
    const res = await POST(mockRequest("POST", "/api/cron"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for MEMBER role (no cron secret)", async () => {
    mockGetAuthSession.mockResolvedValue(memberSession);
    const res = await POST(mockRequest("POST", "/api/cron"));
    expect(res.status).toBe(403);
  });

  it("returns 403 for OPERATOR role (no cron secret)", async () => {
    mockGetAuthSession.mockResolvedValue(operatorSession);
    const res = await POST(mockRequest("POST", "/api/cron"));
    expect(res.status).toBe(403);
  });

  it("runs cron for ADMIN session", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockRunDailyCron.mockResolvedValue({ processed: 5, reminded: 2, expired: 1 });

    const res = await POST(mockRequest("POST", "/api/cron"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.processed).toBe(5);
  });

  it("runs cron with valid x-cron-secret header", async () => {
    process.env.CRON_SECRET = "my-secret-123";
    mockRunDailyCron.mockResolvedValue({ processed: 3, reminded: 1, expired: 0 });

    const req = mockRequestWithHeaders("POST", "/api/cron", { "x-cron-secret": "my-secret-123" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    // getAuthSession should NOT have been called when secret matches
    expect(mockGetAuthSession).not.toHaveBeenCalled();
  });

  it("rejects invalid x-cron-secret and falls back to session auth", async () => {
    process.env.CRON_SECRET = "my-secret-123";
    mockGetAuthSession.mockResolvedValue(null);

    const req = mockRequestWithHeaders("POST", "/api/cron", { "x-cron-secret": "wrong-secret" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 500 when cron job throws", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockRunDailyCron.mockRejectedValue(new Error("DB timeout"));

    const res = await POST(mockRequest("POST", "/api/cron"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Cron job failed");
  });
});

// =========================================================================
// 20. POST /api/notifications/whatsapp
// =========================================================================

describe("POST /api/notifications/whatsapp", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/app/api/notifications/whatsapp/route");
    POST = mod.POST;
  });

  const entityId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthSession.mockResolvedValue(null);
    const res = await POST(mockRequest("POST", "/api/notifications/whatsapp", { type: "approval", entityId }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for OPERATOR role", async () => {
    mockGetAuthSession.mockResolvedValue(operatorSession);
    const res = await POST(mockRequest("POST", "/api/notifications/whatsapp", { type: "approval", entityId }));
    expect(res.status).toBe(403);
  });

  it("returns 403 for MEMBER role", async () => {
    mockGetAuthSession.mockResolvedValue(memberSession);
    const res = await POST(mockRequest("POST", "/api/notifications/whatsapp", { type: "approval", entityId }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    const res = await POST(mockRequest("POST", "/api/notifications/whatsapp", { type: "unknown", entityId: "bad" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when approval entity not found", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockPrisma.approval.findUnique.mockResolvedValue(null);

    const res = await POST(mockRequest("POST", "/api/notifications/whatsapp", { type: "approval", entityId }));
    expect(res.status).toBe(404);
  });

  it("sends approval notification successfully", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockPrisma.approval.findUnique.mockResolvedValue({ id: entityId, requestedBy: { name: "X" } });
    mockNotifyNewApprovalRequest.mockResolvedValue({ sent: 1, failed: 0 });

    const res = await POST(mockRequest("POST", "/api/notifications/whatsapp", { type: "approval", entityId }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.sent).toBe(1);
  });

  it("sends new_member notification successfully", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockPrisma.user.findUnique.mockResolvedValue({ id: entityId, name: "New Member" });
    mockNotifyNewMemberRegistration.mockResolvedValue({ sent: 1, failed: 0 });

    const res = await POST(mockRequest("POST", "/api/notifications/whatsapp", { type: "new_member", entityId }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("sends payment notification successfully", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockPrisma.transaction.findUnique.mockResolvedValue({ id: entityId, member: { name: "M" } });
    mockNotifyPaymentReceived.mockResolvedValue({ sent: 2, failed: 0 });

    const res = await POST(mockRequest("POST", "/api/notifications/whatsapp", { type: "payment", entityId }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sent).toBe(2);
  });

  it("returns 404 for payment when transaction not found", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockPrisma.transaction.findUnique.mockResolvedValue(null);

    const res = await POST(mockRequest("POST", "/api/notifications/whatsapp", { type: "payment", entityId }));
    expect(res.status).toBe(404);
  });
});

// =========================================================================
// 21. GET /api/receipts/[id]
// =========================================================================

describe("GET /api/receipts/[id]", () => {
  let GET: (req: NextRequest, ctx: { params: { id: string } }) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/app/api/receipts/[id]/route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthSession.mockResolvedValue(null);
    const res = await GET(mockRequest("GET", "/api/receipts/txn1"), { params: { id: "txn1" } });
    expect(res.status).toBe(401);
  });

  it("returns 403 for MEMBER role", async () => {
    mockGetAuthSession.mockResolvedValue(memberSession);
    const res = await GET(mockRequest("GET", "/api/receipts/txn1"), { params: { id: "txn1" } });
    expect(res.status).toBe(403);
  });

  it("returns receipt data for admin", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockGenerateReceipt.mockResolvedValue({
      success: true,
      data: { receiptNumber: "REC-001", amount: 5000 },
    });

    const res = await GET(mockRequest("GET", "/api/receipts/txn1"), { params: { id: "txn1" } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.receiptNumber).toBe("REC-001");
  });

  it("returns receipt data for operator", async () => {
    mockGetAuthSession.mockResolvedValue(operatorSession);
    mockGenerateReceipt.mockResolvedValue({
      success: true,
      data: { receiptNumber: "REC-002" },
    });

    const res = await GET(mockRequest("GET", "/api/receipts/txn2"), { params: { id: "txn2" } });
    expect(res.status).toBe(200);
    expect(mockGenerateReceipt).toHaveBeenCalledWith("txn2", "op-id");
  });

  it("returns error when receipt generation fails", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    mockGenerateReceipt.mockResolvedValue({
      success: false,
      error: "Transaction is not APPROVED",
      status: 400,
    });

    const res = await GET(mockRequest("GET", "/api/receipts/txn3"), { params: { id: "txn3" } });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("not APPROVED");
  });

  it("returns 400 for empty id param", async () => {
    mockGetAuthSession.mockResolvedValue(adminSession);
    const res = await GET(mockRequest("GET", "/api/receipts/ "), { params: { id: " " } });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("required");
  });
});
