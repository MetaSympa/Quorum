/**
 * AES-256-GCM field-level encryption for PII data at rest.
 *
 * Provides:
 *   encrypt(plaintext)        — returns "enc:<base64(iv+ciphertext+authTag)>"
 *   decrypt(ciphertext)       — decodes and decrypts the enc: prefixed value
 *   isEncrypted(value)        — returns true if value has the enc: prefix
 *
 * Key:
 *   ENCRYPTION_KEY env var — 32-byte hex string (64 hex chars).
 *   Generate with: openssl rand -hex 32
 *
 * Format:
 *   The encrypted blob is base64-encoded binary with the following layout:
 *     [12 bytes IV] [N bytes ciphertext] [16 bytes GCM auth tag]
 *   Prefixed with "enc:" to mark encrypted values for idempotency detection.
 *
 * Usage:
 *   The Prisma $extends middleware in prisma.ts calls these functions
 *   transparently — application code always works with plaintext strings.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Prefix that marks an already-encrypted value. Prevents double-encryption. */
const ENC_PREFIX = "enc:";

/** GCM IV length in bytes. 12 bytes (96 bits) is the recommended GCM IV size. */
const IV_LENGTH = 12;

/** GCM auth tag length in bytes. 16 bytes = 128-bit auth tag (maximum). */
const AUTH_TAG_LENGTH = 16;

/** AES-256-GCM algorithm identifier. */
const ALGORITHM = "aes-256-gcm";

// ---------------------------------------------------------------------------
// Key loading
// ---------------------------------------------------------------------------

/**
 * Load and validate the ENCRYPTION_KEY environment variable.
 * Returns a 32-byte Buffer or throws if the key is missing/malformed.
 */
function loadKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is not set. " +
      "Generate one with: openssl rand -hex 32"
    );
  }
  if (hex.length !== 64) {
    throw new Error(
      `ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ` +
      `Got ${hex.length} characters.`
    );
  }
  try {
    return Buffer.from(hex, "hex");
  } catch {
    throw new Error("ENCRYPTION_KEY is not valid hex.");
  }
}

// ---------------------------------------------------------------------------
// Core encrypt / decrypt
// ---------------------------------------------------------------------------

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * - A fresh random 12-byte IV is generated for every call, ensuring that
 *   two encryptions of the same plaintext produce different ciphertexts.
 * - The output is prefixed with "enc:" so isEncrypted() and the Prisma
 *   middleware can detect already-encrypted values and skip double-encryption.
 *
 * @param plaintext  The UTF-8 string to encrypt.
 * @returns          "enc:<base64>" where the base64 contains [IV|ciphertext|authTag].
 */
export function encrypt(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag(); // 16 bytes

  // Layout: [12-byte IV] + [N-byte ciphertext] + [16-byte authTag]
  const blob = Buffer.concat([iv, encrypted, authTag]);
  return ENC_PREFIX + blob.toString("base64");
}

/**
 * Decrypt a value produced by encrypt().
 *
 * @param ciphertext  The "enc:<base64>" string returned by encrypt().
 * @returns           The original UTF-8 plaintext.
 * @throws            If the value is not in the expected format, the key is wrong,
 *                    or the GCM auth tag verification fails (tampered data).
 */
export function decrypt(ciphertext: string): string {
  if (!isEncrypted(ciphertext)) {
    throw new Error(
      `decrypt() called on a value that is not encrypted (missing "enc:" prefix). ` +
      `Check isEncrypted() before calling decrypt().`
    );
  }

  const key = loadKey();
  const blob = Buffer.from(ciphertext.slice(ENC_PREFIX.length), "base64");

  // Minimum valid blob: IV (12 bytes) + 0 bytes ciphertext + authTag (16 bytes) = 28 bytes
  if (blob.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Encrypted blob is too short to be valid.");
  }

  const iv = blob.subarray(0, IV_LENGTH);
  const authTag = blob.subarray(blob.length - AUTH_TAG_LENGTH);
  const encrypted = blob.subarray(IV_LENGTH, blob.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

// ---------------------------------------------------------------------------
// Heuristic detection
// ---------------------------------------------------------------------------

/**
 * Returns true if the value looks like an output of encrypt().
 * Uses the "enc:" prefix as the heuristic.
 *
 * Used by the Prisma middleware to avoid double-encrypting already-encrypted
 * values and to skip decrypting plaintext values.
 *
 * @param value  Any string (or null/undefined — handled with optional chaining by callers).
 */
export function isEncrypted(value: string): boolean {
  return typeof value === "string" && value.startsWith(ENC_PREFIX);
}

// ---------------------------------------------------------------------------
// Null-safe wrappers (used by Prisma middleware)
// ---------------------------------------------------------------------------

/**
 * Encrypt a string if it is not already encrypted and not null/undefined.
 * Returns null/undefined unchanged.
 */
export function encryptIfNeeded(value: string | null | undefined): string | null | undefined {
  if (value == null) return value;
  if (isEncrypted(value)) return value; // already encrypted — idempotent
  return encrypt(value);
}

/**
 * Decrypt a string if it is encrypted, otherwise return it unchanged.
 * Returns null/undefined unchanged.
 * Never throws on plaintext inputs — returns them as-is for backward compatibility.
 */
export function decryptIfNeeded(value: string | null | undefined): string | null | undefined {
  if (value == null) return value;
  if (!isEncrypted(value)) return value; // not encrypted — pass through
  try {
    return decrypt(value);
  } catch (err) {
    // Log and return the raw value rather than crashing the read path.
    // This can happen during key rotation if some values were encrypted
    // with an old key and not yet re-encrypted.
    console.error("[encrypt] Failed to decrypt field value:", err);
    return value;
  }
}
