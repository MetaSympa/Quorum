/**
 * Unit tests for member-service.ts
 *
 * Covers:
 *   - Admin vs operator create/update/delete
 *   - Member ID + temp password generation
 *   - Mirrored User/Member updates
 *   - Sub-member add/update/remove/list
 *   - Max 3 sub-members rule
 *   - Missing parent / missing parent user failures
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/prisma", () => ({
  prisma: {
    member: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    user: { create: vi.fn(), update: vi.fn() },
    subMember: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
    approval: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/audit", () => ({
  logActivity: vi.fn(),
}));
vi.mock("@/lib/member-id", () => ({
  generateMemberId: vi.fn().mockResolvedValue("DPS-2026-0001-00"),
  generateSubMemberId: vi.fn().mockReturnValue("DPS-2026-0001-01"),
  countSubMembers: vi.fn().mockResolvedValue(0),
  nextSubMemberIndex: vi.fn().mockResolvedValue(1),
}));

import { prisma } from "@/lib/prisma";
const mockPrisma = vi.mocked(prisma);

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  listMembers,
  getMember,
  createMember,
  updateMember,
  deleteMember,
  addSubMember,
  updateSubMember,
  removeSubMember,
  listSubMembers,
} from "@/lib/services/member-service";
import { countSubMembers, nextSubMemberIndex } from "@/lib/member-id";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const admin = { id: "admin-1", role: "ADMIN", name: "Admin" };
const operator = { id: "op-1", role: "OPERATOR", name: "Operator" };

const validCreateInput = {
  name: "Test Member",
  email: "test@example.com",
  phone: "+919876543210",
  address: "123 Street",
};

const existingMember = {
  id: "member-1",
  userId: "user-1",
  name: "Existing",
  email: "existing@example.com",
  phone: "+919876543210",
  address: "Old Address",
  membershipStatus: "ACTIVE",
  user: { id: "user-1", memberId: "DPS-2026-0001-00" },
};

const existingSubMember = {
  id: "sub-1",
  memberId: "DPS-2026-0001-01",
  parentUserId: "user-1",
  name: "Sub Member",
  email: "sub@example.com",
  phone: "+919876543211",
  relation: "SPOUSE",
  canLogin: true,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Default $transaction: execute the callback with mockPrisma as tx
  mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma));
});

// ---------------------------------------------------------------------------
// listMembers
// ---------------------------------------------------------------------------

describe("listMembers", () => {
  it("returns paginated members", async () => {
    const members = [{ id: "m1", name: "A" }];
    mockPrisma.member.findMany.mockResolvedValue(members);
    mockPrisma.member.count.mockResolvedValue(1);

    const result = await listMembers({ page: 1, limit: 10 });

    expect(result.success).toBe(true);
    expect(result.data!.data).toEqual(members);
    expect(result.data!.total).toBe(1);
    expect(result.data!.totalPages).toBe(1);
  });

  it("applies search filter", async () => {
    mockPrisma.member.findMany.mockResolvedValue([]);
    mockPrisma.member.count.mockResolvedValue(0);

    await listMembers({ search: "john", page: 1, limit: 10 });

    const call = mockPrisma.member.findMany.mock.calls[0][0];
    expect(call.where.OR).toBeDefined();
    expect(call.where.OR).toHaveLength(3);
  });

  it("applies status filter", async () => {
    mockPrisma.member.findMany.mockResolvedValue([]);
    mockPrisma.member.count.mockResolvedValue(0);

    await listMembers({ status: "ACTIVE" as any, page: 1, limit: 10 });

    const call = mockPrisma.member.findMany.mock.calls[0][0];
    expect(call.where.membershipStatus).toBe("ACTIVE");
  });
});

// ---------------------------------------------------------------------------
// getMember
// ---------------------------------------------------------------------------

describe("getMember", () => {
  it("returns member with sub-members when found", async () => {
    mockPrisma.member.findUnique.mockResolvedValue({
      ...existingMember,
      user: { ...existingMember.user, subMembers: [existingSubMember] },
      childMembers: [],
      membershipStatus: "ACTIVE",
    });

    const result = await getMember("member-1");

    expect(result.success).toBe(true);
    expect(result.data!.subMembers).toHaveLength(1);
  });

  it("returns 404 for non-existent member", async () => {
    mockPrisma.member.findUnique.mockResolvedValue(null);

    const result = await getMember("not-exist");

    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// createMember
// ---------------------------------------------------------------------------

describe("createMember", () => {
  it("admin creates User + Member directly with generated memberId and temp password", async () => {
    mockPrisma.user.create.mockResolvedValue({ id: "new-user" });
    mockPrisma.member.create.mockResolvedValue({ id: "new-member" });

    const result = await createMember(validCreateInput, admin);

    expect(result.success).toBe(true);
    expect(result.action).toBe("direct");
    expect(result.data!.memberId).toBe("DPS-2026-0001-00");
    expect(result.status).toBe(201);
    // User was created inside $transaction
    expect(mockPrisma.user.create).toHaveBeenCalled();
    const userData = mockPrisma.user.create.mock.calls[0][0].data;
    expect(userData.isTempPassword).toBe(true);
    expect(userData.role).toBe("MEMBER");
    expect(userData.membershipStatus).toBe("PENDING_APPROVAL");
  });

  it("operator creates approval record instead of direct write", async () => {
    mockPrisma.approval.create.mockResolvedValue({ id: "approval-1" });

    const result = await createMember(validCreateInput, operator);

    expect(result.success).toBe(true);
    expect(result.action).toBe("pending_approval");
    expect(result.data!.approvalId).toBe("approval-1");
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateMember
// ---------------------------------------------------------------------------

describe("updateMember", () => {
  beforeEach(() => {
    mockPrisma.member.findUnique.mockResolvedValue(existingMember);
  });

  it("admin updates Member and mirrors to User", async () => {
    const result = await updateMember("member-1", { name: "New Name" }, admin);

    expect(result.success).toBe(true);
    expect(result.action).toBe("direct");
    expect(mockPrisma.member.update).toHaveBeenCalled();
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({ name: "New Name" }),
      })
    );
  });

  it("operator creates approval for edit", async () => {
    mockPrisma.approval.create.mockResolvedValue({ id: "approval-2" });

    const result = await updateMember("member-1", { name: "New Name" }, operator);

    expect(result.success).toBe(true);
    expect(result.action).toBe("pending_approval");
    expect(mockPrisma.member.update).not.toHaveBeenCalled();
  });

  it("returns 404 for non-existent member", async () => {
    mockPrisma.member.findUnique.mockResolvedValue(null);

    const result = await updateMember("bad-id", { name: "X" }, admin);

    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// deleteMember
// ---------------------------------------------------------------------------

describe("deleteMember", () => {
  beforeEach(() => {
    mockPrisma.member.findUnique.mockResolvedValue(existingMember);
  });

  it("admin soft-deletes by setting SUSPENDED", async () => {
    const result = await deleteMember("member-1", admin);

    expect(result.success).toBe(true);
    expect(result.action).toBe("direct");
    expect(mockPrisma.member.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { membershipStatus: "SUSPENDED" },
      })
    );
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { membershipStatus: "SUSPENDED" },
      })
    );
  });

  it("operator creates approval for delete", async () => {
    mockPrisma.approval.create.mockResolvedValue({ id: "approval-3" });

    const result = await deleteMember("member-1", operator);

    expect(result.success).toBe(true);
    expect(result.action).toBe("pending_approval");
    expect(mockPrisma.member.update).not.toHaveBeenCalled();
  });

  it("returns 404 for non-existent member", async () => {
    mockPrisma.member.findUnique.mockResolvedValue(null);

    const result = await deleteMember("bad-id", admin);

    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// addSubMember
// ---------------------------------------------------------------------------

describe("addSubMember", () => {
  const subInput = {
    name: "Sub Person",
    email: "sub@example.com",
    phone: "+919876543212",
    relation: "SPOUSE",
  };

  it("admin creates sub-member directly", async () => {
    mockPrisma.member.findUnique.mockResolvedValue(existingMember);
    mockPrisma.subMember.create.mockResolvedValue({ id: "sub-new" });

    const result = await addSubMember("member-1", subInput, admin);

    expect(result.success).toBe(true);
    expect(result.action).toBe("direct");
    expect(result.status).toBe(201);
    expect(mockPrisma.subMember.create).toHaveBeenCalled();
  });

  it("operator creates approval for sub-member add", async () => {
    mockPrisma.member.findUnique.mockResolvedValue(existingMember);
    mockPrisma.approval.create.mockResolvedValue({ id: "approval-sub" });

    const result = await addSubMember("member-1", subInput, operator);

    expect(result.success).toBe(true);
    expect(result.action).toBe("pending_approval");
  });

  it("rejects when max 3 sub-members reached", async () => {
    mockPrisma.member.findUnique.mockResolvedValue(existingMember);
    (countSubMembers as ReturnType<typeof vi.fn>).mockResolvedValue(3);

    const result = await addSubMember("member-1", subInput, admin);

    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toMatch(/Maximum of 3/);
  });

  it("returns 404 when parent member not found", async () => {
    mockPrisma.member.findUnique.mockResolvedValue(null);

    const result = await addSubMember("bad-id", subInput, admin);

    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });

  it("returns 400 when parent member has no linked user", async () => {
    mockPrisma.member.findUnique.mockResolvedValue({
      ...existingMember,
      userId: null,
      user: null,
    });

    const result = await addSubMember("member-1", subInput, admin);

    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toMatch(/no linked user/);
  });

  it("returns 400 when nextSubMemberIndex returns null (admin path)", async () => {
    mockPrisma.member.findUnique.mockResolvedValue(existingMember);
    (countSubMembers as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    (nextSubMemberIndex as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await addSubMember("member-1", subInput, admin);

    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// updateSubMember
// ---------------------------------------------------------------------------

describe("updateSubMember", () => {
  beforeEach(() => {
    mockPrisma.member.findUnique.mockResolvedValue(existingMember);
    mockPrisma.subMember.findFirst.mockResolvedValue(existingSubMember);
  });

  it("admin updates sub-member directly", async () => {
    const result = await updateSubMember("member-1", "sub-1", { name: "New Sub" }, admin);

    expect(result.success).toBe(true);
    expect(result.action).toBe("direct");
    expect(mockPrisma.subMember.update).toHaveBeenCalled();
  });

  it("operator creates approval for sub-member edit", async () => {
    mockPrisma.approval.create.mockResolvedValue({ id: "approval-sub-edit" });

    const result = await updateSubMember("member-1", "sub-1", { name: "New Sub" }, operator);

    expect(result.success).toBe(true);
    expect(result.action).toBe("pending_approval");
  });

  it("returns 404 when parent not found", async () => {
    mockPrisma.member.findUnique.mockResolvedValue(null);

    const result = await updateSubMember("bad", "sub-1", { name: "X" }, admin);

    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });

  it("returns 404 when sub-member not found", async () => {
    mockPrisma.subMember.findFirst.mockResolvedValue(null);

    const result = await updateSubMember("member-1", "bad-sub", { name: "X" }, admin);

    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// removeSubMember
// ---------------------------------------------------------------------------

describe("removeSubMember", () => {
  beforeEach(() => {
    mockPrisma.member.findUnique.mockResolvedValue(existingMember);
    mockPrisma.subMember.findFirst.mockResolvedValue(existingSubMember);
  });

  it("admin hard-deletes sub-member", async () => {
    const result = await removeSubMember("member-1", "sub-1", admin);

    expect(result.success).toBe(true);
    expect(result.action).toBe("direct");
    expect(mockPrisma.subMember.delete).toHaveBeenCalledWith({ where: { id: "sub-1" } });
  });

  it("operator creates approval for sub-member remove", async () => {
    mockPrisma.approval.create.mockResolvedValue({ id: "approval-sub-rm" });

    const result = await removeSubMember("member-1", "sub-1", operator);

    expect(result.success).toBe(true);
    expect(result.action).toBe("pending_approval");
  });

  it("returns 404 when parent not found", async () => {
    mockPrisma.member.findUnique.mockResolvedValue(null);

    const result = await removeSubMember("bad", "sub-1", admin);

    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });

  it("returns 404 when sub-member not found", async () => {
    mockPrisma.subMember.findFirst.mockResolvedValue(null);

    const result = await removeSubMember("member-1", "bad-sub", admin);

    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// listSubMembers
// ---------------------------------------------------------------------------

describe("listSubMembers", () => {
  it("returns sub-members for a valid parent", async () => {
    mockPrisma.member.findUnique.mockResolvedValue(existingMember);
    mockPrisma.subMember.findMany.mockResolvedValue([existingSubMember]);

    const result = await listSubMembers("member-1");

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
  });

  it("returns empty array when parent has no userId", async () => {
    mockPrisma.member.findUnique.mockResolvedValue({ ...existingMember, userId: null });

    const result = await listSubMembers("member-1");

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it("returns 404 when parent not found", async () => {
    mockPrisma.member.findUnique.mockResolvedValue(null);

    const result = await listSubMembers("bad-id");

    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });
});
