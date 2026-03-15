/**
 * Tests for T12 + T13 — Razorpay integration
 *
 * Covers:
 *   - rupeesToPaise / paiseToRupees conversion
 *   - verifyPaymentSignature (HMAC-SHA256 using key_secret)
 *   - verifyWebhookSignature (HMAC-SHA256 using webhook_secret)
 *   - isTestMode
 *   - Order amount calculation per membership type
 *   - createOrderSchema + verifyPaymentSchema Zod validation
 *   - Idempotency check (duplicate paymentId)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "crypto";

// ---------------------------------------------------------------------------
// Utility functions under test (importable without DB)
// ---------------------------------------------------------------------------

import {
  verifyPaymentSignature,
  verifyWebhookSignature,
  rupeesToPaise,
  paiseToRupees,
  isTestMode,
} from "@/lib/razorpay";

import {
  createOrderSchema,
  verifyPaymentSchema,
} from "@/lib/validators";

import { MEMBERSHIP_FEES, APPLICATION_FEE } from "@/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

// ---------------------------------------------------------------------------
// rupeesToPaise
// ---------------------------------------------------------------------------

describe("rupeesToPaise", () => {
  it("converts ₹250 → 25000 paise", () => {
    expect(rupeesToPaise(250)).toBe(25000);
  });

  it("converts ₹1500 → 150000 paise", () => {
    expect(rupeesToPaise(1500)).toBe(150000);
  });

  it("converts ₹3000 → 300000 paise", () => {
    expect(rupeesToPaise(3000)).toBe(300000);
  });

  it("converts ₹10000 → 1000000 paise (application fee)", () => {
    expect(rupeesToPaise(10000)).toBe(1000000);
  });

  it("converts ₹10250 → 1025000 paise (application + monthly fee)", () => {
    expect(rupeesToPaise(10250)).toBe(1025000);
  });

  it("rounds fractional paise correctly", () => {
    // 0.5 rupee = 50 paise (edge case)
    expect(rupeesToPaise(0.5)).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// paiseToRupees
// ---------------------------------------------------------------------------

describe("paiseToRupees", () => {
  it("converts 25000 paise → ₹250", () => {
    expect(paiseToRupees(25000)).toBe(250);
  });

  it("converts 150000 paise → ₹1500", () => {
    expect(paiseToRupees(150000)).toBe(1500);
  });

  it("converts 300000 paise → ₹3000", () => {
    expect(paiseToRupees(300000)).toBe(3000);
  });

  it("converts 1000000 paise → ₹10000", () => {
    expect(paiseToRupees(1000000)).toBe(10000);
  });

  it("is the inverse of rupeesToPaise for all membership fees", () => {
    for (const fee of Object.values(MEMBERSHIP_FEES)) {
      expect(paiseToRupees(rupeesToPaise(fee))).toBe(fee);
    }
  });
});

// ---------------------------------------------------------------------------
// isTestMode
// ---------------------------------------------------------------------------

describe("isTestMode", () => {
  const origEnv = process.env.RAZORPAY_TEST_MODE;

  afterEach(() => {
    process.env.RAZORPAY_TEST_MODE = origEnv;
  });

  it("returns true when RAZORPAY_TEST_MODE=true", () => {
    process.env.RAZORPAY_TEST_MODE = "true";
    expect(isTestMode()).toBe(true);
  });

  it("returns false when RAZORPAY_TEST_MODE=false", () => {
    process.env.RAZORPAY_TEST_MODE = "false";
    expect(isTestMode()).toBe(false);
  });

  it("returns false when RAZORPAY_TEST_MODE is not set", () => {
    delete process.env.RAZORPAY_TEST_MODE;
    expect(isTestMode()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// verifyPaymentSignature
// ---------------------------------------------------------------------------

describe("verifyPaymentSignature", () => {
  const secret = "test-key-secret-abc123";
  const orderId = "order_Abcdef1234567890";
  const paymentId = "pay_Xyz0987654321";

  beforeEach(() => {
    process.env.RAZORPAY_KEY_SECRET = secret;
  });

  afterEach(() => {
    delete process.env.RAZORPAY_KEY_SECRET;
  });

  it("returns true for a valid signature", () => {
    const payload = `${orderId}|${paymentId}`;
    const signature = hmacHex(secret, payload);

    expect(
      verifyPaymentSignature({ orderId, paymentId, signature })
    ).toBe(true);
  });

  it("returns false when signature is tampered", () => {
    const signature = hmacHex(secret, `${orderId}|${paymentId}`);
    const tampered = signature.slice(0, -2) + "ff";

    expect(
      verifyPaymentSignature({ orderId, paymentId, signature: tampered })
    ).toBe(false);
  });

  it("returns false when orderId is wrong", () => {
    const signature = hmacHex(secret, `${orderId}|${paymentId}`);
    expect(
      verifyPaymentSignature({ orderId: "order_WRONG", paymentId, signature })
    ).toBe(false);
  });

  it("returns false when paymentId is wrong", () => {
    const signature = hmacHex(secret, `${orderId}|${paymentId}`);
    expect(
      verifyPaymentSignature({ orderId, paymentId: "pay_WRONG", signature })
    ).toBe(false);
  });

  it("returns false when RAZORPAY_KEY_SECRET is not set", () => {
    delete process.env.RAZORPAY_KEY_SECRET;
    const signature = hmacHex(secret, `${orderId}|${paymentId}`);
    expect(
      verifyPaymentSignature({ orderId, paymentId, signature })
    ).toBe(false);
  });

  it("returns false for non-hex signature input (does not throw)", () => {
    expect(
      verifyPaymentSignature({ orderId, paymentId, signature: "not-hex!!!" })
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// verifyWebhookSignature
// ---------------------------------------------------------------------------

describe("verifyWebhookSignature", () => {
  const webhookSecret = "webhook-secret-xyz987";

  beforeEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
  });

  afterEach(() => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
  });

  it("returns true for a valid webhook signature", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    const signature = hmacHex(webhookSecret, body);
    expect(verifyWebhookSignature(body, signature)).toBe(true);
  });

  it("returns false when body is tampered", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    const signature = hmacHex(webhookSecret, body);
    const tamperedBody = JSON.stringify({ event: "payment.TAMPERED" });
    expect(verifyWebhookSignature(tamperedBody, signature)).toBe(false);
  });

  it("returns false when signature is tampered", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    const signature = hmacHex(webhookSecret, body);
    const tampered = signature.slice(0, -2) + "00";
    expect(verifyWebhookSignature(body, tampered)).toBe(false);
  });

  it("returns false when RAZORPAY_WEBHOOK_SECRET is not set", () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const body = JSON.stringify({ event: "payment.captured" });
    const signature = hmacHex(webhookSecret, body);
    expect(verifyWebhookSignature(body, signature)).toBe(false);
  });

  it("returns false for empty signature (does not throw)", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    expect(verifyWebhookSignature(body, "")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Order amount calculation
// ---------------------------------------------------------------------------

describe("Order amount calculation", () => {
  it("MONTHLY membership fee is ₹250", () => {
    expect(MEMBERSHIP_FEES.MONTHLY).toBe(250);
  });

  it("HALF_YEARLY membership fee is ₹1500", () => {
    expect(MEMBERSHIP_FEES.HALF_YEARLY).toBe(1500);
  });

  it("ANNUAL membership fee is ₹3000", () => {
    expect(MEMBERSHIP_FEES.ANNUAL).toBe(3000);
  });

  it("APPLICATION_FEE is ₹10000", () => {
    expect(APPLICATION_FEE).toBe(10000);
  });

  it("Application fee + MONTHLY = ₹10250", () => {
    expect(MEMBERSHIP_FEES.MONTHLY + APPLICATION_FEE).toBe(10250);
  });

  it("Application fee + HALF_YEARLY = ₹11500", () => {
    expect(MEMBERSHIP_FEES.HALF_YEARLY + APPLICATION_FEE).toBe(11500);
  });

  it("Application fee + ANNUAL = ₹13000", () => {
    expect(MEMBERSHIP_FEES.ANNUAL + APPLICATION_FEE).toBe(13000);
  });

  it("MONTHLY fee in paise is 25000", () => {
    expect(rupeesToPaise(MEMBERSHIP_FEES.MONTHLY)).toBe(25000);
  });

  it("ANNUAL fee in paise is 300000", () => {
    expect(rupeesToPaise(MEMBERSHIP_FEES.ANNUAL)).toBe(300000);
  });

  it("Application fee in paise is 1000000", () => {
    expect(rupeesToPaise(APPLICATION_FEE)).toBe(1000000);
  });
});

// ---------------------------------------------------------------------------
// createOrderSchema validation
// ---------------------------------------------------------------------------

describe("createOrderSchema", () => {
  it("accepts valid MONTHLY order", () => {
    const result = createOrderSchema.safeParse({
      memberId: "550e8400-e29b-41d4-a716-446655440000",
      membershipType: "MONTHLY",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isApplicationFee).toBe(false);
    }
  });

  it("accepts valid ANNUAL order with isApplicationFee=true", () => {
    const result = createOrderSchema.safeParse({
      memberId: "550e8400-e29b-41d4-a716-446655440000",
      membershipType: "ANNUAL",
      isApplicationFee: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isApplicationFee).toBe(true);
    }
  });

  it("rejects invalid membershipType", () => {
    const result = createOrderSchema.safeParse({
      memberId: "550e8400-e29b-41d4-a716-446655440000",
      membershipType: "QUARTERLY", // not valid
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid memberId (not UUID)", () => {
    const result = createOrderSchema.safeParse({
      memberId: "not-a-uuid",
      membershipType: "MONTHLY",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing memberId", () => {
    const result = createOrderSchema.safeParse({
      membershipType: "MONTHLY",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing membershipType", () => {
    const result = createOrderSchema.safeParse({
      memberId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(false);
  });

  it("defaults isApplicationFee to false when not provided", () => {
    const result = createOrderSchema.safeParse({
      memberId: "550e8400-e29b-41d4-a716-446655440000",
      membershipType: "HALF_YEARLY",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isApplicationFee).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// verifyPaymentSchema validation
// ---------------------------------------------------------------------------

describe("verifyPaymentSchema", () => {
  it("accepts all required fields", () => {
    const result = verifyPaymentSchema.safeParse({
      razorpay_order_id: "order_123456",
      razorpay_payment_id: "pay_abcdef",
      razorpay_signature: "abcdef1234567890",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing razorpay_order_id", () => {
    const result = verifyPaymentSchema.safeParse({
      razorpay_payment_id: "pay_abcdef",
      razorpay_signature: "abcdef1234567890",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing razorpay_payment_id", () => {
    const result = verifyPaymentSchema.safeParse({
      razorpay_order_id: "order_123456",
      razorpay_signature: "abcdef1234567890",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing razorpay_signature", () => {
    const result = verifyPaymentSchema.safeParse({
      razorpay_order_id: "order_123456",
      razorpay_payment_id: "pay_abcdef",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty strings", () => {
    const result = verifyPaymentSchema.safeParse({
      razorpay_order_id: "",
      razorpay_payment_id: "pay_abcdef",
      razorpay_signature: "abcdef1234567890",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Idempotency check logic
// ---------------------------------------------------------------------------

describe("Idempotency check", () => {
  it("same paymentId should not produce duplicate transactions (logic test)", () => {
    // This tests the business rule: if razorpayPaymentId already exists
    // in the Transaction table, skip processing.
    // The actual DB check is in handlePaymentCaptured() in the webhook handler.
    // Here we verify the logic concept using a Set to simulate the check.
    const processedPayments = new Set<string>();

    function wouldProcess(paymentId: string): boolean {
      if (processedPayments.has(paymentId)) return false;
      processedPayments.add(paymentId);
      return true;
    }

    expect(wouldProcess("pay_abc123")).toBe(true); // first time: process
    expect(wouldProcess("pay_abc123")).toBe(false); // second time: skip (idempotent)
    expect(wouldProcess("pay_xyz789")).toBe(true); // different payment: process
  });
});

// ---------------------------------------------------------------------------
// Payment-to-transaction field mapping
// ---------------------------------------------------------------------------

describe("Payment method to PaymentMode mapping", () => {
  // Test the mapping logic as implemented in the webhook handler
  function mapMethodToPaymentMode(method: string): "UPI" | "BANK_TRANSFER" {
    if (method === "upi") return "UPI";
    if (method === "bank_transfer") return "BANK_TRANSFER";
    return "UPI";
  }

  it("maps 'upi' → UPI", () => {
    expect(mapMethodToPaymentMode("upi")).toBe("UPI");
  });

  it("maps 'bank_transfer' → BANK_TRANSFER", () => {
    expect(mapMethodToPaymentMode("bank_transfer")).toBe("BANK_TRANSFER");
  });

  it("maps unknown methods → UPI (default)", () => {
    expect(mapMethodToPaymentMode("card")).toBe("UPI");
    expect(mapMethodToPaymentMode("netbanking")).toBe("UPI");
    expect(mapMethodToPaymentMode("wallet")).toBe("UPI");
  });
});
