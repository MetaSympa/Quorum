/**
 * Member Service — business logic for member CRUD and sub-member management.
 *
 * Approval gating rules:
 *   ADMIN  → direct DB write for all operations
 *   OPERATOR → creates an Approval record instead of writing directly
 *              (change is only applied when an admin approves via T09)
 *
 * Member creation always creates:
 *   1. A User record (with generated memberId, hashed temp password, role=MEMBER)
 *   2. A Member record linked to the User
 *   3. An ActivityLog entry
 *
 * For operator actions:
 *   1. An Approval record is created with entityType and proposed data
 *   2. No changes are written to User/Member tables yet
 *   3. An ActivityLog entry is created
 */

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  generateMemberId,
  generateSubMemberId,
  countSubMembers,
  nextSubMemberIndex,
} from "@/lib/member-id";
import { logActivity } from "@/lib/audit";
import type {
  CreateMemberInput,
  UpdateMemberInput,
  CreateSubMemberInput,
  UpdateSubMemberInput,
  MemberListQuery,
} from "@/lib/validators";
import type { MembershipStatus } from "@/types";
import type { SubMember } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MemberWithUser {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  phone: string;
  address: string;
  membershipStatus: MembershipStatus;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    memberId: string;
    role: string;
    isTempPassword: boolean;
    membershipStatus: MembershipStatus;
    totalPaid: unknown;
    applicationFeePaid: boolean;
  } | null;
  subMembers?: SubMember[];
}

export interface PaginatedMembers {
  data: MemberWithUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  /** HTTP status code hint for the route layer */
  status?: number;
  /** "direct" = change applied immediately; "pending_approval" = queued for admin */
  action?: "direct" | "pending_approval";
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

/** Hash a password with bcrypt using 12 rounds (project plan §10.1). */
async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

// ---------------------------------------------------------------------------
// List members
// ---------------------------------------------------------------------------

/**
 * List members with optional search and status filter, paginated.
 * Returns Member records with linked User info (memberId, role, status).
 */
export async function listMembers(
  filters: MemberListQuery
): Promise<ServiceResult<PaginatedMembers>> {
  const { search, status, page, limit } = filters;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: Prisma.MemberWhereInput = {
    parentMemberId: null, // only top-level members in the list
  };

  if (status) {
    where.membershipStatus = status;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      {
        user: {
          memberId: { contains: search, mode: "insensitive" },
        },
      },
    ];
  }

  const [members, total] = await Promise.all([
    prisma.member.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            memberId: true,
            role: true,
            isTempPassword: true,
            membershipStatus: true,
            totalPaid: true,
            applicationFeePaid: true,
          },
        },
      },
    }),
    prisma.member.count({ where }),
  ]);

  return {
    success: true,
    data: {
      data: members as unknown as MemberWithUser[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ---------------------------------------------------------------------------
// Get single member
// ---------------------------------------------------------------------------

/**
 * Retrieve a single Member by its UUID, including sub-members.
 */
export async function getMember(
  id: string
): Promise<ServiceResult<MemberWithUser & { subMembers: SubMember[] }>> {
  const member = await prisma.member.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          memberId: true,
          role: true,
          isTempPassword: true,
          membershipStatus: true,
          totalPaid: true,
          applicationFeePaid: true,
          subMembers: true,
        },
      },
      childMembers: true,
    },
  });

  if (!member) {
    return { success: false, error: "Member not found", status: 404 };
  }

  // Attach sub-members from the User relation (SubMember table)
  const subMembers = member.user?.subMembers ?? [];

  return {
    success: true,
    data: {
      ...member,
      membershipStatus: member.membershipStatus as MembershipStatus,
      user: member.user
        ? {
            ...member.user,
            membershipStatus: member.user.membershipStatus as MembershipStatus,
          }
        : null,
      subMembers,
    } as unknown as MemberWithUser & { subMembers: SubMember[] },
  };
}

