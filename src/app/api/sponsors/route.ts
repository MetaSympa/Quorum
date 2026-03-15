/**
 * GET  /api/sponsors  — list sponsors (admin + operator, paginated)
 * POST /api/sponsors  — create sponsor (admin + operator)
 */

import { NextRequest, NextResponse } from "next/server";

import { getAuthSession } from "@/lib/auth";
import { requireRole, requirePasswordChanged } from "@/lib/permissions";
import { createSponsorSchema, sponsorListQuerySchema } from "@/lib/validators";
import {
  listSponsors,
  createSponsor,
} from "@/lib/services/sponsor-service";

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    requireRole(session, "ADMIN", "OPERATOR");
    requirePasswordChanged(session);

    const { searchParams } = request.nextUrl;
    const parseResult = sponsorListQuerySchema.safeParse({
      search: searchParams.get("search") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const result = await listSponsors(parseResult.data);

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
    console.error("[GET /api/sponsors]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    const user = requireRole(session, "ADMIN", "OPERATOR");
    requirePasswordChanged(session);

    const body = await request.json();
    const parseResult = createSponsorSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const result = await createSponsor(parseResult.data, {
      id: user.id,
      name: user.name,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 500 }
      );
    }

    return NextResponse.json(result.data, { status: result.status ?? 201 });
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    if (e.status === 401 || e.status === 403) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[POST /api/sponsors]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
