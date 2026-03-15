/**
 * POST /api/payments/sponsor-order
 *
 * PUBLIC endpoint — no authentication required.
 * Creates a Razorpay order for a sponsor payment via a public sponsor link.
 *
 * Body:
 *   {
 *     token: string           — sponsor link token (validates the link is active)
 *     amount: number          — amount in INR (for open-ended links); ignored if link has fixed amount
 *     sponsorPurpose: string  — must match a valid SponsorPurpose enum value
 *   }
 *
 * Returns:
 *   { orderId, amount, currency, keyId }
 *
 * Business rules:
 *   - Token must be valid, active, and not expired.
 *   - If the link has a fixed amount, the body amount is ignored.
 *   - If the link is open-ended (amount = null), the body amount must be >= 1 INR.
 *   - Notes on the order carry: sponsorLinkToken, sponsorPurpose, sponsorId (if linked)
 *     so the webhook handler can create the Transaction correctly.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createOrder, rupeesToPaise } from "@/lib/razorpay";
import { getPublicSponsorLink } from "@/lib/services/sponsor-service";
import {
  rateLimit,
  getRateLimitKey,
  PUBLIC_RATE_LIMIT,
} from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const sponsorOrderSchema = z.object({
  token: z.string().min(1, "token is required"),
  amount: z.number().positive("amount must be a positive number").optional(),
  sponsorPurpose: z
    .enum([
      "TITLE_SPONSOR",
      "GOLD_SPONSOR",
      "SILVER_SPONSOR",
      "FOOD_PARTNER",
      "MEDIA_PARTNER",
      "STALL_VENDOR",
      "MARKETING_PARTNER",
    ])
    .optional(),
});

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  // Rate limit: 30 req/min per IP for public endpoints
  const rlKey = getRateLimitKey(request, "sponsor-order");
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

  const parsed = sponsorOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { token, amount: bodyAmount } = parsed.data;

  // Fetch and validate the sponsor link
  const linkResult = await getPublicSponsorLink(token);

  if (!linkResult.success || !linkResult.data) {
    return NextResponse.json(
      { error: linkResult.error ?? "Sponsor link not found" },
      { status: 404 }
    );
  }

  const linkData = linkResult.data;

  // Reject expired or inactive links
  if (!linkData.isActive || linkData.isExpired) {
    return NextResponse.json(
      {
        error: linkData.isExpired
          ? "This payment link has expired"
          : "This payment link is no longer active",
      },
      { status: 410 }
    );
  }

  // Determine payment amount
  let amountINR: number;

  if (linkData.amount !== null) {
    // Fixed amount — use link's amount, ignore body amount
    amountINR = linkData.amount;
  } else {
    // Open-ended — use body amount
    if (!bodyAmount || bodyAmount < 1) {
      return NextResponse.json(
        { error: "Amount is required for open-ended sponsor links (minimum ₹1)" },
        { status: 400 }
      );
    }
    amountINR = bodyAmount;
  }

  // Determine sponsor purpose (from link's bankDetails or body)
  const bd = linkData.bankDetails as Record<string, unknown> | null;
  const purpose = (bd?.sponsorPurpose as string) ?? linkData.purpose ?? parsed.data.sponsorPurpose ?? "OTHER";

  // Generate receipt reference (max 40 chars for Razorpay)
  const timestamp = Date.now();
  const receipt = `DPS-SP-${token.substring(0, 8)}-${timestamp}`.substring(0, 40);

  // Build order notes (echoed back in webhook)
  const notes: Record<string, string> = {
    sponsorLinkToken: token,
    sponsorPurpose: purpose,
  };

  // Create Razorpay order
  let order;
  try {
    order = await createOrder({
      amount: rupeesToPaise(amountINR),
      currency: "INR",
      receipt,
      notes,
    });
  } catch (err) {
    console.error("[sponsor-order] Razorpay order creation failed:", err);
    return NextResponse.json(
      { error: "Payment gateway error — please try again" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    orderId: order.id,
    amount: order.amount, // in paise
    currency: order.currency,
    keyId: process.env.RAZORPAY_KEY_ID ?? "",
    receipt: order.receipt,
  });
}
