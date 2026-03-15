-- DPS Dashboard -- Reference SQL Schema
-- Generated from Prisma schema defined in project plan section 4
-- Date: 2026-03-15
-- All UUIDs use gen_random_uuid(), all timestamps default to now()

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERATOR', 'MEMBER');

CREATE TYPE "MembershipStatus" AS ENUM (
  'PENDING_APPROVAL',
  'PENDING_PAYMENT',
  'ACTIVE',
  'EXPIRED',
  'SUSPENDED'
);

CREATE TYPE "MembershipType" AS ENUM ('MONTHLY', 'HALF_YEARLY', 'ANNUAL');

CREATE TYPE "TransactionType" AS ENUM ('CASH_IN', 'CASH_OUT');

CREATE TYPE "TransactionCategory" AS ENUM (
  'MEMBERSHIP_FEE',
  'APPLICATION_FEE',
  'SPONSORSHIP',
  'EXPENSE',
  'OTHER'
);

CREATE TYPE "PaymentMode" AS ENUM ('UPI', 'BANK_TRANSFER', 'CASH');

CREATE TYPE "SponsorPurpose" AS ENUM (
  'TITLE_SPONSOR',
  'GOLD_SPONSOR',
  'SILVER_SPONSOR',
  'FOOD_PARTNER',
  'MEDIA_PARTNER',
  'STALL_VENDOR',
  'MARKETING_PARTNER'
);

CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TYPE "ApprovalEntityType" AS ENUM (
  'TRANSACTION',
  'MEMBER_ADD',
  'MEMBER_EDIT',
  'MEMBER_DELETE',
  'MEMBERSHIP'
);

CREATE TYPE "ApprovalSource" AS ENUM ('MANUAL', 'RAZORPAY_WEBHOOK');

-- ============================================================
-- TABLES
-- ============================================================

-- 1. User (primary members + admins + operators)
CREATE TABLE "User" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "memberId"            VARCHAR(20) NOT NULL UNIQUE,  -- DPC-YYYY-NNNN-00
  "name"                VARCHAR(255) NOT NULL,
  "email"               VARCHAR(255) NOT NULL UNIQUE,
  "phone"               TEXT NOT NULL,                -- encrypted at rest (AES-256)
  "address"             TEXT NOT NULL,                -- encrypted at rest (AES-256)
  "password"            VARCHAR(255) NOT NULL,        -- bcrypt hash
  "isTempPassword"      BOOLEAN NOT NULL DEFAULT true,
  "role"                "Role" NOT NULL DEFAULT 'MEMBER',
  "membershipStatus"    "MembershipStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "membershipType"      "MembershipType",             -- nullable, set after first payment
  "membershipStart"     DATE,                          -- nullable
  "membershipExpiry"    DATE,                          -- nullable
  "totalPaid"           DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "applicationFeePaid"  BOOLEAN NOT NULL DEFAULT false,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "idx_user_role" ON "User" ("role");
CREATE INDEX "idx_user_membership_status" ON "User" ("membershipStatus");
CREATE INDEX "idx_user_membership_expiry" ON "User" ("membershipExpiry");

