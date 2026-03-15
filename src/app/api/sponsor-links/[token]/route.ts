/**
 * GET    /api/sponsor-links/[token]  — PUBLIC (no auth) — returns sponsor link data for checkout page
 * PATCH  /api/sponsor-links/[token]  — deactivate a sponsor link (admin + operator)
 *
 * GET returns:
 *   { sponsorName, sponsorCompany, amount, purpose, purposeLabel, upiId, bankDetails, isActive, isExpired, clubName }
 *
 * Returns 404 if token not found.
 * Returns 410 Gone if link is expired or inactive.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAuthSession } from "@/lib/auth";
import { requireRole, requirePasswordChanged } from "@/lib/permissions";
import {
  getPublicSponsorLink,
  deactivateSponsorLink,
} from "@/lib/services/sponsor-service";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: { token: string };
}

/**
 * Public GET — no authentication required.
 * Fetches sponsor link data for the public checkout page.
 *
 * 404 → token not found
 * 410 → link is expired or inactive
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const result = await getPublicSponsorLink(params.token);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 500 }
      );
    }

    const data = result.data!;

    // Return 410 Gone for expired or deactivated links
    if (!data.isActive || data.isExpired) {
      return NextResponse.json(
        {
          ...data,
          error: data.isExpired ? "This payment link has expired" : "This payment link is no longer active",
        },
        { status: 410 }
      );
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error("[GET /api/sponsor-links/[token]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH — admin + operator only.
 * Deactivates a sponsor link by its token.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getAuthSession(request);
    const user = requireRole(session, "ADMIN", "OPERATOR");
    requirePasswordChanged(session);

    // Look up link by token to get the ID
    const link = await prisma.sponsorLink.findUnique({
      where: { token: params.token },
      select: { id: true },
    });

    if (!link) {
      return NextResponse.json(
        { error: "Sponsor link not found" },
        { status: 404 }
      );
    }

    const result = await deactivateSponsorLink(link.id, {
      id: user.id,
      name: user.name,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 500 }
      );
    }

    return NextResponse.json({ message: "Sponsor link deactivated successfully" });
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    if (e.status === 401 || e.status === 403) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[PATCH /api/sponsor-links/[token]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
