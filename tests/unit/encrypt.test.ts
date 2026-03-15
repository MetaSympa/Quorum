/**
 * Unit tests for src/lib/encrypt.ts — AES-256-GCM field-level encryption (T24).
 *
 * Tests:
 *   - encrypt/decrypt round-trip produces original plaintext
 *   - Different calls produce different ciphertexts (random IV)
 *   - Decrypt with wrong key fails (GCM auth tag verification)
 *   - Null/undefined handling via encryptIfNeeded/decryptIfNeeded
 *   - isEncrypted detection (enc: prefix heuristic)
 *   - encryptIfNeeded is idempotent (no double-encryption)
 *   - decryptIfNeeded passes through plaintext unchanged
 *   - Missing ENCRYPTION_KEY throws on encrypt()
 *   - Invalid hex key throws on encrypt()
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// We need to control process.env before importing encrypt.ts,
// so we mock the module with a factory that reads env at call time.

describe("encrypt.ts — AES-256-GCM field-level encryption", () => {
  // A valid 32-byte key (64 hex chars) for tests
  const TEST_KEY = "a".repeat(64); // all 'a' → valid 32-byte hex key
  const ALT_KEY = "b".repeat(64); // different valid key for wrong-key tests

  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = TEST_KEY;
    // Clear module cache so loadKey() picks up the new env var
    vi.resetModules();
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.ENCRYPTION_KEY;
    } else {
      process.env.ENCRYPTION_KEY = originalKey;
    }
    vi.resetModules();
  });

  // ---------------------------------------------------------------------------
  // encrypt / decrypt round-trip
  // ---------------------------------------------------------------------------

  it("encrypts and decrypts a simple string correctly", async () => {
    const { encrypt, decrypt } = await import("@/lib/encrypt");
    const plaintext = "hello world";
    const ciphertext = encrypt(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it("round-trips a phone number", async () => {
    const { encrypt, decrypt } = await import("@/lib/encrypt");
    const phone = "+919876543210";
    expect(decrypt(encrypt(phone))).toBe(phone);
  });

  it("round-trips an address with special characters", async () => {
    const { encrypt, decrypt } = await import("@/lib/encrypt");
    const address = "12/A, Deshapriya Park, Kolkata — 700026, West Bengal";
    expect(decrypt(encrypt(address))).toBe(address);
  });

  it("round-trips a UPI ID", async () => {
    const { encrypt, decrypt } = await import("@/lib/encrypt");
    const upiId = "user@okaxis";
    expect(decrypt(encrypt(upiId))).toBe(upiId);
  });

  it("round-trips a long bank account number", async () => {
    const { encrypt, decrypt } = await import("@/lib/encrypt");
    const account = "123456789012345678";
    expect(decrypt(encrypt(account))).toBe(account);
  });

  it("round-trips an empty string", async () => {
    const { encrypt, decrypt } = await import("@/lib/encrypt");
    const empty = "";
    expect(decrypt(encrypt(empty))).toBe(empty);
  });

  it("round-trips a multi-line string", async () => {
    const { encrypt, decrypt } = await import("@/lib/encrypt");
    const multiline = "Line 1\nLine 2\nLine 3";
    expect(decrypt(encrypt(multiline))).toBe(multiline);
  });

  // ---------------------------------------------------------------------------
  // Random IV — different ciphertexts per call
  // ---------------------------------------------------------------------------

  it("produces different ciphertexts for the same plaintext (random IV)", async () => {
    const { encrypt } = await import("@/lib/encrypt");
    const plaintext = "same-data";
    const c1 = encrypt(plaintext);
    const c2 = encrypt(plaintext);
    const c3 = encrypt(plaintext);
    expect(c1).not.toBe(c2);
    expect(c1).not.toBe(c3);
    expect(c2).not.toBe(c3);
  });

  it("all ciphertexts have the enc: prefix", async () => {
    const { encrypt } = await import("@/lib/encrypt");
    for (let i = 0; i < 5; i++) {
      expect(encrypt(`value-${i}`)).toMatch(/^enc:/);
    }
  });

  // ---------------------------------------------------------------------------
  // Wrong key — GCM auth tag failure
  // ---------------------------------------------------------------------------

  it("decrypt fails when using a different key", async () => {
    // Encrypt with TEST_KEY
    const { encrypt } = await import("@/lib/encrypt");
    const ciphertext = encrypt("secret data");

    // Switch to ALT_KEY and try to decrypt
    process.env.ENCRYPTION_KEY = ALT_KEY;
    vi.resetModules();
    const { decrypt } = await import("@/lib/encrypt");

    expect(() => decrypt(ciphertext)).toThrow();
  });

  // ---------------------------------------------------------------------------
  // isEncrypted
  // ---------------------------------------------------------------------------

  it("isEncrypted returns true for enc:-prefixed values", async () => {
    const { encrypt, isEncrypted } = await import("@/lib/encrypt");
    const ciphertext = encrypt("test");
    expect(isEncrypted(ciphertext)).toBe(true);
  });

  it("isEncrypted returns false for plain strings", async () => {
    const { isEncrypted } = await import("@/lib/encrypt");
    expect(isEncrypted("hello")).toBe(false);
    expect(isEncrypted("+919876543210")).toBe(false);
    expect(isEncrypted("user@okaxis")).toBe(false);
    expect(isEncrypted("")).toBe(false);
  });

  it("isEncrypted returns false for non-string inputs coerced as strings", async () => {
    const { isEncrypted } = await import("@/lib/encrypt");
    // Explicitly test that passing a non-enc value is false
    expect(isEncrypted("base64dataWithoutPrefix")).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Null / undefined handling
  // ---------------------------------------------------------------------------

  it("encryptIfNeeded returns null unchanged", async () => {
    const { encryptIfNeeded } = await import("@/lib/encrypt");
    expect(encryptIfNeeded(null)).toBeNull();
  });

  it("encryptIfNeeded returns undefined unchanged", async () => {
    const { encryptIfNeeded } = await import("@/lib/encrypt");
    expect(encryptIfNeeded(undefined)).toBeUndefined();
  });

  it("encryptIfNeeded encrypts a non-null string", async () => {
    const { encryptIfNeeded, isEncrypted } = await import("@/lib/encrypt");
    const result = encryptIfNeeded("+919876543210");
    expect(result).toBeDefined();
    expect(isEncrypted(result!)).toBe(true);
  });

  it("decryptIfNeeded returns null unchanged", async () => {
    const { decryptIfNeeded } = await import("@/lib/encrypt");
    expect(decryptIfNeeded(null)).toBeNull();
  });

  it("decryptIfNeeded returns undefined unchanged", async () => {
    const { decryptIfNeeded } = await import("@/lib/encrypt");
    expect(decryptIfNeeded(undefined)).toBeUndefined();
  });

  it("decryptIfNeeded returns plaintext string unchanged", async () => {
    const { decryptIfNeeded } = await import("@/lib/encrypt");
    const plain = "not encrypted";
    expect(decryptIfNeeded(plain)).toBe(plain);
  });

  it("decryptIfNeeded decrypts an encrypted value", async () => {
    const { encrypt, decryptIfNeeded } = await import("@/lib/encrypt");
    const plaintext = "some sensitive data";
    const encrypted = encrypt(plaintext);
    expect(decryptIfNeeded(encrypted)).toBe(plaintext);
  });

  // ---------------------------------------------------------------------------
  // Idempotency — no double-encryption
  // ---------------------------------------------------------------------------

  it("encryptIfNeeded is idempotent — already-encrypted values are not re-encrypted", async () => {
    const { encrypt, encryptIfNeeded, decrypt } = await import("@/lib/encrypt");
    const plaintext = "phone number";
    const firstEncrypt = encrypt(plaintext);
    const secondEncrypt = encryptIfNeeded(firstEncrypt);
    // The second call should return the same ciphertext, not encrypt it again
    expect(secondEncrypt).toBe(firstEncrypt);
    // And it should still decrypt correctly
    expect(decrypt(secondEncrypt!)).toBe(plaintext);
  });

  // ---------------------------------------------------------------------------
  // Missing / invalid key
  // ---------------------------------------------------------------------------

  it("encrypt throws when ENCRYPTION_KEY is not set", async () => {
    delete process.env.ENCRYPTION_KEY;
    vi.resetModules();
    const { encrypt } = await import("@/lib/encrypt");
    expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY");
  });

  it("encrypt throws when ENCRYPTION_KEY is wrong length", async () => {
    process.env.ENCRYPTION_KEY = "tooshort";
    vi.resetModules();
    const { encrypt } = await import("@/lib/encrypt");
    expect(() => encrypt("test")).toThrow();
  });

  it("decrypt throws on malformed ciphertext (too short)", async () => {
    const { decrypt } = await import("@/lib/encrypt");
    expect(() => decrypt("enc:dG9vc2hvcnQ=")).toThrow(); // "enc:" + base64("tooshort")
  });

  it("decrypt throws when called without enc: prefix", async () => {
    const { decrypt } = await import("@/lib/encrypt");
    expect(() => decrypt("not-encrypted")).toThrow();
  });
});
