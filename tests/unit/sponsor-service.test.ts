/**
 * Unit tests for the Sponsor Service and related validator schemas.
 *
 * Uses vi.mock to mock Prisma and the audit helpers.
 * Tests cover:
 *   - Validator schemas (createSponsorSchema, updateSponsorSchema, sponsorListQuerySchema,
 *     createSponsorLinkSchema, sponsorLinkListQuerySchema)
 *   - Service functions with mocked Prisma (listSponsors, getSponsor, createSponsor,
 *     updateSponsor, deleteSponsor, generateSponsorLink, listSponsorLinks,
 *     deactivateSponsorLink, getPublicSponsorLink)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createSponsorSchema,
  updateSponsorSchema,
  sponsorListQuerySchema,
  createSponsorLinkSchema,
  sponsorLinkListQuerySchema,
} from "@/lib/validators";

// ---------------------------------------------------------------------------
// Validator tests
// ---------------------------------------------------------------------------

describe("createSponsorSchema", () => {
  const validSponsor = {
    name: "Ramesh Kumar",
    phone: "+919876543210",
    email: "ramesh@example.com",
  };

  it("accepts a minimal valid payload", () => {
    const result = createSponsorSchema.safeParse(validSponsor);
    expect(result.success).toBe(true);
  });

  it("accepts payload with company", () => {
    const result = createSponsorSchema.safeParse({
      ...validSponsor,
      company: "Kumar Industries",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.company).toBe("Kumar Industries");
    }
  });

  it("accepts null company", () => {
    const result = createSponsorSchema.safeParse({
      ...validSponsor,
      company: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing name", () => {
    const { name: _, ...rest } = validSponsor;
    const result = createSponsorSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = createSponsorSchema.safeParse({ ...validSponsor, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 255 characters", () => {
    const result = createSponsorSchema.safeParse({
      ...validSponsor,
      name: "x".repeat(256),
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing email", () => {
    const { email: _, ...rest } = validSponsor;
    const result = createSponsorSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = createSponsorSchema.safeParse({
      ...validSponsor,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing phone", () => {
    const { phone: _, ...rest } = validSponsor;
    const result = createSponsorSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects phone without +91 prefix", () => {
    const result = createSponsorSchema.safeParse({
      ...validSponsor,
      phone: "9876543210",
    });
    expect(result.success).toBe(false);
  });

  it("rejects phone with wrong digit count", () => {
    const result = createSponsorSchema.safeParse({
      ...validSponsor,
      phone: "+9198765432", // 9 digits instead of 10
    });
    expect(result.success).toBe(false);
  });

  it("rejects company longer than 255 characters", () => {
    const result = createSponsorSchema.safeParse({
      ...validSponsor,
      company: "x".repeat(256),
    });
    expect(result.success).toBe(false);
  });
});

describe("updateSponsorSchema", () => {
  it("accepts empty object (all fields optional)", () => {
    const result = updateSponsorSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial update with only name", () => {
    const result = updateSponsorSchema.safeParse({ name: "New Name" });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with only email", () => {
    const result = updateSponsorSchema.safeParse({ email: "new@example.com" });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with only phone", () => {
    const result = updateSponsorSchema.safeParse({ phone: "+919876543210" });
    expect(result.success).toBe(true);
  });

  it("accepts null company", () => {
    const result = updateSponsorSchema.safeParse({ company: null });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email in update", () => {
    const result = updateSponsorSchema.safeParse({ email: "bad" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid phone in update", () => {
    const result = updateSponsorSchema.safeParse({ phone: "1234" });
    expect(result.success).toBe(false);
  });
});

describe("sponsorListQuerySchema", () => {
  it("accepts empty params with defaults", () => {
    const result = sponsorListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
      expect(result.data.search).toBeUndefined();
    }
  });

  it("accepts search string", () => {
    const result = sponsorListQuerySchema.safeParse({ search: "Kumar" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.search).toBe("Kumar");
    }
  });

  it("coerces page and limit from strings", () => {
    const result = sponsorListQuerySchema.safeParse({ page: "3", limit: "50" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.limit).toBe(50);
    }
  });

  it("rejects page < 1", () => {
    const result = sponsorListQuerySchema.safeParse({ page: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects limit > 100", () => {
    const result = sponsorListQuerySchema.safeParse({ limit: "200" });
    expect(result.success).toBe(false);
  });
});

describe("createSponsorLinkSchema", () => {
  const validLink = {
    upiId: "club@upi",
    sponsorPurpose: "TITLE_SPONSOR",
  };

  it("accepts minimal valid payload", () => {
    const result = createSponsorLinkSchema.safeParse(validLink);
    expect(result.success).toBe(true);
  });

  it("accepts full payload with all optional fields", () => {
    const result = createSponsorLinkSchema.safeParse({
      ...validLink,
      sponsorId: "550e8400-e29b-41d4-a716-446655440000",
      amount: 50000,
      expiresAt: "2026-12-31T23:59:59Z",
      bankDetails: {
        accountNumber: "1234567890",
        bankName: "SBI",
        ifscCode: "SBIN0001234",
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts null sponsorId", () => {
    const result = createSponsorLinkSchema.safeParse({
      ...validLink,
      sponsorId: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts null amount (open-ended)", () => {
    const result = createSponsorLinkSchema.safeParse({
      ...validLink,
      amount: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing upiId", () => {
    const { upiId: _, ...rest } = validLink;
    const result = createSponsorLinkSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects empty upiId", () => {
    const result = createSponsorLinkSchema.safeParse({ ...validLink, upiId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing sponsorPurpose", () => {
    const { sponsorPurpose: _, ...rest } = validLink;
    const result = createSponsorLinkSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects invalid sponsorPurpose", () => {
    const result = createSponsorLinkSchema.safeParse({
      ...validLink,
      sponsorPurpose: "INVALID",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid sponsor purposes", () => {
    const purposes = [
      "TITLE_SPONSOR",
      "GOLD_SPONSOR",
      "SILVER_SPONSOR",
      "FOOD_PARTNER",
      "MEDIA_PARTNER",
      "STALL_VENDOR",
      "MARKETING_PARTNER",
    ];
    for (const sponsorPurpose of purposes) {
      const result = createSponsorLinkSchema.safeParse({
        ...validLink,
        sponsorPurpose,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects zero amount", () => {
    const result = createSponsorLinkSchema.safeParse({ ...validLink, amount: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects negative amount", () => {
    const result = createSponsorLinkSchema.safeParse({ ...validLink, amount: -100 });
    expect(result.success).toBe(false);
  });

  it("rejects invalid expiresAt", () => {
    const result = createSponsorLinkSchema.safeParse({
      ...validLink,
      expiresAt: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid IFSC code in bankDetails", () => {
    const result = createSponsorLinkSchema.safeParse({
      ...validLink,
      bankDetails: { ifscCode: "bad" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid sponsorId (not UUID)", () => {
    const result = createSponsorLinkSchema.safeParse({
      ...validLink,
      sponsorId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

describe("sponsorLinkListQuerySchema", () => {
  it("accepts empty params with defaults", () => {
    const result = sponsorLinkListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it("accepts valid sponsorId filter", () => {
    const result = sponsorLinkListQuerySchema.safeParse({
      sponsorId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid sponsorId", () => {
    const result = sponsorLinkListQuerySchema.safeParse({
      sponsorId: "not-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("transforms isActive string to boolean", () => {
    const result = sponsorLinkListQuerySchema.safeParse({ isActive: "true" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(true);
    }
  });

  it("coerces page and limit from strings", () => {
    const result = sponsorLinkListQuerySchema.safeParse({ page: "2", limit: "10" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(10);
    }
  });

  it("rejects limit > 100", () => {
    const result = sponsorLinkListQuerySchema.safeParse({ limit: "200" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Sponsor service logic tests (mocked Prisma)
// ---------------------------------------------------------------------------

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sponsor: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    sponsorLink: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/prisma";
import { logAudit, logActivity } from "@/lib/audit";
import {
  listSponsors,
  getSponsor,
  createSponsor,
  updateSponsor,
  deleteSponsor,
  generateSponsorLink,
  listSponsorLinks,
  deactivateSponsorLink,
  getPublicSponsorLink,
  sponsorPurposeLabel,
} from "@/lib/services/sponsor-service";

const mockUser = { id: "user-1", name: "Admin User" };

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// sponsorPurposeLabel helper
// ---------------------------------------------------------------------------

describe("sponsorPurposeLabel", () => {
  it("returns mapped label for known purposes", () => {
    expect(sponsorPurposeLabel("TITLE_SPONSOR")).toBe("Title Sponsor");
    expect(sponsorPurposeLabel("GOLD_SPONSOR")).toBe("Gold Sponsor");
    expect(sponsorPurposeLabel("FOOD_PARTNER")).toBe("Food Partner");
  });

  it("returns the raw string for unknown purposes", () => {
    expect(sponsorPurposeLabel("UNKNOWN")).toBe("UNKNOWN");
  });
});

// ---------------------------------------------------------------------------
// listSponsors
// ---------------------------------------------------------------------------

describe("listSponsors", () => {
  it("returns paginated list with totalContributions", async () => {
    const mockSponsors = [
      {
        id: "s1",
        name: "Sponsor One",
        phone: "+919876543210",
        email: "s1@example.com",
        company: "Corp A",
        createdAt: new Date(),
        createdById: "user-1",
        createdBy: { id: "user-1", name: "Admin" },
        transactions: [
          { id: "t1", amount: 5000, category: "SPONSORSHIP", approvalStatus: "APPROVED" },
          { id: "t2", amount: 3000, category: "SPONSORSHIP", approvalStatus: "APPROVED" },
        ],
      },
    ];

    vi.mocked(prisma.sponsor.findMany).mockResolvedValue(mockSponsors as never);
    vi.mocked(prisma.sponsor.count).mockResolvedValue(1);

    const result = await listSponsors({ page: 1, limit: 20 });

    expect(result.success).toBe(true);
    expect(result.data?.total).toBe(1);
    expect(result.data?.page).toBe(1);
    expect(result.data?.totalPages).toBe(1);
    expect(result.data?.data).toHaveLength(1);
    expect(result.data?.data[0].totalContributions).toBe(8000);
  });

  it("calculates correct skip for page 2", async () => {
    vi.mocked(prisma.sponsor.findMany).mockResolvedValue([]);
    vi.mocked(prisma.sponsor.count).mockResolvedValue(0);

    await listSponsors({ page: 2, limit: 10 });

    const findManyCall = vi.mocked(prisma.sponsor.findMany).mock.calls[0][0];
    expect(findManyCall?.skip).toBe(10);
    expect(findManyCall?.take).toBe(10);
  });

  it("builds search filter with OR clause", async () => {
    vi.mocked(prisma.sponsor.findMany).mockResolvedValue([]);
    vi.mocked(prisma.sponsor.count).mockResolvedValue(0);

    await listSponsors({ search: "Kumar", page: 1, limit: 20 });

    const findManyCall = vi.mocked(prisma.sponsor.findMany).mock.calls[0][0];
    expect(findManyCall?.where?.OR).toBeDefined();
    expect(findManyCall?.where?.OR).toHaveLength(3);
  });

  it("does not add OR clause when search is empty", async () => {
    vi.mocked(prisma.sponsor.findMany).mockResolvedValue([]);
    vi.mocked(prisma.sponsor.count).mockResolvedValue(0);

    await listSponsors({ page: 1, limit: 20 });

    const findManyCall = vi.mocked(prisma.sponsor.findMany).mock.calls[0][0];
    expect(findManyCall?.where?.OR).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getSponsor
// ---------------------------------------------------------------------------

describe("getSponsor", () => {
  it("returns sponsor with totalContributions when found", async () => {
    const mockSponsor = {
      id: "s1",
      name: "Sponsor One",
      phone: "+919876543210",
      email: "s1@example.com",
      company: null,
      createdAt: new Date(),
      createdById: "user-1",
      createdBy: { id: "user-1", name: "Admin" },
      transactions: [
        { id: "t1", amount: 5000, category: "SPONSORSHIP", sponsorPurpose: "TITLE_SPONSOR", approvalStatus: "APPROVED", createdAt: new Date() },
        { id: "t2", amount: 2000, category: "SPONSORSHIP", sponsorPurpose: "GOLD_SPONSOR", approvalStatus: "PENDING", createdAt: new Date() },
      ],
      sponsorLinks: [],
    };

    vi.mocked(prisma.sponsor.findUnique).mockResolvedValue(mockSponsor as never);

    const result = await getSponsor("s1");

    expect(result.success).toBe(true);
    // Only APPROVED transactions count toward totalContributions
    expect(result.data?.totalContributions).toBe(5000);
  });

  it("returns 404 when sponsor not found", async () => {
    vi.mocked(prisma.sponsor.findUnique).mockResolvedValue(null);

    const result = await getSponsor("missing-id");

    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
    expect(result.error).toBe("Sponsor not found");
  });
});

// ---------------------------------------------------------------------------
// createSponsor
// ---------------------------------------------------------------------------

describe("createSponsor", () => {
  it("creates sponsor and returns sponsorId with 201 status", async () => {
    vi.mocked(prisma.sponsor.create).mockResolvedValue({
      id: "new-sponsor",
      name: "New Sponsor",
      phone: "+919876543210",
      email: "new@example.com",
      company: null,
      createdById: "user-1",
      createdAt: new Date(),
    } as never);

    const result = await createSponsor(
      { name: "New Sponsor", phone: "+919876543210", email: "new@example.com" },
      mockUser
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe(201);
    expect(result.data?.sponsorId).toBe("new-sponsor");
    expect(logAudit).toHaveBeenCalledOnce();
    expect(logActivity).toHaveBeenCalledOnce();
  });

  it("passes company to prisma create when provided", async () => {
    vi.mocked(prisma.sponsor.create).mockResolvedValue({
      id: "s2",
      name: "Corp Sponsor",
      phone: "+919876543210",
      email: "corp@example.com",
      company: "BigCorp",
      createdById: "user-1",
      createdAt: new Date(),
    } as never);

    await createSponsor(
      { name: "Corp Sponsor", phone: "+919876543210", email: "corp@example.com", company: "BigCorp" },
      mockUser
    );

    const createCall = vi.mocked(prisma.sponsor.create).mock.calls[0][0];
    expect(createCall?.data?.company).toBe("BigCorp");
  });
});

// ---------------------------------------------------------------------------
// updateSponsor
// ---------------------------------------------------------------------------

describe("updateSponsor", () => {
  it("updates sponsor and returns sponsorId", async () => {
    vi.mocked(prisma.sponsor.findUnique).mockResolvedValue({
      id: "s1",
      name: "Old Name",
      phone: "+919876543210",
      email: "old@example.com",
      company: null,
    } as never);
    vi.mocked(prisma.sponsor.update).mockResolvedValue({
      id: "s1",
      name: "New Name",
      phone: "+919876543210",
      email: "old@example.com",
      company: null,
    } as never);

    const result = await updateSponsor("s1", { name: "New Name" }, mockUser);

    expect(result.success).toBe(true);
    expect(result.data?.sponsorId).toBe("s1");
    expect(logAudit).toHaveBeenCalledOnce();
    expect(logActivity).toHaveBeenCalledOnce();
  });

  it("returns 404 when sponsor not found", async () => {
    vi.mocked(prisma.sponsor.findUnique).mockResolvedValue(null);

    const result = await updateSponsor("missing", { name: "X" }, mockUser);

    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });

  it("returns 400 when no fields provided", async () => {
    vi.mocked(prisma.sponsor.findUnique).mockResolvedValue({
      id: "s1",
      name: "Name",
      phone: "+919876543210",
      email: "e@x.com",
      company: null,
    } as never);

    const result = await updateSponsor("s1", {} as never, mockUser);

    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toContain("No fields");
  });
});

// ---------------------------------------------------------------------------
// deleteSponsor
// ---------------------------------------------------------------------------

describe("deleteSponsor", () => {
  it("deletes sponsor with no transactions", async () => {
    vi.mocked(prisma.sponsor.findUnique).mockResolvedValue({
      id: "s1",
      name: "Sponsor",
      email: "s@x.com",
      _count: { transactions: 0, sponsorLinks: 2 },
    } as never);
    vi.mocked(prisma.sponsorLink.updateMany).mockResolvedValue({ count: 2 } as never);
    vi.mocked(prisma.sponsor.delete).mockResolvedValue({} as never);

    const result = await deleteSponsor("s1", mockUser);

    expect(result.success).toBe(true);
    expect(result.data?.sponsorId).toBe("s1");
    // Deactivates links before deletion
    expect(prisma.sponsorLink.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sponsorId: "s1" },
        data: { isActive: false },
      })
    );
    expect(prisma.sponsor.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
  });

  it("returns 404 when sponsor not found", async () => {
    vi.mocked(prisma.sponsor.findUnique).mockResolvedValue(null);

    const result = await deleteSponsor("missing", mockUser);

    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });

  it("returns 409 when sponsor has transactions", async () => {
    vi.mocked(prisma.sponsor.findUnique).mockResolvedValue({
      id: "s1",
      name: "Sponsor",
      email: "s@x.com",
      _count: { transactions: 3, sponsorLinks: 1 },
    } as never);

    const result = await deleteSponsor("s1", mockUser);

    expect(result.success).toBe(false);
    expect(result.status).toBe(409);
    expect(result.error).toContain("Cannot delete sponsor with existing transactions");
  });
});

// ---------------------------------------------------------------------------
// generateSponsorLink
// ---------------------------------------------------------------------------

describe("generateSponsorLink", () => {
  it("creates a link and returns linkId, token, and url", async () => {
    vi.mocked(prisma.sponsor.findUnique).mockResolvedValue({ id: "s1" } as never);
    vi.mocked(prisma.sponsorLink.create).mockResolvedValue({
      id: "link-1",
      token: "fake-uuid-token",
      sponsorId: "s1",
      amount: { toString: () => "50000" },
      upiId: "club@upi",
      bankDetails: { sponsorPurpose: "TITLE_SPONSOR" },
      isActive: true,
      createdById: "user-1",
      expiresAt: null,
      createdAt: new Date(),
    } as never);

    const result = await generateSponsorLink(
      {
        sponsorId: "s1",
        amount: 50000,
        upiId: "club@upi",
        sponsorPurpose: "TITLE_SPONSOR",
      },
      mockUser
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe(201);
    expect(result.data?.linkId).toBe("link-1");
    expect(result.data?.url).toContain("/sponsor/");
    expect(logAudit).toHaveBeenCalledOnce();
    expect(logActivity).toHaveBeenCalledOnce();
  });

  it("creates link without sponsorId (generic link)", async () => {
    vi.mocked(prisma.sponsorLink.create).mockResolvedValue({
      id: "link-2",
      token: "generic-token",
      sponsorId: null,
      amount: null,
      upiId: "club@upi",
      bankDetails: { sponsorPurpose: "GOLD_SPONSOR" },
      isActive: true,
      createdById: "user-1",
      expiresAt: null,
      createdAt: new Date(),
    } as never);

    const result = await generateSponsorLink(
      { upiId: "club@upi", sponsorPurpose: "GOLD_SPONSOR" },
      mockUser
    );

    expect(result.success).toBe(true);
    // Should not have called sponsor.findUnique since no sponsorId
    expect(prisma.sponsor.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when sponsorId does not exist", async () => {
    vi.mocked(prisma.sponsor.findUnique).mockResolvedValue(null);

    const result = await generateSponsorLink(
      { sponsorId: "missing-id", upiId: "club@upi", sponsorPurpose: "TITLE_SPONSOR" },
      mockUser
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
    expect(result.error).toBe("Sponsor not found");
  });
});

// ---------------------------------------------------------------------------
// listSponsorLinks
// ---------------------------------------------------------------------------

describe("listSponsorLinks", () => {
  it("returns paginated list with linkUrl", async () => {
    const mockLinks = [
      {
        id: "link-1",
        sponsorId: "s1",
        token: "tok-1",
        amount: 5000,
        upiId: "club@upi",
        bankDetails: { sponsorPurpose: "TITLE_SPONSOR" },
        isActive: true,
        createdById: "user-1",
        createdAt: new Date(),
        expiresAt: null,
        sponsor: { id: "s1", name: "Sponsor One", company: "Corp" },
        createdBy: { id: "user-1", name: "Admin" },
      },
    ];

    vi.mocked(prisma.sponsorLink.findMany).mockResolvedValue(mockLinks as never);
    vi.mocked(prisma.sponsorLink.count).mockResolvedValue(1);

    const result = await listSponsorLinks({ page: 1, limit: 20 });

    expect(result.success).toBe(true);
    expect(result.data?.total).toBe(1);
    expect(result.data?.data).toHaveLength(1);
    expect(result.data?.data[0].linkUrl).toContain("/sponsor/tok-1");
    expect(result.data?.data[0].sponsorPurpose).toBe("TITLE_SPONSOR");
  });

  it("applies sponsorId filter to where clause", async () => {
    vi.mocked(prisma.sponsorLink.findMany).mockResolvedValue([]);
    vi.mocked(prisma.sponsorLink.count).mockResolvedValue(0);

    await listSponsorLinks({ sponsorId: "s1", page: 1, limit: 20 });

    const findManyCall = vi.mocked(prisma.sponsorLink.findMany).mock.calls[0][0];
    expect(findManyCall?.where?.sponsorId).toBe("s1");
  });

  it("applies isActive filter to where clause", async () => {
    vi.mocked(prisma.sponsorLink.findMany).mockResolvedValue([]);
    vi.mocked(prisma.sponsorLink.count).mockResolvedValue(0);

    await listSponsorLinks({ isActive: true, page: 1, limit: 20 });

    const findManyCall = vi.mocked(prisma.sponsorLink.findMany).mock.calls[0][0];
    expect(findManyCall?.where?.isActive).toBe(true);
  });

  it("defaults sponsorPurpose to OTHER when not in bankDetails", async () => {
    const mockLinks = [
      {
        id: "link-2",
        sponsorId: null,
        token: "tok-2",
        amount: null,
        upiId: "club@upi",
        bankDetails: null,
        isActive: true,
        createdById: "user-1",
        createdAt: new Date(),
        expiresAt: null,
        sponsor: null,
        createdBy: { id: "user-1", name: "Admin" },
      },
    ];

    vi.mocked(prisma.sponsorLink.findMany).mockResolvedValue(mockLinks as never);
    vi.mocked(prisma.sponsorLink.count).mockResolvedValue(1);

    const result = await listSponsorLinks({ page: 1, limit: 20 });

    expect(result.data?.data[0].sponsorPurpose).toBe("OTHER");
  });
});

// ---------------------------------------------------------------------------
// deactivateSponsorLink
// ---------------------------------------------------------------------------

describe("deactivateSponsorLink", () => {
  it("deactivates an active link", async () => {
    vi.mocked(prisma.sponsorLink.findUnique).mockResolvedValue({
      id: "link-1",
      token: "tok-1",
      isActive: true,
    } as never);
    vi.mocked(prisma.sponsorLink.update).mockResolvedValue({} as never);

    const result = await deactivateSponsorLink("link-1", mockUser);

    expect(result.success).toBe(true);
    expect(result.data?.linkId).toBe("link-1");
    expect(prisma.sponsorLink.update).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: { isActive: false },
    });
    expect(logActivity).toHaveBeenCalledOnce();
  });

  it("returns 404 when link not found", async () => {
    vi.mocked(prisma.sponsorLink.findUnique).mockResolvedValue(null);

    const result = await deactivateSponsorLink("missing", mockUser);

    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
    expect(result.error).toBe("Sponsor link not found");
  });

  it("returns 409 when link is already inactive", async () => {
    vi.mocked(prisma.sponsorLink.findUnique).mockResolvedValue({
      id: "link-1",
      token: "tok-1",
      isActive: false,
    } as never);

    const result = await deactivateSponsorLink("link-1", mockUser);

    expect(result.success).toBe(false);
    expect(result.status).toBe(409);
    expect(result.error).toContain("already inactive");
  });
});

// ---------------------------------------------------------------------------
// getPublicSponsorLink
// ---------------------------------------------------------------------------

describe("getPublicSponsorLink", () => {
  it("returns public link data for active, non-expired link", async () => {
    vi.mocked(prisma.sponsorLink.findUnique).mockResolvedValue({
      id: "link-1",
      token: "tok-1",
      amount: 50000,
      upiId: "club@upi",
      bankDetails: { sponsorPurpose: "TITLE_SPONSOR", accountNumber: "12345" },
      isActive: true,
      expiresAt: null,
      sponsor: { id: "s1", name: "Sponsor One", company: "Corp A" },
    } as never);

    const result = await getPublicSponsorLink("tok-1");

    expect(result.success).toBe(true);
    expect(result.data?.token).toBe("tok-1");
    expect(result.data?.sponsorName).toBe("Sponsor One");
    expect(result.data?.sponsorCompany).toBe("Corp A");
    expect(result.data?.amount).toBe(50000);
    expect(result.data?.purpose).toBe("TITLE_SPONSOR");
    expect(result.data?.purposeLabel).toBe("Title Sponsor");
    expect(result.data?.upiId).toBe("club@upi");
    expect(result.data?.isActive).toBe(true);
    expect(result.data?.isExpired).toBe(false);
    expect(result.data?.clubName).toBe("Deshapriya Park Sarbojanin Durgotsav");
    // sponsorPurpose should be stripped from public bankDetails
    expect((result.data?.bankDetails as Record<string, unknown>)?.sponsorPurpose).toBeUndefined();
    expect((result.data?.bankDetails as Record<string, unknown>)?.accountNumber).toBe("12345");
  });

  it("returns 404 when token not found", async () => {
    vi.mocked(prisma.sponsorLink.findUnique).mockResolvedValue(null);

    const result = await getPublicSponsorLink("missing-token");

    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
    expect(result.error).toBe("Sponsor link not found");
  });

  it("returns isActive=false for deactivated link", async () => {
    vi.mocked(prisma.sponsorLink.findUnique).mockResolvedValue({
      id: "link-1",
      token: "tok-1",
      amount: null,
      upiId: "club@upi",
      bankDetails: { sponsorPurpose: "GOLD_SPONSOR" },
      isActive: false,
      expiresAt: null,
      sponsor: null,
    } as never);

    const result = await getPublicSponsorLink("tok-1");

    expect(result.success).toBe(true);
    expect(result.data?.isActive).toBe(false);
  });

  it("returns isExpired=true when expiresAt is in the past", async () => {
    const pastDate = new Date("2020-01-01T00:00:00Z");
    vi.mocked(prisma.sponsorLink.findUnique).mockResolvedValue({
      id: "link-1",
      token: "tok-1",
      amount: null,
      upiId: "club@upi",
      bankDetails: { sponsorPurpose: "SILVER_SPONSOR" },
      isActive: true,
      expiresAt: pastDate,
      sponsor: null,
    } as never);

    const result = await getPublicSponsorLink("tok-1");

    expect(result.success).toBe(true);
    expect(result.data?.isExpired).toBe(true);
  });

  it("returns null amount when link has no fixed amount", async () => {
    vi.mocked(prisma.sponsorLink.findUnique).mockResolvedValue({
      id: "link-1",
      token: "tok-1",
      amount: null,
      upiId: "club@upi",
      bankDetails: { sponsorPurpose: "FOOD_PARTNER" },
      isActive: true,
      expiresAt: null,
      sponsor: null,
    } as never);

    const result = await getPublicSponsorLink("tok-1");

    expect(result.success).toBe(true);
    expect(result.data?.amount).toBeNull();
  });

  it("returns null sponsor fields when no sponsor linked", async () => {
    vi.mocked(prisma.sponsorLink.findUnique).mockResolvedValue({
      id: "link-1",
      token: "tok-1",
      amount: null,
      upiId: "club@upi",
      bankDetails: { sponsorPurpose: "MEDIA_PARTNER" },
      isActive: true,
      expiresAt: null,
      sponsor: null,
    } as never);

    const result = await getPublicSponsorLink("tok-1");

    expect(result.success).toBe(true);
    expect(result.data?.sponsorName).toBeNull();
    expect(result.data?.sponsorCompany).toBeNull();
  });

  it("defaults purpose to OTHER when bankDetails has no sponsorPurpose", async () => {
    vi.mocked(prisma.sponsorLink.findUnique).mockResolvedValue({
      id: "link-1",
      token: "tok-1",
      amount: null,
      upiId: "club@upi",
      bankDetails: {},
      isActive: true,
      expiresAt: null,
      sponsor: null,
    } as never);

    const result = await getPublicSponsorLink("tok-1");

    expect(result.success).toBe(true);
    expect(result.data?.purpose).toBe("OTHER");
    expect(result.data?.purposeLabel).toBe("OTHER");
  });
});
