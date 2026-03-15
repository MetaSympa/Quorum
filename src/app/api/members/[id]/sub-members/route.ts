/**
 * GET    /api/members/[id]/sub-members  — list sub-members for a member
 * POST   /api/members/[id]/sub-members  — add sub-member (max 3 enforced)
 * PUT    /api/members/[id]/sub-members  — update sub-member (body includes subMemberId)
 * DELETE /api/members/[id]/sub-members  — remove sub-member (body includes subMemberId)
 */

import { NextRequest, NextResponse } from "next/server";

import { getAuthSession } from "@/lib/auth";
import { requireRole, requirePasswordChanged } from "@/lib/permissions";
import {
  createSubMemberSchema,
  updateSubMemberSchema,
  deleteSubMemberSchema,
} from "@/lib/validators";
import {
  listSubMembers,
  addSubMember,
  updateSubMember,
  removeSubMember,
} from "@/lib/services/member-service";

interface RouteParams {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getAuthSession(request);
    requireRole(session, "ADMIN", "OPERATOR");
    requirePasswordChanged(session);

    const result = await listSubMembers(params.id);

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
    console.error("[GET /api/members/[id]/sub-members]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getAuthSession(request);
    const user = requireRole(session, "ADMIN", "OPERATOR");
    requirePasswordChanged(session);

    const body = await request.json();
    const parseResult = createSubMemberSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const result = await addSubMember(params.id, parseResult.data, {
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

    const statusCode = result.status ?? (result.action === "pending_approval" ? 202 : 201);
    return NextResponse.json(
      {
        ...result.data,
        action: result.action,
        message:
          result.action === "pending_approval"
            ? "Sub-member add request submitted for admin approval"
            : "Sub-member added successfully",
      },
      { status: statusCode }
    );
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    if (e.status === 401 || e.status === 403) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[POST /api/members/[id]/sub-members]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getAuthSession(request);
    const user = requireRole(session, "ADMIN", "OPERATOR");
    requirePasswordChanged(session);

    const body = await request.json();
    const parseResult = updateSubMemberSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { subMemberId, ...updateData } = parseResult.data;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "At least one field must be provided for update" },
        { status: 400 }
      );
    }

    const result = await updateSubMember(params.id, subMemberId, updateData, {
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
          ? "Sub-member update request submitted for admin approval"
          : "Sub-member updated successfully",
    });
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    if (e.status === 401 || e.status === 403) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[PUT /api/members/[id]/sub-members]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getAuthSession(request);
    const user = requireRole(session, "ADMIN", "OPERATOR");
    requirePasswordChanged(session);

    const body = await request.json();
    const parseResult = deleteSubMemberSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const result = await removeSubMember(
      params.id,
      parseResult.data.subMemberId,
      {
        id: user.id,
        role: user.role,
        name: user.name,
      }
    );

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
          ? "Sub-member remove request submitted for admin approval"
          : "Sub-member removed successfully",
    });
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    if (e.status === 401 || e.status === 403) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[DELETE /api/members/[id]/sub-members]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
