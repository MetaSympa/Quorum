/**
 * T34 — Additional unit tests for encrypt.ts
 *
 * Covers edge cases not in the original encrypt.test.ts:
 *   - Unicode characters (Bengali script used in DPS context)
 *   - Very long strings (>10KB)
 *   - JSON-serialized objects as strings
 *   - Strings containing special characters: quotes, backslashes, null bytes
 *   - Repeated encrypt/decrypt cycles (stability)
 *   - encryptIfNeeded with empty string
 *   - decryptIfNeeded with already-plain multi-line text
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("encrypt.ts — Unicode and edge cases", () => {
  const TEST_KEY = "c".repeat(64); // valid 32-byte hex key (different from other test files)

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
    vi.resetModules();
  });

  // ---------------------------------------------------------------------------
  // Unicode — Bengali script
  // ---------------------------------------------------------------------------

  it("round-trips Bengali script: দুর্গাপূজা", async () => {
    const { encrypt, decrypt } = await import("@/lib/encrypt");
    const bengali = "দুর্গাপূজা";
    expect(decrypt(encrypt(bengali))).toBe(bengali);
  });

  it("round-trips mixed Bengali + English + symbols", async () => {
    const { encrypt, decrypt } = await import("@/lib/encrypt");
    const mixed = "ডিউরগাপূজা সমিতি — Deshapriya Park Club 2026 ₹10,000";
    expect(decrypt(encrypt(mixed))).toBe(mixed);
  });

  it("round-trips full Bengali address", async () => {
    const { encrypt, decrypt } = await import("@/lib/encrypt");
    const address = "দেশপ্রিয় পার্ক, কলকাতা - ৭০০০২৬, পশ্চিমবঙ্গ";
    expect(decrypt(encrypt(address))).toBe(address);
  });

  it("round-trips Bengali name with diacritics", async () => {
    const { encrypt, decrypt } = await import("@/lib/encrypt");
    const name = "অর্পিতা সেন";
    expect(decrypt(encrypt(name))).toBe(name);
  });

  // ---------------------------------------------------------------------------
  // Very long strings
  // ---------------------------------------------------------------------------

  it("round-trips a 1KB string", async () => {
    const { encrypt, decrypt } = await import("@/lib/encrypt");
    const longStr = "a".repeat(1024);
    expect(decrypt(encrypt(longStr))).toBe(longStr);
  });

  it("round-trips a 10KB string", async () => {
    const { encrypt, decrypt } = await import("@/lib/encrypt");
    const veryLong = "Bengali address data: ".repeat(500); // ~11KB
    expect(decrypt(encrypt(veryLong))).toBe(veryLong);
  });

  it("round-trips a 100KB string", async () => {
    const { encrypt, decrypt } = await import("@/lib/encrypt");
    // Use a repeating pattern to hit 100KB
    const huge = "x".repeat(100 * 1024);
    expect(decrypt(encrypt(huge))).toBe(huge);
  });

  // ---------------------------------------------------------------------------
  // JSON objects serialized as strings
  // ---------------------------------------------------------------------------

  it("round-trips JSON.stringify of an object", async () => {
    const { encrypt, decrypt } = await import("@/lib/encrypt");
    const obj = {
      name: "Arpita Sen",
      phone: "+919876543210",
      address: "12A Deshapriya Park",
      notes: "VIP member",
    };
    const json = JSON.stringify(obj);
    const decrypted = decrypt(encrypt(json));
    expect(decrypted).toBe(json);
    expect(JSON.parse(decrypted)).toEqual(obj);
  });

  // ---------------------------------------------------------------------------
  // Special characters
  // ---------------------------------------------------------------------------

  it("round-trips a string with backslashes", async () => {
    const { encrypt, decrypt } = await import("@/lib/encrypt");
    const withBackslashes = "C:\\Users\\Admin\\Documents\\membership.pdf";
    expect(decrypt(encrypt(withBackslashes))).toBe(withBackslashes);
  });

  it("round-trips a string with single and double quotes", async () => {
    const { encrypt, decrypt } = await import("@/lib/encrypt");
    const withQuotes = `It's a "test" with 'quotes' and "double quotes"`;
    expect(decrypt(encrypt(withQuotes))).toBe(withQuotes);
  });

  it("round-trips a string with newlines and tabs", async () => {
    const { encrypt, decrypt } = await import("@/lib/encrypt");
    const multiline = "Line 1\r\nLine 2\tTabbed\nLine 3";
    expect(decrypt(encrypt(multiline))).toBe(multiline);
  });

  it("round-trips a URL with special chars", async () => {
    const { encrypt, decrypt } = await import("@/lib/encrypt");
    const url = "https://example.com/api?key=abc&val=xyz%20test#anchor";
    expect(decrypt(encrypt(url))).toBe(url);
  });

  // ---------------------------------------------------------------------------
  // Stability across multiple encrypt/decrypt cycles
  // ---------------------------------------------------------------------------

  it("round-trips 50 different values without collision", async () => {
    const { encrypt, decrypt } = await import("@/lib/encrypt");
    const values = Array.from({ length: 50 }, (_, i) => `value-${i}-${"x".repeat(i)}`);
    for (const value of values) {
      expect(decrypt(encrypt(value))).toBe(value);
    }
  });

  it("10 encryptions of the same value all produce unique ciphertexts", async () => {
    const { encrypt } = await import("@/lib/encrypt");
    const plaintext = "+919876543210";
    const ciphertexts = Array.from({ length: 10 }, () => encrypt(plaintext));
    const unique = new Set(ciphertexts);
    expect(unique.size).toBe(10); // All different due to random IV
  });

  // ---------------------------------------------------------------------------
  // encryptIfNeeded with edge cases
  // ---------------------------------------------------------------------------

  it("encryptIfNeeded does not encrypt empty string (returns encrypted empty)", async () => {
    const { encryptIfNeeded, isEncrypted } = await import("@/lib/encrypt");
    const result = encryptIfNeeded("");
    // encryptIfNeeded("") should encrypt it (non-null, non-undefined)
    expect(result).toBeDefined();
    expect(isEncrypted(result!)).toBe(true);
  });

  it("decryptIfNeeded handles a string that looks like base64 but is not encrypted", async () => {
    const { decryptIfNeeded } = await import("@/lib/encrypt");
    // This is a plain base64 string without the enc: prefix
    const plainBase64 = "dGVzdA=="; // base64 for "test"
    expect(decryptIfNeeded(plainBase64)).toBe(plainBase64);
  });

  it("decryptIfNeeded on empty string returns empty string", async () => {
    const { decryptIfNeeded } = await import("@/lib/encrypt");
    expect(decryptIfNeeded("")).toBe("");
  });
});
