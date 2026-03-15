/**
 * POST /api/payments/verify
 *
 * Secondary verification of a Razorpay payment after client-side checkout.
 * The webhook handler (T13) is the PRIMARY payment processor — this endpoint
 * is a fast client-side confirmation check only.
 *
 * Body:
 *   { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 *
 * Returns:
 *   200 { verified: true } — signature valid
 *   400 { error: "..." }   — invalid signature or validation error
 *   401                    — not authenticated
 *
 * Auth: any authenticated user.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAuthSession } from "@/lib/auth";
import { verifyPaymentSignature } from "@/lib/razorpay";
import { verifyPaymentSchema } from "@/lib/validators";

export async function POST(request: NextRequest) {
  // Auth: any authenticated user
  const session = await getAuthSession(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
