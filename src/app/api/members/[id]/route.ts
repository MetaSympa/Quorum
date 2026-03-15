/**
 * GET    /api/members/[id]  — get single member with sub-members (admin + operator)
 * PUT    /api/members/[id]  — update member (admin: direct; operator: queues approval)
 * DELETE /api/members/[id]  — soft-delete member (admin: direct; operator: queues approval)
 */

import { NextRequest, NextResponse } from "next/server";

import { getAuthSession } from "@/lib/auth";
import { requireRole, requirePasswordChanged } from "@/lib/permissions";
import { updateMemberSchema } from "@/lib/validators";
import {
  getMember,
  updateMember,
  deleteMember,
} from "@/lib/services/member-service";

interface RouteParams {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getAuthSession(request);
    requireRole(session, "ADMIN", "OPERATOR");
    requirePasswordChanged(session);

    const result = await getMember(params.id);

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
    console.error("[GET /api/members/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getAuthSession(request);
    const user = requireRole(session, "ADMIN", "OPERATOR");
    requirePasswordChanged(session);

    const body = await request.json();
    const parseResult = updateMemberSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    // Ensure at least one field is provided
    if (Object.keys(parseResult.data).length === 0) {
      return NextResponse.json(
        { error: "At least one field must be provided for update" },
        { status: 400 }
      );
    }

    const result = await updateMember(params.id, parseResult.data, {
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

    return NextResponse.json({
      ...result.data,
      action: result.action,
      message:
        result.action === "pending_approval"
          ? "Member update request submitted for admin approval"
          : "Member updated successfully",
    });
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    if (e.status === 401 || e.status === 403) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[PUT /api/members/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getAuthSession(request);
    const user = requireRole(session, "ADMIN", "OPERATOR");
    requirePasswordChanged(session);

    const result = await deleteMember(params.id, {
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

    return NextResponse.json({
      ...result.data,
      action: result.action,
      message:
        result.action === "pending_approval"
          ? "Member delete request submitted for admin approval"
          : "Member suspended (soft-deleted) successfully",
    });
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    if (e.status === 401 || e.status === 403) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[DELETE /api/members/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
