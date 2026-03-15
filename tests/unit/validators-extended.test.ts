/**
 * T34 — Additional unit tests for validators.ts
 *
 * Covers schemas not yet tested in existing test files:
 *   - createMemberSchema
 *   - updateMemberSchema
 *   - createSubMemberSchema / updateSubMemberSchema / deleteSubMemberSchema
 *   - memberListQuerySchema
 *   - approvalActionSchema / approvalListQuerySchema
 *   - createSponsorSchema / updateSponsorSchema / sponsorListQuerySchema
 *   - createSponsorLinkSchema (with bankDetailsSchema)
 *   - sponsorLinkListQuerySchema
 *   - auditLogQuerySchema / activityLogQuerySchema
 *   - membershipListQuerySchema
 */

import { describe, it, expect } from "vitest";
import {
  createMemberSchema,
  updateMemberSchema,
  createSubMemberSchema,
  updateSubMemberSchema,
  deleteSubMemberSchema,
  memberListQuerySchema,
  approvalActionSchema,
  approvalListQuerySchema,
  createSponsorSchema,
  updateSponsorSchema,
  sponsorListQuerySchema,
  createSponsorLinkSchema,
  sponsorLinkListQuerySchema,
  auditLogQuerySchema,
  activityLogQuerySchema,
  membershipListQuerySchema,
} from "@/lib/validators";

// ---------------------------------------------------------------------------
// createMemberSchema
// ---------------------------------------------------------------------------

