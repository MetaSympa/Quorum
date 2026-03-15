/**
 * Approval Service — core approval queue business logic.
 *
 * Responsibilities:
 *   - List pending approvals (admin only, with filters + pagination)
 *   - Get a single approval with full details
 *   - approveEntry: apply proposed change to DB atomically, log to activity
 *                   and to audit only for financial entity types
 *   - rejectEntry: discard change, update approval record, log only to activity
 *
 * Entity-type dispatch on approval:
 *   MEMBER_ADD     → create User + Member from newData (generates memberId, temp password)
 *   MEMBER_EDIT    → apply newData fields to existing Member (and linked User)
 *   MEMBER_DELETE  → set Member.membershipStatus = SUSPENDED (soft-delete)
 *   TRANSACTION    → set Transaction.approvalStatus = APPROVED
 *   MEMBERSHIP     → set Membership.status = APPROVED, update User subscription fields
 *
 * All approve/reject actions are wrapped in Prisma $transaction for atomicity.
 */

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateMemberId, generateSubMemberId, nextSubMemberIndex } from "@/lib/member-id";
import { buildTransactionAuditSnapshot, logAudit, logActivity } from "@/lib/audit";
import type { ApprovalListQuery } from "@/lib/validators";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApprovalWithRelations {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  previousData: unknown;
  newData: unknown;
  status: string;
  notes: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  requestedBy: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  reviewedBy: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface PaginatedApprovals {
  data: ApprovalWithRelations[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  pendingCount: number;
}

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a random 8-character alphanumeric temporary password. */
function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/** Hash a password with bcrypt using 12 rounds. */
async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

// ---------------------------------------------------------------------------
// List approvals
// ---------------------------------------------------------------------------

/**
 * List approvals with optional filters, paginated.
 * Admin only — enforced at route level.
 */
export async function listApprovals(
  filters: ApprovalListQuery
): Promise<ServiceResult<PaginatedApprovals>> {
  const { entityType, status, page, limit, dateFrom, dateTo } = filters;
  const skip = (page - 1) * limit;

  const where: Prisma.ApprovalWhereInput = {};

  if (entityType) {
    where.entityType = entityType as Prisma.EnumApprovalEntityTypeFilter;
  }

  where.status = (status ?? "PENDING") as Prisma.EnumApprovalStatusFilter;

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  const [approvals, total, pendingCount] = await Promise.all([
    prisma.approval.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        requestedBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        reviewedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    }),
    prisma.approval.count({ where }),
    prisma.approval.count({ where: { status: "PENDING" } }),
  ]);

  return {
    success: true,
    data: {
      data: approvals as unknown as ApprovalWithRelations[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      pendingCount,
    },
  };
}

// ---------------------------------------------------------------------------
// Get single approval
// ---------------------------------------------------------------------------

/**
 * Retrieve a single Approval with full relations.
 * Admin only — enforced at route level.
 */
export async function getApproval(
  id: string
): Promise<ServiceResult<ApprovalWithRelations>> {
  const approval = await prisma.approval.findUnique({
    where: { id },
    include: {
      requestedBy: {
        select: { id: true, name: true, email: true, role: true },
      },
      reviewedBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  if (!approval) {
    return { success: false, error: "Approval not found", status: 404 };
  }

  return { success: true, data: approval as unknown as ApprovalWithRelations };
}

// ---------------------------------------------------------------------------
// Approve entry
// ---------------------------------------------------------------------------

/**
 * Approve an approval entry.
 *
 * 1. Validates the approval exists and is still PENDING.
 * 2. Dispatches to entity-type handler inside a Prisma $transaction.
 * 3. Updates the Approval record (status=APPROVED, reviewedBy, reviewedAt, notes).
 * 4. Logs approved transactions to AuditLog and all actions to ActivityLog.
 *
 * Returns the updated approval on success.
 */
export async function approveEntry(
  id: string,
  reviewedBy: { id: string; name: string },
  notes?: string
): Promise<ServiceResult<ApprovalWithRelations>> {
  const approval = await prisma.approval.findUnique({
    where: { id },
    include: {
      requestedBy: { select: { id: true, name: true, email: true, role: true } },
    },
  });

  if (!approval) {
    return { success: false, error: "Approval not found", status: 404 };
  }

  if (approval.status !== "PENDING") {
    return {
      success: false,
      error: `Approval is already ${approval.status.toLowerCase()}`,
      status: 409,
    };
  }

  let logEntityId = approval.entityId;
  let tempPasswordForMember: string | undefined;
  let newMemberEmail: string | undefined;

  try {
    await prisma.$transaction(async (tx) => {
      switch (approval.entityType) {
        case "MEMBER_ADD": {
          await handleMemberAdd(tx, approval, (tempPass, email) => {
            tempPasswordForMember = tempPass;
            newMemberEmail = email;
          });
          logEntityId = approval.entityId;
          break;
        }

        case "MEMBER_EDIT": {
          await handleMemberEdit(tx, approval);
          logEntityId = approval.entityId;
          break;
        }

        case "MEMBER_DELETE": {
          await handleMemberDelete(tx, approval);
          logEntityId = approval.entityId;
          break;
        }

        case "TRANSACTION": {
          await handleTransactionApprove(tx, approval, reviewedBy.id);
          logEntityId = approval.entityId;
          break;
        }

        case "MEMBERSHIP": {
          await handleMembershipApprove(tx, approval);
          logEntityId = approval.entityId;
          break;
        }

        default:
          throw new Error(`Unknown entity type: ${approval.entityType}`);
      }

      // Update the Approval record itself
      await tx.approval.update({
        where: { id },
        data: {
          status: "APPROVED",
          reviewedById: reviewedBy.id,
          reviewedAt: new Date(),
          notes: notes ?? null,
        },
      });
    });

    if (approval.entityType === "TRANSACTION") {
      const approvedTransaction = await prisma.transaction.findUnique({
        where: { id: logEntityId },
      });

      if (!approvedTransaction) {
        throw new Error("Approved transaction not found for audit logging");
      }

      await logAudit({
        transactionId: logEntityId,
        transactionSnapshot: buildTransactionAuditSnapshot(approvedTransaction),
        performedById: reviewedBy.id,
      });
    }

    await logActivity({
      userId: reviewedBy.id,
      action: "approval_approved",
      description: `Admin ${reviewedBy.name} approved ${approval.entityType} request (${approval.action}) submitted by ${approval.requestedBy?.name ?? "unknown"}`,
      metadata: {
        approvalId: id,
        entityType: approval.entityType,
        entityId: logEntityId,
        requestedById: approval.requestedById,
        ...(tempPasswordForMember
          ? { tempPassword: tempPasswordForMember, memberEmail: newMemberEmail }
          : {}),
      },
    });

    const updated = await prisma.approval.findUnique({
      where: { id },
      include: {
        requestedBy: { select: { id: true, name: true, email: true, role: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return { success: true, data: updated as unknown as ApprovalWithRelations };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Approval failed";
    return { success: false, error: message, status: 500 };
  }
}

// ---------------------------------------------------------------------------
// Reject entry
// ---------------------------------------------------------------------------

/**
 * Reject an approval entry.
 *
 * For TRANSACTION and MEMBERSHIP: marks the entity as REJECTED in the DB.
 * For MEMBER_ADD / MEMBER_EDIT / MEMBER_DELETE: no DB change to the entity
 * (proposed change is discarded).
 *
 * Always updates the Approval record and logs only to activity.
 */
export async function rejectEntry(
  id: string,
  reviewedBy: { id: string; name: string },
  notes?: string
): Promise<ServiceResult<ApprovalWithRelations>> {
  const approval = await prisma.approval.findUnique({
    where: { id },
    include: {
      requestedBy: { select: { id: true, name: true, email: true, role: true } },
    },
  });

  if (!approval) {
    return { success: false, error: "Approval not found", status: 404 };
  }

  if (approval.status !== "PENDING") {
    return {
      success: false,
      error: `Approval is already ${approval.status.toLowerCase()}`,
      status: 409,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // For TRANSACTION and MEMBERSHIP: mark the entity as REJECTED
      if (approval.entityType === "TRANSACTION") {
        await tx.transaction.update({
          where: { id: approval.entityId },
          data: { approvalStatus: "REJECTED" },
        });
      } else if (approval.entityType === "MEMBERSHIP") {
        await tx.membership.update({
          where: { id: approval.entityId },
          data: { status: "REJECTED" },
        });
      }
      // MEMBER_ADD / MEMBER_EDIT / MEMBER_DELETE: no entity change (discard)

      // Update the Approval record
      await tx.approval.update({
        where: { id },
        data: {
          status: "REJECTED",
          reviewedById: reviewedBy.id,
          reviewedAt: new Date(),
          notes: notes ?? null,
        },
      });
    });

    await logActivity({
      userId: reviewedBy.id,
      action: "approval_rejected",
      description: `Admin ${reviewedBy.name} rejected ${approval.entityType} request (${approval.action}) submitted by ${approval.requestedBy?.name ?? "unknown"}`,
      metadata: {
        approvalId: id,
        entityType: approval.entityType,
        entityId: approval.entityId,
        requestedById: approval.requestedById,
        notes,
      },
    });

    const updated = await prisma.approval.findUnique({
      where: { id },
      include: {
        requestedBy: { select: { id: true, name: true, email: true, role: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return { success: true, data: updated as unknown as ApprovalWithRelations };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Rejection failed";
    return { success: false, error: message, status: 500 };
  }
}

// ---------------------------------------------------------------------------
// Entity-type handlers (called inside $transaction)
// ---------------------------------------------------------------------------

/**
 * Handle MEMBER_ADD approval.
 *
 * Creates User + Member from newData.
 * Handles both new primary member (action="add_member") and sub-member (action="add_sub_member").
 *
 * On success, calls onCreated with (tempPassword, email) so the caller can
 * surface this in the activity log (for WhatsApp notification in T18).
 */
async function handleMemberAdd(
  tx: Prisma.TransactionClient,
  approval: {
    entityId: string;
    action: string;
    newData: unknown;
  },
  onCreated: (tempPassword: string, email: string) => void
): Promise<void> {
  const data = approval.newData as Record<string, unknown>;
  if (!data) throw new Error("MEMBER_ADD approval has no newData");

  const action = approval.action;

  if (action === "add_sub_member") {
    // Sub-member creation
    const parentUserId = data.parentUserId as string;
    const parentMemberId = data.parentMemberId as string;

    if (!parentUserId) throw new Error("add_sub_member missing parentUserId");

    // Verify parent still exists
    const parentUser = await tx.user.findUnique({
      where: { id: parentUserId },
      select: { memberId: true },
    });
    if (!parentUser) throw new Error("Parent user not found");

    // Get next available index
    const existing = await tx.subMember.findMany({
      where: { parentUserId },
      select: { memberId: true },
    });

    const usedIndexes = new Set(
      existing
        .map((sm) => {
          const match = sm.memberId.match(/-(\d{2})$/);
          return match ? parseInt(match[1], 10) : null;
        })
        .filter((n): n is number => n !== null)
    );

    let index: number | null = null;
    for (let i = 1; i <= 3; i++) {
      if (!usedIndexes.has(i)) {
        index = i;
        break;
      }
    }

    if (index === null) {
      throw new Error("Maximum of 3 sub-members already reached");
    }

    const subMemberMemberId = generateSubMemberId(parentUser.memberId, index);
    const tempPassword = generateTempPassword();
    const hashedPassword = await hashPassword(tempPassword);
    const email = (data.email as string).toLowerCase().trim();

    await tx.subMember.create({
      data: {
        memberId: subMemberMemberId,
        parentUserId,
        name: data.name as string,
        email,
        phone: data.phone as string,
        password: hashedPassword,
        isTempPassword: true,
        relation: data.relation as string,
        canLogin: true,
      },
    });

    onCreated(tempPassword, email);

    // Also create a child Member record linked to parent member (if parentMemberId given)
    if (parentMemberId) {
      await tx.member.create({
        data: {
          name: data.name as string,
          phone: data.phone as string,
          email,
          address: (data.address as string) ?? "",
          parentMemberId,
          membershipStatus: "ACTIVE",
        },
      });
    }
  } else {
    // Primary member creation (action = "add_member")
    const memberId = await generateMemberId();
    const tempPassword = generateTempPassword();
    const hashedPassword = await hashPassword(tempPassword);
    const email = (data.email as string).toLowerCase().trim();

    const user = await tx.user.create({
      data: {
        memberId,
        name: data.name as string,
        email,
        phone: data.phone as string,
        address: data.address as string,
        password: hashedPassword,
        isTempPassword: true,
        role: "MEMBER",
        membershipStatus: "PENDING_APPROVAL",
      },
    });

    await tx.member.create({
      data: {
        userId: user.id,
        name: data.name as string,
        phone: data.phone as string,
        email,
        address: data.address as string,
        membershipStatus: "PENDING_APPROVAL",
      },
    });

    onCreated(tempPassword, email);
  }
}

/**
 * Handle MEMBER_EDIT approval.
 * Applies newData fields to the existing Member (and linked User if present).
 */
async function handleMemberEdit(
  tx: Prisma.TransactionClient,
  approval: { entityId: string; newData: unknown; action: string }
): Promise<void> {
  const data = approval.newData as Record<string, unknown>;
  if (!data) throw new Error("MEMBER_EDIT approval has no newData");

  const isSubMember = approval.action === "edit_sub_member";

  if (isSubMember) {
    // Update SubMember record
    const updates: Prisma.SubMemberUpdateInput = {};
    if (data.name) updates.name = data.name as string;
    if (data.email) updates.email = (data.email as string).toLowerCase().trim();
    if (data.phone) updates.phone = data.phone as string;
    if (data.relation) updates.relation = data.relation as string;
    if (data.canLogin !== undefined) updates.canLogin = data.canLogin as boolean;

    await tx.subMember.update({
      where: { id: approval.entityId },
      data: updates,
    });
  } else {
    // Update Member record
    const member = await tx.member.findUnique({
      where: { id: approval.entityId },
      select: { userId: true },
    });

    if (!member) throw new Error("Member not found");

    const memberUpdates: Prisma.MemberUpdateInput = {};
    if (data.name) memberUpdates.name = data.name as string;
    if (data.email) memberUpdates.email = (data.email as string).toLowerCase().trim();
    if (data.phone) memberUpdates.phone = data.phone as string;
    if (data.address) memberUpdates.address = data.address as string;

    await tx.member.update({
      where: { id: approval.entityId },
      data: memberUpdates,
    });

    // Mirror to User if linked
    if (member.userId) {
      const userUpdates: Prisma.UserUpdateInput = {};
      if (data.name) userUpdates.name = data.name as string;
      if (data.email) userUpdates.email = (data.email as string).toLowerCase().trim();
      if (data.phone) userUpdates.phone = data.phone as string;
      if (data.address) userUpdates.address = data.address as string;

      await tx.user.update({
        where: { id: member.userId },
        data: userUpdates,
      });
    }
  }
}

/**
 * Handle MEMBER_DELETE approval.
 * Soft-deletes the member by setting status to SUSPENDED.
 */
async function handleMemberDelete(
  tx: Prisma.TransactionClient,
  approval: { entityId: string; action: string }
): Promise<void> {
  if (approval.action === "remove_sub_member") {
    // Hard-delete sub-member (no status field)
    await tx.subMember.delete({ where: { id: approval.entityId } });
  } else {
    // Soft-delete member
    const member = await tx.member.findUnique({
      where: { id: approval.entityId },
      select: { userId: true },
    });

    if (!member) throw new Error("Member not found");

    await tx.member.update({
      where: { id: approval.entityId },
      data: { membershipStatus: "SUSPENDED" },
    });

    if (member.userId) {
      await tx.user.update({
        where: { id: member.userId },
        data: { membershipStatus: "SUSPENDED" },
      });
    }
  }
}

/**
 * Handle TRANSACTION approval.
 * Sets Transaction.approvalStatus = APPROVED and records approvedBy + approvedAt.
 */
async function handleTransactionApprove(
  tx: Prisma.TransactionClient,
  approval: { entityId: string },
  approvedById: string
): Promise<void> {
  const transaction = await tx.transaction.findUnique({
    where: { id: approval.entityId },
  });

  if (!transaction) throw new Error("Transaction not found");

  await tx.transaction.update({
    where: { id: approval.entityId },
    data: {
      approvalStatus: "APPROVED",
      approvedById,
      approvedAt: new Date(),
    },
  });
}

/**
 * Handle MEMBERSHIP approval.
 *
 * Sets Membership.status = APPROVED.
 * Also updates the linked User/Member record:
 *   - membershipStatus = ACTIVE
 *   - membershipType, membershipStart, membershipExpiry
 *   - totalPaid += amount
 *   - applicationFeePaid = true if isApplicationFee
 */
async function handleMembershipApprove(
  tx: Prisma.TransactionClient,
  approval: { entityId: string }
): Promise<void> {
  const membership = await tx.membership.findUnique({
    where: { id: approval.entityId },
    include: {
      member: {
        select: {
          id: true,
          userId: true,
        },
      },
    },
  });

  if (!membership) throw new Error("Membership not found");

  await tx.membership.update({
    where: { id: approval.entityId },
    data: { status: "APPROVED" },
  });

  // Update the member's subscription fields on User
  if (membership.member.userId) {
    const userUpdates: Prisma.UserUpdateInput = {
      membershipStatus: "ACTIVE",
      membershipType: membership.type,
      membershipStart: membership.startDate,
      membershipExpiry: membership.endDate,
      totalPaid: {
        increment: membership.amount,
      },
    };

    if (membership.isApplicationFee) {
      userUpdates.applicationFeePaid = true;
    }

    await tx.user.update({
      where: { id: membership.member.userId },
      data: userUpdates,
    });
  }

  // Also update Member.membershipStatus
  await tx.member.update({
    where: { id: membership.memberId },
    data: { membershipStatus: "ACTIVE" },
  });
}
