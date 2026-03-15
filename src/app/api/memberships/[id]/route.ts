/**
 * GET /api/memberships/[id]  — single membership details
 * PUT /api/memberships/[id]  — update membership status (admin only)
 *
 * Auth rules:
 *   GET: authenticated users (members see own, admin/operator see all)
 *   PUT: admin only (approve/reject)
 */

import { NextRequest, NextResponse } from "next/server";

import { getAuthSession } from "@/lib/auth";
import { requireAuth, requireRole, requirePasswordChanged } from "@/lib/permissions";
import { getMembership, approveMembership, rejectMembership } from "@/lib/services/membership-service";
import { z } from "zod";

const updateMembershipSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"] as const, {
    message: "status must be APPROVED or REJECTED",
  }),
  notes: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAuthSession(request);
    const user = requireAuth(session);
    requirePasswordChanged(session);

    const result = await getMembership(params.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 500 }
      );
    }

    // Members can only view their own memberships
    if (user.role === "MEMBER") {
      const { prisma } = await import("@/lib/prisma");
      const targetUserId =
        user.isSubMember && user.parentUserId ? user.parentUserId : user.id;

      const memberRecord = await prisma.member.findFirst({
        where: { userId: targetUserId },
        select: { id: true },
      });

      if (!memberRecord || result.data!.member.id !== memberRecord.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    return NextResponse.json(result.data);
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    if (e.status === 401 || e.status === 403) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[GET /api/memberships/[id]]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAuthSession(request);
    const user = requireRole(session, "ADMIN");
    requirePasswordChanged(session);

    const body = await request.json();
    const parseResult = updateMembershipSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { status, notes } = parseResult.data;

    let result;
    if (status === "APPROVED") {
      result = await approveMembership(params.id, {
        id: user.id,
        name: user.name,
      });
    } else {
      result = await rejectMembership(
        params.id,
        { id: user.id, name: user.name },
        notes
      );
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 500 }
      );
    }

    return NextResponse.json({
      ...result.data,
      message: `Membership ${status.toLowerCase()} successfully`,
    });
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    if (e.status === 401 || e.status === 403) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[PUT /api/memberships/[id]]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
