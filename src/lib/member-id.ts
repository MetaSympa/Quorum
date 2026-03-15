/**
 * DPC Member ID generation.
 *
 * Format: DPC-YYYY-NNNN-SS
 *   YYYY = joining year (4 digits)
 *   NNNN = auto-increment primary member number (zero-padded to 4 digits)
 *   SS   = sub-member index (00 = primary member, 01-03 = sub-members)
 *
 * All IDs are unique across the system.
 * Sub-members share the parent's DPC-YYYY-NNNN prefix.
 */

import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse the numeric NNNN segment from a primary memberId.
 * Returns the integer value or null if the format doesn't match.
 */
function parseSequenceNumber(memberId: string): number | null {
  // Format: DPC-YYYY-NNNN-SS
  const match = memberId.match(/^DPC-\d{4}-(\d{4})-\d{2}$/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

// ---------------------------------------------------------------------------
// Public generators
// ---------------------------------------------------------------------------

/**
 * Generate the next primary member ID in DPC-YYYY-NNNN-00 format.
 *
 * Queries the DB for the highest existing NNNN for the current year
 * and increments by 1. Thread-safety relies on DB-level unique constraint
 * on the memberId field — callers should retry on conflict.
 *
 * @returns e.g. "DPC-2026-0001-00"
 */
export async function generateMemberId(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `DPC-${year}-`;

  // Find the highest sequence number among primary members for this year.
  // Primary members have SS = 00.
  const lastMember = await prisma.user.findFirst({
    where: {
      memberId: {
        startsWith: prefix,
        endsWith: "-00",
      },
    },
    orderBy: { memberId: "desc" },
    select: { memberId: true },
  });

  let nextSeq = 1;
  if (lastMember) {
    const seq = parseSequenceNumber(lastMember.memberId);
    if (seq !== null) {
      nextSeq = seq + 1;
    }
  }

  const nnnn = String(nextSeq).padStart(4, "0");
  return `DPC-${year}-${nnnn}-00`;
}

/**
 * Generate a sub-member ID given the parent's primary memberId and the
 * 1-based sub-member index (1, 2, or 3).
 *
 * @param parentMemberId - e.g. "DPC-2026-0001-00"
 * @param index          - 1, 2, or 3
 * @returns e.g. "DPC-2026-0001-01"
 */
export function generateSubMemberId(
  parentMemberId: string,
  index: number
): string {
  if (index < 1 || index > 3) {
    throw new Error(
      `Sub-member index must be 1-3, got ${index}`
    );
  }
  // Replace the last two digits (SS) with the sub-member index
  const base = parentMemberId.slice(0, -2); // removes the "00" suffix
  const ss = String(index).padStart(2, "0");
  return `${base}${ss}`;
}

/**
 * Count how many sub-members already exist for a given parent user ID.
 * Used to determine the next available index and enforce the max-3 cap.
 *
 * @param parentUserId - UUID of the parent User record
 * @returns count (0-3)
 */
export async function countSubMembers(parentUserId: string): Promise<number> {
  return prisma.subMember.count({
    where: { parentUserId },
  });
}

/**
 * Get the next available sub-member index (1-3) for a parent user.
 * Returns null if the parent already has 3 sub-members (cap reached).
 *
 * @param parentUserId - UUID of the parent User record
 */
export async function nextSubMemberIndex(
  parentUserId: string
): Promise<number | null> {
  const existing = await prisma.subMember.findMany({
    where: { parentUserId },
    select: { memberId: true },
  });

  const usedIndexes = new Set(
    existing
      .map((sm) => {
        const match = sm.memberId.match(/-(\d{2})$/);
        return match ? parseInt(match[1], 10) : null;
      })
      .filter((n): n is number => n !== null)
  );

  for (let i = 1; i <= 3; i++) {
    if (!usedIndexes.has(i)) return i;
  }
  return null; // cap reached
}