// ---------------------------------------------------------------------------
// Create member
// ---------------------------------------------------------------------------

/**
 * Create a new member.
 *
 * Admin: creates User + Member directly, status = PENDING_APPROVAL.
 * Operator: creates an Approval record (MEMBER_ADD), does not write to User/Member yet.
 *
 * @param data        - validated member input
 * @param requestedBy - the session user performing the action
 */
export async function createMember(
  data: CreateMemberInput,
  requestedBy: { id: string; role: string; name: string }
): Promise<ServiceResult<{ memberId?: string; approvalId?: string }>> {
  if (requestedBy.role === "OPERATOR") {
    // Operator path: queue for admin approval
    const approval = await prisma.approval.create({
      data: {
        entityType: "MEMBER_ADD",
        entityId: "00000000-0000-0000-0000-000000000000", // placeholder — real ID assigned on approval
        action: "add_member",
        previousData: Prisma.DbNull,
        newData: data as Prisma.InputJsonValue,
        requestedById: requestedBy.id,
        status: "PENDING",
      },
    });

    await logActivity({
      userId: requestedBy.id,
      action: "member_add_requested",
      description: `Operator ${requestedBy.name} submitted new member request for ${data.name}`,
      metadata: { approvalId: approval.id, memberEmail: data.email },
    });

    return {
      success: true,
      data: { approvalId: approval.id },
      action: "pending_approval",
    };
  }

  // Admin path: direct create
  const tempPassword = generateTempPassword();
  const hashedPassword = await hashPassword(tempPassword);
  const memberId = await generateMemberId();

  const result = await prisma.$transaction(async (tx) => {
    // 1. Create User record
    const user = await tx.user.create({
      data: {
        memberId,
        name: data.name,
        email: data.email.toLowerCase().trim(),
        phone: data.phone,
        address: data.address,
        password: hashedPassword,
        isTempPassword: true,
        role: "MEMBER",
        membershipStatus: "PENDING_APPROVAL",
      },
    });

    // 2. Create Member record linked to User
    const member = await tx.member.create({
      data: {
        userId: user.id,
        name: data.name,
        phone: data.phone,
        email: data.email.toLowerCase().trim(),
        address: data.address,
        membershipStatus: "PENDING_APPROVAL",
      },
    });

    return { user, member };
  });

  await logActivity({
    userId: requestedBy.id,
    action: "member_created",
    description: `Admin ${requestedBy.name} created member ${data.name} (${memberId})`,
    metadata: {
      memberId,
      memberEmail: data.email,
      memberRecordId: result.member.id,
    },
  });

  return {
    success: true,
    data: { memberId },
    action: "direct",
    status: 201,
  };
}

// ---------------------------------------------------------------------------
// Update member
// ---------------------------------------------------------------------------

/**
 * Update member fields.
 *
 * Admin: applies update directly to Member (and User if email/phone/address/name).
 * Operator: creates an Approval record (MEMBER_EDIT) with previousData + newData.
 */
