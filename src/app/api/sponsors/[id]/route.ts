/**
 * GET    /api/sponsors/[id]  — get single sponsor with transactions + links
 * PUT    /api/sponsors/[id]  — update sponsor
 * DELETE /api/sponsors/[id]  — delete sponsor (blocked if has transactions)
 */

import { NextRequest, NextResponse } from "next/server";

import { getAuthSession } from "@/lib/auth";
import { requireRole, requirePasswordChanged } from "@/lib/permissions";
import { updateSponsorSchema } from "@/lib/validators";
import {
  getSponsor,
  updateSponsor,
  deleteSponsor,
} from "@/lib/services/sponsor-service";

interface RouteParams {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getAuthSession(request);
    requireRole(session, "ADMIN", "OPERATOR");
    requirePasswordChanged(session);

    const result = await getSponsor(params.id);

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
    console.error("[GET /api/sponsors/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getAuthSession(request);
    const user = requireRole(session, "ADMIN", "OPERATOR");
    requirePasswordChanged(session);

    const body = await request.json();
    const parseResult = updateSponsorSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    if (Object.keys(parseResult.data).length === 0) {
      return NextResponse.json(
        { error: "At least one field must be provided for update" },
        { status: 400 }
      );
    }

    const result = await updateSponsor(params.id, parseResult.data, {
      id: user.id,
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
      message: "Sponsor updated successfully",
    });
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    if (e.status === 401 || e.status === 403) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[PUT /api/sponsors/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getAuthSession(request);
    const user = requireRole(session, "ADMIN", "OPERATOR");
    requirePasswordChanged(session);

    const result = await deleteSponsor(params.id, {
      id: user.id,
      name: user.name,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 500 }
      );
    }

    return NextResponse.json({ message: "Sponsor deleted successfully" });
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    if (e.status === 401 || e.status === 403) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[DELETE /api/sponsors/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
