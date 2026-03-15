/**
 * Razorpay client library for DPS Dashboard.
 *
 * Provides:
 *   - Razorpay client singleton (key_id + key_secret from env)
 *   - createOrder()            — create a Razorpay order (amount in paise)
 *   - verifyPaymentSignature() — HMAC-SHA256 verify after client-side checkout
 *   - verifyWebhookSignature() — HMAC-SHA256 verify on incoming webhook request
 *   - isTestMode()             — true when RAZORPAY_TEST_MODE=true
 *
 * All amounts accepted by Razorpay are in PAISE (INR × 100).
 * createOrder() receives amount in paise — the caller must multiply.
 *
 * Security:
 *   - RAZORPAY_KEY_SECRET is used for payment signature verification.
 *   - RAZORPAY_WEBHOOK_SECRET is used for webhook HMAC verification.
 *   - Both are sourced exclusively from environment variables — never hardcoded.
 */

import Razorpay from "razorpay";
import { createHmac, timingSafeEqual } from "crypto";

// ---------------------------------------------------------------------------
// Razorpay SDK types (the npm package ships CJS without bundled TypeScript
// declarations for all sub-objects, so we define the shapes we need here)
// ---------------------------------------------------------------------------

export interface RazorpayOrder {
  id: string;
  entity: string;
  amount: number; // paise
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string | null;
  status: "created" | "attempted" | "paid";
  notes: Record<string, string>;
  created_at: number;
}

export interface CreateOrderOptions {
  /** Amount in paise (INR × 100). Must be a positive integer. */
  amount: number;
  /** ISO-4217 currency code — always 'INR' for this application. */
  currency: string;
  /** Internal reference — shown on Razorpay dashboard. Max 40 chars. */
  receipt: string;
  /** Key-value metadata stored on the order and echoed back in webhooks. */
  notes?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------

let _razorpay: Razorpay | null = null;

/**
 * Returns the shared Razorpay client instance.
 * Lazily initialised on first call.
 * Throws if RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET are not set.
 */
function getRazorpayClient(): Razorpay {
  if (!_razorpay) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      throw new Error(
        "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in environment variables"
      );
    }

    _razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }
  return _razorpay;
}

// ---------------------------------------------------------------------------
// Order creation
// ---------------------------------------------------------------------------

/**
 * Create a Razorpay order for a membership or sponsor payment.
 *
 * @param options.amount   - Amount in PAISE (multiply INR amount by 100 before calling)
 * @param options.currency - Always 'INR' for this application
 * @param options.receipt  - Internal reference (shown in Razorpay dashboard), max 40 chars
 * @param options.notes    - Optional metadata attached to the order — echoed in webhooks.
 *                           Use to store: memberId, membershipType, isApplicationFee, sponsorId, etc.
 * @returns Razorpay order object
 */
export async function createOrder(
  options: CreateOrderOptions
): Promise<RazorpayOrder> {
  const client = getRazorpayClient();

  const order = await (client.orders.create as unknown as (
    opts: CreateOrderOptions
  ) => Promise<RazorpayOrder>)(options);

  return order;
}

// ---------------------------------------------------------------------------
// Payment signature verification (client-side checkout)
// ---------------------------------------------------------------------------

/**
 * Verify a Razorpay payment signature after the client-side checkout completes.
 *
 * Razorpay signs the result with:
 *   HMAC-SHA256(razorpay_order_id + "|" + razorpay_payment_id, key_secret)
 *
 * This is a secondary defence layer — the webhook (T13) is the primary handler.
 *
 * @returns true if the signature is valid; false otherwise
 */
export function verifyPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    console.error("[razorpay] RAZORPAY_KEY_SECRET not set — cannot verify payment signature");
    return false;
  }

  const payload = `${params.orderId}|${params.paymentId}`;
  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  // Use timing-safe comparison to prevent timing attacks
  try {
    return timingSafeEqual(Buffer.from(params.signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    // Buffer.from will throw if the signature is not valid hex
    return false;
  }
}

// ---------------------------------------------------------------------------
// Webhook HMAC signature verification
// ---------------------------------------------------------------------------

/**
 * Verify the HMAC-SHA256 signature on an incoming Razorpay webhook request.
 *
 * Razorpay computes:
 *   HMAC-SHA256(raw_request_body, webhook_secret)
 * and sends the hex digest in the `x-razorpay-signature` header.
 *
 * @param body      - Raw request body as a string (must NOT be JSON.parse'd first)
 * @param signature - Value of the `x-razorpay-signature` header
 * @returns true if the signature matches; false otherwise
 */
export function verifyWebhookSignature(body: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[razorpay] RAZORPAY_WEBHOOK_SECRET not set — rejecting webhook");
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  try {
    return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when RAZORPAY_TEST_MODE=true.
 * Used to decide whether to show test-mode UI hints.
 */
export function isTestMode(): boolean {
  return process.env.RAZORPAY_TEST_MODE === "true";
}

/**
 * Convert an INR rupee amount (decimal number) to Razorpay paise (integer).
 * Rounds to the nearest paisa.
 *
 * @example rupeesToPaise(1500) → 150000
 */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/**
 * Convert Razorpay paise (integer) back to INR rupees.
 *
 * @example paiseToRupees(150000) → 1500
 */
export function paiseToRupees(paise: number): number {
  return paise / 100;
}