export async function updateMember(
  id: string,
  data: UpdateMemberInput,
  requestedBy: { id: string; role: string; name: string }
): Promise<ServiceResult<{ approvalId?: string }>> {
  // Ensure the member exists
  const existing = await prisma.member.findUnique({
    where: { id },
    include: { user: true },
  });

  if (!existing) {
    return { success: false, error: "Member not found", status: 404 };
  }

  if (requestedBy.role === "OPERATOR") {
    const previousData = {
      name: existing.name,
      email: existing.email,
      phone: existing.phone,
      address: existing.address,
    };

    const approval = await prisma.approval.create({
      data: {
        entityType: "MEMBER_EDIT",
        entityId: id,
        action: "edit_member",
        previousData: previousData as Prisma.InputJsonValue,
        newData: data as Prisma.InputJsonValue,
        requestedById: requestedBy.id,
        status: "PENDING",
      },
    });

    await logActivity({
      userId: requestedBy.id,
      action: "member_edit_requested",
      description: `Operator ${requestedBy.name} submitted edit request for member ${existing.name}`,
      metadata: {
        approvalId: approval.id,
        memberId: id,
        changes: data,
      },
    });

    return {
      success: true,
      data: { approvalId: approval.id },
      action: "pending_approval",
    };
  }

  // Admin path: direct update
  await prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.email && { email: data.email.toLowerCase().trim() }),
        ...(data.phone && { phone: data.phone }),
        ...(data.address && { address: data.address }),
      },
    });

    // Mirror changes to the linked User record
    if (existing.userId) {
      await tx.user.update({
        where: { id: existing.userId },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.email && { email: data.email.toLowerCase().trim() }),
          ...(data.phone && { phone: data.phone }),
          ...(data.address && { address: data.address }),
        },
      });
    }
  });

  await logActivity({
    userId: requestedBy.id,
    action: "member_updated",
    description: `Admin ${requestedBy.name} updated member ${existing.name}`,
    metadata: { memberId: id, changes: data },
  });

  return { success: true, data: {}, action: "direct" };
}

// ---------------------------------------------------------------------------
// Delete member (soft-delete)
// ---------------------------------------------------------------------------

/**
 * Soft-delete a member by setting status to SUSPENDED.
 *
 * Admin: applies directly.
 * Operator: creates an Approval record (MEMBER_DELETE).
 */
export async function deleteMember(
  id: string,
  requestedBy: { id: string; role: string; name: string }
): Promise<ServiceResult<{ approvalId?: string }>> {
  const existing = await prisma.member.findUnique({
    where: { id },
    include: { user: true },
  });

  if (!existing) {
    return { success: false, error: "Member not found", status: 404 };
  }

  if (requestedBy.role === "OPERATOR") {
    const previousData = {
      id: existing.id,
      name: existing.name,
      email: existing.email,
      membershipStatus: existing.membershipStatus,
    };

    const approval = await prisma.approval.create({
      data: {
        entityType: "MEMBER_DELETE",
        entityId: id,
        action: "delete_member",
        previousData: previousData as Prisma.InputJsonValue,
        newData: { membershipStatus: "SUSPENDED" } as Prisma.InputJsonValue,
        requestedById: requestedBy.id,
        status: "PENDING",
      },
    });

    await logActivity({
      userId: requestedBy.id,
      action: "member_delete_requested",
      description: `Operator ${requestedBy.name} submitted delete request for member ${existing.name}`,
      metadata: { approvalId: approval.id, memberId: id },
    });

    return {
      success: true,
      data: { approvalId: approval.id },
      action: "pending_approval",
    };
  }

  // Admin path: soft-delete (set status to SUSPENDED)
  await prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id },
      data: { membershipStatus: "SUSPENDED" },
    });

    if (existing.userId) {
      await tx.user.update({
        where: { id: existing.userId },
        data: { membershipStatus: "SUSPENDED" },
      });
    }
  });

  await logActivity({
    userId: requestedBy.id,
    action: "member_deleted",
    description: `Admin ${requestedBy.name} suspended (soft-deleted) member ${existing.name}`,
    metadata: { memberId: id },
  });

  return { success: true, data: {}, action: "direct" };
}

// ---------------------------------------------------------------------------
// Sub-member operations
// ---------------------------------------------------------------------------

/**
 * Add a sub-member to a parent member.
 * Enforces max 3 sub-members cap.
 *
 * Admin: creates SubMember directly.
 * Operator: creates Approval record.
 */
