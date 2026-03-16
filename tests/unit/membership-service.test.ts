/**
 * Unit tests for membership validators.
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Validator schema tests
// ---------------------------------------------------------------------------

import { createMembershipSchema } from "@/lib/validators";

describe("createMembershipSchema", () => {
  const validBase = {
    memberId: "550e8400-e29b-41d4-a716-446655440000",
    type: "MONTHLY",
    amount: "250",
    isApplicationFee: false,
  };

  it("accepts valid MONTHLY payload", () => {
    const result = createMembershipSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("accepts valid HALF_YEARLY payload", () => {
    const result = createMembershipSchema.safeParse({
      ...validBase,
      type: "HALF_YEARLY",
      amount: "1500",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid ANNUAL payload", () => {
    const result = createMembershipSchema.safeParse({
      ...validBase,
      type: "ANNUAL",
      amount: "3000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid type", () => {
    const result = createMembershipSchema.safeParse({
      ...validBase,
      type: "QUARTERLY",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID memberId", () => {
    const result = createMembershipSchema.safeParse({
      ...validBase,
      memberId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-numeric amount string", () => {
    const result = createMembershipSchema.safeParse({
      ...validBase,
      amount: "abc",
    });
    expect(result.success).toBe(false);
  });

  it("accepts amount with 2 decimal places", () => {
    const result = createMembershipSchema.safeParse({
      ...validBase,
      amount: "250.00",
    });
    expect(result.success).toBe(true);
  });

  it("defaults isApplicationFee to false when not provided", () => {
    const result = createMembershipSchema.safeParse({
      memberId: validBase.memberId,
      type: "MONTHLY",
      amount: "250",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isApplicationFee).toBe(false);
    }
  });

  it("accepts isApplicationFee: true", () => {
    const result = createMembershipSchema.safeParse({
      ...validBase,
      isApplicationFee: true,
      amount: "10250",
    });
    expect(result.success).toBe(true);
  });

  it("missing memberId fails", () => {
    const { memberId: _, ...rest } = validBase;
    const result = createMembershipSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("missing type fails", () => {
    const { type: _, ...rest } = validBase;
    const result = createMembershipSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("missing amount fails", () => {
    const { amount: _, ...rest } = validBase;
    const result = createMembershipSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Service-level tests (mocked Prisma)
// ---------------------------------------------------------------------------

import { vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    member: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    membership: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    approval: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/audit", () => ({
  logActivity: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
const mockPrisma = vi.mocked(prisma);

import {
  createMembership,
  approveMembership,
  rejectMembership,
  getMyMembership,
  getMembershipsByMember,
  listMemberships,
} from "@/lib/services/membership-service";

const admin = { id: "admin-1", role: "ADMIN", name: "Admin" };
const operator = { id: "op-1", role: "OPERATOR", name: "Operator" };

const memberWithUser = {
  id: "member-1",
  name: "Test Member",
  userId: "user-1",
  user: {
    id: "user-1",
    membershipExpiry: null,
    applicationFeePaid: false,
    membershipType: null,
    membershipStatus: "PENDING_APPROVAL",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma));
});

// ---------------------------------------------------------------------------
// createMembership — fee validation
// ---------------------------------------------------------------------------

describe("createMembership — fee validation", () => {
  beforeEach(() => {
    mockPrisma.member.findUnique.mockResolvedValue(memberWithUser);
  });

  it("rejects wrong amount for MONTHLY (expects ₹250)", async () => {
    const result = await createMembership(
      { memberId: "member-1", type: "MONTHLY", amount: 500, isApplicationFee: false },
      admin
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/₹250/);
  });

  it("rejects wrong amount for HALF_YEARLY (expects ₹1500)", async () => {
    const result = await createMembership(
      { memberId: "member-1", type: "HALF_YEARLY", amount: 1000, isApplicationFee: false },
      admin
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/₹1500/);
  });

  it("rejects wrong amount for ANNUAL (expects ₹3000)", async () => {
    const result = await createMembership(
      { memberId: "member-1", type: "ANNUAL", amount: 2000, isApplicationFee: false },
      admin
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/₹3000/);
  });

  it("rejects wrong amount when application fee included (expects ₹10250 for MONTHLY)", async () => {
    const result = await createMembership(
      { memberId: "member-1", type: "MONTHLY", amount: 250, isApplicationFee: true },
      admin
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/₹10250/);
  });

  it("accepts correct MONTHLY + application fee amount (₹10250)", async () => {
    mockPrisma.membership.create.mockResolvedValue({ id: "ms-1" });
    const result = await createMembership(
      { memberId: "member-1", type: "MONTHLY", amount: 10250, isApplicationFee: true },
      admin
    );
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createMembership — application fee already paid
// ---------------------------------------------------------------------------

describe("createMembership — application fee already paid", () => {
  it("rejects if applicationFeePaid is true", async () => {
    mockPrisma.member.findUnique.mockResolvedValue({
      ...memberWithUser,
      user: { ...memberWithUser.user, applicationFeePaid: true },
    });
    const result = await createMembership(
      { memberId: "member-1", type: "MONTHLY", amount: 10250, isApplicationFee: true },
      admin
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already been paid/);
  });

  it("rejects application fee when member has no linked user", async () => {
    mockPrisma.member.findUnique.mockResolvedValue({
      ...memberWithUser,
      userId: null,
      user: null,
    });
    const result = await createMembership(
      { memberId: "member-1", type: "MONTHLY", amount: 10250, isApplicationFee: true },
      admin
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no linked user/);
  });
});

// ---------------------------------------------------------------------------
// createMembership — date rollover
// ---------------------------------------------------------------------------

describe("createMembership — date rollover from current expiry", () => {
  it("starts after current expiry if still active", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    mockPrisma.member.findUnique.mockResolvedValue({
      ...memberWithUser,
      user: { ...memberWithUser.user, membershipExpiry: futureDate },
    });
    mockPrisma.membership.create.mockResolvedValue({ id: "ms-2" });

    const result = await createMembership(
      { memberId: "member-1", type: "MONTHLY", amount: 250, isApplicationFee: false },
      admin
    );

    expect(result.success).toBe(true);
    const createData = mockPrisma.membership.create.mock.calls[0][0].data;
    expect(createData.startDate.getTime()).toBeGreaterThan(futureDate.getTime());
  });

  it("starts today when no current expiry", async () => {
    mockPrisma.member.findUnique.mockResolvedValue(memberWithUser);
    mockPrisma.membership.create.mockResolvedValue({ id: "ms-3" });

    const result = await createMembership(
      { memberId: "member-1", type: "MONTHLY", amount: 250, isApplicationFee: false },
      admin
    );
    expect(result.success).toBe(true);
    const createData = mockPrisma.membership.create.mock.calls[0][0].data;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expect(createData.startDate.getTime()).toBe(today.getTime());
  });
});

// ---------------------------------------------------------------------------
// createMembership — admin vs operator
// ---------------------------------------------------------------------------

describe("createMembership — admin direct create", () => {
  it("creates APPROVED membership and updates User subscription", async () => {
    mockPrisma.member.findUnique.mockResolvedValue(memberWithUser);
    mockPrisma.membership.create.mockResolvedValue({ id: "ms-4" });

    const result = await createMembership(
      { memberId: "member-1", type: "MONTHLY", amount: 250, isApplicationFee: false },
      admin
    );

    expect(result.success).toBe(true);
    expect(result.action).toBe("direct");
    expect(result.status).toBe(201);
    const createData = mockPrisma.membership.create.mock.calls[0][0].data;
    expect(createData.status).toBe("APPROVED");
    expect(mockPrisma.user.update).toHaveBeenCalled();
    expect(mockPrisma.member.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { membershipStatus: "ACTIVE" } })
    );
  });
});

describe("createMembership — operator pending approval", () => {
  it("creates PENDING membership + approval record", async () => {
    mockPrisma.member.findUnique.mockResolvedValue(memberWithUser);
    mockPrisma.membership.create.mockResolvedValue({ id: "ms-5" });
    mockPrisma.approval.create.mockResolvedValue({ id: "approval-1" });

    const result = await createMembership(
      { memberId: "member-1", type: "MONTHLY", amount: 250, isApplicationFee: false },
      operator
    );

    expect(result.success).toBe(true);
    expect(result.action).toBe("pending_approval");
    expect(result.status).toBe(202);
    const createData = mockPrisma.membership.create.mock.calls[0][0].data;
    expect(createData.status).toBe("PENDING");
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

describe("createMembership — 404 for missing member", () => {
  it("returns 404 when member not found", async () => {
    mockPrisma.member.findUnique.mockResolvedValue(null);
    const result = await createMembership(
      { memberId: "bad-id", type: "MONTHLY", amount: 250, isApplicationFee: false },
      admin
    );
    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// approveMembership
// ---------------------------------------------------------------------------

describe("approveMembership", () => {
  const pendingMembership = {
    id: "ms-6",
    status: "PENDING",
    type: "MONTHLY",
    amount: new Prisma.Decimal(250),
    startDate: new Date("2026-01-01"),
    endDate: new Date("2026-01-30"),
    isApplicationFee: false,
    memberId: "member-1",
    member: {
      id: "member-1",
      name: "Test",
      userId: "user-1",
      user: { id: "user-1", totalPaid: new Prisma.Decimal(0), applicationFeePaid: false },
    },
  };

  it("approves and updates User subscription fields", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue(pendingMembership);
    const result = await approveMembership("ms-6", { id: "admin-1", name: "Admin" });
    expect(result.success).toBe(true);
    expect(mockPrisma.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "APPROVED" } })
    );
    expect(mockPrisma.user.update).toHaveBeenCalled();
    expect(mockPrisma.member.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { membershipStatus: "ACTIVE" } })
    );
  });

  it("returns 404 for non-existent membership", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue(null);
    const result = await approveMembership("bad", { id: "admin-1", name: "Admin" });
    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });

  it("returns 400 if membership is not PENDING", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({ ...pendingMembership, status: "APPROVED" });
    const result = await approveMembership("ms-6", { id: "admin-1", name: "Admin" });
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// rejectMembership
// ---------------------------------------------------------------------------

describe("rejectMembership", () => {
  const pendingMembership = {
    id: "ms-7",
    status: "PENDING",
    type: "MONTHLY",
    amount: new Prisma.Decimal(250),
    memberId: "member-1",
    member: { id: "member-1", name: "Test" },
  };

  it("rejects and sets status to REJECTED", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue(pendingMembership);
    const result = await rejectMembership("ms-7", { id: "admin-1", name: "Admin" }, "Not eligible");
    expect(result.success).toBe(true);
    expect(mockPrisma.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "REJECTED" } })
    );
  });

  it("returns 400 if already rejected", async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({ ...pendingMembership, status: "REJECTED" });
    const result = await rejectMembership("ms-7", { id: "admin-1", name: "Admin" });
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// getMyMembership
// ---------------------------------------------------------------------------

describe("getMyMembership", () => {
  const mockUser = {
    id: "user-1",
    memberId: "DPS-2026-0001-00",
    name: "Test",
    email: "test@example.com",
    phone: "+91",
    address: "Addr",
    role: "MEMBER",
    membershipStatus: "ACTIVE",
    membershipType: "MONTHLY",
    membershipStart: new Date(),
    membershipExpiry: new Date(),
    totalPaid: new Prisma.Decimal(250),
    applicationFeePaid: false,
    subMembers: [],
    member: {
      id: "member-1",
      membershipStatus: "ACTIVE",
      memberships: [
        {
          id: "ms-1",
          type: "MONTHLY",
          amount: new Prisma.Decimal(250),
          status: "APPROVED",
          startDate: new Date(),
          endDate: new Date(),
          isApplicationFee: false,
          createdAt: new Date(),
          memberId: "member-1",
        },
      ],
    },
  };

  it("returns membership data for primary member", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    const result = await getMyMembership("user-1", false);
    expect(result.success).toBe(true);
    expect(result.data!.user.memberId).toBe("DPS-2026-0001-00");
    expect(result.data!.paymentHistory).toHaveLength(1);
  });

  it("returns parent membership data for sub-member", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    const result = await getMyMembership("sub-1", true, "user-1");
    expect(result.success).toBe(true);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" } })
    );
  });

  it("returns 404 when user not found", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const result = await getMyMembership("bad", false);
    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// getMembershipsByMember / listMemberships
// ---------------------------------------------------------------------------

describe("getMembershipsByMember", () => {
  it("returns memberships for existing member", async () => {
    mockPrisma.member.findUnique.mockResolvedValue({ id: "member-1" });
    mockPrisma.membership.findMany.mockResolvedValue([
      { id: "ms-1", type: "MONTHLY", amount: new Prisma.Decimal(250), status: "APPROVED", startDate: new Date(), endDate: new Date(), isApplicationFee: false, createdAt: new Date(), memberId: "member-1" },
    ]);
    const result = await getMembershipsByMember("member-1");
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].amount).toBe("250");
  });

  it("returns 404 when member not found", async () => {
    mockPrisma.member.findUnique.mockResolvedValue(null);
    const result = await getMembershipsByMember("bad");
    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });
});

describe("listMemberships", () => {
  it("returns paginated memberships", async () => {
    mockPrisma.membership.findMany.mockResolvedValue([]);
    mockPrisma.membership.count.mockResolvedValue(0);
    const result = await listMemberships({ page: 1, limit: 10 });
    expect(result.success).toBe(true);
    expect(result.data!.data).toEqual([]);
  });
});
