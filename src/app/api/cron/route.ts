/**
 * POST /api/cron
 *
 * Manually triggers the daily membership expiry cron job.
 *
 * Authentication — accepts either:
 *   1. An authenticated admin session (for manual admin triggers).
 *   2. The `x-cron-secret` header matching the CRON_SECRET env var
 *      (for automated external cron service calls — no session required).
 *
 * Returns: { processed, reminded, expired }
 */

import { NextRequest, NextResponse } from "next/server";

import { getAuthSession } from "@/lib/auth";
import { requireRole } from "@/lib/permissions";
import { runDailyCron } from "@/lib/cron";

export async function POST(request: NextRequest) {
  // ----- Auth: accept cron secret header OR admin session -----
  const cronSecret = process.env.CRON_SECRET;
  const incomingSecret = request.headers.get("x-cron-secret");

  const isSecretAuth =
    cronSecret && incomingSecret && incomingSecret === cronSecret;

  if (!isSecretAuth) {
    // Fall back to session-based admin auth
    try {
      const session = await getAuthSession(request);
      requireRole(session, "ADMIN");
    } catch (err) {
      const error = err as Error & { status?: number };
      return NextResponse.json(
        { error: error.message || "Unauthorized" },
        { status: error.status ?? 401 }
      );
    }
  }

  // ----- Run cron -----
  try {
    const result = await runDailyCron();
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("[api/cron] Cron job failed:", err);
    return NextResponse.json(
      { error: "Cron job failed", details: String(err) },
      { status: 500 }
    );
  }
}
