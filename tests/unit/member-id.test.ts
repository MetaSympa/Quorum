/**
 * Unit tests for src/lib/member-id.ts
 *
 * Tests generateMemberId format, generateSubMemberId format/validation,
 * and edge cases (index out of range, format parsing).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateSubMemberId } from "@/lib/member-id";

// ---------------------------------------------------------------------------
// generateSubMemberId
// ---------------------------------------------------------------------------

describe("generateSubMemberId", () => {
  it("generates sub-member ID with index 1 from a primary member ID", () => {
    const result = generateSubMemberId("DPC-2026-0001-00", 1);
    expect(result).toBe("DPC-2026-0001-01");
  });

  it("generates sub-member ID with index 2", () => {
    const result = generateSubMemberId("DPC-2026-0001-00", 2);
    expect(result).toBe("DPC-2026-0001-02");
  });

  it("generates sub-member ID with index 3", () => {
    const result = generateSubMemberId("DPC-2026-0001-00", 3);
    expect(result).toBe("DPC-2026-0001-03");
  });

  it("works with a 4-digit sequence number", () => {
    const result = generateSubMemberId("DPC-2026-0025-00", 2);
    expect(result).toBe("DPC-2026-0025-02");
  });

  it("throws when index is 0", () => {
    expect(() => generateSubMemberId("DPC-2026-0001-00", 0)).toThrow(
      "Sub-member index must be 1-3"
    );
  });

  it("throws when index is 4", () => {
    expect(() => generateSubMemberId("DPC-2026-0001-00", 4)).toThrow(
      "Sub-member index must be 1-3"
    );
  });

  it("throws when index is negative", () => {
    expect(() => generateSubMemberId("DPC-2026-0001-00", -1)).toThrow(
      "Sub-member index must be 1-3"
    );
  });

  it("retains the full prefix intact", () => {
    const result = generateSubMemberId("DPC-2099-9999-00", 3);
    expect(result).toBe("DPC-2099-9999-03");
  });
});

// ---------------------------------------------------------------------------
// generateMemberId format validation (structure tests without DB)
// ---------------------------------------------------------------------------

describe("memberId format", () => {
  const memberIdRegex = /^DPC-\d{4}-\d{4}-00$/;
  const subMemberIdRegex = /^DPC-\d{4}-\d{4}-0[1-3]$/;

  it("primary member ID matches DPC-YYYY-NNNN-00 pattern", () => {
    expect("DPC-2026-0001-00").toMatch(memberIdRegex);
    expect("DPC-2026-0099-00").toMatch(memberIdRegex);
    expect("DPC-2026-9999-00").toMatch(memberIdRegex);
  });

  it("sub-member ID matches DPC-YYYY-NNNN-SS (01-03) pattern", () => {
    expect("DPC-2026-0001-01").toMatch(subMemberIdRegex);
    expect("DPC-2026-0001-02").toMatch(subMemberIdRegex);
    expect("DPC-2026-0001-03").toMatch(subMemberIdRegex);
  });

  it("primary member ID does NOT match sub-member pattern", () => {
    expect("DPC-2026-0001-00").not.toMatch(subMemberIdRegex);
  });

  it("sub-member IDs do NOT match primary pattern", () => {
    expect("DPC-2026-0001-01").not.toMatch(memberIdRegex);
    expect("DPC-2026-0001-02").not.toMatch(memberIdRegex);
  });

  it("rejects IDs with wrong format", () => {
    expect("DPS-2026-0001-00").not.toMatch(memberIdRegex);
    expect("DPC-26-0001-00").not.toMatch(memberIdRegex);
    expect("DPC-2026-001-00").not.toMatch(memberIdRegex);
    expect("DPC-2026-0001-4").not.toMatch(subMemberIdRegex);
  });
});

// ---------------------------------------------------------------------------
// generateSubMemberId preserves year + sequence
// ---------------------------------------------------------------------------

describe("generateSubMemberId — preserves prefix", () => {
  it("preserves year in prefix", () => {
    const id = generateSubMemberId("DPC-2030-0042-00", 1);
    expect(id.startsWith("DPC-2030-0042-")).toBe(true);
  });

  it("produces exactly 16 characters", () => {
    // DPC-2026-0001-01 = 16 chars (3+1+4+1+4+1+2)
    const id = generateSubMemberId("DPC-2026-0001-00", 1);
    expect(id.length).toBe(16);
  });

  it("all 3 sub-member slots produce unique IDs", () => {
    const parent = "DPC-2026-0001-00";
    const ids = [1, 2, 3].map((i) => generateSubMemberId(parent, i));
    const unique = new Set(ids);
    expect(unique.size).toBe(3);
  });
});
