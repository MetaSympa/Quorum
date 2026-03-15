/**
 * DPS Dashboard — Comprehensive Seed Data (T32)
 *
 * Run with: npx prisma db seed
 * Or:       npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts
 *
 * Creates:
 *   - 8 Users (1 admin, 1 operator, 5 members + 1 extra)
 *   - 6 SubMembers (member1:3, member2:2, member5:1)
 *   - 8 Member records linked to Users
 *   - 10 Memberships
 *   - 24 Transactions (mixed categories, modes, statuses)
 *   - 4 Sponsors
 *   - 3 SponsorLinks
 *   - 10 Approvals (3 pending, 5 approved, 2 rejected)
 *   - 20 AuditLog entries (approved transactions only)
 *   - 20 ActivityLog entries
 *
 * NOTE: The Prisma $extends middleware encrypts PII fields transparently
 * when ENCRYPTION_KEY is set. The seed works with or without it.
 */

import {
  PrismaClient,
  Prisma,
  TransactionType,
  TransactionCategory,
  PaymentMode,
  SponsorPurpose,
  ApprovalStatus,
  ApprovalSource,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

function d(isoDate: string): Date {
  return new Date(isoDate);
}

function dec(value: string | number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function buildAuditSnapshot(
  transaction: {
    id: string;
    type: TransactionType;
    category: TransactionCategory;
    amount: Prisma.Decimal;
    paymentMode: PaymentMode;
    description: string;
    sponsorPurpose: SponsorPurpose | null;
    approvalStatus: ApprovalStatus;
    approvalSource: ApprovalSource;
    enteredById: string;
    approvedById: string | null;
    approvedAt: Date | null;
    razorpayPaymentId: string | null;
    razorpayOrderId: string | null;
    senderName: string | null;
    senderPhone: string | null;
    senderUpiId: string | null;
    senderBankAccount: string | null;
    senderBankName: string | null;
    receiptNumber: string | null;
    memberId: string | null;
    sponsorId: string | null;
    createdAt: Date;
  }
): Prisma.InputJsonValue {
  return {
    id: transaction.id,
    type: transaction.type,
    category: transaction.category,
    amount: transaction.amount.toString(),
    paymentMode: transaction.paymentMode,
    description: transaction.description,
    sponsorPurpose: transaction.sponsorPurpose,
    approvalStatus: transaction.approvalStatus,
    approvalSource: transaction.approvalSource,
    enteredById: transaction.enteredById,
    approvedById: transaction.approvedById,
    approvedAt: transaction.approvedAt?.toISOString() ?? null,
    razorpayPaymentId: transaction.razorpayPaymentId,
    razorpayOrderId: transaction.razorpayOrderId,
    senderName: transaction.senderName,
    senderPhone: transaction.senderPhone,
    senderUpiId: transaction.senderUpiId,
    senderBankAccount: transaction.senderBankAccount,
    senderBankName: transaction.senderBankName,
    receiptNumber: transaction.receiptNumber,
    memberId: transaction.memberId,
    sponsorId: transaction.sponsorId,
    createdAt: transaction.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Seeding database...");

  // Make the seed rerunnable in a populated local database.
  await prisma.auditLog.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.sponsorLink.deleteMany();
  await prisma.sponsor.deleteMany();
  await prisma.subMember.deleteMany();
  await prisma.member.deleteMany();
  await prisma.user.deleteMany();

  // -----------------------------------------------------------------------
  // 1. Hash passwords
  // -----------------------------------------------------------------------
  const adminPw     = await hashPassword("Admin@123");
  const operatorPw  = await hashPassword("Operator@123");
  const memberPw    = await hashPassword("Member@123");
  const subMemberPw = await hashPassword("SubMember@123");

  // -----------------------------------------------------------------------
  // 2. Users
  // -----------------------------------------------------------------------

  const admin = await prisma.user.create({
    data: {
      memberId:         "DPC-2026-0001-00",
      name:             "Subhash Mukherjee",
      email:            "admin@dps.club",
      phone:            "9830000001",
      address:          "12 Deshapriya Park, Kolkata 700026",
      password:         adminPw,
      isTempPassword:   false,
      role:             "ADMIN",
      membershipStatus: "ACTIVE",
      membershipType:   "ANNUAL",
      membershipStart:  d("2026-01-01"),
      membershipExpiry: d("2026-12-31"),
      totalPaid:        dec("13000"),
      applicationFeePaid: true,
    },
  });

  const operator = await prisma.user.create({
    data: {
      memberId:         "DPC-2026-0002-00",
      name:             "Ramesh Chatterjee",
      email:            "operator@dps.club",
      phone:            "9830000002",
      address:          "45 Rashbehari Avenue, Kolkata 700026",
      password:         operatorPw,
      isTempPassword:   false,
      role:             "OPERATOR",
      membershipStatus: "ACTIVE",
      membershipType:   "ANNUAL",
      membershipStart:  d("2026-01-01"),
      membershipExpiry: d("2026-12-31"),
      totalPaid:        dec("13000"),
      applicationFeePaid: true,
    },
  });

  const member1 = await prisma.user.create({
    data: {
      memberId:         "DPC-2026-0003-00",
      name:             "Arijit Banerjee",
      email:            "member1@dps.club",
      phone:            "9830000003",
      address:          "78 Lake Gardens, Kolkata 700045",
      password:         memberPw,
      isTempPassword:   false,
      role:             "MEMBER",
      membershipStatus: "ACTIVE",
      membershipType:   "ANNUAL",
      membershipStart:  d("2026-01-01"),
      membershipExpiry: d("2026-12-31"),
      totalPaid:        dec("13000"),
      applicationFeePaid: true,
    },
  });

  const member2 = await prisma.user.create({
    data: {
      memberId:         "DPC-2026-0004-00",
      name:             "Priya Sen",
      email:            "member2@dps.club",
      phone:            "9830000004",
      address:          "22 Tollygunge, Kolkata 700033",
      password:         memberPw,
      isTempPassword:   false,
      role:             "MEMBER",
      membershipStatus: "ACTIVE",
      membershipType:   "HALF_YEARLY",
      membershipStart:  d("2026-01-01"),
      membershipExpiry: d("2026-06-30"),
      totalPaid:        dec("11500"),
      applicationFeePaid: true,
    },
  });

  const member3 = await prisma.user.create({
    data: {
      memberId:         "DPC-2026-0005-00",
      name:             "Debashis Roy",
      email:            "member3@dps.club",
      phone:            "9830000005",
      address:          "5 Gariahat Road, Kolkata 700019",
      password:         memberPw,
      isTempPassword:   false,
      role:             "MEMBER",
      membershipStatus: "EXPIRED",
      membershipType:   "MONTHLY",
      membershipStart:  d("2025-12-01"),
      membershipExpiry: d("2025-12-31"),
      totalPaid:        dec("10250"),
      applicationFeePaid: true,
    },
  });

  const member4 = await prisma.user.create({
    data: {
      memberId:         "DPC-2026-0006-00",
      name:             "Suchitra Ghosh",
      email:            "member4@dps.club",
      phone:            "9830000006",
      address:          "99 Ballygunge Place, Kolkata 700019",
      password:         memberPw,
      isTempPassword:   false,
      role:             "MEMBER",
      membershipStatus: "PENDING_PAYMENT",
      membershipType:   null,
      membershipStart:  null,
      membershipExpiry: null,
      totalPaid:        dec("0"),
      applicationFeePaid: false,
    },
  });

  const member5 = await prisma.user.create({
    data: {
      memberId:         "DPC-2026-0007-00",
      name:             "Kaushik Dey",
      email:            "member5@dps.club",
      phone:            "9830000007",
      address:          "31 Hindustan Park, Kolkata 700029",
      password:         memberPw,
      isTempPassword:   false,
      role:             "MEMBER",
      membershipStatus: "ACTIVE",
      membershipType:   "ANNUAL",
      membershipStart:  d("2026-01-01"),
      membershipExpiry: d("2026-12-31"),
      totalPaid:        dec("13000"),
      applicationFeePaid: true,
    },
  });

  console.log("Users created.");

  // -----------------------------------------------------------------------
  // 3. Sub-Members
  // -----------------------------------------------------------------------

  // Member 1 — 3 sub-members (max)
  await prisma.subMember.create({
    data: {
      memberId:      "DPC-2026-0003-01",
      parentUserId:  member1.id,
      name:          "Mitali Banerjee",
      email:         "mitali.banerjee@dps.club",
      phone:         "9830100001",
      password:      subMemberPw,
      isTempPassword: false,
      relation:      "Spouse",
      canLogin:      true,
    },
  });

  await prisma.subMember.create({
    data: {
      memberId:      "DPC-2026-0003-02",
      parentUserId:  member1.id,
      name:          "Rohan Banerjee",
      email:         "rohan.banerjee@dps.club",
      phone:         "9830100002",
      password:      subMemberPw,
      isTempPassword: false,
      relation:      "Son",
      canLogin:      true,
    },
  });

  await prisma.subMember.create({
    data: {
      memberId:      "DPC-2026-0003-03",
      parentUserId:  member1.id,
      name:          "Riya Banerjee",
      email:         "riya.banerjee@dps.club",
      phone:         "9830100003",
      password:      subMemberPw,
      isTempPassword: false,
      relation:      "Daughter",
      canLogin:      true,
    },
  });

  // Member 2 — 2 sub-members
  await prisma.subMember.create({
    data: {
      memberId:      "DPC-2026-0004-01",
      parentUserId:  member2.id,
      name:          "Sourav Sen",
      email:         "sourav.sen@dps.club",
      phone:         "9830100004",
      password:      subMemberPw,
      isTempPassword: false,
      relation:      "Husband",
      canLogin:      true,
    },
  });

  await prisma.subMember.create({
    data: {
      memberId:      "DPC-2026-0004-02",
      parentUserId:  member2.id,
      name:          "Kamala Devi Sen",
      email:         "kamala.sen@dps.club",
      phone:         "9830100005",
      password:      subMemberPw,
      isTempPassword: false,
      relation:      "Mother",
      canLogin:      true,
    },
  });

  // Member 5 — 1 sub-member
  await prisma.subMember.create({
    data: {
      memberId:      "DPC-2026-0007-01",
      parentUserId:  member5.id,
      name:          "Ananya Dey",
      email:         "ananya.dey@dps.club",
      phone:         "9830100006",
      password:      subMemberPw,
      isTempPassword: false,
      relation:      "Wife",
      canLogin:      true,
    },
  });

  console.log("Sub-members created.");

  // -----------------------------------------------------------------------
  // 4. Member records (canonical Member, linked to User via userId)
  // -----------------------------------------------------------------------

  const memberRecordAdmin = await prisma.member.create({
    data: {
      userId:          admin.id,
      name:            admin.name,
      phone:           "9830000001",
      email:           admin.email,
      address:         "12 Deshapriya Park, Kolkata 700026",
      membershipStatus: "ACTIVE",
      joinedAt:        d("2026-01-01T00:00:00Z"),
    },
  });

  const memberRecordOperator = await prisma.member.create({
    data: {
      userId:          operator.id,
      name:            operator.name,
      phone:           "9830000002",
      email:           operator.email,
      address:         "45 Rashbehari Avenue, Kolkata 700026",
      membershipStatus: "ACTIVE",
      joinedAt:        d("2026-01-01T00:00:00Z"),
    },
  });

  const memberRecord1 = await prisma.member.create({
    data: {
      userId:          member1.id,
      name:            member1.name,
      phone:           "9830000003",
      email:           member1.email,
      address:         "78 Lake Gardens, Kolkata 700045",
      membershipStatus: "ACTIVE",
      joinedAt:        d("2026-01-15T00:00:00Z"),
    },
  });

  const memberRecord2 = await prisma.member.create({
    data: {
      userId:          member2.id,
      name:            member2.name,
      phone:           "9830000004",
      email:           member2.email,
      address:         "22 Tollygunge, Kolkata 700033",
      membershipStatus: "ACTIVE",
      joinedAt:        d("2026-01-20T00:00:00Z"),
    },
  });

  const memberRecord3 = await prisma.member.create({
    data: {
      userId:          member3.id,
      name:            member3.name,
      phone:           "9830000005",
      email:           member3.email,
      address:         "5 Gariahat Road, Kolkata 700019",
      membershipStatus: "EXPIRED",
      joinedAt:        d("2025-12-01T00:00:00Z"),
    },
  });

  const memberRecord4 = await prisma.member.create({
    data: {
      userId:          member4.id,
      name:            member4.name,
      phone:           "9830000006",
      email:           member4.email,
      address:         "99 Ballygunge Place, Kolkata 700019",
      membershipStatus: "PENDING_PAYMENT",
      joinedAt:        d("2026-02-01T00:00:00Z"),
    },
  });

  const memberRecord5 = await prisma.member.create({
    data: {
      userId:          member5.id,
      name:            member5.name,
      phone:           "9830000007",
      email:           member5.email,
      address:         "31 Hindustan Park, Kolkata 700029",
      membershipStatus: "ACTIVE",
      joinedAt:        d("2026-01-10T00:00:00Z"),
    },
  });

  console.log("Member records created.");

  // -----------------------------------------------------------------------
  // 5. Memberships
  // -----------------------------------------------------------------------

  // Application fees (one-time)
  await prisma.membership.create({
    data: {
      memberId:        memberRecord1.id,
      type:            "ANNUAL",
      amount:          dec("10000"),
      startDate:       d("2026-01-15"),
      endDate:         d("2026-01-15"),
      isApplicationFee: true,
      status:          "APPROVED",
    },
  });

  await prisma.membership.create({
    data: {
      memberId:        memberRecord2.id,
      type:            "HALF_YEARLY",
      amount:          dec("10000"),
      startDate:       d("2026-01-20"),
      endDate:         d("2026-01-20"),
      isApplicationFee: true,
      status:          "APPROVED",
    },
  });

  await prisma.membership.create({
    data: {
      memberId:        memberRecord3.id,
      type:            "MONTHLY",
      amount:          dec("10000"),
      startDate:       d("2025-12-01"),
      endDate:         d("2025-12-01"),
      isApplicationFee: true,
      status:          "APPROVED",
    },
  });

  await prisma.membership.create({
    data: {
      memberId:        memberRecord5.id,
      type:            "ANNUAL",
      amount:          dec("10000"),
      startDate:       d("2026-01-10"),
      endDate:         d("2026-01-10"),
      isApplicationFee: true,
      status:          "APPROVED",
    },
  });

  // Active annual membership — Member 1
  await prisma.membership.create({
    data: {
      memberId:  memberRecord1.id,
      type:      "ANNUAL",
      amount:    dec("3000"),
      startDate: d("2026-01-15"),
      endDate:   d("2026-12-31"),
      status:    "APPROVED",
    },
  });

  // Active half-yearly — Member 2
  await prisma.membership.create({
    data: {
      memberId:  memberRecord2.id,
      type:      "HALF_YEARLY",
      amount:    dec("1500"),
      startDate: d("2026-01-20"),
      endDate:   d("2026-06-30"),
      status:    "APPROVED",
    },
  });

  // Expired monthly — Member 3
  await prisma.membership.create({
    data: {
      memberId:  memberRecord3.id,
      type:      "MONTHLY",
      amount:    dec("250"),
      startDate: d("2025-12-01"),
      endDate:   d("2025-12-31"),
      status:    "APPROVED",
    },
  });

  // Pending payment — Member 4 (pending approval)
  await prisma.membership.create({
    data: {
      memberId:  memberRecord4.id,
      type:      "ANNUAL",
      amount:    dec("10000"),
      startDate: d("2026-02-01"),
      endDate:   d("2026-02-01"),
      isApplicationFee: true,
      status:    "PENDING",
    },
  });

  // Active annual — Member 5
  await prisma.membership.create({
    data: {
      memberId:  memberRecord5.id,
      type:      "ANNUAL",
      amount:    dec("3000"),
      startDate: d("2026-01-10"),
      endDate:   d("2026-12-31"),
      status:    "APPROVED",
    },
  });

  console.log("Memberships created.");

  // -----------------------------------------------------------------------
  // 6. Sponsors
  // -----------------------------------------------------------------------

  const sponsor1 = await prisma.sponsor.create({
    data: {
      name:        "Balaram Das & Sons",
      phone:       "9830200001",
      email:       "contact@balarambdas.com",
      company:     "Balaram Das & Sons Pvt. Ltd.",
      createdById: admin.id,
    },
  });

  const sponsor2 = await prisma.sponsor.create({
    data: {
      name:        "Kolkata Sweets",
      phone:       "9830200002",
      email:       "info@kolkatasweets.com",
      company:     "Kolkata Sweets Co.",
      createdById: operator.id,
    },
  });

  const sponsor3 = await prisma.sponsor.create({
    data: {
      name:        "ABP Media Group",
      phone:       "9830200003",
      email:       "partnerships@abp.in",
      company:     "ABP Media Group Ltd.",
      createdById: admin.id,
    },
  });

  const sponsor4 = await prisma.sponsor.create({
    data: {
      name:        "Priya Textiles",
      phone:       "9830200004",
      email:       "priyatex@gmail.com",
      company:     "Priya Textiles",
      createdById: operator.id,
    },
  });

  console.log("Sponsors created.");

  // -----------------------------------------------------------------------
  // 7. Sponsor Links
  // -----------------------------------------------------------------------

  // Active link for sponsor 1 (Title Sponsor — fixed amount)
  await prisma.sponsorLink.create({
    data: {
      sponsorId:   sponsor1.id,
      token:       "sl_balaram_title_2026_abc123def456",
      amount:      dec("500000"),
      upiId:       "dps.club@axisbank",
      bankDetails: {
        accountNumber: "1234567890",
        bankName:      "Axis Bank",
        ifscCode:      "UTIB0000123",
      },
      isActive:    true,
      createdById: admin.id,
      expiresAt:   d("2026-12-31T23:59:59Z"),
    },
  });

  // Expired link for sponsor 2 (Food Partner)
  await prisma.sponsorLink.create({
    data: {
      sponsorId:   sponsor2.id,
      token:       "sl_kolkatasweets_food_2026_xyz789",
      amount:      dec("100000"),
      upiId:       "dps.club@axisbank",
      bankDetails: {
        accountNumber: "1234567890",
        bankName:      "Axis Bank",
        ifscCode:      "UTIB0000123",
      },
      isActive:    false,
      createdById: admin.id,
      expiresAt:   d("2026-01-31T23:59:59Z"),
    },
  });

  // Open-ended amount link for sponsor 4 (Stall Vendor — they choose amount)
  await prisma.sponsorLink.create({
    data: {
      sponsorId:   sponsor4.id,
      token:       "sl_priyatex_stall_2026_openamt",
      amount:      null,
      upiId:       "dps.club@axisbank",
      bankDetails: {
        accountNumber: "1234567890",
        bankName:      "Axis Bank",
        ifscCode:      "UTIB0000123",
      },
      isActive:    true,
      createdById: operator.id,
      expiresAt:   d("2026-10-31T23:59:59Z"),
    },
  });

  console.log("Sponsor links created.");

  // -----------------------------------------------------------------------
  // 8. Transactions (24 mixed)
  // -----------------------------------------------------------------------

  // T01 — Application fee, Member 1, UPI, approved via Razorpay
  const txn1 = await prisma.transaction.create({
    data: {
      type:              "CASH_IN",
      category:          "APPLICATION_FEE",
      amount:            dec("10000"),
      paymentMode:       "UPI",
      description:       "Application fee — Arijit Banerjee",
      memberId:          memberRecord1.id,
      enteredById:       admin.id,
      approvalStatus:    "APPROVED",
      approvalSource:    "RAZORPAY_WEBHOOK",
      approvedById:      admin.id,
      approvedAt:        d("2026-01-15T10:30:00Z"),
      razorpayPaymentId: "pay_QP123456789001",
      razorpayOrderId:   "order_QP123456789001",
      senderName:        "Arijit Banerjee",
      senderPhone:       "9830000003",
      senderUpiId:       "arijit.banerjee@oksbi",
      receiptNumber:     "DPS-REC-2026-0001",
      createdAt:         d("2026-01-15T10:28:00Z"),
    },
  });

  // T02 — Annual membership fee, Member 1, UPI, approved via Razorpay
  const txn2 = await prisma.transaction.create({
    data: {
      type:              "CASH_IN",
      category:          "MEMBERSHIP_FEE",
      amount:            dec("3000"),
      paymentMode:       "UPI",
      description:       "Annual membership fee — Arijit Banerjee",
      memberId:          memberRecord1.id,
      enteredById:       admin.id,
      approvalStatus:    "APPROVED",
      approvalSource:    "RAZORPAY_WEBHOOK",
      approvedById:      admin.id,
      approvedAt:        d("2026-01-15T10:35:00Z"),
      razorpayPaymentId: "pay_QP123456789002",
      razorpayOrderId:   "order_QP123456789002",
      senderName:        "Arijit Banerjee",
      senderPhone:       "9830000003",
      senderUpiId:       "arijit.banerjee@oksbi",
      receiptNumber:     "DPS-REC-2026-0002",
      createdAt:         d("2026-01-15T10:33:00Z"),
    },
  });

  // T03 — Application fee, Member 2, Bank Transfer, approved manually
  const txn3 = await prisma.transaction.create({
    data: {
      type:           "CASH_IN",
      category:       "APPLICATION_FEE",
      amount:         dec("10000"),
      paymentMode:    "BANK_TRANSFER",
      description:    "Application fee — Priya Sen (NEFT)",
      memberId:       memberRecord2.id,
      enteredById:    operator.id,
      approvalStatus: "APPROVED",
      approvalSource: "MANUAL",
      approvedById:   admin.id,
      approvedAt:     d("2026-01-20T14:00:00Z"),
      senderName:     "Priya Sen",
      senderPhone:    "9830000004",
      senderBankAccount: "XXXX1234",
      senderBankName: "SBI",
      receiptNumber:  "DPS-REC-2026-0003",
      createdAt:      d("2026-01-20T13:45:00Z"),
    },
  });

  // T04 — Half-yearly membership, Member 2, Bank Transfer, approved
  await prisma.transaction.create({
    data: {
      type:           "CASH_IN",
      category:       "MEMBERSHIP_FEE",
      amount:         dec("1500"),
      paymentMode:    "BANK_TRANSFER",
      description:    "Half-yearly membership — Priya Sen",
      memberId:       memberRecord2.id,
      enteredById:    operator.id,
      approvalStatus: "APPROVED",
      approvalSource: "MANUAL",
      approvedById:   admin.id,
      approvedAt:     d("2026-01-20T14:10:00Z"),
      senderName:     "Priya Sen",
      senderPhone:    "9830000004",
      senderBankAccount: "XXXX1234",
      senderBankName: "SBI",
      receiptNumber:  "DPS-REC-2026-0004",
      createdAt:      d("2026-01-20T14:05:00Z"),
    },
  });

  // T05 — Title Sponsor payment, sponsor1, UPI, approved
  const txn5 = await prisma.transaction.create({
    data: {
      type:              "CASH_IN",
      category:          "SPONSORSHIP",
      amount:            dec("500000"),
      paymentMode:       "UPI",
      description:       "Title sponsorship — Balaram Das & Sons",
      sponsorId:         sponsor1.id,
      sponsorPurpose:    "TITLE_SPONSOR",
      enteredById:       admin.id,
      approvalStatus:    "APPROVED",
      approvalSource:    "RAZORPAY_WEBHOOK",
      approvedById:      admin.id,
      approvedAt:        d("2026-02-01T09:00:00Z"),
      razorpayPaymentId: "pay_QP123456789005",
      razorpayOrderId:   "order_QP123456789005",
      senderName:        "Balaram Das",
      senderPhone:       "9830200001",
      senderUpiId:       "balarambdas@icici",
      receiptNumber:     "DPS-REC-2026-0005",
      createdAt:         d("2026-02-01T08:50:00Z"),
    },
  });

  // T06 — Food partner sponsorship, sponsor2, Cash, approved
  await prisma.transaction.create({
    data: {
      type:           "CASH_IN",
      category:       "SPONSORSHIP",
      amount:         dec("100000"),
      paymentMode:    "CASH",
      description:    "Food partnership sponsorship — Kolkata Sweets",
      sponsorId:      sponsor2.id,
      sponsorPurpose: "FOOD_PARTNER",
      enteredById:    operator.id,
      approvalStatus: "APPROVED",
      approvalSource: "MANUAL",
      approvedById:   admin.id,
      approvedAt:     d("2026-02-05T11:00:00Z"),
      senderName:     "Ratan Mondal",
      receiptNumber:  "DPS-REC-2026-0006",
      createdAt:      d("2026-02-05T10:45:00Z"),
    },
  });

  // T07 — Media partner, sponsor3, Bank Transfer, approved
  await prisma.transaction.create({
    data: {
      type:           "CASH_IN",
      category:       "SPONSORSHIP",
      amount:         dec("200000"),
      paymentMode:    "BANK_TRANSFER",
      description:    "Media partnership — ABP Media Group",
      sponsorId:      sponsor3.id,
      sponsorPurpose: "MEDIA_PARTNER",
      enteredById:    admin.id,
      approvalStatus: "APPROVED",
      approvalSource: "MANUAL",
      approvedById:   admin.id,
      approvedAt:     d("2026-02-10T15:00:00Z"),
      senderName:     "ABP Finance Dept",
      senderPhone:    "9830200003",
      senderBankAccount: "XXXX5678",
      senderBankName: "HDFC",
      receiptNumber:  "DPS-REC-2026-0007",
      createdAt:      d("2026-02-10T14:30:00Z"),
    },
  });

  // T08 — Application fee, Member 3, UPI, approved (now expired member)
  await prisma.transaction.create({
    data: {
      type:              "CASH_IN",
      category:          "APPLICATION_FEE",
      amount:            dec("10000"),
      paymentMode:       "UPI",
      description:       "Application fee — Debashis Roy",
      memberId:          memberRecord3.id,
      enteredById:       operator.id,
      approvalStatus:    "APPROVED",
      approvalSource:    "RAZORPAY_WEBHOOK",
      approvedById:      admin.id,
      approvedAt:        d("2025-12-01T11:00:00Z"),
      razorpayPaymentId: "pay_QP123456789008",
      razorpayOrderId:   "order_QP123456789008",
      senderName:        "Debashis Roy",
      senderPhone:       "9830000005",
      senderUpiId:       "debashis.roy@paytm",
      receiptNumber:     "DPS-REC-2026-0008",
      createdAt:         d("2025-12-01T10:55:00Z"),
    },
  });

  // T09 — Expired monthly membership, Member 3
  await prisma.transaction.create({
    data: {
      type:           "CASH_IN",
      category:       "MEMBERSHIP_FEE",
      amount:         dec("250"),
      paymentMode:    "CASH",
      description:    "Monthly membership — Debashis Roy",
      memberId:       memberRecord3.id,
      enteredById:    operator.id,
      approvalStatus: "APPROVED",
      approvalSource: "MANUAL",
      approvedById:   admin.id,
      approvedAt:     d("2025-12-01T11:15:00Z"),
      senderName:     "Debashis Roy",
      receiptNumber:  "DPS-REC-2026-0009",
      createdAt:      d("2025-12-01T11:10:00Z"),
    },
  });

  // T10 — Application fee, Member 5, UPI, approved
  await prisma.transaction.create({
    data: {
      type:              "CASH_IN",
      category:          "APPLICATION_FEE",
      amount:            dec("10000"),
      paymentMode:       "UPI",
      description:       "Application fee — Kaushik Dey",
      memberId:          memberRecord5.id,
      enteredById:       operator.id,
      approvalStatus:    "APPROVED",
      approvalSource:    "RAZORPAY_WEBHOOK",
      approvedById:      admin.id,
      approvedAt:        d("2026-01-10T09:00:00Z"),
      razorpayPaymentId: "pay_QP123456789010",
      razorpayOrderId:   "order_QP123456789010",
      senderName:        "Kaushik Dey",
      senderPhone:       "9830000007",
      senderUpiId:       "kaushik.dey@gpay",
      receiptNumber:     "DPS-REC-2026-0010",
      createdAt:         d("2026-01-10T08:55:00Z"),
    },
  });

  // T11 — Annual membership, Member 5, UPI, approved
  await prisma.transaction.create({
    data: {
      type:              "CASH_IN",
      category:          "MEMBERSHIP_FEE",
      amount:            dec("3000"),
      paymentMode:       "UPI",
      description:       "Annual membership — Kaushik Dey",
      memberId:          memberRecord5.id,
      enteredById:       operator.id,
      approvalStatus:    "APPROVED",
      approvalSource:    "RAZORPAY_WEBHOOK",
      approvedById:      admin.id,
      approvedAt:        d("2026-01-10T09:10:00Z"),
      razorpayPaymentId: "pay_QP123456789011",
      razorpayOrderId:   "order_QP123456789011",
      senderName:        "Kaushik Dey",
      senderPhone:       "9830000007",
      senderUpiId:       "kaushik.dey@gpay",
      receiptNumber:     "DPS-REC-2026-0011",
      createdAt:         d("2026-01-10T09:05:00Z"),
    },
  });

  // T12 — Expense: decorations, operator entry, approved
  const txn12 = await prisma.transaction.create({
    data: {
      type:           "CASH_OUT",
      category:       "EXPENSE",
      amount:         dec("45000"),
      paymentMode:    "BANK_TRANSFER",
      description:    "Pandal decoration materials — Om Decorators",
      enteredById:    operator.id,
      approvalStatus: "APPROVED",
      approvalSource: "MANUAL",
      approvedById:   admin.id,
      approvedAt:     d("2026-03-01T10:00:00Z"),
      senderName:     "Om Decorators",
      senderBankAccount: "XXXX9012",
      senderBankName: "Canara Bank",
      receiptNumber:  "DPS-REC-2026-0012",
      createdAt:      d("2026-02-28T17:00:00Z"),
    },
  });

  // T13 — Expense: sound system rental, cash, approved
  await prisma.transaction.create({
    data: {
      type:           "CASH_OUT",
      category:       "EXPENSE",
      amount:         dec("25000"),
      paymentMode:    "CASH",
      description:    "Sound system rental — 5 days",
      enteredById:    operator.id,
      approvalStatus: "APPROVED",
      approvalSource: "MANUAL",
      approvedById:   admin.id,
      approvedAt:     d("2026-03-05T12:00:00Z"),
      senderName:     "Rhythm Sound Systems",
      receiptNumber:  "DPS-REC-2026-0013",
      createdAt:      d("2026-03-05T11:00:00Z"),
    },
  });

  // T14 — Expense: idol making advance, UPI, pending approval
  await prisma.transaction.create({
    data: {
      type:           "CASH_OUT",
      category:       "EXPENSE",
      amount:         dec("75000"),
      paymentMode:    "UPI",
      description:    "Durga idol advance payment — Shilpa Studio",
      enteredById:    operator.id,
      approvalStatus: "PENDING",
      approvalSource: "MANUAL",
      senderName:     "Shilpa Studio",
      senderPhone:    "9830300001",
      senderUpiId:    "shilpastudio@phonepe",
      createdAt:      d("2026-03-10T14:00:00Z"),
    },
  });

  // T15 — Stall vendor payment, sponsor4, UPI, approved
  await prisma.transaction.create({
    data: {
      type:              "CASH_IN",
      category:          "SPONSORSHIP",
      amount:            dec("50000"),
      paymentMode:       "UPI",
      description:       "Stall vendor fee — Priya Textiles",
      sponsorId:         sponsor4.id,
      sponsorPurpose:    "STALL_VENDOR",
      enteredById:       operator.id,
      approvalStatus:    "APPROVED",
      approvalSource:    "RAZORPAY_WEBHOOK",
      approvedById:      admin.id,
      approvedAt:        d("2026-03-08T16:00:00Z"),
      razorpayPaymentId: "pay_QP123456789015",
      razorpayOrderId:   "order_QP123456789015",
      senderName:        "Priya Textiles",
      senderPhone:       "9830200004",
      senderUpiId:       "priyatex@phonepe",
      receiptNumber:     "DPS-REC-2026-0014",
      createdAt:         d("2026-03-08T15:55:00Z"),
    },
  });

  // T16 — Miscellaneous: OTHER category, cash, approved
  await prisma.transaction.create({
    data: {
      type:           "CASH_IN",
      category:       "OTHER",
      amount:         dec("5000"),
      paymentMode:    "CASH",
      description:    "Cultural programme ticket sales",
      enteredById:    operator.id,
      approvalStatus: "APPROVED",
      approvalSource: "MANUAL",
      approvedById:   admin.id,
      approvedAt:     d("2026-03-12T18:00:00Z"),
      senderName:     "Gate Collection",
      receiptNumber:  "DPS-REC-2026-0015",
      createdAt:      d("2026-03-12T17:30:00Z"),
    },
  });

  // T17 — OTHER out: miscellaneous expense, cash, approved
  await prisma.transaction.create({
    data: {
      type:           "CASH_OUT",
      category:       "OTHER",
      amount:         dec("2500"),
      paymentMode:    "CASH",
      description:    "Stationery and printing costs",
      enteredById:    operator.id,
      approvalStatus: "APPROVED",
      approvalSource: "MANUAL",
      approvedById:   admin.id,
      approvedAt:     d("2026-03-07T10:00:00Z"),
      receiptNumber:  "DPS-REC-2026-0016",
      createdAt:      d("2026-03-07T09:45:00Z"),
    },
  });

  // T18 — Application fee, admin user (for completeness), Cash, approved
  await prisma.transaction.create({
    data: {
      type:           "CASH_IN",
      category:       "APPLICATION_FEE",
      amount:         dec("10000"),
      paymentMode:    "CASH",
      description:    "Application fee — Subhash Mukherjee (admin)",
      memberId:       memberRecordAdmin.id,
      enteredById:    admin.id,
      approvalStatus: "APPROVED",
      approvalSource: "MANUAL",
      approvedById:   admin.id,
      approvedAt:     d("2026-01-01T09:00:00Z"),
      senderName:     "Subhash Mukherjee",
      receiptNumber:  "DPS-REC-2026-0017",
      createdAt:      d("2026-01-01T08:45:00Z"),
    },
  });

  // T19 — Annual membership, admin, Cash, approved
  await prisma.transaction.create({
    data: {
      type:           "CASH_IN",
      category:       "MEMBERSHIP_FEE",
      amount:         dec("3000"),
      paymentMode:    "CASH",
      description:    "Annual membership — Subhash Mukherjee",
      memberId:       memberRecordAdmin.id,
      enteredById:    admin.id,
      approvalStatus: "APPROVED",
      approvalSource: "MANUAL",
      approvedById:   admin.id,
      approvedAt:     d("2026-01-01T09:15:00Z"),
      senderName:     "Subhash Mukherjee",
      receiptNumber:  "DPS-REC-2026-0018",
      createdAt:      d("2026-01-01T09:10:00Z"),
    },
  });

  // T20 — Application fee, operator, approved
  await prisma.transaction.create({
    data: {
      type:           "CASH_IN",
      category:       "APPLICATION_FEE",
      amount:         dec("10000"),
      paymentMode:    "UPI",
      description:    "Application fee — Ramesh Chatterjee",
      memberId:       memberRecordOperator.id,
      enteredById:    admin.id,
      approvalStatus: "APPROVED",
      approvalSource: "MANUAL",
      approvedById:   admin.id,
      approvedAt:     d("2026-01-02T10:00:00Z"),
      senderName:     "Ramesh Chatterjee",
      senderUpiId:    "ramesh.chatt@gpay",
      receiptNumber:  "DPS-REC-2026-0019",
      createdAt:      d("2026-01-02T09:50:00Z"),
    },
  });

  // T21 — Pending membership payment for Member 4
  await prisma.transaction.create({
    data: {
      type:           "CASH_IN",
      category:       "APPLICATION_FEE",
      amount:         dec("10000"),
      paymentMode:    "UPI",
      description:    "Application fee — Suchitra Ghosh (pending)",
      memberId:       memberRecord4.id,
      enteredById:    operator.id,
      approvalStatus: "PENDING",
      approvalSource: "MANUAL",
      senderName:     "Suchitra Ghosh",
      senderPhone:    "9830000006",
      senderUpiId:    "suchitra.ghosh@paytm",
      createdAt:      d("2026-02-01T12:00:00Z"),
    },
  });

  // T22 — Rejected expense entry
  await prisma.transaction.create({
    data: {
      type:           "CASH_OUT",
      category:       "EXPENSE",
      amount:         dec("15000"),
      paymentMode:    "CASH",
      description:    "Entertainment expenses — rejected, insufficient documentation",
      enteredById:    operator.id,
      approvalStatus: "REJECTED",
      approvalSource: "MANUAL",
      approvedById:   admin.id,
      approvedAt:     d("2026-03-11T14:00:00Z"),
      createdAt:      d("2026-03-11T12:00:00Z"),
    },
  });

  // T23 — Partial gold sponsor payment, Bank Transfer, approved
  await prisma.transaction.create({
    data: {
      type:           "CASH_IN",
      category:       "SPONSORSHIP",
      amount:         dec("150000"),
      paymentMode:    "BANK_TRANSFER",
      description:    "Gold sponsorship partial payment — Kalyan Jewellers",
      sponsorPurpose: "GOLD_SPONSOR",
      enteredById:    admin.id,
      approvalStatus: "APPROVED",
      approvalSource: "MANUAL",
      approvedById:   admin.id,
      approvedAt:     d("2026-03-13T11:00:00Z"),
      senderName:     "Kalyan Jewellers",
      senderBankAccount: "XXXX3456",
      senderBankName: "ICICI Bank",
      receiptNumber:  "DPS-REC-2026-0020",
      createdAt:      d("2026-03-13T10:30:00Z"),
    },
  });

  // T24 — Electricity bill expense, pending approval
  await prisma.transaction.create({
    data: {
      type:           "CASH_OUT",
      category:       "EXPENSE",
      amount:         dec("8500"),
      paymentMode:    "BANK_TRANSFER",
      description:    "Electricity charges — generator hire advance",
      enteredById:    operator.id,
      approvalStatus: "PENDING",
      approvalSource: "MANUAL",
      senderName:     "Sundarban Power",
      senderPhone:    "9830300002",
      createdAt:      d("2026-03-14T09:00:00Z"),
    },
  });

  console.log("Transactions created.");

  // -----------------------------------------------------------------------
  // 9. Approvals (10 mixed)
  // -----------------------------------------------------------------------

  // AP01 — PENDING: Transaction approval (idol advance)
  await prisma.approval.create({
    data: {
      entityType:    "TRANSACTION",
      entityId:      txn12.id,
      action:        "approve_transaction",
      previousData:  Prisma.JsonNull,
      newData:       { approvalStatus: "APPROVED" },
      requestedById: operator.id,
      status:        "PENDING",
      createdAt:     d("2026-03-10T14:05:00Z"),
    },
  });

  // AP02 — PENDING: Member add approval for new member
  await prisma.approval.create({
    data: {
      entityType:    "MEMBER_ADD",
      entityId:      memberRecord4.id,
      action:        "add_member",
      previousData:  Prisma.JsonNull,
      newData:       {
        name:    "Suchitra Ghosh",
        email:   "member4@dps.club",
        phone:   "9830000006",
        address: "99 Ballygunge Place, Kolkata 700019",
      },
      requestedById: operator.id,
      status:        "PENDING",
      createdAt:     d("2026-02-01T11:00:00Z"),
    },
  });

  // AP03 — PENDING: Membership approval
  await prisma.approval.create({
    data: {
      entityType:    "MEMBERSHIP",
      entityId:      memberRecord4.id,
      action:        "approve_membership",
      previousData:  Prisma.JsonNull,
      newData:       {
        memberId: memberRecord4.id,
        type:     "ANNUAL",
        amount:   "10000",
      },
      requestedById: operator.id,
      status:        "PENDING",
      createdAt:     d("2026-02-01T12:05:00Z"),
    },
  });

  // AP04 — APPROVED: Member 1 added
  await prisma.approval.create({
    data: {
      entityType:    "MEMBER_ADD",
      entityId:      memberRecord1.id,
      action:        "add_member",
      previousData:  Prisma.JsonNull,
      newData:       {
        name:    "Arijit Banerjee",
        email:   "member1@dps.club",
        phone:   "9830000003",
        address: "78 Lake Gardens, Kolkata 700045",
      },
      requestedById: operator.id,
      status:        "APPROVED",
      reviewedById:  admin.id,
      reviewedAt:    d("2026-01-15T09:00:00Z"),
      notes:         "Member verified and approved.",
      createdAt:     d("2026-01-14T17:00:00Z"),
    },
  });

  // AP05 — APPROVED: Title sponsor transaction
  await prisma.approval.create({
    data: {
      entityType:    "TRANSACTION",
      entityId:      txn5.id,
      action:        "approve_transaction",
      previousData:  Prisma.JsonNull,
      newData:       { approvalStatus: "APPROVED" },
      requestedById: operator.id,
      status:        "APPROVED",
      reviewedById:  admin.id,
      reviewedAt:    d("2026-02-01T09:05:00Z"),
      notes:         "Confirmed via Razorpay webhook and bank statement.",
      createdAt:     d("2026-02-01T08:58:00Z"),
    },
  });

  // AP06 — APPROVED: Member 2 added
  await prisma.approval.create({
    data: {
      entityType:    "MEMBER_ADD",
      entityId:      memberRecord2.id,
      action:        "add_member",
      previousData:  Prisma.JsonNull,
      newData:       {
        name:    "Priya Sen",
        email:   "member2@dps.club",
        phone:   "9830000004",
        address: "22 Tollygunge, Kolkata 700033",
      },
      requestedById: operator.id,
      status:        "APPROVED",
      reviewedById:  admin.id,
      reviewedAt:    d("2026-01-20T13:00:00Z"),
      notes:         "Approved — documents verified.",
      createdAt:     d("2026-01-19T16:00:00Z"),
    },
  });

  // AP07 — APPROVED: Member edit — address update for Member 1
  await prisma.approval.create({
    data: {
      entityType:    "MEMBER_EDIT",
      entityId:      memberRecord1.id,
      action:        "edit_member",
      previousData:  { address: "78 Lake Gardens, Kolkata 700045" },
      newData:       { address: "78A Lake Gardens, Flat 3B, Kolkata 700045" },
      requestedById: operator.id,
      status:        "APPROVED",
      reviewedById:  admin.id,
      reviewedAt:    d("2026-02-15T11:00:00Z"),
      createdAt:     d("2026-02-14T15:00:00Z"),
    },
  });

  // AP08 — APPROVED: Application fee approved for Member 5
  await prisma.approval.create({
    data: {
      entityType:    "MEMBERSHIP",
      entityId:      memberRecord5.id,
      action:        "approve_membership",
      previousData:  Prisma.JsonNull,
      newData:       { memberId: memberRecord5.id, type: "ANNUAL", amount: "10000" },
      requestedById: operator.id,
      status:        "APPROVED",
      reviewedById:  admin.id,
      reviewedAt:    d("2026-01-10T09:05:00Z"),
      notes:         "Razorpay payment confirmed.",
      createdAt:     d("2026-01-10T09:00:00Z"),
    },
  });

  // AP09 — REJECTED: Member delete request (rejected)
  await prisma.approval.create({
    data: {
      entityType:    "MEMBER_DELETE",
      entityId:      memberRecord3.id,
      action:        "delete_member",
      previousData:  {
        name:    "Debashis Roy",
        email:   "member3@dps.club",
        status:  "EXPIRED",
      },
      newData:       Prisma.JsonNull,
      requestedById: operator.id,
      status:        "REJECTED",
      reviewedById:  admin.id,
      reviewedAt:    d("2026-02-20T10:00:00Z"),
      notes:         "Cannot delete — member has active audit records.",
      createdAt:     d("2026-02-19T17:00:00Z"),
    },
  });

  // AP10 — REJECTED: Transaction rejected (T22 equivalent)
  await prisma.approval.create({
    data: {
      entityType:    "TRANSACTION",
      entityId:      txn3.id,
      action:        "approve_transaction",
      previousData:  Prisma.JsonNull,
      newData:       { approvalStatus: "REJECTED", notes: "Insufficient vouchers." },
      requestedById: operator.id,
      status:        "REJECTED",
      reviewedById:  admin.id,
      reviewedAt:    d("2026-03-11T14:05:00Z"),
      notes:         "Rejected — no supporting documentation provided.",
      createdAt:     d("2026-03-11T12:10:00Z"),
    },
  });

  console.log("Approvals created.");

  // -----------------------------------------------------------------------
  // 10. Audit Log (approved transactions only)
  // -----------------------------------------------------------------------

  const approvedTransactions = await prisma.transaction.findMany({
    where: { approvalStatus: "APPROVED" },
    orderBy: [{ approvedAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      type: true,
      category: true,
      amount: true,
      paymentMode: true,
      description: true,
      sponsorPurpose: true,
      approvalStatus: true,
      approvalSource: true,
      enteredById: true,
      approvedById: true,
      approvedAt: true,
      razorpayPaymentId: true,
      razorpayOrderId: true,
      senderName: true,
      senderPhone: true,
      senderUpiId: true,
      senderBankAccount: true,
      senderBankName: true,
      receiptNumber: true,
      memberId: true,
      sponsorId: true,
      createdAt: true,
    },
  });

  const auditEntries: Prisma.AuditLogCreateInput[] = approvedTransactions.map((transaction) => ({
    transaction: { connect: { id: transaction.id } },
    transactionSnapshot: buildAuditSnapshot(transaction),
    performedBy: {
      connect: { id: transaction.approvedById ?? transaction.enteredById },
    },
    createdAt: transaction.approvedAt ?? transaction.createdAt,
  }));

  for (const entry of auditEntries) {
    await prisma.auditLog.create({ data: entry });
  }

  console.log(`Audit log entries created (${auditEntries.length} approved transactions).`);

  // -----------------------------------------------------------------------
  // 11. Activity Log (20 entries)
  // -----------------------------------------------------------------------

  const activityEntries: Prisma.ActivityLogCreateInput[] = [
    {
      user:        { connect: { id: admin.id } },
      action:      "LOGIN",
      description: "Admin logged in from 192.168.1.1",
      metadata:    { ip: "192.168.1.1", userAgent: "Mozilla/5.0" },
      createdAt:   d("2026-03-15T09:00:00Z"),
    },
    {
      user:        { connect: { id: operator.id } },
      action:      "LOGIN",
      description: "Operator logged in from 192.168.1.5",
      metadata:    { ip: "192.168.1.5", userAgent: "Mozilla/5.0" },
      createdAt:   d("2026-03-15T09:10:00Z"),
    },
    {
      user:        { connect: { id: admin.id } },
      action:      "MEMBER_CREATED",
      description: "New member added: Arijit Banerjee (DPC-2026-0003-00)",
      metadata:    { memberId: member1.id, memberCode: "DPC-2026-0003-00" },
      createdAt:   d("2026-01-15T09:00:00Z"),
    },
    {
      user:        { connect: { id: operator.id } },
      action:      "MEMBER_CREATED",
      description: "New member added: Priya Sen (DPC-2026-0004-00)",
      metadata:    { memberId: member2.id, memberCode: "DPC-2026-0004-00" },
      createdAt:   d("2026-01-20T13:45:00Z"),
    },
    {
      user:        { connect: { id: admin.id } },
      action:      "TRANSACTION_CREATED",
      description: "Transaction created: APPLICATION_FEE ₹10,000 — Arijit Banerjee",
      metadata:    { transactionId: txn1.id, amount: 10000, category: "APPLICATION_FEE" },
      createdAt:   d("2026-01-15T10:28:00Z"),
    },
    {
      user:        { connect: { id: admin.id } },
      action:      "APPROVAL_APPROVED",
      description: "Transaction approved: Membership fee ₹3,000 — Arijit Banerjee",
      metadata:    { transactionId: txn2.id, amount: 3000 },
      createdAt:   d("2026-01-15T10:35:00Z"),
    },
    {
      user:        { connect: { id: admin.id } },
      action:      "PAYMENT_RECEIVED",
      description: "Razorpay payment received: ₹5,00,000 — Balaram Das & Sons (Title Sponsor)",
      metadata:    { transactionId: txn5.id, razorpayPaymentId: "pay_QP123456789005", amount: 500000 },
      createdAt:   d("2026-02-01T08:52:00Z"),
    },
    {
      user:        { connect: { id: admin.id } },
      action:      "APPROVAL_APPROVED",
      description: "Sponsorship payment approved: ₹5,00,000 — Balaram Das & Sons",
      metadata:    { transactionId: txn5.id, sponsorId: sponsor1.id },
      createdAt:   d("2026-02-01T09:00:00Z"),
    },
    {
      user:        { connect: { id: operator.id } },
      action:      "TRANSACTION_CREATED",
      description: "Expense recorded: Pandal decoration ₹45,000",
      metadata:    { transactionId: txn12.id, amount: 45000, category: "EXPENSE" },
      createdAt:   d("2026-02-28T17:00:00Z"),
    },
    {
      user:        { connect: { id: admin.id } },
      action:      "APPROVAL_APPROVED",
      description: "Expense approved: Pandal decoration ₹45,000",
      metadata:    { transactionId: txn12.id },
      createdAt:   d("2026-03-01T10:00:00Z"),
    },
    {
      user:        { connect: { id: member1.id } },
      action:      "LOGIN",
      description: "Member logged in: Arijit Banerjee",
      metadata:    { ip: "192.168.1.10" },
      createdAt:   d("2026-03-14T18:30:00Z"),
    },
    {
      user:        { connect: { id: admin.id } },
      action:      "PASSWORD_CHANGED",
      description: "Password changed for user: Subhash Mukherjee",
      metadata:    { userId: admin.id },
      createdAt:   d("2026-01-01T08:30:00Z"),
    },
    {
      user:        { connect: { id: admin.id } },
      action:      "APPROVAL_REJECTED",
      description: "Member delete rejected: Debashis Roy — active audit records",
      metadata:    { memberId: member3.id, reason: "Active audit records exist" },
      createdAt:   d("2026-02-20T10:00:00Z"),
    },
    {
      user:        { connect: { id: operator.id } },
      action:      "MEMBER_CREATED",
      description: "New member added: Kaushik Dey (DPC-2026-0007-00)",
      metadata:    { memberId: member5.id, memberCode: "DPC-2026-0007-00" },
      createdAt:   d("2026-01-10T08:30:00Z"),
    },
    {
      user:        { connect: { id: admin.id } },
      action:      "PAYMENT_RECEIVED",
      description: "Razorpay payment received: ₹10,000 — Kaushik Dey (Application Fee)",
      metadata:    { transactionId: txn5.id, amount: 10000 },
      createdAt:   d("2026-01-10T09:00:00Z"),
    },
    {
      user:        { connect: { id: member2.id } },
      action:      "LOGIN",
      description: "Member logged in: Priya Sen",
      metadata:    { ip: "10.0.0.5" },
      createdAt:   d("2026-03-15T10:00:00Z"),
    },
    {
      user:        { connect: { id: admin.id } },
      action:      "SPONSOR_CREATED",
      description: "Sponsor created: Balaram Das & Sons (TITLE_SPONSOR)",
      metadata:    { sponsorId: sponsor1.id, purpose: "TITLE_SPONSOR" },
      createdAt:   d("2026-01-25T13:55:00Z"),
    },
    {
      user:        { connect: { id: admin.id } },
      action:      "SPONSOR_LINK_CREATED",
      description: "Sponsor payment link generated for Balaram Das & Sons",
      metadata:    { sponsorId: sponsor1.id, token: "sl_balaram_title_2026_abc123def456" },
      createdAt:   d("2026-01-25T14:00:00Z"),
    },
    {
      user:        { connect: { id: admin.id } },
      action:      "MEMBERSHIP_EXPIRED",
      description: "Membership expired for Debashis Roy (DPC-2026-0005-00)",
      metadata:    { memberId: member3.id, expiredAt: "2026-01-01" },
      createdAt:   d("2026-01-01T00:05:00Z"),
    },
    {
      user:        { connect: { id: operator.id } },
      action:      "TRANSACTION_CREATED",
      description: "Pending expense submitted: Generator advance ₹8,500",
      metadata:    { amount: 8500, category: "EXPENSE", status: "PENDING" },
      createdAt:   d("2026-03-14T09:00:00Z"),
    },
  ];

  for (const entry of activityEntries) {
    await prisma.activityLog.create({ data: entry });
  }

  console.log("Activity log entries created.");
  console.log("\nDatabase seeded successfully.");
  console.log("\nTest accounts:");
  console.log("  admin@dps.club         / Admin@123");
  console.log("  operator@dps.club      / Operator@123");
  console.log("  member1@dps.club       / Member@123  (active, annual, 3 sub-members)");
  console.log("  member2@dps.club       / Member@123  (active, half-yearly, 2 sub-members)");
  console.log("  member3@dps.club       / Member@123  (expired)");
  console.log("  member4@dps.club       / Member@123  (pending payment)");
  console.log("  member5@dps.club       / Member@123  (active, annual, 1 sub-member)");
  console.log("  mitali.banerjee@dps.club / SubMember@123  (spouse of member1)");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
