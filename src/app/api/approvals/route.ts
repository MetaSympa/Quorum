/**
 * GET /api/approvals
 *
 * List approvals. Admin only.
 *
 * Query parameters:
 *   entityType — TRANSACTION | MEMBER_ADD | MEMBER_EDIT | MEMBER_DELETE | MEMBERSHIP
 *   status     — PENDING | APPROVED | REJECTED (defaults to PENDING if omitted)
 *   dateFrom   — ISO date string (inclusive)
 *   dateTo     — ISO date string (inclusive, end of day)
 *   page       — default 1
 *   limit      — default 20, max 100
 */

import { NextRequest, NextResponse } from "next/server";

import { getAuthSession } from "@/lib/auth";
import { requireRole } from "@/lib/permissions";
import { approvalListQuerySchema } from "@/lib/validators";
import { listApprovals } from "@/lib/services/approval-service";

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    requireRole(session, "ADMIN");

    const { searchParams } = request.nextUrl;
    const raw = {
      entityType: searchParams.get("entityType") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    };

    const parsed = approvalListQuerySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await listApprovals(parsed.data);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 500 }
      );
    }

    return NextResponse.json(result.data);
  } catch (err) {
    const error = err as Error & { status?: number };
    return NextResponse.json(
      { error: error.message ?? "Internal server error" },
      { status: error.status ?? 500 }
    );
  }
}
