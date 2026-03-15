/**
 * POST /api/approvals/[id]/reject
 *
 * Reject a pending approval entry. Admin only.
 *
 * Body: { notes?: string }
 *
 * For TRANSACTION and MEMBERSHIP: marks entity as REJECTED in DB.
 * For MEMBER_ADD / MEMBER_EDIT / MEMBER_DELETE: no entity DB change (discard).
 * Logs to AuditLog + ActivityLog on success.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAuthSession } from "@/lib/auth";
import { requireRole } from "@/lib/permissions";
import { approvalActionSchema } from "@/lib/validators";
import { rejectEntry } from "@/lib/services/approval-service";

interface RouteContext {
  params: { id: string };
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getAuthSession(request);
    const user = requireRole(session, "ADMIN");

    const body = await request.json().catch(() => ({}));
    const parsed = approvalActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { id } = params;
    const result = await rejectEntry(
      id,
      { id: user.id, name: user.name },
      parsed.data.notes
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      message: "Approval rejected successfully",
    });
  } catch (err) {
    const error = err as Error & { status?: number };
    return NextResponse.json(
      { error: error.message ?? "Internal server error" },
      { status: error.status ?? 500 }
    );
  }
}
