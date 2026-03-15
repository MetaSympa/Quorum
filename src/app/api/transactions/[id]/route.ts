/**
 * GET    /api/transactions/[id]  — get single transaction
 * PUT    /api/transactions/[id]  — update transaction (admin: direct; operator: queues approval)
 * DELETE /api/transactions/[id]  — void transaction (admin: direct; operator: queues approval)
 *
 * Razorpay-sourced transactions (approvalSource=RAZORPAY_WEBHOOK) cannot be
 * updated or deleted by any user — returns 403.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAuthSession } from "@/lib/auth";
import { requireRole, requirePasswordChanged } from "@/lib/permissions";
import { updateTransactionSchema } from "@/lib/validators";
import {
  getTransaction,
  updateTransaction,
  deleteTransaction,
} from "@/lib/services/transaction-service";

interface RouteParams {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getAuthSession(request);
    requireRole(session, "ADMIN", "OPERATOR");
    requirePasswordChanged(session);

    const result = await getTransaction(params.id);

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
    console.error("[GET /api/transactions/[id]]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getAuthSession(request);
    const user = requireRole(session, "ADMIN", "OPERATOR");
    requirePasswordChanged(session);

    const body = await request.json();
    const parseResult = updateTransactionSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    // Require at least one field
    if (Object.keys(parseResult.data).length === 0) {
      return NextResponse.json(
        { error: "At least one field must be provided for update" },
        { status: 400 }
      );
    }

    const result = await updateTransaction(params.id, parseResult.data, {
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
          ? "Transaction update request submitted for admin approval"
          : "Transaction updated successfully",
    });
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    if (e.status === 401 || e.status === 403) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[PUT /api/transactions/[id]]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getAuthSession(request);
    const user = requireRole(session, "ADMIN", "OPERATOR");
    requirePasswordChanged(session);

    const result = await deleteTransaction(params.id, {
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
          ? "Transaction delete request submitted for admin approval"
          : "Transaction voided successfully",
    });
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    if (e.status === 401 || e.status === 403) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[DELETE /api/transactions/[id]]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