-- 2. SubMember
CREATE TABLE "SubMember" (
  "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "memberId"          VARCHAR(20) NOT NULL UNIQUE,    -- DPC-YYYY-NNNN-SS (01-03)
  "parentUserId"      UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "name"              VARCHAR(255) NOT NULL,
  "email"             VARCHAR(255) NOT NULL UNIQUE,   -- for login
  "phone"             TEXT NOT NULL,                  -- encrypted at rest (AES-256)
  "password"          VARCHAR(255) NOT NULL,          -- bcrypt hash
  "isTempPassword"    BOOLEAN NOT NULL DEFAULT true,
  "relation"          VARCHAR(100) NOT NULL,          -- e.g. "Spouse", "Child", "Parent"
  "canLogin"          BOOLEAN NOT NULL DEFAULT true,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "idx_submember_parent" ON "SubMember" ("parentUserId");

-- 3. Member (canonical member record, linked to User for login)
CREATE TABLE "Member" (
  "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"            UUID UNIQUE REFERENCES "User"("id") ON DELETE SET NULL,  -- nullable
  "name"              VARCHAR(255) NOT NULL,
  "phone"             TEXT NOT NULL,                  -- encrypted at rest (AES-256)
  "email"             VARCHAR(255) NOT NULL,
  "address"           TEXT NOT NULL,                  -- encrypted at rest (AES-256)
  "parentMemberId"    UUID REFERENCES "Member"("id") ON DELETE SET NULL,  -- nullable, for sub-members
  "membershipStatus"  "MembershipStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "joinedAt"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "idx_member_user" ON "Member" ("userId");
CREATE INDEX "idx_member_parent" ON "Member" ("parentMemberId");
CREATE INDEX "idx_member_status" ON "Member" ("membershipStatus");

-- 4. Membership (payment periods)
CREATE TABLE "Membership" (
  "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "memberId"          UUID NOT NULL REFERENCES "Member"("id") ON DELETE CASCADE,
  "type"              "MembershipType" NOT NULL,
  "amount"            DECIMAL(12, 2) NOT NULL,
  "startDate"         DATE NOT NULL,
  "endDate"           DATE NOT NULL,
  "isApplicationFee"  BOOLEAN NOT NULL DEFAULT false,
  "status"            "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "idx_membership_member" ON "Membership" ("memberId");
CREATE INDEX "idx_membership_status" ON "Membership" ("status");
CREATE INDEX "idx_membership_end_date" ON "Membership" ("endDate");

-- 5. Transaction (cash in/out)
CREATE TABLE "Transaction" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "type"                "TransactionType" NOT NULL,
  "category"            "TransactionCategory" NOT NULL,
  "amount"              DECIMAL(12, 2) NOT NULL,
  "paymentMode"         "PaymentMode" NOT NULL,
  "description"         TEXT NOT NULL,
  "sponsorPurpose"      "SponsorPurpose",              -- nullable, required when category=SPONSORSHIP
  "memberId"            UUID REFERENCES "Member"("id") ON DELETE SET NULL,    -- nullable
  "sponsorId"           UUID REFERENCES "Sponsor"("id") ON DELETE SET NULL,   -- nullable
  "enteredById"         UUID NOT NULL REFERENCES "User"("id"),                -- SYSTEM user for auto-detect
  "approvalStatus"      "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "approvalSource"      "ApprovalSource" NOT NULL DEFAULT 'MANUAL',
  "approvedById"        UUID REFERENCES "User"("id"),                         -- nullable
  "approvedAt"          TIMESTAMPTZ,                                          -- nullable
  "razorpayPaymentId"   VARCHAR(255),                                         -- nullable
  "razorpayOrderId"     VARCHAR(255),                                         -- nullable
  "senderName"          VARCHAR(255),                                         -- nullable
  "senderPhone"         TEXT,                                                 -- nullable, encrypted
  "senderUpiId"         VARCHAR(255),                                         -- nullable
  "senderBankAccount"   TEXT,                                                 -- nullable, encrypted
  "senderBankName"      VARCHAR(255),                                         -- nullable
  "receiptNumber"       VARCHAR(50),                                          -- nullable
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "idx_transaction_type" ON "Transaction" ("type");
CREATE INDEX "idx_transaction_category" ON "Transaction" ("category");
CREATE INDEX "idx_transaction_member" ON "Transaction" ("memberId");
CREATE INDEX "idx_transaction_sponsor" ON "Transaction" ("sponsorId");
CREATE INDEX "idx_transaction_approval_status" ON "Transaction" ("approvalStatus");
CREATE INDEX "idx_transaction_created" ON "Transaction" ("createdAt");
CREATE INDEX "idx_transaction_razorpay_payment" ON "Transaction" ("razorpayPaymentId");
CREATE INDEX "idx_transaction_razorpay_order" ON "Transaction" ("razorpayOrderId");

-- 6. Sponsor
CREATE TABLE "Sponsor" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"          VARCHAR(255) NOT NULL,
  "phone"         TEXT NOT NULL,                      -- encrypted at rest (AES-256)
  "email"         VARCHAR(255) NOT NULL,
  "company"       VARCHAR(255),                        -- nullable
  "createdById"   UUID NOT NULL REFERENCES "User"("id"),
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "idx_sponsor_created_by" ON "Sponsor" ("createdById");

-- 7. SponsorLink
CREATE TABLE "SponsorLink" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "sponsorId"     UUID REFERENCES "Sponsor"("id") ON DELETE SET NULL,  -- nullable
  "token"         VARCHAR(255) NOT NULL UNIQUE,
  "amount"        DECIMAL(12, 2),                     -- nullable, open-ended if null
  "upiId"         VARCHAR(255) NOT NULL,
  "bankDetails"   JSONB,                               -- nullable, schema: { accountNumber, bankName, ifscCode }
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "createdById"   UUID NOT NULL REFERENCES "User"("id"),
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "expiresAt"     TIMESTAMPTZ                          -- nullable
);

CREATE INDEX "idx_sponsor_link_token" ON "SponsorLink" ("token");
CREATE INDEX "idx_sponsor_link_sponsor" ON "SponsorLink" ("sponsorId");
CREATE INDEX "idx_sponsor_link_active" ON "SponsorLink" ("isActive");

-- 8. Approval
CREATE TABLE "Approval" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "entityType"      "ApprovalEntityType" NOT NULL,
  "entityId"        UUID NOT NULL,
  "action"          VARCHAR(100) NOT NULL,
  "previousData"    JSONB,                             -- nullable
  "newData"         JSONB,                             -- nullable
  "requestedById"   UUID NOT NULL REFERENCES "User"("id"),
  "status"          "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById"    UUID REFERENCES "User"("id"),      -- nullable
  "reviewedAt"      TIMESTAMPTZ,                       -- nullable
  "notes"           TEXT,                               -- nullable
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "idx_approval_status" ON "Approval" ("status");
CREATE INDEX "idx_approval_entity" ON "Approval" ("entityType", "entityId");
CREATE INDEX "idx_approval_requested_by" ON "Approval" ("requestedById");
CREATE INDEX "idx_approval_created" ON "Approval" ("createdAt");

-- 9. AuditLog (append-only -- no UPDATE/DELETE allowed)
CREATE TABLE "AuditLog" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "entityType"      VARCHAR(100) NOT NULL,
  "entityId"        UUID NOT NULL,
  "action"          VARCHAR(100) NOT NULL,
  "previousData"    JSONB,                             -- nullable
  "newData"         JSONB NOT NULL,
  "transactionId"   UUID REFERENCES "Transaction"("id") ON DELETE SET NULL,  -- nullable
  "performedById"   UUID NOT NULL REFERENCES "User"("id"),
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "idx_audit_entity" ON "AuditLog" ("entityType", "entityId");
CREATE INDEX "idx_audit_performed_by" ON "AuditLog" ("performedById");
CREATE INDEX "idx_audit_created" ON "AuditLog" ("createdAt");
CREATE INDEX "idx_audit_transaction" ON "AuditLog" ("transactionId");

-- 10. ActivityLog (append-only -- no UPDATE/DELETE allowed)
CREATE TABLE "ActivityLog" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"      UUID NOT NULL REFERENCES "User"("id"),
  "action"      VARCHAR(100) NOT NULL,
  "description" TEXT NOT NULL,
  "metadata"    JSONB,                                 -- nullable
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "idx_activity_user" ON "ActivityLog" ("userId");
CREATE INDEX "idx_activity_created" ON "ActivityLog" ("createdAt");
CREATE INDEX "idx_activity_action" ON "ActivityLog" ("action");

-- ============================================================
-- CONSTRAINTS (business rules enforced at DB level where possible)
-- ============================================================

-- Ensure sponsorPurpose is set when category is SPONSORSHIP
ALTER TABLE "Transaction" ADD CONSTRAINT "chk_sponsor_purpose"
  CHECK (
    ("category" != 'SPONSORSHIP') OR ("sponsorPurpose" IS NOT NULL)
  );

-- Ensure amount is positive
ALTER TABLE "Transaction" ADD CONSTRAINT "chk_positive_amount"
  CHECK ("amount" > 0);

ALTER TABLE "Membership" ADD CONSTRAINT "chk_positive_membership_amount"
  CHECK ("amount" > 0);

-- Ensure endDate > startDate for memberships
ALTER TABLE "Membership" ADD CONSTRAINT "chk_date_range"
  CHECK ("endDate" > "startDate");

-- ============================================================
-- NOTES
-- ============================================================
-- 1. Sub-member count (max 3 per parent) enforced in application logic, not DB constraint
-- 2. AuditLog and ActivityLog are append-only: no UPDATE/DELETE API endpoints exposed
-- 3. Encrypted fields (phone, address, bank details): encrypted/decrypted via Prisma middleware
-- 4. The "enteredBy" field uses a SYSTEM user record for auto-detected Razorpay payments
-- 5. Member.userId is nullable to support members added before they have login credentials
-- 6. All foreign keys use ON DELETE SET NULL or CASCADE as appropriate
