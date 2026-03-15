/**
 * Tests for T21 + T22 + T23 — Security: Input Validation, Auth Hardening, Rate Limiting
 *
 * Covers:
 *   - sanitizeString: control char stripping, whitespace trimming
 *   - changePasswordSchema: common password rejection, min length, same-password check
 *   - rateLimit: allows up to max, blocks after max, resets after window
 *   - rateLimit: remaining count decrements correctly
 *   - rateLimit: multiple keys are independent
 *   - rateLimit: cleanup — entries are pruned after window expires
 *   - getRateLimitKey: IP extraction from headers
 *   - getRateLimitKeyForUser: user-scoped keys
 *   - Rate limit constants: correct values for each bucket
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { sanitizeString, changePasswordSchema } from "@/lib/validators";
import {
  rateLimit,
  getRateLimitKey,
  getRateLimitKeyForUser,
  clearRateLimitStore,
  getRateLimitStoreSize,
  LOGIN_RATE_LIMIT,
  API_RATE_LIMIT,
  WEBHOOK_RATE_LIMIT,
  PUBLIC_RATE_LIMIT,
} from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// sanitizeString
// ---------------------------------------------------------------------------

describe("sanitizeString", () => {
  it("trims leading and trailing whitespace", () => {
    expect(sanitizeString("  hello  ")).toBe("hello");
    expect(sanitizeString("\t test \n")).toBe("test");
  });

  it("strips ASCII control characters (0x00–0x1F)", () => {
    // NUL, SOH, STX, ETX ... and other control chars
    expect(sanitizeString("hello\x00world")).toBe("helloworld");
    expect(sanitizeString("hello\x01world")).toBe("helloworld");
    expect(sanitizeString("foo\x09bar")).toBe("foobar"); // horizontal tab
    expect(sanitizeString("foo\x0Abar")).toBe("foobar"); // newline
    expect(sanitizeString("foo\x0Dbar")).toBe("foobar"); // carriage return
    expect(sanitizeString("foo\x1Fbar")).toBe("foobar"); // unit separator
  });

  it("strips DEL character (0x7F)", () => {
    expect(sanitizeString("hello\x7Fworld")).toBe("helloworld");
  });

  it("strips multiple control chars", () => {
    expect(sanitizeString("\x00abc\x01def\x7F")).toBe("abcdef");
  });

  it("preserves normal printable characters", () => {
    const input = "John Doe — DPS Member (2026) ₹250!";
    expect(sanitizeString(input)).toBe(input);
  });

  it("preserves Unicode characters", () => {
    const input = "Durga Puja দুর্গাপূজা";
    expect(sanitizeString(input)).toBe(input);
  });

  it("handles empty string", () => {
    expect(sanitizeString("")).toBe("");
  });

  it("handles string that is only whitespace", () => {
    expect(sanitizeString("   ")).toBe("");
  });

  it("handles string that is only control chars", () => {
    expect(sanitizeString("\x00\x01\x02")).toBe("");
  });

  it("combines trimming and control char removal", () => {
    // Control chars and surrounding whitespace
    expect(sanitizeString("  foo\x00bar  ")).toBe("foobar");
  });
});

// ---------------------------------------------------------------------------
// changePasswordSchema — common password rejection
// ---------------------------------------------------------------------------

describe("changePasswordSchema", () => {
  it("accepts a strong valid password", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "OldPassXY99",
      newPassword: "N3wSecure!Pass",
    });
    expect(result.success).toBe(true);
  });

  it("rejects newPassword shorter than 8 characters", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "OldPassXY99",
      newPassword: "short",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toContain("8");
  });

  it("rejects newPassword longer than 128 characters", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "OldPassXY99",
      newPassword: "a".repeat(129),
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toContain("128");
  });

  it("rejects common password: password123", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "OldPassXY99",
      newPassword: "password123",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toContain("common");
  });

  it("rejects common password: 12345678", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "OldPassXY99",
      newPassword: "12345678",
    });
    expect(result.success).toBe(false);
  });

  it("rejects common password case-insensitively: PASSWORD123", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "OldPassXY99",
      newPassword: "PASSWORD123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects newPassword same as currentPassword", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "SamePass99!",
      newPassword: "SamePass99!",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toContain("different");
  });

  it("requires both fields", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "OldPassXY99",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// rateLimit — core behavior
// ---------------------------------------------------------------------------

describe("rateLimit", () => {
  beforeEach(() => {
    clearRateLimitStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearRateLimitStore();
  });

  it("allows requests up to the max attempts", () => {
    const key = "test:allow-up-to-max";
    const max = 3;
    const windowMs = 60_000;

    for (let i = 0; i < max; i++) {
      const result = rateLimit(key, max, windowMs);
      expect(result.success).toBe(true);
    }
  });

  it("blocks the (max + 1)th request", () => {
    const key = "test:block-after-max";
    const max = 3;
    const windowMs = 60_000;

    for (let i = 0; i < max; i++) {
      rateLimit(key, max, windowMs);
    }

    const blocked = rateLimit(key, max, windowMs);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("decrements remaining count correctly", () => {
    const key = "test:remaining";
    const max = 5;
    const windowMs = 60_000;

    const first = rateLimit(key, max, windowMs);
    expect(first.success).toBe(true);
    expect(first.remaining).toBe(4);

    const second = rateLimit(key, max, windowMs);
    expect(second.success).toBe(true);
    expect(second.remaining).toBe(3);
  });

  it("provides a resetAt date in the future", () => {
    const key = "test:reset-date";
    const max = 3;
    const windowMs = 60_000;

    const result = rateLimit(key, max, windowMs);
    expect(result.success).toBe(true);
    expect(result.resetAt).toBeInstanceOf(Date);
    expect(result.resetAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("resets after the window expires", () => {
    const key = "test:reset-after-window";
    const max = 3;
    const windowMs = 60_000;

    // Exhaust the limit
    for (let i = 0; i < max; i++) {
      rateLimit(key, max, windowMs);
    }

    // Verify blocked
    expect(rateLimit(key, max, windowMs).success).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(windowMs + 1);

    // Should be allowed again
    const afterReset = rateLimit(key, max, windowMs);
    expect(afterReset.success).toBe(true);
    expect(afterReset.remaining).toBe(max - 1);
  });

  it("multiple keys are independent", () => {
    const max = 2;
    const windowMs = 60_000;

    // Exhaust key1
    rateLimit("key1", max, windowMs);
    rateLimit("key1", max, windowMs);
    const key1Blocked = rateLimit("key1", max, windowMs);
    expect(key1Blocked.success).toBe(false);

    // key2 should still be fresh
    const key2Result = rateLimit("key2", max, windowMs);
    expect(key2Result.success).toBe(true);
  });

  it("partial reset: only old entries fall out of window", () => {
    const key = "test:partial-reset";
    const max = 3;
    const windowMs = 60_000;

    // Use 2 of 3 attempts at t=0
    rateLimit(key, max, windowMs);
    rateLimit(key, max, windowMs);

    // Advance to t=30s (still within the window)
    vi.advanceTimersByTime(30_000);

    // Use 1 more attempt at t=30s — total 3, should be allowed
    const third = rateLimit(key, max, windowMs);
    expect(third.success).toBe(true);

    // Now at max — next should be blocked
    const fourth = rateLimit(key, max, windowMs);
    expect(fourth.success).toBe(false);

    // Advance to t=61s — the t=0 entries fall out of the window
    vi.advanceTimersByTime(31_000); // total 61s

    // Should now have room for new requests (the t=30s entry is still in window)
    const afterPartialReset = rateLimit(key, max, windowMs);
    expect(afterPartialReset.success).toBe(true);
  });

  it("store size increases with new keys", () => {
    clearRateLimitStore();
    expect(getRateLimitStoreSize()).toBe(0);

    rateLimit("key-a", 10, 60_000);
    expect(getRateLimitStoreSize()).toBe(1);

    rateLimit("key-b", 10, 60_000);
    expect(getRateLimitStoreSize()).toBe(2);
  });

  it("clearRateLimitStore empties the store", () => {
    rateLimit("some-key", 10, 60_000);
    expect(getRateLimitStoreSize()).toBeGreaterThan(0);

    clearRateLimitStore();
    expect(getRateLimitStoreSize()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getRateLimitKey
// ---------------------------------------------------------------------------

describe("getRateLimitKey", () => {
  it("uses x-forwarded-for header if present", () => {
    const req = new Request("https://example.com/api/test", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    expect(getRateLimitKey(req, "login")).toBe("login:1.2.3.4");
  });

  it("takes first IP from comma-separated x-forwarded-for", () => {
    const req = new Request("https://example.com/api/test", {
      headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1, 172.16.0.1" },
    });
    expect(getRateLimitKey(req, "webhook")).toBe("webhook:1.2.3.4");
  });

  it("falls back to x-real-ip if x-forwarded-for is absent", () => {
    const req = new Request("https://example.com/api/test", {
      headers: { "x-real-ip": "5.6.7.8" },
    });
    expect(getRateLimitKey(req, "sponsor-order")).toBe("sponsor-order:5.6.7.8");
  });

  it("falls back to 'unknown' if no IP headers are present", () => {
    const req = new Request("https://example.com/api/test");
    expect(getRateLimitKey(req, "login")).toBe("login:unknown");
  });

  it("includes the prefix in the key", () => {
    const req = new Request("https://example.com/api/test", {
      headers: { "x-forwarded-for": "9.9.9.9" },
    });
    expect(getRateLimitKey(req, "my-prefix")).toBe("my-prefix:9.9.9.9");
  });
});

// ---------------------------------------------------------------------------
// getRateLimitKeyForUser
// ---------------------------------------------------------------------------

describe("getRateLimitKeyForUser", () => {
  it("includes the user ID and prefix", () => {
    const key = getRateLimitKeyForUser("user-uuid-123", "change-password");
    expect(key).toBe("change-password:user:user-uuid-123");
  });

  it("different users produce different keys", () => {
    const key1 = getRateLimitKeyForUser("user-a", "login");
    const key2 = getRateLimitKeyForUser("user-b", "login");
    expect(key1).not.toBe(key2);
  });
});

// ---------------------------------------------------------------------------
// Rate limit constants
// ---------------------------------------------------------------------------

describe("Rate limit constants", () => {
  it("LOGIN_RATE_LIMIT: 5 attempts per 15 minutes", () => {
    expect(LOGIN_RATE_LIMIT.maxAttempts).toBe(5);
    expect(LOGIN_RATE_LIMIT.windowMs).toBe(15 * 60 * 1000);
  });

  it("API_RATE_LIMIT: 100 requests per minute", () => {
    expect(API_RATE_LIMIT.maxAttempts).toBe(100);
    expect(API_RATE_LIMIT.windowMs).toBe(60 * 1000);
  });

  it("WEBHOOK_RATE_LIMIT: 50 requests per minute", () => {
    expect(WEBHOOK_RATE_LIMIT.maxAttempts).toBe(50);
    expect(WEBHOOK_RATE_LIMIT.windowMs).toBe(60 * 1000);
  });

  it("PUBLIC_RATE_LIMIT: 30 requests per minute", () => {
    expect(PUBLIC_RATE_LIMIT.maxAttempts).toBe(30);
    expect(PUBLIC_RATE_LIMIT.windowMs).toBe(60 * 1000);
  });
});
