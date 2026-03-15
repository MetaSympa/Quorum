/**
 * Zod validation schemas for all DPS Dashboard API inputs.
 *
 * All phone numbers must be in +91XXXXXXXXXX format.
 * All amounts in INR decimal (not Razorpay paise).
 *
 * Usage:
 *   const result = createMemberSchema.safeParse(body);
 *   if (!result.success) return NextResponse.json({ error: "Validation failed", details: result.error.flatten() }, { status: 400 });
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// String sanitization
// ---------------------------------------------------------------------------

/**
 * Sanitize a string input by trimming whitespace and stripping ASCII control
 * characters (0x00–0x1F and 0x7F). Should be applied to all free-text
 * string inputs before storing to the database.
 *
 * @param input - Raw string from user input
 * @returns Sanitized string
 */
export function sanitizeString(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.trim().replace(/[\x00-\x1F\x7F]/g, "");
}

// ---------------------------------------------------------------------------
// Common field validators
// ---------------------------------------------------------------------------

const phoneSchema = z
  .string()
  .regex(/^\+91\d{10}$/, "Phone must be in +91XXXXXXXXXX format");

const emailSchema = z.string().email("Must be a valid email address");

const nameSchema = z
  .string()
  .min(1, "Name is required")
  .max(255, "Name must be 255 characters or less");

// ---------------------------------------------------------------------------
// Member schemas
// ---------------------------------------------------------------------------

/**
 * Validate POST /api/members body.
 */
export const createMemberSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  address: z.string().min(1, "Address is required"),
});

export type CreateMemberInput = z.infer<typeof createMemberSchema>;

/**
 * Validate PUT /api/members/[id] body.
 * All fields optional — at least one must be present (checked at route level).
 */
export const updateMemberSchema = z.object({
  name: nameSchema.optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  address: z.string().min(1, "Address is required").optional(),
});

export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

// ---------------------------------------------------------------------------
// Sub-member schemas
// ---------------------------------------------------------------------------

/**
 * Validate POST /api/members/[id]/sub-members body.
 */
export const createSubMemberSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  relation: z
    .string()
    .min(1, "Relation is required")
    .max(100, "Relation must be 100 characters or less"),
});

export type CreateSubMemberInput = z.infer<typeof createSubMemberSchema>;

/**
 * Validate PUT /api/members/[id]/sub-members body.
 * subMemberId is required to identify which sub-member to update.
 */
export const updateSubMemberSchema = z.object({
  subMemberId: z.string().uuid("subMemberId must be a valid UUID"),
  name: nameSchema.optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  relation: z
    .string()
    .min(1, "Relation is required")
    .max(100, "Relation must be 100 characters or less")
    .optional(),
  canLogin: z.boolean().optional(),
});

export type UpdateSubMemberInput = z.infer<typeof updateSubMemberSchema>;

/**
 * Validate DELETE /api/members/[id]/sub-members body.
 */
export const deleteSubMemberSchema = z.object({
  subMemberId: z.string().uuid("subMemberId must be a valid UUID"),
});

export type DeleteSubMemberInput = z.infer<typeof deleteSubMemberSchema>;

// ---------------------------------------------------------------------------
// Membership schemas
// ---------------------------------------------------------------------------

/**
 * Validate POST /api/memberships body.
 * Amount must exactly match the fee for the selected type.
 * isApplicationFee is optional — true only for first-time members.
 */
export const createMembershipSchema = z.object({
  memberId: z.string().uuid("memberId must be a valid UUID"),
  type: z.enum(["MONTHLY", "HALF_YEARLY", "ANNUAL"] as const, {
    message: "type must be one of MONTHLY, HALF_YEARLY, ANNUAL",
  }),
  /**
   * Amount in INR as a string representation of a Decimal.
   * Must exactly match the fee for the selected type (no partial payments).
   * If isApplicationFee is true, must equal type fee + ₹10,000.
   */
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "amount must be a valid decimal number"),
  isApplicationFee: z.boolean().optional().default(false),
});

