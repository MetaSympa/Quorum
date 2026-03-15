/**
 * GET /api/audit-log — list financial audit log entries (read-only, append-only)
 *
 * Auth: ADMIN + OPERATOR (both get same read-only data)
 * Filters: category, dateFrom, dateTo, performedById, page, limit
 * Includes: performer (name), linked transaction details, approved snapshot
 * Order: createdAt DESC
 * Scope: approved transactions only
 *
 * Immutability (T27):
 *   AuditLog is append-only — no mutations are permitted via the API.
 *   POST, PUT, PATCH, and DELETE return 405 Method Not Allowed.
 *   Audit entries are written exclusively by logAudit() in lib/audit.ts
 *   which only calls prisma.auditLog.create() — never update or delete.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAuthSession } from "@/lib/auth";
import { requireRole, requirePasswordChanged } from "@/lib/permissions";
import { auditLogQuerySchema } from "@/lib/validators";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    requireRole(session, "ADMIN", "OPERATOR");
    requirePasswordChanged(session);

    const { searchParams } = request.nextUrl;
    const parseResult = auditLogQuerySchema.safeParse({
      category: searchParams.get("category") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      performedById: searchParams.get("performedById") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { category, dateFrom, dateTo, performedById, page, limit } = parseResult.data;

    // Build where clause
    const where: Prisma.AuditLogWhereInput = {
      transaction: {
        is: {
          approvalStatus: "APPROVED",
          ...(category ? { category } : {}),
        },
      },
    };

    if (performedById) {
      where.performedById = performedById;
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
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          transactionSnapshot: true,
          transactionId: true,
          performedById: true,
          createdAt: true,
          performedBy: {
            select: { id: true, name: true, role: true, memberId: true },
          },
          transaction: {
            select: {
              id: true,
              type: true,
              category: true,
              amount: true,
              paymentMode: true,
              description: true,
              sponsorPurpose: true,
              approvalStatus: true,
              approvalSource: true,
              senderName: true,
              senderPhone: true,
              senderUpiId: true,
              senderBankAccount: true,
              senderBankName: true,
              razorpayPaymentId: true,
              razorpayOrderId: true,
              receiptNumber: true,
              createdAt: true,
            },
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
    console.error("[GET /api/audit-log]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Explicit 405 handlers — audit log is read-only / append-only (T27)
// ---------------------------------------------------------------------------

const METHOD_NOT_ALLOWED = NextResponse.json(
  { error: "Method Not Allowed — audit log is read-only and append-only" },
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
