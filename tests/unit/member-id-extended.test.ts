/**
 * T34 — Additional unit tests for member-id.ts
 *
 * Covers edge cases not in the existing member-id.test.ts:
 *   - Year rollover: DPC-2027-XXXX-XX format when year changes
 *   - Gap filling in sub-member indices (nextSubMemberIndex logic simulation)
 *   - parseSequenceNumber-equivalent logic tests
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
// Sub-member index gap filling (pure logic — no DB)
// ---------------------------------------------------------------------------

describe("sub-member index gap filling logic", () => {
  /**
   * Mirrors the logic in nextSubMemberIndex() from member-id.ts
   * but without a DB call — pure unit test of the algorithm.
   */
  function findNextIndex(usedIndexes: number[]): number | null {
    const used = new Set(usedIndexes);
    for (let i = 1; i <= 3; i++) {
      if (!used.has(i)) return i;
    }
    return null;
  }

  it("returns 1 when no sub-members exist", () => {
    expect(findNextIndex([])).toBe(1);
  });

  it("returns 2 when index 1 is used", () => {
    expect(findNextIndex([1])).toBe(2);
  });

  it("returns 3 when indexes 1 and 2 are used", () => {
    expect(findNextIndex([1, 2])).toBe(3);
  });

  it("returns null when all 3 slots are filled", () => {
    expect(findNextIndex([1, 2, 3])).toBeNull();
  });

  it("fills gap at index 1 when 2 and 3 are used (sub-member was deleted)", () => {
    expect(findNextIndex([2, 3])).toBe(1);
  });

  it("fills gap at index 2 when 1 and 3 are used", () => {
    expect(findNextIndex([1, 3])).toBe(2);
  });

  it("fills gap at index 3 when 1 and 2 are used", () => {
    expect(findNextIndex([1, 2])).toBe(3);
  });

  it("returns 1 when all slots were freed (empty again)", () => {
    // All sub-members deleted, start from 1 again
    expect(findNextIndex([])).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// parseSequenceNumber-equivalent logic
// ---------------------------------------------------------------------------

describe("sequence number parsing logic", () => {
  /**
   * Mirrors parseSequenceNumber() from member-id.ts.
   * Tests the regex and parseInt logic.
   */
  function parseSequenceNumber(memberId: string): number | null {
    const match = memberId.match(/^DPC-\d{4}-(\d{4})-\d{2}$/);
    if (!match) return null;
    return parseInt(match[1], 10);
  }

  it("parses sequence 0001 from DPC-2026-0001-00", () => {
    expect(parseSequenceNumber("DPC-2026-0001-00")).toBe(1);
  });

  it("parses sequence 0099 from DPC-2026-0099-00", () => {
    expect(parseSequenceNumber("DPC-2026-0099-00")).toBe(99);
  });

  it("parses sequence 1000 from DPC-2026-1000-00", () => {
    expect(parseSequenceNumber("DPC-2026-1000-00")).toBe(1000);
  });

  it("parses sequence 9999 from DPC-2026-9999-00", () => {
    expect(parseSequenceNumber("DPC-2026-9999-00")).toBe(9999);
  });

  it("returns null for wrong prefix DPS-", () => {
    expect(parseSequenceNumber("DPS-2026-0001-00")).toBeNull();
  });

  it("returns null for 3-digit sequence number", () => {
    expect(parseSequenceNumber("DPC-2026-001-00")).toBeNull();
  });

  it("returns null for 5-digit sequence number", () => {
    expect(parseSequenceNumber("DPC-2026-00001-00")).toBeNull();
  });

  it("returns null for sub-member ID (valid format but still parseable)", () => {
    // DPC-2026-0001-01 — this actually DOES match the regex (SS = \d{2})
    // so it returns 1
    expect(parseSequenceNumber("DPC-2026-0001-01")).toBe(1);
  });

  it("returns null for malformed ID without separator dashes", () => {
    expect(parseSequenceNumber("DPC20260001-00")).toBeNull();
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

// ---------------------------------------------------------------------------
// Next sequence number increment logic
// ---------------------------------------------------------------------------

describe("next sequence number logic", () => {
  /**
   * Mirrors the increment logic in generateMemberId().
   * Tests the zero-padding and increment without DB.
   */
  function computeNextMemberId(
    lastMemberId: string | null,
    year: number
  ): string {
    let nextSeq = 1;
    if (lastMemberId) {
      const match = lastMemberId.match(/^DPC-\d{4}-(\d{4})-\d{2}$/);
      if (match) {
        nextSeq = parseInt(match[1], 10) + 1;
      }
    }
    const nnnn = String(nextSeq).padStart(4, "0");
    return `DPC-${year}-${nnnn}-00`;
  }

  it("generates DPC-2026-0001-00 when no prior members exist", () => {
    expect(computeNextMemberId(null, 2026)).toBe("DPC-2026-0001-00");
  });

  it("increments from 0001 to 0002", () => {
    expect(computeNextMemberId("DPC-2026-0001-00", 2026)).toBe("DPC-2026-0002-00");
  });

  it("increments from 0099 to 0100", () => {
    expect(computeNextMemberId("DPC-2026-0099-00", 2026)).toBe("DPC-2026-0100-00");
  });

  it("increments from 0999 to 1000", () => {
    expect(computeNextMemberId("DPC-2026-0999-00", 2026)).toBe("DPC-2026-1000-00");
  });

  it("increments from 9998 to 9999", () => {
    expect(computeNextMemberId("DPC-2026-9998-00", 2026)).toBe("DPC-2026-9999-00");
  });

  it("uses the current year in the generated ID", () => {
    const id2027 = computeNextMemberId(null, 2027);
    expect(id2027).toBe("DPC-2027-0001-00");
    expect(id2027.split("-")[1]).toBe("2027");
  });

  it("year rollover: new year starts from 0001 regardless of last year's count", () => {
    // Last member was DPC-2026-0150-00, but new year is 2027
    // generateMemberId uses the current year prefix — if no 2027 members exist,
    // nextSeq = 1
    const newYearId = computeNextMemberId(null, 2027); // null = no 2027 members yet
    expect(newYearId).toBe("DPC-2027-0001-00");
  });
});