export type CreateMembershipInput = z.infer<typeof createMembershipSchema>;

/**
 * Validate query params for GET /api/memberships.
 */
export const membershipListQuerySchema = z.object({
  memberId: z.string().uuid("memberId must be a valid UUID").optional(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type MembershipListQuery = z.infer<typeof membershipListQuerySchema>;

// ---------------------------------------------------------------------------
// Transaction schemas
// ---------------------------------------------------------------------------

const transactionTypeValues = ["CASH_IN", "CASH_OUT"] as const;
const transactionCategoryValues = [
  "MEMBERSHIP_FEE",
  "APPLICATION_FEE",
  "SPONSORSHIP",
  "EXPENSE",
  "OTHER",
] as const;
const paymentModeValues = ["UPI", "BANK_TRANSFER", "CASH"] as const;
const sponsorPurposeValues = [
  "TITLE_SPONSOR",
  "GOLD_SPONSOR",
  "SILVER_SPONSOR",
  "FOOD_PARTNER",
  "MEDIA_PARTNER",
  "STALL_VENDOR",
  "MARKETING_PARTNER",
] as const;
const approvalStatusValues = ["PENDING", "APPROVED", "REJECTED"] as const;

/**
 * Validate POST /api/transactions body.
 * sponsorPurpose is required when category=SPONSORSHIP.
 */
export const createTransactionSchema = z
  .object({
    type: z.enum(transactionTypeValues, {
      message: "type must be CASH_IN or CASH_OUT",
    }),
    category: z.enum(transactionCategoryValues, {
      message: "Invalid category",
    }),
    amount: z
      .number()
      .positive("amount must be a positive number")
      .multipleOf(0.01, "amount must have at most 2 decimal places"),
    paymentMode: z.enum(paymentModeValues, {
      message: "paymentMode must be UPI, BANK_TRANSFER, or CASH",
    }),
    description: z
      .string()
      .min(1, "description is required")
      .max(1000, "description must be 1000 characters or less"),
    sponsorPurpose: z.enum(sponsorPurposeValues).optional().nullable(),
    memberId: z
      .string()
      .uuid("memberId must be a valid UUID")
      .optional()
      .nullable(),
    sponsorId: z
      .string()
      .uuid("sponsorId must be a valid UUID")
      .optional()
      .nullable(),
    senderName: z
      .string()
      .max(255, "senderName must be 255 characters or less")
      .optional()
      .nullable(),
    senderPhone: z
      .string()
      .regex(/^\+91\d{10}$/, "senderPhone must be in +91XXXXXXXXXX format")
      .optional()
      .nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.category === "SPONSORSHIP" && !val.sponsorPurpose) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sponsorPurpose"],
        message: "sponsorPurpose is required when category is SPONSORSHIP",
      });
    }
  });

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

/**
 * Validate PUT /api/transactions/[id] body.
 * All fields optional. sponsorPurpose still required if category=SPONSORSHIP.
 */
export const updateTransactionSchema = z
  .object({
    type: z.enum(transactionTypeValues).optional(),
    category: z.enum(transactionCategoryValues).optional(),
    amount: z
      .number()
      .positive("amount must be a positive number")
      .multipleOf(0.01, "amount must have at most 2 decimal places")
      .optional(),
    paymentMode: z.enum(paymentModeValues).optional(),
    description: z
      .string()
      .min(1, "description is required")
      .max(1000, "description must be 1000 characters or less")
      .optional(),
    sponsorPurpose: z.enum(sponsorPurposeValues).optional().nullable(),
    memberId: z
      .string()
      .uuid("memberId must be a valid UUID")
      .optional()
      .nullable(),
    sponsorId: z
      .string()
      .uuid("sponsorId must be a valid UUID")
      .optional()
      .nullable(),
    senderName: z
      .string()
      .max(255, "senderName must be 255 characters or less")
      .optional()
      .nullable(),
    senderPhone: z
      .string()
      .regex(/^\+91\d{10}$/, "senderPhone must be in +91XXXXXXXXXX format")
      .optional()
      .nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.category === "SPONSORSHIP" && val.sponsorPurpose === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sponsorPurpose"],
        message: "sponsorPurpose is required when category is SPONSORSHIP",
      });
    }
  });

