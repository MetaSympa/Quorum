// DPS Dashboard — Shared Types
// Extended in T03 with NextAuth module augmentation

import "next-auth";
import "next-auth/jwt";

/**
 * User roles in the system.
 * ADMIN > OPERATOR > MEMBER in terms of permissions.
 */
export type Role = "ADMIN" | "OPERATOR" | "MEMBER";

/**
 * Membership lifecycle status.
 * Note: Different from Membership.status (which is approval status of a payment period).
 */
export type MembershipStatus =
  | "PENDING_APPROVAL"
  | "PENDING_PAYMENT"
  | "ACTIVE"
  | "EXPIRED"
  | "SUSPENDED";

/**
 * Membership payment period types.
 * Fees: Monthly ₹250, Half-yearly ₹1,500, Annual ₹3,000.
 */
export type MembershipType = "MONTHLY" | "HALF_YEARLY" | "ANNUAL";

/**
 * Transaction types for cash in/out.
 */
export type TransactionType = "CASH_IN" | "CASH_OUT";

/**
 * Transaction categories.
 * SPONSORSHIP requires sponsorPurpose to be set.
 * Refunds are recorded as CASH_OUT / EXPENSE — no separate REFUND category.
 */
export type TransactionCategory =
  | "MEMBERSHIP_FEE"
  | "APPLICATION_FEE"
  | "SPONSORSHIP"
  | "EXPENSE"
  | "OTHER";

/**
 * Payment modes accepted by the system.
 */
export type PaymentMode = "UPI" | "BANK_TRANSFER" | "CASH";

/**
 * Sponsor purpose types for SPONSORSHIP transactions.
 */
export type SponsorPurpose =
  | "TITLE_SPONSOR"
  | "GOLD_SPONSOR"
  | "SILVER_SPONSOR"
  | "FOOD_PARTNER"
  | "MEDIA_PARTNER"
  | "STALL_VENDOR"
  | "MARKETING_PARTNER";

/**
 * Universal approval status (used for Approval records, Membership status, Transaction approval).
 */
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

/**
 * Approval entity types — what the approval is for.
 */
export type ApprovalEntityType =
  | "TRANSACTION"
  | "MEMBER_ADD"
  | "MEMBER_EDIT"
  | "MEMBER_DELETE"
  | "MEMBERSHIP";

/**
 * How a transaction was recorded.
 * MANUAL = operator entered manually. RAZORPAY_WEBHOOK = auto-detected from Razorpay.
 */
export type ApprovalSource = "MANUAL" | "RAZORPAY_WEBHOOK";

/**
 * Authenticated session user — fields available in session.user and JWT token.
 * Set by NextAuth JWT + session callbacks in src/lib/auth.ts.
 */
export interface SessionUser {
  /** User or SubMember UUID */
  id: string;
  /** Registered email address */
  email: string;
  /** Display name */
  name: string;
  /** ADMIN | OPERATOR | MEMBER */
  role: Role;
  /** DPC-YYYY-NNNN-SS format member ID */
  memberId: string;
  /** True if user must change their temporary password before dashboard access */
  isTempPassword: boolean;
  /** True for SubMember accounts; false for User accounts */
  isSubMember: boolean;
  /** Present only for sub-members — UUID of the parent User */
  parentUserId?: string;
}

// ---------------------------------------------------------------------------
// NextAuth module augmentation
// Extends the built-in Session and JWT types to include our custom fields.
// ---------------------------------------------------------------------------

declare module "next-auth" {
  interface Session {
    user: SessionUser;
  }

  // The object returned from the authorize() callback.
  // We extend with our custom fields; built-in fields (id, email, name, image) are optional.
  interface User {
    role: Role;
    memberId: string;
    isTempPassword: boolean;
    isSubMember: boolean;
    parentUserId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role;
    memberId?: string;
    isTempPassword?: boolean;
    isSubMember?: boolean;
    parentUserId?: string;
  }
}

// ---------------------------------------------------------------------------
// Business constants
// ---------------------------------------------------------------------------

/**
 * Membership fee constants (INR).
 */
export const MEMBERSHIP_FEES: Record<MembershipType, number> = {
  MONTHLY: 250,
  HALF_YEARLY: 1500,
  ANNUAL: 3000,
};

/**
 * Application fee (one-time, first membership only).
 */
export const APPLICATION_FEE = 10000;

/**
 * Maximum sub-members per primary member.
 */
export const MAX_SUB_MEMBERS = 3;

/**
 * Days before expiry to send reminder notification.
 */
export const EXPIRY_REMINDER_DAYS = 15;
