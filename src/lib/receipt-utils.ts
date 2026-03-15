/**
 * Client-safe receipt utilities — no server-side dependencies.
 *
 * This file is safe to import in both client and server components.
 * Server-only logic (DB access, receipt generation) lives in receipt.ts.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CLUB_NAME = "Deshapriya Park Sarbojanin Durgotsav";
export const CLUB_ADDRESS =
  "Deshapriya Park, Bhawanipur, Kolkata - 700 026, West Bengal";
export const CLUB_PHONE = "+91 98300 XXXXX";

// ---------------------------------------------------------------------------
// Receipt data shape
// ---------------------------------------------------------------------------

export interface ReceiptData {
  receiptNumber: string;
  date: Date;
  /** "MEMBER" for membership/application fee receipts, "SPONSOR" for sponsorship */
  type: "MEMBER" | "SPONSOR";

  // Member-specific fields
  memberName?: string;
  /** DPC-YYYY-NNNN-SS */
  memberId?: string;
  /** Membership period start date */
  membershipStart?: Date;
  /** Membership period end date */
  membershipEnd?: Date;

  // Sponsor-specific fields
  sponsorName?: string;
  sponsorCompany?: string;
  /** Human-readable sponsor purpose label */
  sponsorPurpose?: string;

  // Common fields
  amount: number;
  /** Human-readable payment mode */
  paymentMode: string;
  /** Human-readable category */
  category: string;
  description: string;
  /** Name of the user who entered / processed this transaction */
  receivedBy: string;
  clubName: string;
  clubAddress: string;
}

// ---------------------------------------------------------------------------
// Amount to words — Indian English (handles up to crores)
// ---------------------------------------------------------------------------

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

function threeDigitWords(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ONES[n];
  if (n < 100) {
    return TENS[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + ONES[n % 10] : "");
  }
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;
  return (
    ONES[hundreds] +
    " Hundred" +
    (remainder !== 0 ? " and " + threeDigitWords(remainder) : "")
  );
}

/**
 * Convert a rupee amount (number) into Indian English words.
 *
 * Examples:
 *   1500     → "One Thousand Five Hundred Rupees Only"
 *   10000    → "Ten Thousand Rupees Only"
 *   250000   → "Two Lakh Fifty Thousand Rupees Only"
 *   10000000 → "One Crore Rupees Only"
 *   1250.50  → "One Thousand Two Hundred and Fifty Rupees and Fifty Paise Only"
 */
export function amountToWords(amount: number): string {
  if (amount < 0) return "Invalid Amount";
  if (amount === 0) return "Zero Rupees Only";

  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);

  let result = "";

  if (rupees > 0) {
    const crore = Math.floor(rupees / 10000000);
    const lakh = Math.floor((rupees % 10000000) / 100000);
    const thousand = Math.floor((rupees % 100000) / 1000);
    const remainder = rupees % 1000;

    if (crore > 0) result += threeDigitWords(crore) + " Crore ";
    if (lakh > 0) result += threeDigitWords(lakh) + " Lakh ";
    if (thousand > 0) result += threeDigitWords(thousand) + " Thousand ";
    if (remainder > 0) result += threeDigitWords(remainder) + " ";
    result = result.trim() + " Rupees";
  }

  if (paise > 0) {
    result += " and " + threeDigitWords(paise) + " Paise";
  }

  return result.trim() + " Only";
}
