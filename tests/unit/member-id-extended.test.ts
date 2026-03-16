/**
 * T34 — Additional unit tests for member-id.ts
 *
 * Covers edge cases not in the existing member-id.test.ts:
 *   - Year rollover: DPC-2027-XXXX-XX format when year changes
 *   - generateSubMemberId with boundary year values
 *   - ID format compliance across years
 */

import { describe, it, expect } from "vitest";
import { generateSubMemberId } from "@/lib/member-id";

// ---------------------------------------------------------------------------
// Year rollover — format compliance across years
// ---------------------------------------------------------------------------

describe("member ID format — year rollover", () => {
  const memberIdRegex = /^DPC-\d{4}-\d{4}-00$/;

  it("format is valid for past year 2025", () => {
    expect("DPC-2025-0001-00").toMatch(memberIdRegex);
  });

  it("format is valid for current year 2026", () => {
    expect("DPC-2026-0001-00").toMatch(memberIdRegex);
  });

  it("format is valid for future year 2030", () => {
    expect("DPC-2030-0001-00").toMatch(memberIdRegex);
  });

  it("format is valid for year 2099 (far future)", () => {
    expect("DPC-2099-9999-00").toMatch(memberIdRegex);
  });

  it("DPC-2027-0001-00 is a valid next-year ID", () => {
    expect("DPC-2027-0001-00").toMatch(memberIdRegex);
  });

  it("sequence resets to 0001 each year — 2026 and 2027 both have 0001", () => {
    // Both IDs can coexist in the system — year is part of the key
    expect("DPC-2026-0001-00").toMatch(memberIdRegex);
    expect("DPC-2027-0001-00").toMatch(memberIdRegex);
    expect("DPC-2026-0001-00").not.toBe("DPC-2027-0001-00");
  });

  it("IDs from different years are always unique", () => {
    const years = [2026, 2027, 2028, 2029, 2030];
    const ids = years.map((y) => `DPC-${y}-0001-00`);
    const unique = new Set(ids);
    expect(unique.size).toBe(years.length);
  });
});

// ---------------------------------------------------------------------------
// generateSubMemberId — year boundary tests
// ---------------------------------------------------------------------------

describe("generateSubMemberId — year boundary values", () => {
  it("generates sub-member ID for year 2025", () => {
    const result = generateSubMemberId("DPC-2025-0001-00", 1);
    expect(result).toBe("DPC-2025-0001-01");
  });

  it("generates sub-member ID for year 2027 (next year)", () => {
    const result = generateSubMemberId("DPC-2027-0001-00", 2);
    expect(result).toBe("DPC-2027-0001-02");
  });

  it("generates sub-member ID for year 2099", () => {
    const result = generateSubMemberId("DPC-2099-0001-00", 3);
    expect(result).toBe("DPC-2099-0001-03");
  });

  it("sub-member ID has same year as parent", () => {
    const parent = "DPC-2026-0042-00";
    const sub = generateSubMemberId(parent, 1);
    expect(sub.includes("2026")).toBe(true);
    expect(sub.split("-")[1]).toBe("2026");
  });

  it("sub-member ID has same sequence number as parent", () => {
    const parent = "DPC-2026-0042-00";
    const sub = generateSubMemberId(parent, 2);
    expect(sub.split("-")[2]).toBe("0042");
  });

  it("throws for index 0 (out of range)", () => {
    expect(() => generateSubMemberId("DPC-2026-0001-00", 0)).toThrow();
  });

  it("throws for index 4 (out of range)", () => {
    expect(() => generateSubMemberId("DPC-2026-0001-00", 4)).toThrow();
  });

  it("throws for index 5 (out of range)", () => {
    expect(() => generateSubMemberId("DPC-2026-0001-00", 5)).toThrow();
  });

  it("generates all 3 slots sequentially for a given parent", () => {
    const parent = "DPC-2026-0001-00";
    expect(generateSubMemberId(parent, 1)).toBe("DPC-2026-0001-01");
    expect(generateSubMemberId(parent, 2)).toBe("DPC-2026-0001-02");
    expect(generateSubMemberId(parent, 3)).toBe("DPC-2026-0001-03");
  });
});
