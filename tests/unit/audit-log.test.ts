/**
 * Unit tests for T16 + T17 — Audit Log + Activity Log validators and query schemas.
 *
 * Tests cover:
 * - auditLogQuerySchema — valid params, defaults, edge cases, invalid UUID
 * - activityLogQuerySchema — same coverage
 * - Date range boundary handling
 * - Page/limit coercion and min/max
 */

import { describe, it, expect } from "vitest";
import { auditLogQuerySchema, activityLogQuerySchema } from "@/lib/validators";

// ---------------------------------------------------------------------------
// auditLogQuerySchema
// ---------------------------------------------------------------------------

describe("auditLogQuerySchema", () => {
  it("accepts empty params and returns defaults", () => {
    const result = auditLogQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.page).toBe(1);
    expect(result.data.limit).toBe(20);
    expect(result.data.entityType).toBeUndefined();
    expect(result.data.action).toBeUndefined();
    expect(result.data.dateFrom).toBeUndefined();
    expect(result.data.dateTo).toBeUndefined();
    expect(result.data.performedById).toBeUndefined();
  });

  it("accepts all valid params", () => {
    const result = auditLogQuerySchema.safeParse({
      entityType: "Transaction",
      action: "create_transaction",
      dateFrom: "2026-01-01",
      dateTo: "2026-03-31",
      performedById: "550e8400-e29b-41d4-a716-446655440000",
      page: "2",
      limit: "50",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.entityType).toBe("Transaction");
    expect(result.data.action).toBe("create_transaction");
    expect(result.data.dateFrom).toBe("2026-01-01");
    expect(result.data.dateTo).toBe("2026-03-31");
    expect(result.data.performedById).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(result.data.page).toBe(2);
    expect(result.data.limit).toBe(50);
  });

  it("coerces page and limit from strings", () => {
    const result = auditLogQuerySchema.safeParse({ page: "3", limit: "10" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.page).toBe(3);
    expect(result.data.limit).toBe(10);
  });

  it("rejects page below 1", () => {
    const result = auditLogQuerySchema.safeParse({ page: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects limit above 100", () => {
    const result = auditLogQuerySchema.safeParse({ limit: "101" });
    expect(result.success).toBe(false);
  });

  it("rejects limit below 1", () => {
    const result = auditLogQuerySchema.safeParse({ limit: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid performedById UUID", () => {
    const result = auditLogQuerySchema.safeParse({
      performedById: "not-a-uuid",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const flat = result.error.flatten();
    expect(flat.fieldErrors.performedById).toBeDefined();
  });

  it("accepts performedById omitted (undefined)", () => {
    const result = auditLogQuerySchema.safeParse({ entityType: "Member" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.performedById).toBeUndefined();
  });

  it("rejects entityType over 100 chars", () => {
    const result = auditLogQuerySchema.safeParse({
      entityType: "A".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("accepts entityType exactly 100 chars", () => {
    const result = auditLogQuerySchema.safeParse({
      entityType: "A".repeat(100),
    });
    expect(result.success).toBe(true);
  });

  it("rejects action over 100 chars", () => {
    const result = auditLogQuerySchema.safeParse({
      action: "x".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("defaults page=1 when omitted", () => {
    const result = auditLogQuerySchema.safeParse({ limit: "5" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.page).toBe(1);
  });

  it("defaults limit=20 when omitted", () => {
    const result = auditLogQuerySchema.safeParse({ page: "2" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.limit).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// activityLogQuerySchema
// ---------------------------------------------------------------------------

describe("activityLogQuerySchema", () => {
  it("accepts empty params and returns defaults", () => {
    const result = activityLogQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.page).toBe(1);
    expect(result.data.limit).toBe(20);
    expect(result.data.userId).toBeUndefined();
    expect(result.data.action).toBeUndefined();
    expect(result.data.dateFrom).toBeUndefined();
    expect(result.data.dateTo).toBeUndefined();
  });

  it("accepts all valid params", () => {
    const result = activityLogQuerySchema.safeParse({
      userId: "550e8400-e29b-41d4-a716-446655440001",
      action: "LOGIN",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      page: "1",
      limit: "100",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.userId).toBe("550e8400-e29b-41d4-a716-446655440001");
    expect(result.data.action).toBe("LOGIN");
    expect(result.data.dateFrom).toBe("2026-01-01");
    expect(result.data.dateTo).toBe("2026-12-31");
    expect(result.data.page).toBe(1);
    expect(result.data.limit).toBe(100);
  });

  it("coerces page and limit from strings", () => {
    const result = activityLogQuerySchema.safeParse({ page: "5", limit: "25" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.page).toBe(5);
    expect(result.data.limit).toBe(25);
  });

  it("rejects page below 1", () => {
    const result = activityLogQuerySchema.safeParse({ page: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects limit above 100", () => {
    const result = activityLogQuerySchema.safeParse({ limit: "200" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid userId UUID", () => {
    const result = activityLogQuerySchema.safeParse({
      userId: "not-valid-uuid",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const flat = result.error.flatten();
    expect(flat.fieldErrors.userId).toBeDefined();
  });

  it("accepts userId omitted (undefined)", () => {
    const result = activityLogQuerySchema.safeParse({ action: "PAYMENT_RECEIVED" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.userId).toBeUndefined();
  });

  it("rejects action over 100 chars", () => {
    const result = activityLogQuerySchema.safeParse({
      action: "Z".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("accepts action exactly 100 chars", () => {
    const result = activityLogQuerySchema.safeParse({
      action: "Z".repeat(100),
    });
    expect(result.success).toBe(true);
  });

  it("defaults page=1 limit=20 when omitted", () => {
    const result = activityLogQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.page).toBe(1);
    expect(result.data.limit).toBe(20);
  });

  it("accepts date range with only dateFrom", () => {
    const result = activityLogQuerySchema.safeParse({ dateFrom: "2026-03-01" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.dateFrom).toBe("2026-03-01");
    expect(result.data.dateTo).toBeUndefined();
  });

  it("accepts date range with only dateTo", () => {
    const result = activityLogQuerySchema.safeParse({ dateTo: "2026-03-15" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.dateTo).toBe("2026-03-15");
    expect(result.data.dateFrom).toBeUndefined();
  });

  it("handles known MEMBER_CREATED action", () => {
    const result = activityLogQuerySchema.safeParse({ action: "MEMBER_CREATED" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.action).toBe("MEMBER_CREATED");
  });

  it("handles known TRANSACTION_CREATED action", () => {
    const result = activityLogQuerySchema.safeParse({ action: "TRANSACTION_CREATED" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.action).toBe("TRANSACTION_CREATED");
  });

  it("handles known APPROVAL_APPROVED action", () => {
    const result = activityLogQuerySchema.safeParse({ action: "APPROVAL_APPROVED" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.action).toBe("APPROVAL_APPROVED");
  });

  it("handles known PASSWORD_CHANGED action", () => {
    const result = activityLogQuerySchema.safeParse({ action: "PASSWORD_CHANGED" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.action).toBe("PASSWORD_CHANGED");
  });
});