export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

/**
 * Validate query parameters for GET /api/transactions.
 */
export const transactionListQuerySchema = z.object({
  type: z.enum(transactionTypeValues).optional(),
  category: z.enum(transactionCategoryValues).optional(),
  paymentMode: z.enum(paymentModeValues).optional(),
  status: z.enum(approvalStatusValues).optional(),
  /** ISO date string e.g. "2026-01-01" */
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>;

// ---------------------------------------------------------------------------
// Auth schemas
// ---------------------------------------------------------------------------

/**
 * Common weak/trivial passwords that must be rejected regardless of length.
 * Checked against the lower-cased new password.
 */
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "qwertyuiop",
  "admin1234",
  "letmein1",
  "welcome1",
  "monkey123",
  "abc12345",
  "iloveyou1",
  "sunshine1",
]);

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(8, "Current password must be at least 8 characters"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters")
      .max(128, "New password must be 128 characters or less")
      .refine(
        (val) => !COMMON_PASSWORDS.has(val.toLowerCase()),
        "This password is too common — please choose a stronger password"
      ),
  })
  .superRefine((val, ctx) => {
    if (val.currentPassword === val.newPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newPassword"],
        message: "New password must be different from current password",
      });
    }
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ---------------------------------------------------------------------------
// Pagination + filter schemas
// ---------------------------------------------------------------------------

