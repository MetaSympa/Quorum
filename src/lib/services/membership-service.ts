/**
 * Membership Service — business logic for membership period management.
 *
 * Fee rules (project plan §4.3, §6.8):
 *   Monthly     ₹250  (30 days)
 *   Half-yearly ₹1,500 (180 days)
 *   Annual      ₹3,000 (365 days)
 *   Application fee ₹10,000 — one-time, only if User.applicationFeePaid === false
 *
 * No partial payments: amount must match the fee for the selected type exactly.
 *
 * Approval gating:
 *   ADMIN    → Membership.status = APPROVED immediately, User subscription fields updated
 *   OPERATOR → Membership.status stays PENDING, Approval record created
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity, logAudit } from "@/lib/audit";
import { MEMBERSHIP_FEES, APPLICATION_FEE } from "@/types";
import type { MembershipType } from "@/types";
import type { CreateMembershipInput } from "@/lib/validators";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MembershipRecord {
  id: string;
  memberId: string;
  type: MembershipType;
  amount: string; // Decimal serialised as string for JSON safety
  startDate: Date;
  endDate: Date;
  isApplicationFee: boolean;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: Date;
}

export interface MembershipWithMember extends MembershipRecord {
  member: {
    id: string;
    name: string;
    email: string;
    userId: string | null;
  };
}

export interface MyMembershipData {
  user: {
    id: string;
    memberId: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    role: string;
    membershipStatus: string;
    membershipType: MembershipType | null;
    membershipStart: Date | null;
    membershipExpiry: Date | null;
    totalPaid: string;
    applicationFeePaid: boolean;
  };
  member: {
    id: string;
    membershipStatus: string;
  } | null;
  subMembers: Array<{
    id: string;
    memberId: string;
    name: string;
    email: string;
    phone: string;
    relation: string;
  }>;
  paymentHistory: MembershipRecord[];
}

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
  action?: "direct" | "pending_approval";
}

export interface MembershipListQuery {
  memberId?: string;
  status?: "PENDING" | "APPROVED" | "REJECTED";
  page: number;
  limit: number;
}

export interface PaginatedMemberships {
  data: MembershipWithMember[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Duration in days for each membership type.
 */
const MEMBERSHIP_DURATION_DAYS: Record<MembershipType, number> = {
  MONTHLY: 30,
  HALF_YEARLY: 180,
  ANNUAL: 365,
};

/**
 * Calculate startDate and endDate for a new membership period.
 *
 * If the member has an active/future membership, the new period starts the day
 * after the current expiry. Otherwise it starts today.
 */
function calculateMembershipDates(
  type: MembershipType,
  currentExpiry: Date | null
): { startDate: Date; endDate: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let startDate: Date;
  if (currentExpiry && currentExpiry >= today) {
    // Start the day after current expiry
    startDate = new Date(currentExpiry);
    startDate.setDate(startDate.getDate() + 1);
  } else {
    startDate = today;
  }

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + MEMBERSHIP_DURATION_DAYS[type] - 1);

  return { startDate, endDate };
}

/**
 * Validate that the amount matches the expected fee for the membership type.
 * Returns an error string if invalid, or null if valid.
 */
