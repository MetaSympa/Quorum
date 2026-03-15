/**
 * GET /api/activity-log — list system-wide activity log entries (read-only, append-only)
 *
 * Auth: ADMIN + OPERATOR (both get same read-only data)
 * Filters: userId, action, dateFrom, dateTo, page, limit
 * Includes: user (name, role, memberId)
 * Order: createdAt DESC
 *
 * Immutability (T27):
 *   ActivityLog is append-only — no mutations are permitted via the API.
 *   POST, PUT, PATCH, and DELETE return 405 Method Not Allowed.
 *   Activity entries are written exclusively by logActivity() in lib/audit.ts
 *   which only calls prisma.activityLog.create() — never update or delete.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAuthSession } from "@/lib/auth";
import { requireRole, requirePasswordChanged } from "@/lib/permissions";
import { activityLogQuerySchema } from "@/lib/validators";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    requireRole(session, "ADMIN", "OPERATOR");
    requirePasswordChanged(session);

    const { searchParams } = request.nextUrl;
    const parseResult = activityLogQuerySchema.safeParse({
      userId: searchParams.get("userId") ?? undefined,
      action: searchParams.get("action") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { userId, action, dateFrom, dateTo, page, limit } = parseResult.data;

    // Build where clause
    const where: Prisma.ActivityLogWhereInput = {};

    if (userId) {
      where.userId = userId;
    }
    if (action) {
      where.action = { contains: action, mode: "insensitive" };
    }
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        // Include the full dateTo day up to 23:59:59
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }

    const [total, entries] = await Promise.all([
      prisma.activityLog.count({ where }),
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: { id: true, name: true, role: true, memberId: true },
          },
        },
      }),
    ]);

    return NextResponse.json({
      data: entries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    if (e.status === 401 || e.status === 403) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[GET /api/activity-log]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Explicit 405 handlers — activity log is read-only / append-only (T27)
// ---------------------------------------------------------------------------

const METHOD_NOT_ALLOWED = NextResponse.json(
  { error: "Method Not Allowed — activity log is read-only and append-only" },
  {
    status: 405,
    headers: { Allow: "GET" },
  }
);

export async function POST() {
  return METHOD_NOT_ALLOWED;
}

export async function PUT() {
  return METHOD_NOT_ALLOWED;
}

export async function PATCH() {
  return METHOD_NOT_ALLOWED;
}

export async function DELETE() {
  return METHOD_NOT_ALLOWED;
}
