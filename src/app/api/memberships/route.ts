/**
 * GET  /api/memberships  — list membership periods
 * POST /api/memberships  — create a new membership period
 *
 * Auth rules:
 *   Admin + Operator: can query any member's memberships via ?memberId=
 *   Member (primary + sub-member): can only see own memberships
 */

import { NextRequest, NextResponse } from "next/server";

import { getAuthSession } from "@/lib/auth";
import { requireAuth, requirePasswordChanged } from "@/lib/permissions";
import {
  createMembershipSchema,
  membershipListQuerySchema,
} from "@/lib/validators";
import {
  listMemberships,
  createMembership,
} from "@/lib/services/membership-service";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    const user = requireAuth(session);
    requirePasswordChanged(session);

    const { searchParams } = request.nextUrl;

    // Members can only see their own memberships — resolve their memberId
    let resolvedMemberId: string | undefined;

    if (user.role === "MEMBER") {
      // Look up the Member record for this user (or parent user for sub-members)
      const targetUserId =
        user.isSubMember && user.parentUserId ? user.parentUserId : user.id;

      const memberRecord = await prisma.member.findFirst({
        where: { userId: targetUserId },
        select: { id: true },
      });

      if (!memberRecord) {
        return NextResponse.json({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
      }
      resolvedMemberId = memberRecord.id;
    } else {
      // Admin/Operator can optionally filter by memberId
      resolvedMemberId = searchParams.get("memberId") ?? undefined;
    }

    const parseResult = membershipListQuerySchema.safeParse({
      memberId: resolvedMemberId,
      status: searchParams.get("status") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Invalid query parameters",
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const result = await listMemberships(parseResult.data);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 500 }
      );
    }

    return NextResponse.json(result.data);
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    if (e.status === 401 || e.status === 403) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[GET /api/memberships]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    const user = requireAuth(session);
    requirePasswordChanged(session);

    const body = await request.json();
    const parseResult = createMembershipSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    // Members can only create memberships for themselves (or their parent)
    if (user.role === "MEMBER") {
      const targetUserId =
        user.isSubMember && user.parentUserId ? user.parentUserId : user.id;

      const memberRecord = await prisma.member.findFirst({
        where: { userId: targetUserId },
        select: { id: true },
      });

      if (!memberRecord || memberRecord.id !== parseResult.data.memberId) {
        return NextResponse.json(
          { error: "Forbidden: members can only create their own memberships" },
          { status: 403 }
        );
      }
    }

    const result = await createMembership(parseResult.data, {
      id: user.id,
      role: user.role,
      name: user.name,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 500 }
      );
    }

    const statusCode =
      result.status ??
      (result.action === "pending_approval" ? 202 : 201);

    return NextResponse.json(
      {
        ...result.data,
        action: result.action,
        message:
          result.action === "pending_approval"
            ? "Membership request submitted for admin approval"
            : "Membership created and approved successfully",
      },
      { status: statusCode }
    );
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    if (e.status === 401 || e.status === 403) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[POST /api/memberships]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
