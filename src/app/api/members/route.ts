/**
 * GET  /api/members  — list all members (admin + operator)
 * POST /api/members  — create member (admin: direct; operator: queues approval)
 */

import { NextRequest, NextResponse } from "next/server";

import { getAuthSession } from "@/lib/auth";
import { requireRole, requirePasswordChanged } from "@/lib/permissions";
import { createMemberSchema, memberListQuerySchema } from "@/lib/validators";
import {
  listMembers,
  createMember,
} from "@/lib/services/member-service";

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    const user = requireRole(session, "ADMIN", "OPERATOR");
    requirePasswordChanged(session);

    // Parse + validate query params
    const { searchParams } = request.nextUrl;
    const parseResult = memberListQuerySchema.safeParse({
      search: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const result = await listMembers(parseResult.data);

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
    console.error("[GET /api/members]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    const user = requireRole(session, "ADMIN", "OPERATOR");
    requirePasswordChanged(session);

    const body = await request.json();
    const parseResult = createMemberSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const result = await createMember(parseResult.data, {
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
            ? "Member creation request submitted for admin approval"
            : "Member created successfully",
      },
      { status: statusCode }
    );
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    if (e.status === 401 || e.status === 403) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[POST /api/members]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
