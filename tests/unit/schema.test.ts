/**
 * T02 — Prisma Schema Tests
 *
 * Validates that the generated Prisma client exports all expected enums and
 * that enum values match the business rules defined in the project plan.
 * These tests run without a live database connection.
 */

import { describe, it, expect } from "vitest";
import {
  Role,
  MembershipStatus,
  MembershipType,
  TransactionType,
  TransactionCategory,
  PaymentMode,
  SponsorPurpose,
  ApprovalStatus,
  ApprovalEntityType,
  ApprovalSource,
} from "@prisma/client";

describe("Prisma enums — Role", () => {
  it("has all 3 role values", () => {
    expect(Role.ADMIN).toBe("ADMIN");
    expect(Role.OPERATOR).toBe("OPERATOR");
    expect(Role.MEMBER).toBe("MEMBER");
  });
});

describe("Prisma enums — MembershipStatus", () => {
  it("has all 5 lifecycle states", () => {
    expect(MembershipStatus.PENDING_APPROVAL).toBe("PENDING_APPROVAL");
    expect(MembershipStatus.PENDING_PAYMENT).toBe("PENDING_PAYMENT");
    expect(MembershipStatus.ACTIVE).toBe("ACTIVE");
    expect(MembershipStatus.EXPIRED).toBe("EXPIRED");
    expect(MembershipStatus.SUSPENDED).toBe("SUSPENDED");
  });
});

describe("Prisma enums — MembershipType", () => {
  it("has all 3 payment period types", () => {
    expect(MembershipType.MONTHLY).toBe("MONTHLY");
    expect(MembershipType.HALF_YEARLY).toBe("HALF_YEARLY");
    expect(MembershipType.ANNUAL).toBe("ANNUAL");
  });
});

describe("Prisma enums — TransactionType", () => {
  it("has CASH_IN and CASH_OUT only", () => {
    expect(TransactionType.CASH_IN).toBe("CASH_IN");
    expect(TransactionType.CASH_OUT).toBe("CASH_OUT");
    expect(Object.keys(TransactionType)).toHaveLength(2);
  });
});

describe("Prisma enums — TransactionCategory", () => {
  it("has all 5 categories", () => {
    expect(TransactionCategory.MEMBERSHIP_FEE).toBe("MEMBERSHIP_FEE");
    expect(TransactionCategory.APPLICATION_FEE).toBe("APPLICATION_FEE");
    expect(TransactionCategory.SPONSORSHIP).toBe("SPONSORSHIP");
    expect(TransactionCategory.EXPENSE).toBe("EXPENSE");
    expect(TransactionCategory.OTHER).toBe("OTHER");
  });
});

describe("Prisma enums — PaymentMode", () => {
  it("has UPI, BANK_TRANSFER, CASH", () => {
    expect(PaymentMode.UPI).toBe("UPI");
    expect(PaymentMode.BANK_TRANSFER).toBe("BANK_TRANSFER");
    expect(PaymentMode.CASH).toBe("CASH");
    expect(Object.keys(PaymentMode)).toHaveLength(3);
  });
});

describe("Prisma enums — SponsorPurpose", () => {
  it("has all 7 sponsor types", () => {
    expect(SponsorPurpose.TITLE_SPONSOR).toBe("TITLE_SPONSOR");
    expect(SponsorPurpose.GOLD_SPONSOR).toBe("GOLD_SPONSOR");
    expect(SponsorPurpose.SILVER_SPONSOR).toBe("SILVER_SPONSOR");
    expect(SponsorPurpose.FOOD_PARTNER).toBe("FOOD_PARTNER");
    expect(SponsorPurpose.MEDIA_PARTNER).toBe("MEDIA_PARTNER");
    expect(SponsorPurpose.STALL_VENDOR).toBe("STALL_VENDOR");
    expect(SponsorPurpose.MARKETING_PARTNER).toBe("MARKETING_PARTNER");
    expect(Object.keys(SponsorPurpose)).toHaveLength(7);
  });
});

describe("Prisma enums — ApprovalStatus", () => {
  it("has PENDING, APPROVED, REJECTED", () => {
    expect(ApprovalStatus.PENDING).toBe("PENDING");
    expect(ApprovalStatus.APPROVED).toBe("APPROVED");
    expect(ApprovalStatus.REJECTED).toBe("REJECTED");
    expect(Object.keys(ApprovalStatus)).toHaveLength(3);
  });
});

describe("Prisma enums — ApprovalEntityType", () => {
  it("has all 5 entity types", () => {
    expect(ApprovalEntityType.TRANSACTION).toBe("TRANSACTION");
    expect(ApprovalEntityType.MEMBER_ADD).toBe("MEMBER_ADD");
    expect(ApprovalEntityType.MEMBER_EDIT).toBe("MEMBER_EDIT");
    expect(ApprovalEntityType.MEMBER_DELETE).toBe("MEMBER_DELETE");
    expect(ApprovalEntityType.MEMBERSHIP).toBe("MEMBERSHIP");
    expect(Object.keys(ApprovalEntityType)).toHaveLength(5);
  });
});

describe("Prisma enums — ApprovalSource", () => {
  it("has MANUAL and RAZORPAY_WEBHOOK", () => {
    expect(ApprovalSource.MANUAL).toBe("MANUAL");
    expect(ApprovalSource.RAZORPAY_WEBHOOK).toBe("RAZORPAY_WEBHOOK");
    expect(Object.keys(ApprovalSource)).toHaveLength(2);
  });
});