export async function addSubMember(
  parentMemberId: string,
  data: CreateSubMemberInput,
  requestedBy: { id: string; role: string; name: string }
): Promise<ServiceResult<{ subMemberId?: string; approvalId?: string }>> {
  // Resolve parent member + linked user
  const parentMember = await prisma.member.findUnique({
    where: { id: parentMemberId },
    include: { user: true },
  });

  if (!parentMember) {
    return { success: false, error: "Parent member not found", status: 404 };
  }

  if (!parentMember.userId) {
    return {
      success: false,
      error: "Parent member has no linked user account",
      status: 400,
    };
  }

  const currentCount = await countSubMembers(parentMember.userId);
  if (currentCount >= 3) {
    return {
      success: false,
      error: "Maximum of 3 sub-members allowed per primary member",
      status: 400,
    };
  }

  if (requestedBy.role === "OPERATOR") {
    const approval = await prisma.approval.create({
      data: {
        entityType: "MEMBER_ADD",
        entityId: parentMemberId,
        action: "add_sub_member",
        previousData: Prisma.DbNull,
        newData: {
          ...data,
          parentMemberId,
          parentUserId: parentMember.userId,
        } as Prisma.InputJsonValue,
        requestedById: requestedBy.id,
        status: "PENDING",
      },
    });

    await logActivity({
      userId: requestedBy.id,
      action: "sub_member_add_requested",
      description: `Operator ${requestedBy.name} submitted sub-member add request for ${data.name} under member ${parentMember.name}`,
      metadata: { approvalId: approval.id, parentMemberId },
    });

    return {
      success: true,
      data: { approvalId: approval.id },
      action: "pending_approval",
    };
  }

  // Admin path: direct create
  const index = await nextSubMemberIndex(parentMember.userId);
  if (index === null) {
    return {
      success: false,
      error: "Maximum of 3 sub-members allowed per primary member",
      status: 400,
    };
  }

  const parentUserMemberId = parentMember.user!.memberId;
  const subMemberMemberId = generateSubMemberId(parentUserMemberId, index);

  const tempPassword = generateTempPassword();
  const hashedPassword = await hashPassword(tempPassword);

  const subMember = await prisma.subMember.create({
    data: {
      memberId: subMemberMemberId,
      parentUserId: parentMember.userId,
      name: data.name,
      email: data.email.toLowerCase().trim(),
      phone: data.phone,
      password: hashedPassword,
      isTempPassword: true,
      relation: data.relation,
      canLogin: true,
    },
  });

  await logActivity({
    userId: requestedBy.id,
    action: "sub_member_created",
    description: `Admin ${requestedBy.name} added sub-member ${data.name} (${subMemberMemberId}) to member ${parentMember.name}`,
    metadata: {
      subMemberId: subMember.id,
      subMemberMemberId,
      parentMemberId,
    },
  });

  return {
    success: true,
    data: { subMemberId: subMember.id },
    action: "direct",
    status: 201,
  };
}

/**
 * Update a sub-member's details.
 *
 * Admin: applies directly.
 * Operator: creates Approval record.
 */
export async function updateSubMember(
  parentMemberId: string,
  subMemberId: string,
  data: Omit<UpdateSubMemberInput, "subMemberId">,
  requestedBy: { id: string; role: string; name: string }
): Promise<ServiceResult<{ approvalId?: string }>> {
  const parentMember = await prisma.member.findUnique({
    where: { id: parentMemberId },
  });

  if (!parentMember) {
    return { success: false, error: "Parent member not found", status: 404 };
  }

  const subMember = await prisma.subMember.findFirst({
    where: {
      id: subMemberId,
      parentUserId: parentMember.userId ?? undefined,
    },
  });

  if (!subMember) {
    return { success: false, error: "Sub-member not found", status: 404 };
  }

  if (requestedBy.role === "OPERATOR") {
    const previousData = {
      name: subMember.name,
      email: subMember.email,
      phone: subMember.phone,
      relation: subMember.relation,
      canLogin: subMember.canLogin,
    };

    const approval = await prisma.approval.create({
      data: {
        entityType: "MEMBER_EDIT",
        entityId: subMemberId,
        action: "edit_sub_member",
        previousData: previousData as Prisma.InputJsonValue,
        newData: { ...data, parentMemberId } as Prisma.InputJsonValue,
        requestedById: requestedBy.id,
        status: "PENDING",
      },
    });

    await logActivity({
      userId: requestedBy.id,
      action: "sub_member_edit_requested",
      description: `Operator ${requestedBy.name} submitted edit request for sub-member ${subMember.name}`,
      metadata: { approvalId: approval.id, subMemberId },
    });

    return {
      success: true,
      data: { approvalId: approval.id },
      action: "pending_approval",
    };
  }

  // Admin path: direct update
  await prisma.subMember.update({
    where: { id: subMemberId },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.email && { email: data.email.toLowerCase().trim() }),
      ...(data.phone && { phone: data.phone }),
      ...(data.relation && { relation: data.relation }),
      ...(data.canLogin !== undefined && { canLogin: data.canLogin }),
    },
  });

  await logActivity({
    userId: requestedBy.id,
    action: "sub_member_updated",
    description: `Admin ${requestedBy.name} updated sub-member ${subMember.name}`,
    metadata: { subMemberId, changes: data },
  });

  return { success: true, data: {}, action: "direct" };
}

