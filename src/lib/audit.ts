/**
 * Audit + Activity log helpers.
 *
 * Both AuditLog and ActivityLog are append-only — no update/delete endpoints.
 * These helpers are called from the service layer after any state-changing operation.
 *
 * logAudit()    — financial audit log (AuditLog table)
 * logActivity() — system-wide activity log (ActivityLog table)
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditLogParams {
  entityType: string;
  entityId: string;
  action: string;
  previousData?: Record<string, unknown> | null;
  newData: Record<string, unknown>;
  transactionId?: string | null;
  performedById: string;
}

export interface ActivityLogParams {
  userId: string;
  action: string;
  description: string;
  metadata?: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Append an entry to the financial AuditLog.
 * Never throws — failures are logged to console to avoid disrupting the
 * primary operation.
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        previousData:
          params.previousData != null
            ? (params.previousData as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        newData: params.newData as Prisma.InputJsonValue,
        transactionId: params.transactionId ?? undefined,
        performedById: params.performedById,
      },
    });
  } catch (err) {
    console.error("[audit] Failed to write AuditLog:", err);
  }
}

/**
 * Append an entry to the system-wide ActivityLog.
 * Never throws — failures are logged to console to avoid disrupting the
 * primary operation.
 */
export async function logActivity(params: ActivityLogParams): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        description: params.description,
        metadata:
          params.metadata != null
            ? (params.metadata as Prisma.InputJsonValue)
            : undefined,
      },
    });
  } catch (err) {
    console.error("[audit] Failed to write ActivityLog:", err);
  }
}
