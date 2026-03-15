/**
 * T35 — Integration test helpers.
 *
 * Integration tests require a live DATABASE_URL to run.
 * When DATABASE_URL is not set (e.g. in CI without a DB), all integration
 * test suites are automatically skipped using describe.skip.
 *
 * Usage:
 *   import { describeIntegration } from "../helpers";
 *
 *   describeIntegration("my service", () => {
 *     it("does something with the DB", async () => { ... });
 *   });
 */

import { describe } from "vitest";

/**
 * Skip integration test suites when DATABASE_URL is not configured.
 * Use this in place of `describe` for any test that touches the database.
 */
export const describeIntegration = process.env.DATABASE_URL
  ? describe
  : describe.skip;

/**
 * Canonical test UUIDs — used across integration tests to avoid hard-coding.
 */
export const TEST_UUIDS = {
  admin: "00000000-0000-0000-0000-000000000001",
  operator: "00000000-0000-0000-0000-000000000002",
  member1: "00000000-0000-0000-0000-000000000003",
  member2: "00000000-0000-0000-0000-000000000004",
  member3: "00000000-0000-0000-0000-000000000005",
  sponsor: "00000000-0000-0000-0000-000000000010",
  transaction: "00000000-0000-0000-0000-000000000020",
  approval: "00000000-0000-0000-0000-000000000030",
  membership: "00000000-0000-0000-0000-000000000040",
} as const;

/**
 * Canonical member IDs for integration tests.
 */
export const TEST_MEMBER_IDS = {
  admin: "DPC-2026-0001-00",
  member1: "DPC-2026-0002-00",
  member1Sub1: "DPC-2026-0002-01",
  member2: "DPC-2026-0003-00",
} as const;