/**
 * Remove a sub-member.
 *
 * Admin: deletes directly (hard delete for sub-members — no status field).
 * Operator: creates Approval record.
 */
export async function removeSubMember(
  parentMemberId: string,
  subMemberId: string,
  requestedBy: { id: string; role: string; name: string }
): Promise<ServiceResult<{ approvalId?: string }>> {
  const parentMember = await prisma.member.findUnique({
    where: { id: parentMemberId },
  });

  if (!parentMember) {
    return { success: false, error: "Parent member not found", status: 404 };
  }

  const subMember = await prisma.subMember.findFirst({
    where: {
      id: subMemberId,
      parentUserId: parentMember.userId ?? undefined,
    },
  });

  if (!subMember) {
    return { success: false, error: "Sub-member not found", status: 404 };
  }

  if (requestedBy.role === "OPERATOR") {
    const previousData = {
      id: subMember.id,
      memberId: subMember.memberId,
      name: subMember.name,
      email: subMember.email,
    };

    const approval = await prisma.approval.create({
      data: {
        entityType: "MEMBER_DELETE",
        entityId: subMemberId,
        action: "remove_sub_member",
        previousData: previousData as Prisma.InputJsonValue,
        newData: { deleted: true, parentMemberId } as Prisma.InputJsonValue,
        requestedById: requestedBy.id,
        status: "PENDING",
      },
    });

    await logActivity({
      userId: requestedBy.id,
      action: "sub_member_remove_requested",
      description: `Operator ${requestedBy.name} submitted remove request for sub-member ${subMember.name}`,
      metadata: { approvalId: approval.id, subMemberId },
    });

    return {
      success: true,
      data: { approvalId: approval.id },
      action: "pending_approval",
    };
  }

  // Admin path: direct delete
  await prisma.subMember.delete({ where: { id: subMemberId } });

  await logActivity({
    userId: requestedBy.id,
    action: "sub_member_removed",
    description: `Admin ${requestedBy.name} removed sub-member ${subMember.name}`,
    metadata: { subMemberId, parentMemberId },
  });

  return { success: true, data: {}, action: "direct" };
}

/**
 * List all sub-members for a given parent member.
 */
export async function listSubMembers(
  parentMemberId: string
): Promise<ServiceResult<SubMember[]>> {
  const parentMember = await prisma.member.findUnique({
    where: { id: parentMemberId },
  });

  if (!parentMember) {
    return { success: false, error: "Parent member not found", status: 404 };
  }

  if (!parentMember.userId) {
    return { success: true, data: [] };
  }

  const subMembers = await prisma.subMember.findMany({
    where: { parentUserId: parentMember.userId },
    orderBy: { memberId: "asc" },
  });

  return { success: true, data: subMembers };
}
