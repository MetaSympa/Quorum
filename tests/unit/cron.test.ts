/**
 * Unit tests for exported cron date helpers.
 */

import { describe, it, expect } from "vitest";
import { getTodayUTC, addDaysUTC } from "@/lib/cron";
import { EXPIRY_REMINDER_DAYS } from "@/types";

// ---------------------------------------------------------------------------
// Tests for getTodayUTC
// ---------------------------------------------------------------------------

describe("getTodayUTC", () => {
  it("returns a Date at midnight UTC", () => {
    const today = getTodayUTC();
    expect(today.getUTCHours()).toBe(0);
    expect(today.getUTCMinutes()).toBe(0);
    expect(today.getUTCSeconds()).toBe(0);
    expect(today.getUTCMilliseconds()).toBe(0);
  });

  it("returns today's date", () => {
    const now = new Date();
    const today = getTodayUTC();
    expect(today.getUTCFullYear()).toBe(now.getUTCFullYear());
    expect(today.getUTCMonth()).toBe(now.getUTCMonth());
    expect(today.getUTCDate()).toBe(now.getUTCDate());
  });
});

// ---------------------------------------------------------------------------
// Tests for addDaysUTC
// ---------------------------------------------------------------------------

describe("addDaysUTC", () => {
  it("adds days correctly crossing month boundary", () => {
    const jan31 = new Date(Date.UTC(2026, 0, 31)); // Jan 31
    const result = addDaysUTC(jan31, 1);
    expect(result.getUTCMonth()).toBe(1); // February
    expect(result.getUTCDate()).toBe(1);
  });

  it("adds zero days returns same date", () => {
    const date = new Date(Date.UTC(2026, 2, 15)); // March 15
    const result = addDaysUTC(date, 0);
    expect(result.getTime()).toBe(date.getTime());
  });

  it("handles adding EXPIRY_REMINDER_DAYS (15)", () => {
    const base = new Date(Date.UTC(2026, 2, 1)); // March 1
    const result = addDaysUTC(base, EXPIRY_REMINDER_DAYS);
    expect(result.getUTCDate()).toBe(16); // March 16
  });
});

// ---------------------------------------------------------------------------
// EXPIRY_REMINDER_DAYS constant
// ---------------------------------------------------------------------------

describe("EXPIRY_REMINDER_DAYS", () => {
  it("is set to 15 days", () => {
    expect(EXPIRY_REMINDER_DAYS).toBe(15);
  });

  it("is a positive integer", () => {
    expect(Number.isInteger(EXPIRY_REMINDER_DAYS)).toBe(true);
    expect(EXPIRY_REMINDER_DAYS).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// checkMembershipExpiry — behavior tests (mocked Prisma)
// ---------------------------------------------------------------------------

import { vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    member: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/audit", () => ({
  logActivity: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
const mockPrisma = vi.mocked(prisma);

import { checkMembershipExpiry } from "@/lib/cron";
import { logActivity } from "@/lib/audit";

const systemUser = { id: "system-1" };

beforeEach(() => {
  vi.clearAllMocks();
  // System user exists
  mockPrisma.user.findUnique.mockResolvedValue(systemUser as never);
  mockPrisma.$transaction.mockImplementation(async (cb: unknown) => (cb as (tx: typeof mockPrisma) => Promise<unknown>)(mockPrisma));
});

describe("checkMembershipExpiry — reminder path", () => {
  it("sends reminder for users expiring within 15 days", async () => {
    const expiringIn5Days = new Date();
    expiringIn5Days.setUTCDate(expiringIn5Days.getUTCDate() + 5);

    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: "user-1",
        memberId: "DPS-001",
        name: "Test",
        membershipExpiry: expiringIn5Days,
        membershipStatus: "ACTIVE",
        subMembers: [],
      },
    ] as never);
    // For tryNotifyExpiryReminder's user lookup
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(systemUser as never)  // getSystemUser
      .mockResolvedValueOnce({ id: "user-1", name: "Test" } as never); // tryNotifyExpiryReminder

    const result = await checkMembershipExpiry();

    expect(result.processed).toBe(1);
    expect(result.reminded).toBe(1);
    expect(result.expired).toBe(0);
    expect(vi.mocked(logActivity)).toHaveBeenCalledWith(
      expect.objectContaining({ action: "membership_expiry_reminder_sent" })
    );
  });
});

describe("checkMembershipExpiry — expiry path", () => {
  it("marks expired users and updates Member status", async () => {
    const pastDate = new Date();
    pastDate.setUTCDate(pastDate.getUTCDate() - 5);

    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: "user-2",
        memberId: "DPS-002",
        name: "Expired User",
        membershipExpiry: pastDate,
        membershipStatus: "ACTIVE",
        subMembers: [],
      },
    ] as never);
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(systemUser as never)
      .mockResolvedValueOnce({ id: "user-2", name: "Expired User" } as never);

    const result = await checkMembershipExpiry();

    expect(result.processed).toBe(1);
    expect(result.expired).toBe(1);
    expect(result.reminded).toBe(0);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { membershipStatus: "EXPIRED" } })
    );
    expect(mockPrisma.member.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { membershipStatus: "EXPIRED" } })
    );
  });
});

describe("checkMembershipExpiry — notification failures do not throw", () => {
  it("completes even when notification service is unavailable", async () => {
    // Use a date clearly in the past (5 days ago) to avoid timezone edge cases
    const pastDate = new Date();
    pastDate.setUTCDate(pastDate.getUTCDate() - 5);

    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: "user-3",
        memberId: "DPS-003",
        name: "User",
        membershipExpiry: pastDate,
        membershipStatus: "ACTIVE",
        subMembers: [],
      },
    ] as never);
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(systemUser as never)
      .mockResolvedValueOnce(null as never); // tryNotifyMembershipExpired - user not found

    const result = await checkMembershipExpiry();

    expect(result.expired).toBe(1);
    // Should not throw
  });
});

describe("checkMembershipExpiry — system user fallback/creation", () => {
  it("creates system user if not found", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null as never); // getSystemUser - not found
    mockPrisma.user.create.mockResolvedValue({ id: "new-system" } as never);
    mockPrisma.user.findMany.mockResolvedValue([] as never);

    const result = await checkMembershipExpiry();

    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "SYSTEM@dps-dashboard.internal" }),
      })
    );
    expect(result.processed).toBe(0);
  });
});

describe("checkMembershipExpiry — counts", () => {
  it("returns correct processed/reminded/expired counts", async () => {
    const expiringSoon = new Date();
    expiringSoon.setUTCDate(expiringSoon.getUTCDate() + 10);
    const expired = new Date();
    expired.setUTCDate(expired.getUTCDate() - 5);
    const farFuture = new Date();
    farFuture.setUTCDate(farFuture.getUTCDate() + 60);

    mockPrisma.user.findMany.mockResolvedValue([
      { id: "u1", memberId: "M1", name: "A", membershipExpiry: expiringSoon, membershipStatus: "ACTIVE", subMembers: [] },
      { id: "u2", memberId: "M2", name: "B", membershipExpiry: expired, membershipStatus: "ACTIVE", subMembers: [] },
      { id: "u3", memberId: "M3", name: "C", membershipExpiry: farFuture, membershipStatus: "ACTIVE", subMembers: [] },
    ] as never);
    // For tryNotify calls
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(systemUser as never)  // getSystemUser
      .mockResolvedValue({ id: "u1" } as never);   // subsequent notify lookups

    const result = await checkMembershipExpiry();

    expect(result.processed).toBe(3);
    expect(result.reminded).toBe(1);
    expect(result.expired).toBe(1);
  });
});