export const memberListQuerySchema = z.object({
  search: z.string().optional(),
  status: z
    .enum([
      "PENDING_APPROVAL",
      "PENDING_PAYMENT",
      "ACTIVE",
      "EXPIRED",
      "SUSPENDED",
    ])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type MemberListQuery = z.infer<typeof memberListQuerySchema>;

// ---------------------------------------------------------------------------
// Approval schemas
// ---------------------------------------------------------------------------

/**
 * Validate POST /api/approvals/[id]/approve and /api/approvals/[id]/reject body.
 */
export const approvalActionSchema = z.object({
  notes: z.string().max(1000, "Notes must be 1000 characters or less").optional(),
});

export type ApprovalActionInput = z.infer<typeof approvalActionSchema>;

/**
 * Validate GET /api/approvals query parameters.
 */
export const approvalListQuerySchema = z.object({
  entityType: z
    .enum([
      "TRANSACTION",
      "MEMBER_ADD",
      "MEMBER_EDIT",
      "MEMBER_DELETE",
      "MEMBERSHIP",
    ])
    .optional(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ApprovalListQuery = z.infer<typeof approvalListQuerySchema>;

// ---------------------------------------------------------------------------
// Razorpay payment schemas
// ---------------------------------------------------------------------------

/**
 * Validate POST /api/payments/create-order body.
 * memberId is the UUID of the Member record (not User.id).
 * membershipType is required for fee calculation.
 * isApplicationFee is optional (true only for first-time members adding the ₹10,000 fee).
 */
export const createOrderSchema = z.object({
  memberId: z.string().uuid("memberId must be a valid UUID"),
  membershipType: z.enum(["MONTHLY", "HALF_YEARLY", "ANNUAL"] as const, {
    message: "membershipType must be one of MONTHLY, HALF_YEARLY, ANNUAL",
  }),
  isApplicationFee: z.boolean().optional().default(false),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/**
 * Validate POST /api/payments/verify body.
 * All three Razorpay fields are required strings — passed directly from the
 * Razorpay client-side checkout handler.
 */
export const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1, "razorpay_order_id is required"),
  razorpay_payment_id: z.string().min(1, "razorpay_payment_id is required"),
  razorpay_signature: z.string().min(1, "razorpay_signature is required"),
});

export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

// ---------------------------------------------------------------------------
// Sponsor schemas
// ---------------------------------------------------------------------------

/**
 * Validate POST /api/sponsors body.
 */
export const createSponsorSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  email: emailSchema,
  company: z
    .string()
    .max(255, "company must be 255 characters or less")
    .optional()
    .nullable(),
});

export type CreateSponsorInput = z.infer<typeof createSponsorSchema>;

/**
 * Validate PUT /api/sponsors/[id] body.
 * All fields optional.
 */
export const updateSponsorSchema = z.object({
  name: nameSchema.optional(),
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
  company: z
    .string()
    .max(255, "company must be 255 characters or less")
    .optional()
    .nullable(),
});

export type UpdateSponsorInput = z.infer<typeof updateSponsorSchema>;

/**
 * Validate query params for GET /api/sponsors.
 */
export const sponsorListQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type SponsorListQuery = z.infer<typeof sponsorListQuerySchema>;

// ---------------------------------------------------------------------------
// Sponsor link schemas
// ---------------------------------------------------------------------------

/** Bank details JSON shape for sponsor links */
export const bankDetailsSchema = z
  .object({
    accountNumber: z
      .string()
      .max(30, "accountNumber must be 30 characters or less")
      .optional(),
    bankName: z
      .string()
      .max(100, "bankName must be 100 characters or less")
      .optional(),
    ifscCode: z
      .string()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "ifscCode must be in XXXX0XXXXXX format")
      .optional(),
  })
  .optional()
  .nullable();

/**
 * Validate POST /api/sponsor-links body.
 * sponsorPurpose is always required.
 * amount is optional (open-ended if omitted).
 * upiId is required.
 */
export const createSponsorLinkSchema = z.object({
  sponsorId: z.string().uuid("sponsorId must be a valid UUID").optional().nullable(),
  amount: z
    .number()
    .positive("amount must be a positive number")
    .multipleOf(0.01, "amount must have at most 2 decimal places")
    .optional()
    .nullable(),
  upiId: z
    .string()
    .min(1, "upiId is required")
    .max(255, "upiId must be 255 characters or less"),
  bankDetails: bankDetailsSchema,
  expiresAt: z
    .string()
    .refine(
      (val) => !isNaN(Date.parse(val)),
      "expiresAt must be a valid ISO date string"
    )
    .optional()
    .nullable(),
  sponsorPurpose: z.enum(
    [
      "TITLE_SPONSOR",
      "GOLD_SPONSOR",
      "SILVER_SPONSOR",
      "FOOD_PARTNER",
      "MEDIA_PARTNER",
      "STALL_VENDOR",
      "MARKETING_PARTNER",
    ] as const,
    { message: "Invalid sponsorPurpose" }
  ),
});

export type CreateSponsorLinkInput = z.infer<typeof createSponsorLinkSchema>;

/**
 * Validate GET /api/sponsor-links query parameters.
 */
export const sponsorLinkListQuerySchema = z.object({
  sponsorId: z.string().uuid("sponsorId must be a valid UUID").optional(),
  isActive: z
    .string()
    .transform((v) => v === "true")
    .pipe(z.boolean())
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type SponsorLinkListQuery = z.infer<typeof sponsorLinkListQuerySchema>;

// ---------------------------------------------------------------------------
// Audit log schemas
// ---------------------------------------------------------------------------

/**
 * Validate GET /api/audit-log query parameters.
 */
export const auditLogQuerySchema = z.object({
  category: z
    .enum([
      "MEMBERSHIP_FEE",
      "APPLICATION_FEE",
      "SPONSORSHIP",
      "EXPENSE",
      "OTHER",
    ] as const)
    .optional(),
  /** ISO date string e.g. "2026-01-01" */
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  performedById: z.string().uuid("performedById must be a valid UUID").optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

// ---------------------------------------------------------------------------
// Activity log schemas
// ---------------------------------------------------------------------------

/**
 * Validate GET /api/activity-log query parameters.
 */
export const activityLogQuerySchema = z.object({
  userId: z.string().uuid("userId must be a valid UUID").optional(),
  action: z.string().max(100).optional(),
  /** ISO date string e.g. "2026-01-01" */
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ActivityLogQuery = z.infer<typeof activityLogQuerySchema>;
