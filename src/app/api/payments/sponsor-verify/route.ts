/**
 * POST /api/payments/sponsor-verify
 *
 * PUBLIC endpoint — no authentication required.
 * Secondary HMAC signature verification after a public sponsor checkout completes.
 *
 * The webhook handler (/api/webhooks/razorpay) is the PRIMARY payment processor.
 * This endpoint provides a fast client-side confirmation check only.
 *
 * Body:
 *   { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 *
 * Returns:
 *   200 { verified: true } — signature valid
 *   400 { error: "..." }   — invalid signature or validation error
 *
 * Note: No authentication required because the sponsor checkout is a public flow.
 * The HMAC signature itself is the security mechanism here.
 */

import { NextResponse } from "next/server";
import { verifyPaymentSignature } from "@/lib/razorpay";
import { verifyPaymentSchema } from "@/lib/validators";
import {
  rateLimit,
  getRateLimitKey,
  PUBLIC_RATE_LIMIT,
} from "@/lib/rate-limit";

export async function POST(request: Request) {
  // Rate limit: 30 req/min per IP for public endpoints
  const rlKey = getRateLimitKey(request, "sponsor-verify");
  const rl = rateLimit(rlKey, PUBLIC_RATE_LIMIT.maxAttempts, PUBLIC_RATE_LIMIT.windowMs);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests — please try again later" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)),
        },
      }
    );
  }

  // Parse + validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = verifyPaymentSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", details: result.error.flatten() },
      { status: 400 }
    );
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = result.data;

  const valid = verifyPaymentSignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });

  if (!valid) {
    return NextResponse.json(
      { error: "Payment signature verification failed" },
      { status: 400 }
    );
  }

  return NextResponse.json({ verified: true });
}
