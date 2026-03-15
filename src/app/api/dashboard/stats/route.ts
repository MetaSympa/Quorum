/**
 * GET /api/dashboard/stats
 *
 * Returns role-scoped summary stats for the dashboard home page.
 *
 * Auth: all authenticated users (ADMIN, OPERATOR, MEMBER).
 *
 * Admin/Operator response:
 *   {
 *     members: { total, active, pending, expired },
 *     financial: { totalIncome, totalExpenses, pendingApprovals, netBalance },
 *     approvals: { pending },
 *     recentActivity: [...last 10 activity entries],
 *     recentAudit: [...last 10 audit entries]
 *   }
 *
 * Member response:
 *   {
 *     membership: { status, type, expiry, daysLeft },
 *     payments: { total, lastPayment },
 *     subMembers: [...list of sub-members]
 *   }
 *
 * All Decimal amounts are cast to numbers for JSON serialisation.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAuthSession } from "@/lib/auth";
import { requireAuth } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Helper: days between two dates (rounded up)
// ---------------------------------------------------------------------------

function daysUntil(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diff = target.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// Admin / Operator stats
// ---------------------------------------------------------------------------

async function getAdminStats() {
  const [
    totalMembers,
    activeMembers,
    pendingMembers,
    expiredMembers,
    incomeAgg,
    expenseAgg,
    pendingTransactionAgg,
    pendingApprovals,
    recentActivity,
    recentAudit,
  ] = await Promise.all([
    // Member counts
    prisma.user.count({ where: { role: "MEMBER" } }),
    prisma.user.count({
      where: { role: "MEMBER", membershipStatus: "ACTIVE" },
    }),
    prisma.user.count({
      where: {
        role: "MEMBER",
        membershipStatus: {
          in: ["PENDING_APPROVAL", "PENDING_PAYMENT"],
        },
      },
    }),
    prisma.user.count({
      where: { role: "MEMBER", membershipStatus: "EXPIRED" },
    }),

    // Financial: total approved income (CASH_IN, APPROVED)
    prisma.transaction.aggregate({
      where: { type: "CASH_IN", approvalStatus: "APPROVED" },
      _sum: { amount: true },
    }),

    // Financial: total approved expenses (CASH_OUT, APPROVED)
    prisma.transaction.aggregate({
      where: { type: "CASH_OUT", approvalStatus: "APPROVED" },
      _sum: { amount: true },
    }),

    // Financial: pending approval transactions total
    prisma.transaction.aggregate({
      where: { approvalStatus: "PENDING" },
      _sum: { amount: true },
    }),

    // Pending approvals count
    prisma.approval.count({ where: { status: "PENDING" } }),

    // Recent activity (last 10)
    prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        action: true,
        description: true,
        createdAt: true,
        user: { select: { id: true, name: true, role: true, memberId: true } },
      },
    }),

    // Recent audit (last 10)
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        entityType: true,
        entityId: true,
        action: true,
        createdAt: true,
        performedBy: {
          select: { id: true, name: true, role: true, memberId: true },
        },
      },
    }),
  ]);

  const totalIncome = Number(incomeAgg._sum.amount ?? 0);
  const totalExpenses = Number(expenseAgg._sum.amount ?? 0);
  const pendingAmount = Number(pendingTransactionAgg._sum.amount ?? 0);

  return {
    members: {
      total: totalMembers,
      active: activeMembers,
      pending: pendingMembers,
      expired: expiredMembers,
    },
    financial: {
      totalIncome,
      totalExpenses,
      pendingApprovals: pendingAmount,
      netBalance: totalIncome - totalExpenses,
    },
    approvals: {
      pending: pendingApprovals,
    },
    recentActivity: recentActivity.map((a) => ({
      id: a.id,
      action: a.action,
      description: a.description,
      createdAt: a.createdAt,
      user: a.user,
    })),
    recentAudit: recentAudit.map((a) => ({
      id: a.id,
      entityType: a.entityType,
      entityId: a.entityId,
      action: a.action,
      createdAt: a.createdAt,
      performedBy: a.performedBy,
    })),
  };
}

// ---------------------------------------------------------------------------
// Member stats (primary user or sub-member)
// ---------------------------------------------------------------------------

async function getMemberStats(
  userId: string,
  isSubMember: boolean,
  parentUserId?: string
) {
  // For sub-members, membership data comes from the parent user
  const memberUserId = isSubMember && parentUserId ? parentUserId : userId;

  const [user, transactions, subMembers] = await Promise.all([
    prisma.user.findUnique({
      where: { id: memberUserId },
      select: {
        id: true,
        memberId: true,
        name: true,
        membershipStatus: true,
        membershipType: true,
        membershipExpiry: true,
        membershipStart: true,
        totalPaid: true,
      },
    }),

    // Approved payment transactions for this member (linked via Member.userId)
    prisma.transaction.findMany({
      where: {
        member: { userId: memberUserId },
        type: "CASH_IN",
        approvalStatus: "APPROVED",
      },
      orderBy: { createdAt: "desc" },
      take: 1,
      select: { createdAt: true, amount: true },
    }),

    // Sub-members of the parent user
    prisma.subMember.findMany({
      where: { parentUserId: memberUserId },
      select: {
        id: true,
        memberId: true,
        name: true,
        relation: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!user) {
    return null;
  }

  const daysLeft =
    user.membershipExpiry ? daysUntil(user.membershipExpiry) : null;
  const lastPayment = transactions[0]?.createdAt ?? null;

  return {
    membership: {
      status: user.membershipStatus,
      type: user.membershipType,
      expiry: user.membershipExpiry,
      daysLeft,
    },
    payments: {
      total: Number(user.totalPaid),
      lastPayment,
    },
    subMembers: subMembers.map((s) => ({
      id: s.id,
      memberId: s.memberId,
      name: s.name,
      relation: s.relation,
      createdAt: s.createdAt,
    })),
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    const sessionUser = requireAuth(session);

    const { role, id, isSubMember, parentUserId } = sessionUser;

    if (role === "ADMIN" || role === "OPERATOR") {
      const stats = await getAdminStats();
      return NextResponse.json(stats, { status: 200 });
    }

    // MEMBER (primary or sub-member)
    const stats = await getMemberStats(id, isSubMember, parentUserId);
    if (!stats) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(stats, { status: 200 });
  } catch (err) {
    const error = err as Error & { status?: number };
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: error.status ?? 500 }
    );
  }
}