describe("createMemberSchema", () => {
  const valid = {
    name: "Arpita Sen",
    email: "arpita@example.com",
    phone: "+919876543210",
    address: "12A, Deshapriya Park, Kolkata 700026",
  };

  it("accepts a fully valid member payload", () => {
    expect(createMemberSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects missing name", () => {
    const { name: _, ...rest } = valid;
    expect(createMemberSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects empty name", () => {
    expect(createMemberSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
  });

  it("rejects name exceeding 255 characters", () => {
    expect(
      createMemberSchema.safeParse({ ...valid, name: "a".repeat(256) }).success
    ).toBe(false);
  });

  it("accepts name exactly 255 characters", () => {
    expect(
      createMemberSchema.safeParse({ ...valid, name: "a".repeat(255) }).success
    ).toBe(true);
  });

  it("rejects invalid email", () => {
    expect(
      createMemberSchema.safeParse({ ...valid, email: "not-an-email" }).success
    ).toBe(false);
  });

  it("rejects phone without +91 prefix", () => {
    expect(
      createMemberSchema.safeParse({ ...valid, phone: "9876543210" }).success
    ).toBe(false);
  });

  it("rejects phone with too few digits", () => {
    expect(
      createMemberSchema.safeParse({ ...valid, phone: "+91987654321" }).success
    ).toBe(false);
  });

  it("rejects phone with too many digits", () => {
    expect(
      createMemberSchema.safeParse({ ...valid, phone: "+9198765432100" }).success
    ).toBe(false);
  });

  it("rejects empty address", () => {
    expect(
      createMemberSchema.safeParse({ ...valid, address: "" }).success
    ).toBe(false);
  });

  it("rejects missing email", () => {
    const { email: _, ...rest } = valid;
    expect(createMemberSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing phone", () => {
    const { phone: _, ...rest } = valid;
    expect(createMemberSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing address", () => {
    const { address: _, ...rest } = valid;
    expect(createMemberSchema.safeParse(rest).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateMemberSchema
// ---------------------------------------------------------------------------

describe("updateMemberSchema", () => {
  it("accepts an empty object (all fields optional)", () => {
    expect(updateMemberSchema.safeParse({}).success).toBe(true);
  });

  it("accepts partial update with only name", () => {
    expect(updateMemberSchema.safeParse({ name: "New Name" }).success).toBe(true);
  });

  it("accepts partial update with only phone", () => {
    expect(updateMemberSchema.safeParse({ phone: "+919876543210" }).success).toBe(true);
  });

  it("accepts partial update with only email", () => {
    expect(
      updateMemberSchema.safeParse({ email: "new@example.com" }).success
    ).toBe(true);
  });

  it("rejects invalid phone format when phone is provided", () => {
    expect(
      updateMemberSchema.safeParse({ phone: "9876543210" }).success
    ).toBe(false);
  });

  it("rejects invalid email when email is provided", () => {
    expect(
      updateMemberSchema.safeParse({ email: "bad-email" }).success
    ).toBe(false);
  });

  it("rejects empty address string when address is provided", () => {
    expect(
      updateMemberSchema.safeParse({ address: "" }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createSubMemberSchema
// ---------------------------------------------------------------------------

describe("createSubMemberSchema", () => {
  const valid = {
    name: "Subha Sen",
    email: "subha@example.com",
    phone: "+919876543211",
    relation: "Spouse",
  };

  it("accepts a valid sub-member payload", () => {
    expect(createSubMemberSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects missing relation", () => {
    const { relation: _, ...rest } = valid;
    expect(createSubMemberSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects empty relation", () => {
    expect(
      createSubMemberSchema.safeParse({ ...valid, relation: "" }).success
    ).toBe(false);
  });

  it("rejects relation exceeding 100 characters", () => {
    expect(
      createSubMemberSchema.safeParse({ ...valid, relation: "a".repeat(101) }).success
    ).toBe(false);
  });

  it("accepts relation exactly 100 characters", () => {
    expect(
      createSubMemberSchema.safeParse({ ...valid, relation: "a".repeat(100) }).success
    ).toBe(true);
  });

  it("rejects invalid phone format", () => {
    expect(
      createSubMemberSchema.safeParse({ ...valid, phone: "9876543211" }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateSubMemberSchema
// ---------------------------------------------------------------------------

describe("updateSubMemberSchema", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("requires subMemberId", () => {
    expect(updateSubMemberSchema.safeParse({}).success).toBe(false);
  });

  it("accepts just subMemberId with no other fields", () => {
    expect(
      updateSubMemberSchema.safeParse({ subMemberId: validUUID }).success
    ).toBe(true);
  });

  it("rejects non-UUID subMemberId", () => {
    expect(
      updateSubMemberSchema.safeParse({ subMemberId: "not-a-uuid" }).success
    ).toBe(false);
  });

  it("accepts canLogin boolean", () => {
    expect(
      updateSubMemberSchema.safeParse({ subMemberId: validUUID, canLogin: true }).success
    ).toBe(true);
  });

  it("rejects canLogin as string", () => {
    expect(
      updateSubMemberSchema.safeParse({ subMemberId: validUUID, canLogin: "yes" as unknown as boolean }).success
    ).toBe(false);
  });

  it("accepts all optional fields together", () => {
    expect(
      updateSubMemberSchema.safeParse({
        subMemberId: validUUID,
        name: "Updated Name",
        email: "updated@example.com",
        phone: "+919876543212",
        relation: "Child",
        canLogin: false,
      }).success
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// deleteSubMemberSchema
// ---------------------------------------------------------------------------

describe("deleteSubMemberSchema", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("accepts valid UUID", () => {
    expect(deleteSubMemberSchema.safeParse({ subMemberId: validUUID }).success).toBe(true);
  });

  it("rejects missing subMemberId", () => {
    expect(deleteSubMemberSchema.safeParse({}).success).toBe(false);
  });

  it("rejects non-UUID subMemberId", () => {
    expect(
      deleteSubMemberSchema.safeParse({ subMemberId: "not-a-uuid" }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// memberListQuerySchema
// ---------------------------------------------------------------------------

describe("memberListQuerySchema", () => {
  it("accepts empty object with defaults applied", () => {
    const result = memberListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it("accepts valid status filter ACTIVE", () => {
    expect(
      memberListQuerySchema.safeParse({ status: "ACTIVE" }).success
    ).toBe(true);
  });

  it("accepts valid status filter PENDING_APPROVAL", () => {
    expect(
      memberListQuerySchema.safeParse({ status: "PENDING_APPROVAL" }).success
    ).toBe(true);
  });

  it("accepts valid status filter PENDING_PAYMENT", () => {
    expect(
      memberListQuerySchema.safeParse({ status: "PENDING_PAYMENT" }).success
    ).toBe(true);
  });

  it("accepts valid status filter EXPIRED", () => {
    expect(
      memberListQuerySchema.safeParse({ status: "EXPIRED" }).success
    ).toBe(true);
  });

  it("accepts valid status filter SUSPENDED", () => {
    expect(
      memberListQuerySchema.safeParse({ status: "SUSPENDED" }).success
    ).toBe(true);
  });

  it("rejects invalid status", () => {
    expect(
      memberListQuerySchema.safeParse({ status: "DELETED" }).success
    ).toBe(false);
  });

  it("accepts string page and limit via coerce", () => {
    const result = memberListQuerySchema.safeParse({ page: "2", limit: "50" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(50);
    }
  });

  it("rejects page less than 1", () => {
    expect(memberListQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });

  it("rejects limit greater than 100", () => {
    expect(memberListQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("accepts optional search param", () => {
    expect(
      memberListQuerySchema.safeParse({ search: "Arpita" }).success
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// approvalActionSchema
// ---------------------------------------------------------------------------

describe("approvalActionSchema", () => {
  it("accepts empty object (notes optional)", () => {
    expect(approvalActionSchema.safeParse({}).success).toBe(true);
  });

  it("accepts notes string", () => {
    expect(
      approvalActionSchema.safeParse({ notes: "Approved after review" }).success
    ).toBe(true);
  });

  it("rejects notes exceeding 1000 characters", () => {
    expect(
      approvalActionSchema.safeParse({ notes: "a".repeat(1001) }).success
    ).toBe(false);
  });

  it("accepts notes exactly 1000 characters", () => {
    expect(
      approvalActionSchema.safeParse({ notes: "a".repeat(1000) }).success
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// approvalListQuerySchema
// ---------------------------------------------------------------------------

describe("approvalListQuerySchema", () => {
  it("accepts empty object with defaults", () => {
    const result = approvalListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it("accepts entityType TRANSACTION", () => {
    expect(
      approvalListQuerySchema.safeParse({ entityType: "TRANSACTION" }).success
    ).toBe(true);
  });

  it("accepts entityType MEMBER_ADD", () => {
    expect(
      approvalListQuerySchema.safeParse({ entityType: "MEMBER_ADD" }).success
    ).toBe(true);
  });

  it("accepts entityType MEMBER_EDIT", () => {
    expect(
      approvalListQuerySchema.safeParse({ entityType: "MEMBER_EDIT" }).success
    ).toBe(true);
  });

  it("accepts entityType MEMBER_DELETE", () => {
    expect(
      approvalListQuerySchema.safeParse({ entityType: "MEMBER_DELETE" }).success
    ).toBe(true);
  });

  it("accepts entityType MEMBERSHIP", () => {
    expect(
      approvalListQuerySchema.safeParse({ entityType: "MEMBERSHIP" }).success
    ).toBe(true);
  });

  it("rejects invalid entityType", () => {
    expect(
      approvalListQuerySchema.safeParse({ entityType: "PUJA_CONTRIBUTION" }).success
    ).toBe(false);
  });

  it("accepts status PENDING", () => {
    expect(approvalListQuerySchema.safeParse({ status: "PENDING" }).success).toBe(true);
  });

  it("accepts status APPROVED", () => {
    expect(approvalListQuerySchema.safeParse({ status: "APPROVED" }).success).toBe(true);
  });

  it("accepts status REJECTED", () => {
    expect(approvalListQuerySchema.safeParse({ status: "REJECTED" }).success).toBe(true);
  });

  it("rejects invalid status", () => {
    expect(approvalListQuerySchema.safeParse({ status: "CANCELLED" }).success).toBe(false);
  });

  it("accepts dateFrom and dateTo as strings", () => {
    expect(
      approvalListQuerySchema.safeParse({
        dateFrom: "2026-01-01",
        dateTo: "2026-12-31",
      }).success
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createSponsorSchema
// ---------------------------------------------------------------------------

describe("createSponsorSchema", () => {
  const valid = {
    name: "Tata Consultancy Services",
    phone: "+919000000001",
    email: "sponsor@tcs.com",
  };

  it("accepts minimal valid sponsor payload", () => {
    expect(createSponsorSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts with optional company field", () => {
    expect(
      createSponsorSchema.safeParse({ ...valid, company: "TCS Ltd." }).success
    ).toBe(true);
  });

  it("accepts null company", () => {
    expect(
      createSponsorSchema.safeParse({ ...valid, company: null }).success
    ).toBe(true);
  });

  it("rejects company exceeding 255 characters", () => {
    expect(
      createSponsorSchema.safeParse({ ...valid, company: "x".repeat(256) }).success
    ).toBe(false);
  });

  it("rejects invalid email", () => {
    expect(
      createSponsorSchema.safeParse({ ...valid, email: "not-email" }).success
    ).toBe(false);
  });

  it("rejects missing name", () => {
    const { name: _, ...rest } = valid;
    expect(createSponsorSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects phone not in +91XXXXXXXXXX format", () => {
    expect(
      createSponsorSchema.safeParse({ ...valid, phone: "09000000001" }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateSponsorSchema
// ---------------------------------------------------------------------------

describe("updateSponsorSchema", () => {
  it("accepts empty object (all fields optional)", () => {
    expect(updateSponsorSchema.safeParse({}).success).toBe(true);
  });

  it("accepts partial update with only company", () => {
    expect(
      updateSponsorSchema.safeParse({ company: "New Company Ltd." }).success
    ).toBe(true);
  });

  it("rejects invalid email when provided", () => {
    expect(
      updateSponsorSchema.safeParse({ email: "bad" }).success
    ).toBe(false);
  });

  it("rejects invalid phone when provided", () => {
    expect(
      updateSponsorSchema.safeParse({ phone: "9123456789" }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sponsorListQuerySchema
// ---------------------------------------------------------------------------

describe("sponsorListQuerySchema", () => {
  it("accepts empty object with defaults", () => {
    const result = sponsorListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it("accepts search string", () => {
    expect(sponsorListQuerySchema.safeParse({ search: "TCS" }).success).toBe(true);
  });

  it("accepts custom page and limit", () => {
    const result = sponsorListQuerySchema.safeParse({ page: "3", limit: "10" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.limit).toBe(10);
    }
  });

  it("rejects limit over 100", () => {
    expect(sponsorListQuerySchema.safeParse({ limit: "200" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createSponsorLinkSchema (includes bankDetailsSchema)
// ---------------------------------------------------------------------------

describe("createSponsorLinkSchema", () => {
  const valid = {
    upiId: "tcs@okaxis",
    sponsorPurpose: "TITLE_SPONSOR" as const,
  };

  it("accepts minimal valid sponsor link (just upiId + sponsorPurpose)", () => {
    expect(createSponsorLinkSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts with optional amount", () => {
    expect(
      createSponsorLinkSchema.safeParse({ ...valid, amount: 50000 }).success
    ).toBe(true);
  });

  it("accepts null amount (open-ended)", () => {
    expect(
      createSponsorLinkSchema.safeParse({ ...valid, amount: null }).success
    ).toBe(true);
  });

  it("rejects negative amount", () => {
    expect(
      createSponsorLinkSchema.safeParse({ ...valid, amount: -100 }).success
    ).toBe(false);
  });

  it("rejects zero amount", () => {
    expect(
      createSponsorLinkSchema.safeParse({ ...valid, amount: 0 }).success
    ).toBe(false);
  });

  it("rejects empty upiId", () => {
    expect(
      createSponsorLinkSchema.safeParse({ ...valid, upiId: "" }).success
    ).toBe(false);
  });

  it("rejects missing sponsorPurpose", () => {
    const { sponsorPurpose: _, ...rest } = valid;
    expect(createSponsorLinkSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects invalid sponsorPurpose", () => {
    expect(
      createSponsorLinkSchema.safeParse({ ...valid, sponsorPurpose: "INVALID_SPONSOR" }).success
    ).toBe(false);
  });

  it("accepts all valid sponsorPurpose values", () => {
    const purposes = [
      "TITLE_SPONSOR",
      "GOLD_SPONSOR",
      "SILVER_SPONSOR",
      "FOOD_PARTNER",
      "MEDIA_PARTNER",
      "STALL_VENDOR",
      "MARKETING_PARTNER",
    ] as const;
    for (const purpose of purposes) {
      expect(
        createSponsorLinkSchema.safeParse({ ...valid, sponsorPurpose: purpose }).success
      ).toBe(true);
    }
  });

  it("accepts valid expiresAt ISO date string", () => {
    expect(
      createSponsorLinkSchema.safeParse({
        ...valid,
        expiresAt: "2026-12-31T23:59:59Z",
      }).success
    ).toBe(true);
  });

  it("rejects non-date expiresAt string", () => {
    expect(
      createSponsorLinkSchema.safeParse({
        ...valid,
        expiresAt: "not-a-date",
      }).success
    ).toBe(false);
  });

  it("accepts valid bankDetails with all fields", () => {
    expect(
      createSponsorLinkSchema.safeParse({
        ...valid,
        bankDetails: {
          accountNumber: "123456789012",
          bankName: "State Bank of India",
          ifscCode: "SBIN0001234",
        },
      }).success
    ).toBe(true);
  });

  it("rejects bankDetails with invalid IFSC code format", () => {
    expect(
      createSponsorLinkSchema.safeParse({
        ...valid,
        bankDetails: {
          ifscCode: "INVALID",
        },
      }).success
    ).toBe(false);
  });

  it("accepts IFSC code in correct XXXX0XXXXXX format", () => {
    expect(
      createSponsorLinkSchema.safeParse({
        ...valid,
        bankDetails: {
          ifscCode: "HDFC0001234",
        },
      }).success
    ).toBe(true);
  });

  it("accepts null bankDetails", () => {
    expect(
      createSponsorLinkSchema.safeParse({ ...valid, bankDetails: null }).success
    ).toBe(true);
  });

  it("accepts optional sponsorId as UUID", () => {
    expect(
      createSponsorLinkSchema.safeParse({
        ...valid,
        sponsorId: "550e8400-e29b-41d4-a716-446655440000",
      }).success
    ).toBe(true);
  });

  it("rejects non-UUID sponsorId", () => {
    expect(
      createSponsorLinkSchema.safeParse({
        ...valid,
        sponsorId: "not-a-uuid",
      }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sponsorLinkListQuerySchema
// ---------------------------------------------------------------------------

describe("sponsorLinkListQuerySchema", () => {
  it("accepts empty object with defaults", () => {
    const result = sponsorLinkListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it("isActive=true transforms to boolean true", () => {
    const result = sponsorLinkListQuerySchema.safeParse({ isActive: "true" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(true);
    }
  });

  it("isActive=false transforms to boolean false", () => {
    const result = sponsorLinkListQuerySchema.safeParse({ isActive: "false" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(false);
    }
  });

  it("accepts valid sponsorId UUID", () => {
    expect(
      sponsorLinkListQuerySchema.safeParse({
        sponsorId: "550e8400-e29b-41d4-a716-446655440000",
      }).success
    ).toBe(true);
  });

  it("rejects invalid sponsorId", () => {
    expect(
      sponsorLinkListQuerySchema.safeParse({ sponsorId: "bad-id" }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// auditLogQuerySchema
// ---------------------------------------------------------------------------

describe("auditLogQuerySchema", () => {
  it("accepts empty object with defaults", () => {
    const result = auditLogQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it("accepts entityType string", () => {
    expect(
      auditLogQuerySchema.safeParse({ entityType: "User" }).success
    ).toBe(true);
  });

  it("rejects entityType exceeding 100 characters", () => {
    expect(
      auditLogQuerySchema.safeParse({ entityType: "x".repeat(101) }).success
    ).toBe(false);
  });

  it("accepts action string", () => {
    expect(auditLogQuerySchema.safeParse({ action: "CREATE" }).success).toBe(true);
  });

  it("accepts performedById as valid UUID", () => {
    expect(
      auditLogQuerySchema.safeParse({
        performedById: "550e8400-e29b-41d4-a716-446655440000",
      }).success
    ).toBe(true);
  });

  it("rejects non-UUID performedById", () => {
    expect(
      auditLogQuerySchema.safeParse({ performedById: "not-a-uuid" }).success
    ).toBe(false);
  });

  it("accepts dateFrom and dateTo", () => {
    expect(
      auditLogQuerySchema.safeParse({
        dateFrom: "2026-01-01",
        dateTo: "2026-03-31",
      }).success
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// activityLogQuerySchema
// ---------------------------------------------------------------------------

describe("activityLogQuerySchema", () => {
  it("accepts empty object with defaults", () => {
    const result = activityLogQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it("accepts userId as valid UUID", () => {
    expect(
      activityLogQuerySchema.safeParse({
        userId: "550e8400-e29b-41d4-a716-446655440000",
      }).success
    ).toBe(true);
  });

  it("rejects non-UUID userId", () => {
    expect(
      activityLogQuerySchema.safeParse({ userId: "bad-id" }).success
    ).toBe(false);
  });

  it("accepts action string", () => {
    expect(activityLogQuerySchema.safeParse({ action: "LOGIN" }).success).toBe(true);
  });

  it("rejects action exceeding 100 characters", () => {
    expect(
      activityLogQuerySchema.safeParse({ action: "a".repeat(101) }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// membershipListQuerySchema
// ---------------------------------------------------------------------------

describe("membershipListQuerySchema", () => {
  it("accepts empty object with defaults", () => {
    const result = membershipListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it("accepts valid memberId UUID", () => {
    expect(
      membershipListQuerySchema.safeParse({
        memberId: "550e8400-e29b-41d4-a716-446655440000",
      }).success
    ).toBe(true);
  });

  it("rejects non-UUID memberId", () => {
    expect(
      membershipListQuerySchema.safeParse({ memberId: "not-a-uuid" }).success
    ).toBe(false);
  });

  it("accepts status PENDING", () => {
    expect(membershipListQuerySchema.safeParse({ status: "PENDING" }).success).toBe(true);
  });

  it("accepts status APPROVED", () => {
    expect(membershipListQuerySchema.safeParse({ status: "APPROVED" }).success).toBe(true);
  });

  it("accepts status REJECTED", () => {
    expect(membershipListQuerySchema.safeParse({ status: "REJECTED" }).success).toBe(true);
  });

  it("rejects invalid status", () => {
    expect(
      membershipListQuerySchema.safeParse({ status: "ACTIVE" }).success
    ).toBe(false);
  });

  it("rejects limit over 100", () => {
    expect(membershipListQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("rejects page 0", () => {
    expect(membershipListQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });
});
