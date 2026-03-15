/**
 * Unit tests for the Approval Service and related validators.
 *
 * Uses vi.mock to mock Prisma and the audit helpers.
 * Tests cover:
 *   - approvalListQuerySchema validation
 *   - approvalActionSchema validation
 *   - listApprovals (filters, pagination)
 *   - getApproval (found, not found)
 *   - approveEntry (all entity types, already approved guard)
 *   - rejectEntry (entity types, already rejected guard)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { approvalListQuerySchema, approvalActionSchema } from "@/lib/validators";

// ---------------------------------------------------------------------------
// Validator tests
// ---------------------------------------------------------------------------

describe("approvalListQuerySchema", () => {
  it("accepts empty params with defaults", () => {
    const result = approvalListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
      expect(result.data.entityType).toBeUndefined();
      expect(result.data.status).toBeUndefined();
    }
  });

  it("accepts valid entity types", () => {
    const types = [
      "TRANSACTION",
      "MEMBER_ADD",
      "MEMBER_EDIT",
      "MEMBER_DELETE",
      "MEMBERSHIP",
    ];
    for (const entityType of types) {
      const result = approvalListQuerySchema.safeParse({ entityType });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid entity type", () => {
    const result = approvalListQuerySchema.safeParse({ entityType: "UNKNOWN" });
    expect(result.success).toBe(false);
  });

  it("accepts valid status values", () => {
    const statuses = ["PENDING", "APPROVED", "REJECTED"];
    for (const status of statuses) {
      const result = approvalListQuerySchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid status", () => {
    const result = approvalListQuerySchema.safeParse({ status: "UNKNOWN" });
    expect(result.success).toBe(false);
  });

  it("coerces page and limit from strings", () => {
    const result = approvalListQuerySchema.safeParse({ page: "3", limit: "50" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.limit).toBe(50);
    }
  });

  it("rejects page < 1", () => {
    const result = approvalListQuerySchema.safeParse({ page: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects limit > 100", () => {
    const result = approvalListQuerySchema.safeParse({ limit: "200" });
    expect(result.success).toBe(false);
  });

  it("accepts optional dateFrom and dateTo", () => {
    const result = approvalListQuerySchema.safeParse({
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dateFrom).toBe("2026-01-01");
      expect(result.data.dateTo).toBe("2026-12-31");
    }
  });
});

describe("approvalActionSchema", () => {
  it("accepts empty body (no notes)", () => {
    const result = approvalActionSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBeUndefined();
    }
  });

  it("accepts valid notes string", () => {
    const result = approvalActionSchema.safeParse({ notes: "Looks good" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBe("Looks good");
    }
  });

  it("rejects notes longer than 1000 characters", () => {
    const result = approvalActionSchema.safeParse({ notes: "x".repeat(1001) });
    expect(result.success).toBe(false);
  });

  it("accepts notes exactly 1000 characters", () => {
    const result = approvalActionSchema.safeParse({ notes: "x".repeat(1000) });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Approval service logic tests (mocked Prisma)
// ---------------------------------------------------------------------------

vi.mock("@/lib/prisma", () => ({
  prisma: {
    approval: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    member: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    subMember: {
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    transaction: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/member-id", () => ({
  generateMemberId: vi.fn().mockResolvedValue("DPC-2026-0001-00"),
  generateSubMemberId: vi.fn().mockReturnValue("DPC-2026-0001-01"),
  nextSubMemberIndex: vi.fn().mockResolvedValue(1),
}));

import { prisma } from "@/lib/prisma";
import { logAudit, logActivity } from "@/lib/audit";
import {
  listApprovals,
  getApproval,
  approveEntry,
  rejectEntry,
} from "@/lib/services/approval-service";

const mockApproval = {
  id: "approval-1",
  entityType: "MEMBER_ADD",
  entityId: "00000000-0000-0000-0000-000000000000",
  action: "add_member",
  previousData: null,
  newData: { name: "Test User", email: "test@example.com", phone: "+911234567890", address: "123 St" },
  status: "PENDING",
  notes: null,
  reviewedAt: null,
  reviewedById: null,
  requestedById: "user-1",
  createdAt: new Date(),
  requestedBy: { id: "user-1", name: "Operator One", email: "op@example.com", role: "OPERATOR" },
  reviewedBy: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listApprovals", () => {
  it("returns paginated list with pendingCount", async () => {
    vi.mocked(prisma.approval.findMany).mockResolvedValue([mockApproval] as never);
    vi.mocked(prisma.approval.count)
      .mockResolvedValueOnce(1) // total
      .mockResolvedValueOnce(3); // pendingCount

    const result = await listApprovals({ page: 1, limit: 20 });

    expect(result.success).toBe(true);
    expect(result.data?.total).toBe(1);
    expect(result.data?.pendingCount).toBe(3);
    expect(result.data?.data).toHaveLength(1);
  });

  it("builds where clause with entityType filter", async () => {
    vi.mocked(prisma.approval.findMany).mockResolvedValue([]);
    vi.mocked(prisma.approval.count).mockResolvedValue(0);

    await listApprovals({ page: 1, limit: 20, entityType: "TRANSACTION" });

    const findManyCall = vi.mocked(prisma.approval.findMany).mock.calls[0][0];
    expect(findManyCall?.where).toMatchObject({ entityType: "TRANSACTION" });
  });

  it("defaults to PENDING status when no status filter given", async () => {
    vi.mocked(prisma.approval.findMany).mockResolvedValue([]);
    vi.mocked(prisma.approval.count).mockResolvedValue(0);

    await listApprovals({ page: 1, limit: 20 });

    const findManyCall = vi.mocked(prisma.approval.findMany).mock.calls[0][0];
    expect(findManyCall?.where).toMatchObject({ status: "PENDING" });
  });

  it("uses provided status filter when given", async () => {
    vi.mocked(prisma.approval.findMany).mockResolvedValue([]);
    vi.mocked(prisma.approval.count).mockResolvedValue(0);

    await listApprovals({ page: 1, limit: 20, status: "APPROVED" });

    const findManyCall = vi.mocked(prisma.approval.findMany).mock.calls[0][0];
    expect(findManyCall?.where).toMatchObject({ status: "APPROVED" });
  });

  it("calculates correct skip for page 2", async () => {
    vi.mocked(prisma.approval.findMany).mockResolvedValue([]);
    vi.mocked(prisma.approval.count).mockResolvedValue(0);

    await listApprovals({ page: 2, limit: 10 });

    const findManyCall = vi.mocked(prisma.approval.findMany).mock.calls[0][0];
    expect(findManyCall?.skip).toBe(10);
    expect(findManyCall?.take).toBe(10);
  });
});

describe("getApproval", () => {
  it("returns the approval when found", async () => {
    vi.mocked(prisma.approval.findUnique).mockResolvedValue(mockApproval as never);

    const result = await getApproval("approval-1");

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("approval-1");
  });

  it("returns 404 when not found", async () => {
    vi.mocked(prisma.approval.findUnique).mockResolvedValue(null);

    const result = await getApproval("missing-id");

    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });
});

describe("approveEntry", () => {
  it("returns 404 when approval not found", async () => {
    vi.mocked(prisma.approval.findUnique).mockResolvedValue(null);

    const result = await approveEntry("missing-id", { id: "admin-1", name: "Admin" });

    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });

  it("returns 409 when approval is already approved", async () => {
    vi.mocked(prisma.approval.findUnique).mockResolvedValue({
      ...mockApproval,
      status: "APPROVED",
    } as never);

    const result = await approveEntry("approval-1", { id: "admin-1", name: "Admin" });

    expect(result.success).toBe(false);
    expect(result.status).toBe(409);
    expect(result.error).toContain("approved");
  });

  it("returns 409 when approval is already rejected", async () => {
    vi.mocked(prisma.approval.findUnique).mockResolvedValue({
      ...mockApproval,
      status: "REJECTED",
    } as never);

    const result = await approveEntry("approval-1", { id: "admin-1", name: "Admin" });

    expect(result.success).toBe(false);
    expect(result.status).toBe(409);
  });

  it("executes $transaction for MEMBER_ADD", async () => {
    vi.mocked(prisma.approval.findUnique)
      .mockResolvedValueOnce({ ...mockApproval, status: "PENDING" } as never)
      .mockResolvedValueOnce({ ...mockApproval, status: "APPROVED" } as never);

    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      await fn({
        user: { create: vi.fn().mockResolvedValue({ id: "new-user", memberId: "DPC-2026-0001-00" }) },
        member: { create: vi.fn().mockResolvedValue({ id: "new-member" }) },
        subMember: { findMany: vi.fn().mockResolvedValue([]) },
        approval: { update: vi.fn().mockResolvedValue({}) },
      } as never);
    });

    const result = await approveEntry("approval-1", { id: "admin-1", name: "Admin" });

    expect(result.success).toBe(true);
    expect(vi.mocked(prisma.$transaction)).toHaveBeenCalledOnce();
    expect(vi.mocked(logAudit)).not.toHaveBeenCalled();
    expect(vi.mocked(logActivity)).toHaveBeenCalledOnce();
  });

  it("executes $transaction for TRANSACTION approval", async () => {
    const transactionApproval = {
      ...mockApproval,
      entityType: "TRANSACTION",
      entityId: "tx-id-1",
      action: "add_transaction",
      status: "PENDING",
    };

    vi.mocked(prisma.approval.findUnique)
      .mockResolvedValueOnce(transactionApproval as never)
      .mockResolvedValueOnce({ ...transactionApproval, status: "APPROVED" } as never);

    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      await fn({
        transaction: {
          findUnique: vi.fn().mockResolvedValue({ id: "tx-id-1", approvalStatus: "PENDING" }),
          update: vi.fn().mockResolvedValue({ id: "tx-id-1", approvalStatus: "APPROVED" }),
        },
        approval: { update: vi.fn().mockResolvedValue({}) },
      } as never);
    });

    const result = await approveEntry("approval-1", { id: "admin-1", name: "Admin" });

    expect(result.success).toBe(true);
    expect(vi.mocked(prisma.$transaction)).toHaveBeenCalledOnce();
    expect(vi.mocked(logAudit)).toHaveBeenCalledOnce();
  });

  it("executes $transaction for MEMBERSHIP approval", async () => {
    const membershipApproval = {
      ...mockApproval,
      entityType: "MEMBERSHIP",
      entityId: "membership-id-1",
      action: "add_membership",
      status: "PENDING",
    };

    vi.mocked(prisma.approval.findUnique)
      .mockResolvedValueOnce(membershipApproval as never)
      .mockResolvedValueOnce({ ...membershipApproval, status: "APPROVED" } as never);

    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      await fn({
        membership: {
          findUnique: vi.fn().mockResolvedValue({
            id: "membership-id-1",
            memberId: "member-1",
            type: "MONTHLY",
            amount: 250,
            startDate: new Date(),
            endDate: new Date(),
            isApplicationFee: false,
            member: { id: "member-1", userId: "user-1" },
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        user: { update: vi.fn().mockResolvedValue({}) },
        member: { update: vi.fn().mockResolvedValue({}) },
        approval: { update: vi.fn().mockResolvedValue({}) },
      } as never);
    });

    const result = await approveEntry("approval-1", { id: "admin-1", name: "Admin" });

    expect(result.success).toBe(true);
    expect(vi.mocked(logAudit)).toHaveBeenCalledOnce();
  });
});

describe("rejectEntry", () => {
  it("returns 404 when approval not found", async () => {
    vi.mocked(prisma.approval.findUnique).mockResolvedValue(null);

    const result = await rejectEntry("missing-id", { id: "admin-1", name: "Admin" });

    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });

  it("returns 409 when already rejected", async () => {
    vi.mocked(prisma.approval.findUnique).mockResolvedValue({
      ...mockApproval,
      status: "REJECTED",
    } as never);

    const result = await rejectEntry("approval-1", { id: "admin-1", name: "Admin" });

    expect(result.success).toBe(false);
    expect(result.status).toBe(409);
  });

  it("rejects MEMBER_ADD without touching Member/User table", async () => {
    vi.mocked(prisma.approval.findUnique)
      .mockResolvedValueOnce({ ...mockApproval, status: "PENDING" } as never)
      .mockResolvedValueOnce({ ...mockApproval, status: "REJECTED" } as never);

    const mockTx = {
      approval: { update: vi.fn().mockResolvedValue({}) },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      await fn(mockTx as never);
    });

    const result = await rejectEntry("approval-1", { id: "admin-1", name: "Admin" }, "Not valid");

    expect(result.success).toBe(true);
    // No transaction or membership update should have been called
    expect(mockTx.approval.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REJECTED", notes: "Not valid" }),
      })
    );
    expect(vi.mocked(logAudit)).not.toHaveBeenCalled();
    expect(vi.mocked(logActivity)).toHaveBeenCalledOnce();
  });

  it("rejects TRANSACTION and sets Transaction.approvalStatus = REJECTED", async () => {
    const txApproval = {
      ...mockApproval,
      entityType: "TRANSACTION",
      entityId: "tx-id-2",
      action: "add_transaction",
      status: "PENDING",
    };

    vi.mocked(prisma.approval.findUnique)
      .mockResolvedValueOnce(txApproval as never)
      .mockResolvedValueOnce({ ...txApproval, status: "REJECTED" } as never);

    const mockTx = {
      transaction: { update: vi.fn().mockResolvedValue({}) },
      approval: { update: vi.fn().mockResolvedValue({}) },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      await fn(mockTx as never);
    });

    const result = await rejectEntry("approval-1", { id: "admin-1", name: "Admin" });

    expect(result.success).toBe(true);
    expect(mockTx.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tx-id-2" },
        data: { approvalStatus: "REJECTED" },
      })
    );
    expect(vi.mocked(logAudit)).toHaveBeenCalledOnce();
  });

  it("rejects MEMBERSHIP and sets Membership.status = REJECTED", async () => {
    const membershipApproval = {
      ...mockApproval,
      entityType: "MEMBERSHIP",
      entityId: "membership-id-2",
      action: "add_membership",
      status: "PENDING",
    };

    vi.mocked(prisma.approval.findUnique)
      .mockResolvedValueOnce(membershipApproval as never)
      .mockResolvedValueOnce({ ...membershipApproval, status: "REJECTED" } as never);

    const mockTx = {
      membership: { update: vi.fn().mockResolvedValue({}) },
      approval: { update: vi.fn().mockResolvedValue({}) },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      await fn(mockTx as never);
    });

    const result = await rejectEntry("approval-1", { id: "admin-1", name: "Admin" });

    expect(result.success).toBe(true);
    expect(mockTx.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "membership-id-2" },
        data: { status: "REJECTED" },
      })
    );
    expect(vi.mocked(logAudit)).toHaveBeenCalledOnce();
  });
});
