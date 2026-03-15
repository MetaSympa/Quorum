/**
 * GET /api/transactions/summary
 * Returns aggregate totals: totalIncome, totalExpenses, pendingAmount, netBalance.
 * Used by the Cash Management page summary cards.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { requireRole, requirePasswordChanged } from "@/lib/permissions";
import { getTransactionSummary } from "@/lib/services/transaction-service";

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    requireRole(session, "ADMIN", "OPERATOR");
    requirePasswordChanged(session);

    const result = await getTransactionSummary();
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json(result.data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
