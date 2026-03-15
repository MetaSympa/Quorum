-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERATOR', 'MEMBER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING_APPROVAL', 'PENDING_PAYMENT', 'ACTIVE', 'EXPIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MembershipType" AS ENUM ('MONTHLY', 'HALF_YEARLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('CASH_IN', 'CASH_OUT');

-- CreateEnum
CREATE TYPE "TransactionCategory" AS ENUM ('MEMBERSHIP_FEE', 'APPLICATION_FEE', 'SPONSORSHIP', 'EXPENSE', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('UPI', 'BANK_TRANSFER', 'CASH');

-- CreateEnum
CREATE TYPE "SponsorPurpose" AS ENUM ('TITLE_SPONSOR', 'GOLD_SPONSOR', 'SILVER_SPONSOR', 'FOOD_PARTNER', 'MEDIA_PARTNER', 'STALL_VENDOR', 'MARKETING_PARTNER');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalEntityType" AS ENUM ('TRANSACTION', 'MEMBER_ADD', 'MEMBER_EDIT', 'MEMBER_DELETE', 'MEMBERSHIP');

-- CreateEnum
CREATE TYPE "ApprovalSource" AS ENUM ('MANUAL', 'RAZORPAY_WEBHOOK');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "memberId" VARCHAR(20) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "isTempPassword" BOOLEAN NOT NULL DEFAULT true,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "membershipStatus" "MembershipStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "membershipType" "MembershipType",
    "membershipStart" DATE,
    "membershipExpiry" DATE,
    "totalPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "applicationFeePaid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_members" (
    "id" TEXT NOT NULL,
    "memberId" VARCHAR(20) NOT NULL,
    "parentUserId" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" TEXT NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "isTempPassword" BOOLEAN NOT NULL DEFAULT true,
    "relation" VARCHAR(100) NOT NULL,
    "canLogin" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sub_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" VARCHAR(255) NOT NULL,
    "phone" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "address" TEXT NOT NULL,
    "parentMemberId" TEXT,
    "membershipStatus" "MembershipStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "joinedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "type" "MembershipType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isApplicationFee" BOOLEAN NOT NULL DEFAULT false,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "category" "TransactionCategory" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentMode" "PaymentMode" NOT NULL,
    "description" TEXT NOT NULL,
    "sponsorPurpose" "SponsorPurpose",
    "memberId" TEXT,
    "sponsorId" TEXT,
    "enteredById" TEXT NOT NULL,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvalSource" "ApprovalSource" NOT NULL DEFAULT 'MANUAL',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMPTZ,
    "razorpayPaymentId" VARCHAR(255),
    "razorpayOrderId" VARCHAR(255),
    "senderName" VARCHAR(255),
    "senderPhone" TEXT,
    "senderUpiId" VARCHAR(255),
    "senderBankAccount" TEXT,
    "senderBankName" VARCHAR(255),
    "receiptNumber" VARCHAR(50),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsors" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "phone" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "company" VARCHAR(255),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsor_links" (
    "id" TEXT NOT NULL,
    "sponsorId" TEXT,
    "token" VARCHAR(255) NOT NULL,
    "amount" DECIMAL(12,2),
    "upiId" VARCHAR(255) NOT NULL,
    "bankDetails" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ,

    CONSTRAINT "sponsor_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" TEXT NOT NULL,
    "entityType" "ApprovalEntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "requestedById" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMPTZ,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "entityType" VARCHAR(100) NOT NULL,
    "entityId" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "previousData" JSONB,
    "newData" JSONB NOT NULL,
    "transactionId" TEXT,
    "performedById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_memberId_key" ON "users"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_membershipStatus_idx" ON "users"("membershipStatus");

-- CreateIndex
CREATE INDEX "users_membershipExpiry_idx" ON "users"("membershipExpiry");

-- CreateIndex
CREATE UNIQUE INDEX "sub_members_memberId_key" ON "sub_members"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "sub_members_email_key" ON "sub_members"("email");

-- CreateIndex
CREATE INDEX "sub_members_parentUserId_idx" ON "sub_members"("parentUserId");

-- CreateIndex
CREATE UNIQUE INDEX "members_userId_key" ON "members"("userId");

-- CreateIndex
CREATE INDEX "members_userId_idx" ON "members"("userId");

-- CreateIndex
CREATE INDEX "members_parentMemberId_idx" ON "members"("parentMemberId");

-- CreateIndex
CREATE INDEX "members_membershipStatus_idx" ON "members"("membershipStatus");

-- CreateIndex
CREATE INDEX "memberships_memberId_idx" ON "memberships"("memberId");

-- CreateIndex
CREATE INDEX "memberships_status_idx" ON "memberships"("status");

-- CreateIndex
CREATE INDEX "memberships_endDate_idx" ON "memberships"("endDate");

-- CreateIndex
CREATE INDEX "transactions_type_idx" ON "transactions"("type");

-- CreateIndex
CREATE INDEX "transactions_category_idx" ON "transactions"("category");

-- CreateIndex
CREATE INDEX "transactions_memberId_idx" ON "transactions"("memberId");

-- CreateIndex
CREATE INDEX "transactions_sponsorId_idx" ON "transactions"("sponsorId");

-- CreateIndex
CREATE INDEX "transactions_approvalStatus_idx" ON "transactions"("approvalStatus");

-- CreateIndex
CREATE INDEX "transactions_createdAt_idx" ON "transactions"("createdAt");

-- CreateIndex
CREATE INDEX "transactions_razorpayPaymentId_idx" ON "transactions"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "transactions_razorpayOrderId_idx" ON "transactions"("razorpayOrderId");

-- CreateIndex
CREATE INDEX "sponsors_createdById_idx" ON "sponsors"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "sponsor_links_token_key" ON "sponsor_links"("token");

-- CreateIndex
CREATE INDEX "sponsor_links_token_idx" ON "sponsor_links"("token");

-- CreateIndex
CREATE INDEX "sponsor_links_sponsorId_idx" ON "sponsor_links"("sponsorId");

-- CreateIndex
CREATE INDEX "sponsor_links_isActive_idx" ON "sponsor_links"("isActive");

-- CreateIndex
CREATE INDEX "approvals_status_idx" ON "approvals"("status");

-- CreateIndex
CREATE INDEX "approvals_entityType_entityId_idx" ON "approvals"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "approvals_requestedById_idx" ON "approvals"("requestedById");

-- CreateIndex
CREATE INDEX "approvals_createdAt_idx" ON "approvals"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_performedById_idx" ON "audit_logs"("performedById");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_transactionId_idx" ON "audit_logs"("transactionId");

-- CreateIndex
CREATE INDEX "activity_logs_userId_idx" ON "activity_logs"("userId");

-- CreateIndex
CREATE INDEX "activity_logs_createdAt_idx" ON "activity_logs"("createdAt");

-- CreateIndex
CREATE INDEX "activity_logs_action_idx" ON "activity_logs"("action");

-- AddForeignKey
ALTER TABLE "sub_members" ADD CONSTRAINT "sub_members_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_parentMemberId_fkey" FOREIGN KEY ("parentMemberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "sponsors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_links" ADD CONSTRAINT "sponsor_links_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "sponsors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_links" ADD CONSTRAINT "sponsor_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
