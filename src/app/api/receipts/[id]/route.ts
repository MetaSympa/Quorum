/**
 * GET /api/receipts/[id]
 *
 * Generate or retrieve an existing receipt for a transaction.
 *
 * Auth: ADMIN or OPERATOR only.
 * Idempotent: returns existing receipt data if the transaction already has a
 * receipt number — does not create a new receipt number on repeat calls.
 *
 * Response: ReceiptData JSON object.
 *
 * Errors:
 *   401 — not authenticated
 *   403 — insufficient role (MEMBER cannot access receipts)
 *   400 — transaction is not in APPROVED status
 *   404 — transaction not found
 *   500 — unexpected server error
 */


import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { requireRole } from "@/lib/permissions";
import { generateReceipt } from "@/lib/receipt";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAuthSession(request);
    const user = requireRole(session, "ADMIN", "OPERATOR");

    const { id } = params;

    if (!id || id.trim() === "") {
      return Response.json({ error: "Transaction ID is required" }, { status: 400 });
    }

    const result = await generateReceipt(id, user.id);

    if (!result.success) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    return Response.json(result.data);
  } catch (err: unknown) {
    const error = err as Error & { status?: number };
    if (error.status === 401 || error.status === 403) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[receipts] Unexpected error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