function validateAmount(
  type: MembershipType,
  amount: number,
  isApplicationFee: boolean
): string | null {
  const expectedFee = MEMBERSHIP_FEES[type];
  const expectedTotal = isApplicationFee
    ? expectedFee + APPLICATION_FEE
    : expectedFee;

  if (amount !== expectedTotal) {
    if (isApplicationFee) {
      return `Amount must be exactly ₹${expectedTotal} (₹${APPLICATION_FEE} application fee + ₹${expectedFee} membership fee) for ${type} membership`;
    }
    return `Amount must be exactly ₹${expectedFee} for ${type} membership. No partial payments allowed.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// List memberships
// ---------------------------------------------------------------------------

/**
 * List all membership periods for a specific member (UUID of Member record).
 * Returns memberships ordered by createdAt descending.
 */
export async function getMembershipsByMember(
  memberId: string
): Promise<ServiceResult<MembershipRecord[]>> {
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) {
    return { success: false, error: "Member not found", status: 404 };
  }

  const memberships = await prisma.membership.findMany({
    where: { memberId },
    orderBy: { createdAt: "desc" },
  });

  return {
    success: true,
    data: memberships.map((m) => ({
      ...m,
      amount: m.amount.toString(),
      type: m.type as MembershipType,
      status: m.status as "PENDING" | "APPROVED" | "REJECTED",
    })),
  };
}

/**
 * List memberships with optional filters and pagination.
 * Admin + Operator see all; Member sees own only (enforced at route level).
 */
export async function listMemberships(
  query: MembershipListQuery
): Promise<ServiceResult<PaginatedMemberships>> {
  const { memberId, status, page, limit } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.MembershipWhereInput = {};
  if (memberId) where.memberId = memberId;
  if (status) where.status = status;

  const [memberships, total] = await Promise.all([
    prisma.membership.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        member: {
          select: { id: true, name: true, email: true, userId: true },
        },
      },
    }),
    prisma.membership.count({ where }),
  ]);

  return {
    success: true,
    data: {
      data: memberships.map((m) => ({
        ...m,
        amount: m.amount.toString(),
        type: m.type as MembershipType,
        status: m.status as "PENDING" | "APPROVED" | "REJECTED",
        member: m.member,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ---------------------------------------------------------------------------
// Create membership
// ---------------------------------------------------------------------------

/**
 * Create a new membership period for a member.
 *
 * Business rules:
 * 1. Amount must exactly match the fee for the selected type (no partial payments).
 * 2. Application fee (₹10,000) is one-time and only valid if User.applicationFeePaid === false.
 * 3. startDate = today or day after current membership expiry (if not expired).
 * 4. Admin: status = APPROVED immediately, User subscription fields updated.
 * 5. Operator: status = PENDING, Approval record created.
 *
 * @param data        - validated membership input
 * @param requestedBy - the session user performing the action
 */
export async function createMembership(
  data: CreateMembershipInput,
  requestedBy: { id: string; role: string; name: string }
): Promise<ServiceResult<{ membershipId?: string; approvalId?: string }>> {
  // 1. Resolve the Member record
  const member = await prisma.member.findUnique({
    where: { id: data.memberId },
    include: {
      user: {
        select: {
          id: true,
          membershipExpiry: true,
          applicationFeePaid: true,
          membershipType: true,
          membershipStatus: true,
        },
      },
    },
  });

  if (!member) {
    return { success: false, error: "Member not found", status: 404 };
  }

  // 2. Validate application fee usage
  if (data.isApplicationFee) {
    if (!member.user) {
      return {
        success: false,
        error: "Member has no linked user account; cannot process application fee",
        status: 400,
      };
    }
    if (member.user.applicationFeePaid) {
      return {
        success: false,
        error: "Application fee has already been paid for this member",
        status: 400,
      };
    }
  }

  // 3. Validate amount exactly matches the fee
  const amountNum = Number(data.amount);
  const amountError = validateAmount(data.type, amountNum, data.isApplicationFee ?? false);
  if (amountError) {
    return { success: false, error: amountError, status: 400 };
  }

  // 4. Calculate dates
  const currentExpiry = member.user?.membershipExpiry ?? null;
  const { startDate, endDate } = calculateMembershipDates(data.type, currentExpiry);

  // 5. Operator path: create Approval record, membership stays PENDING
  if (requestedBy.role === "OPERATOR") {
    const membership = await prisma.membership.create({
      data: {
        memberId: data.memberId,
        type: data.type,
        amount: new Prisma.Decimal(data.amount),
        startDate,
        endDate,
        isApplicationFee: data.isApplicationFee ?? false,
        status: "PENDING",
      },
    });

    const approval = await prisma.approval.create({
      data: {
        entityType: "MEMBERSHIP",
        entityId: membership.id,
        action: "create_membership",
        previousData: Prisma.DbNull,
        newData: {
          membershipId: membership.id,
          memberId: data.memberId,
          type: data.type,
          amount: data.amount,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          isApplicationFee: data.isApplicationFee ?? false,
        } as Prisma.InputJsonValue,
        requestedById: requestedBy.id,
        status: "PENDING",
      },
    });

    await logActivity({
      userId: requestedBy.id,
      action: "membership_create_requested",
      description: `Operator ${requestedBy.name} submitted membership request for member ${member.name} (${data.type}, ₹${data.amount})`,
      metadata: {
        approvalId: approval.id,
        membershipId: membership.id,
        memberId: data.memberId,
        type: data.type,
        amount: data.amount,
      },
    });

    return {
      success: true,
      data: { membershipId: membership.id, approvalId: approval.id },
      action: "pending_approval",
      status: 202,
    };
  }

  // 6. Admin path: create Membership + update User subscription fields in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const membership = await tx.membership.create({
      data: {
        memberId: data.memberId,
        type: data.type,
        amount: new Prisma.Decimal(data.amount),
        startDate,
        endDate,
        isApplicationFee: data.isApplicationFee ?? false,
        status: "APPROVED",
      },
    });

    // Update User subscription fields if linked
    if (member.userId) {
      const userUpdate: Prisma.UserUpdateInput = {
        membershipStatus: "ACTIVE",
        membershipType: data.type,
        membershipStart: startDate,
        membershipExpiry: endDate,
        totalPaid: {
          increment: new Prisma.Decimal(data.amount),
        },
      };

      if (data.isApplicationFee) {
        userUpdate.applicationFeePaid = true;
      }

      await tx.user.update({
        where: { id: member.userId },
        data: userUpdate,
      });

      // Also update the Member record's status
      await tx.member.update({
        where: { id: data.memberId },
        data: { membershipStatus: "ACTIVE" },
      });
    }

    return membership;
  });

  // 7. Log to both audit and activity logs
  await Promise.all([
    logAudit({
      entityType: "Membership",
      entityId: result.id,
      action: "membership_approved",
      previousData: null,
      newData: {
        membershipId: result.id,
        memberId: data.memberId,
        memberName: member.name,
        type: data.type,
        amount: data.amount,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        isApplicationFee: data.isApplicationFee ?? false,
        status: "APPROVED",
        approvedBy: requestedBy.id,
      },
      performedById: requestedBy.id,
    }),
    logActivity({
      userId: requestedBy.id,
      action: "membership_created",
      description: `Admin ${requestedBy.name} created and approved membership for ${member.name} (${data.type}, ₹${data.amount})`,
      metadata: {
        membershipId: result.id,
        memberId: data.memberId,
        type: data.type,
        amount: data.amount,
      },
    }),
  ]);

  return {
    success: true,
    data: { membershipId: result.id },
    action: "direct",
    status: 201,
  };
}

// ---------------------------------------------------------------------------
// Approve membership
// ---------------------------------------------------------------------------

/**
 * Approve a pending membership period.
 * Sets Membership.status = APPROVED and updates User subscription fields.
 *
 * Called from the approval queue handler when an admin approves a MEMBERSHIP approval.
 *
 * @param membershipId - UUID of the Membership record
 * @param approvedBy   - session user performing the approval (must be ADMIN)
 */
export async function approveMembership(
  membershipId: string,
  approvedBy: { id: string; name: string }
): Promise<ServiceResult<{ membershipId: string }>> {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    include: {
      member: {
        include: {
          user: {
            select: {
              id: true,
              totalPaid: true,
              applicationFeePaid: true,
            },
          },
        },
      },
    },
  });

  if (!membership) {
    return { success: false, error: "Membership not found", status: 404 };
  }

  if (membership.status !== "PENDING") {
    return {
      success: false,
      error: `Membership is already ${membership.status}`,
      status: 400,
    };
  }

  await prisma.$transaction(async (tx) => {
    // Update the membership status
    await tx.membership.update({
      where: { id: membershipId },
      data: { status: "APPROVED" },
    });

    // Update User subscription fields if member has a linked User
    if (membership.member.userId && membership.member.user) {
      const userUpdate: Prisma.UserUpdateInput = {
        membershipStatus: "ACTIVE",
        membershipType: membership.type,
        membershipStart: membership.startDate,
        membershipExpiry: membership.endDate,
        totalPaid: {
          increment: membership.amount,
        },
      };

      if (membership.isApplicationFee && !membership.member.user.applicationFeePaid) {
        userUpdate.applicationFeePaid = true;
      }

      await tx.user.update({
        where: { id: membership.member.userId },
        data: userUpdate,
      });

      // Update Member record status
      await tx.member.update({
        where: { id: membership.memberId },
        data: { membershipStatus: "ACTIVE" },
      });
    }
  });

  // Log both
  await Promise.all([
    logAudit({
      entityType: "Membership",
      entityId: membershipId,
      action: "membership_approved",
      previousData: { status: "PENDING" },
      newData: {
        membershipId,
        memberId: membership.memberId,
        memberName: membership.member.name,
        type: membership.type,
        amount: membership.amount.toString(),
        startDate: membership.startDate.toISOString(),
        endDate: membership.endDate.toISOString(),
        isApplicationFee: membership.isApplicationFee,
        status: "APPROVED",
        approvedBy: approvedBy.id,
      },
      performedById: approvedBy.id,
    }),
    logActivity({
      userId: approvedBy.id,
      action: "membership_approved",
      description: `Admin ${approvedBy.name} approved membership for ${membership.member.name} (${membership.type}, ₹${membership.amount})`,
      metadata: { membershipId, memberId: membership.memberId },
    }),
  ]);

  return { success: true, data: { membershipId }, action: "direct" };
}

// ---------------------------------------------------------------------------
// Reject membership
// ---------------------------------------------------------------------------

/**
 * Reject a pending membership period.
 * Sets Membership.status = REJECTED. No User fields are changed.
 */
export async function rejectMembership(
  membershipId: string,
  rejectedBy: { id: string; name: string },
  notes?: string
): Promise<ServiceResult<{ membershipId: string }>> {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    include: {
      member: { select: { id: true, name: true } },
    },
  });

  if (!membership) {
    return { success: false, error: "Membership not found", status: 404 };
  }

  if (membership.status !== "PENDING") {
    return {
      success: false,
      error: `Membership is already ${membership.status}`,
      status: 400,
    };
  }

  await prisma.membership.update({
    where: { id: membershipId },
    data: { status: "REJECTED" },
  });

  await Promise.all([
    logAudit({
      entityType: "Membership",
      entityId: membershipId,
      action: "membership_rejected",
      previousData: { status: "PENDING" },
      newData: {
        membershipId,
        status: "REJECTED",
        rejectedBy: rejectedBy.id,
        notes: notes ?? null,
      },
      performedById: rejectedBy.id,
    }),
    logActivity({
      userId: rejectedBy.id,
      action: "membership_rejected",
      description: `Admin ${rejectedBy.name} rejected membership for ${membership.member.name} (${membership.type}, ₹${membership.amount})`,
      metadata: { membershipId, notes: notes ?? null },
    }),
  ]);

  return { success: true, data: { membershipId }, action: "direct" };
}

// ---------------------------------------------------------------------------
// Get single membership
// ---------------------------------------------------------------------------

/**
 * Retrieve a single Membership record by its UUID.
 */
export async function getMembership(
  membershipId: string
): Promise<ServiceResult<MembershipWithMember>> {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    include: {
      member: {
        select: { id: true, name: true, email: true, userId: true },
      },
    },
  });

  if (!membership) {
    return { success: false, error: "Membership not found", status: 404 };
  }

  return {
    success: true,
    data: {
      ...membership,
      amount: membership.amount.toString(),
      type: membership.type as MembershipType,
      status: membership.status as "PENDING" | "APPROVED" | "REJECTED",
      member: membership.member,
    },
  };
}

// ---------------------------------------------------------------------------
// Get my membership (for the logged-in user's dashboard)
// ---------------------------------------------------------------------------

/**
 * Get the current user's full membership details + payment history.
 * Works for both primary User and SubMember accounts.
 *
 * For sub-members, returns the parent user's membership data.
 *
 * @param userId      - User.id (primary) or SubMember.id (sub-member)
 * @param isSubMember - true if the caller is a sub-member
 * @param parentUserId - for sub-members, the parent User.id
 */
export async function getMyMembership(
  userId: string,
  isSubMember: boolean,
  parentUserId?: string
): Promise<ServiceResult<MyMembershipData>> {
  // Resolve the User record to query against
  const targetUserId = isSubMember && parentUserId ? parentUserId : userId;

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      memberId: true,
      name: true,
      email: true,
      phone: true,
      address: true,
      role: true,
      membershipStatus: true,
      membershipType: true,
      membershipStart: true,
      membershipExpiry: true,
      totalPaid: true,
      applicationFeePaid: true,
      subMembers: {
        select: {
          id: true,
          memberId: true,
          name: true,
          email: true,
          phone: true,
          relation: true,
        },
      },
      member: {
        select: {
          id: true,
          membershipStatus: true,
          memberships: {
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });

  if (!user) {
    return { success: false, error: "User not found", status: 404 };
  }

  const paymentHistory: MembershipRecord[] = (user.member?.memberships ?? []).map(
    (m) => ({
      ...m,
      amount: m.amount.toString(),
      type: m.type as MembershipType,
      status: m.status as "PENDING" | "APPROVED" | "REJECTED",
    })
  );

  return {
    success: true,
    data: {
      user: {
        id: user.id,
        memberId: user.memberId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: user.role,
        membershipStatus: user.membershipStatus,
        membershipType: user.membershipType as MembershipType | null,
        membershipStart: user.membershipStart,
        membershipExpiry: user.membershipExpiry,
        totalPaid: user.totalPaid.toString(),
        applicationFeePaid: user.applicationFeePaid,
      },
      member: user.member
        ? {
            id: user.member.id,
            membershipStatus: user.member.membershipStatus,
          }
        : null,
      subMembers: user.subMembers,
      paymentHistory,
    },
  };
}
