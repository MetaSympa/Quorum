/**
 * GET /api/my-membership
 *
 * Returns the full membership profile for the authenticated user:
 * - User details (name, email, phone, address, membership status/type/expiry, totalPaid, applicationFeePaid)
 * - Linked Member record
 * - Sub-members list
 * - Payment history (all Membership records)
 *
 * For sub-member accounts, returns the parent user's membership data.
 * Accessible by all authenticated users.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAuthSession } from "@/lib/auth";
import { requireAuth, requirePasswordChanged } from "@/lib/permissions";
import { getMyMembership } from "@/lib/services/membership-service";

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    const user = requireAuth(session);
    requirePasswordChanged(session);

    const result = await getMyMembership(
      user.id,
      user.isSubMember,
      user.parentUserId
    );

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
    console.error("[GET /api/my-membership]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
