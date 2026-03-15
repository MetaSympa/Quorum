/**
 * Prisma client singleton for Next.js with transparent PII field encryption.
 *
 * Implements the standard Next.js pattern to avoid multiple PrismaClient
 * instances during hot-reload in development.
 *
 * Field-level AES-256-GCM encryption (T24) is applied via Prisma Client
 * Extensions ($extends query middleware). Encrypted fields are listed in the
 * ENCRYPTED_FIELDS registry below. On write operations the fields are
 * encrypted before being sent to the database. On read operations they are
 * decrypted transparently.
 *
 * Encrypted fields per model:
 *   User        — phone, address
 *   SubMember   — phone
 *   Sponsor     — phone
 *   Transaction — senderPhone, senderUpiId, senderBankAccount
 *   SponsorLink — upiId
 *
 * If ENCRYPTION_KEY is not set the helpers are bypassed so development
 * environments can run without the key. A warning is printed once.
 */

import { PrismaClient } from "@prisma/client";
import { encryptIfNeeded, decryptIfNeeded } from "@/lib/encrypt";

// ---------------------------------------------------------------------------
// PII field registry
// ---------------------------------------------------------------------------

/**
 * Maps Prisma model names (as returned by the $extends operation context) to
 * the list of field names that must be encrypted at rest.
 */
const ENCRYPTED_FIELDS: Record<string, string[]> = {
  user: ["phone", "address"],
  subMember: ["phone"],
  sponsor: ["phone"],
  transaction: ["senderPhone", "senderUpiId", "senderBankAccount"],
  sponsorLink: ["upiId"],
};

// ---------------------------------------------------------------------------
// Encryption guard — skip if ENCRYPTION_KEY is not configured
// ---------------------------------------------------------------------------

let _warnedAboutMissingKey = false;

function encryptionEnabled(): boolean {
  if (!process.env.ENCRYPTION_KEY) {
    if (!_warnedAboutMissingKey) {
      console.warn(
        "[prisma] ENCRYPTION_KEY is not set — PII field encryption is DISABLED. " +
        "Set ENCRYPTION_KEY in your environment for production use."
      );
      _warnedAboutMissingKey = true;
    }
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Encrypt helper — applied to write data (create/update/upsert)
// ---------------------------------------------------------------------------

/**
 * Walk a data object and encrypt any field that is listed in encryptedFields.
 * Handles top-level fields and the nested `data` shape used by upsert.
 * Returns a new object (does not mutate the input).
 */
function encryptDataFields(
  data: Record<string, unknown>,
  encryptedFields: string[]
): Record<string, unknown> {
  if (!data || typeof data !== "object") return data;

  const result: Record<string, unknown> = { ...data };
  for (const field of encryptedFields) {
    if (field in result && typeof result[field] === "string") {
      result[field] = encryptIfNeeded(result[field] as string);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Decrypt helper — applied to read results
// ---------------------------------------------------------------------------

/**
 * Walk a result object (or array of objects) and decrypt any field listed in
 * encryptedFields. Returns a new object (does not mutate the input).
 */
function decryptResultFields(
  result: unknown,
  encryptedFields: string[]
): unknown {
  if (Array.isArray(result)) {
    return result.map((item) => decryptResultFields(item, encryptedFields));
  }
  if (result && typeof result === "object") {
    const obj = result as Record<string, unknown>;
    const decrypted: Record<string, unknown> = { ...obj };
    for (const field of encryptedFields) {
      if (field in decrypted && typeof decrypted[field] === "string") {
        decrypted[field] = decryptIfNeeded(decrypted[field] as string);
      }
    }
    return decrypted;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Prisma $extends — query middleware
// ---------------------------------------------------------------------------

function createPrismaClient() {
  const base = new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

  return base.$extends({
    query: {
      $allModels: {
        // ----- WRITE operations: encrypt before sending to DB -----

        async create({ model, args, query }) {
          const fields = ENCRYPTED_FIELDS[model as string];
          if (fields && encryptionEnabled() && args.data) {
            args.data = encryptDataFields(
              args.data as Record<string, unknown>,
              fields
            ) as typeof args.data;
          }
          return query(args);
        },

        async update({ model, args, query }) {
          const fields = ENCRYPTED_FIELDS[model as string];
          if (fields && encryptionEnabled() && args.data) {
            args.data = encryptDataFields(
              args.data as Record<string, unknown>,
              fields
            ) as typeof args.data;
          }
          return query(args);
        },

        async upsert({ model, args, query }) {
          const fields = ENCRYPTED_FIELDS[model as string];
          if (fields && encryptionEnabled()) {
            if (args.create) {
              args.create = encryptDataFields(
                args.create as Record<string, unknown>,
                fields
              ) as typeof args.create;
            }
            if (args.update) {
              args.update = encryptDataFields(
                args.update as Record<string, unknown>,
                fields
              ) as typeof args.update;
            }
          }
          return query(args);
        },

        async createMany({ model, args, query }) {
          const fields = ENCRYPTED_FIELDS[model as string];
          if (fields && encryptionEnabled() && args.data) {
            if (Array.isArray(args.data)) {
              args.data = args.data.map((item) =>
                encryptDataFields(item as Record<string, unknown>, fields)
              ) as typeof args.data;
            } else {
              args.data = encryptDataFields(
                args.data as Record<string, unknown>,
                fields
              ) as typeof args.data;
            }
          }
          return query(args);
        },

        async updateMany({ model, args, query }) {
          const fields = ENCRYPTED_FIELDS[model as string];
          if (fields && encryptionEnabled() && args.data) {
            args.data = encryptDataFields(
              args.data as Record<string, unknown>,
              fields
            ) as typeof args.data;
          }
          return query(args);
        },

        // ----- READ operations: decrypt after fetching from DB -----

        async findUnique({ model, args, query }) {
          const result = await query(args);
          const fields = ENCRYPTED_FIELDS[model as string];
          if (!fields || !encryptionEnabled()) return result;
          return decryptResultFields(result, fields) as typeof result;
        },

        async findFirst({ model, args, query }) {
          const result = await query(args);
          const fields = ENCRYPTED_FIELDS[model as string];
          if (!fields || !encryptionEnabled()) return result;
          return decryptResultFields(result, fields) as typeof result;
        },

        async findMany({ model, args, query }) {
          const result = await query(args);
          const fields = ENCRYPTED_FIELDS[model as string];
          if (!fields || !encryptionEnabled()) return result;
          return decryptResultFields(result, fields) as typeof result;
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Global singleton (avoids multiple instances during Next.js hot-reload)
// ---------------------------------------------------------------------------

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

const _prismaExtended = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = _prismaExtended;
}

/**
 * The Prisma client with transparent PII field encryption via $extends.
 *
 * TypeScript note: The $extends call changes the inferred type of the client
 * in a way that makes the `tx` parameter inside $transaction callbacks
 * incompatible with `Prisma.TransactionClient`. To work around this known
 * Prisma limitation while preserving all runtime behaviour (encryption /
 * decryption still fires via query extensions), we cast the extended client
 * back to `PrismaClient`.
 *
 * The cast is safe because:
 *   - The $extends query middleware is registered on the underlying
 *     PrismaClient instance and runs at the protocol level.
 *   - All public methods on PrismaClient are present on the extended client.
 *   - $transaction callbacks receive a `tx` that is structurally compatible
 *     with Prisma.TransactionClient at runtime.
 */
export const prisma = _prismaExtended as unknown as PrismaClient;

export default prisma;
