/**
 * Sponsor Service — business logic for sponsor management and sponsor link generation.
 *
 * Sponsors are companies or individuals who financially support the club.
 * Sponsor links are shareable public payment URLs with a cryptographic token.
 *
 * Operations:
 *   listSponsors       — paginated list with transaction totals
 *   getSponsor         — single sponsor with all transactions + links
 *   createSponsor      — admin/operator creates a new sponsor record
 *   updateSponsor      — update sponsor fields
 *   deleteSponsor      — soft-delete (suspends, logs)
 *   generateSponsorLink — create a SponsorLink with token, returns full URL
 *   deactivateSponsorLink — sets isActive=false
 *   listSponsorLinks   — paginated list of links (admin + operator)
 *   getPublicSponsorLink — public read for checkout page (no auth)
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit, logActivity } from "@/lib/audit";
import type {
  CreateSponsorInput,
  UpdateSponsorInput,
  CreateSponsorLinkInput,
  SponsorListQuery,
  SponsorLinkListQuery,
} from "@/lib/validators";

// ---------------------------------------------------------------------------
// ServiceResult (mirrors pattern from other services)
// ---------------------------------------------------------------------------

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SponsorWithRelations {
  id: string;
  name: string;
  phone: string;
  email: string;
  company: string | null;
  createdById: string;
  createdAt: Date;
  createdBy: { id: string; name: string };
  transactions: {
    id: string;
    amount: unknown;
    category: string;
    sponsorPurpose: string | null;
    approvalStatus: string;
    createdAt: Date;
  }[];
  sponsorLinks: {
    id: string;
    token: string;
    amount: unknown;
    isActive: boolean;
    expiresAt: Date | null;
    createdAt: Date;
  }[];
  totalContributions: number;
}

export interface SponsorSummary {
  id: string;
  name: string;
  phone: string;
  email: string;
  company: string | null;
  createdAt: Date;
  totalContributions: number;
}

export interface PaginatedSponsors {
  data: SponsorSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SponsorLinkWithRelations {
  id: string;
  sponsorId: string | null;
  token: string;
  amount: unknown;
  upiId: string;
  bankDetails: unknown;
  isActive: boolean;
  createdById: string;
  createdAt: Date;
  expiresAt: Date | null;
  /** Sponsor purpose tied to this link */
  sponsorPurpose: string;
  sponsor: { id: string; name: string; company: string | null } | null;
  createdBy: { id: string; name: string };
  /** Full URL for this link */
  linkUrl: string;
}

export interface PaginatedSponsorLinks {
  data: SponsorLinkWithRelations[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PublicSponsorLinkData {
  token: string;
  sponsorName: string | null;
  sponsorCompany: string | null;
  /** Fixed amount in INR; null if open-ended */
  amount: number | null;
  purpose: string;
  purposeLabel: string;
  upiId: string;
  bankDetails: unknown;
  isActive: boolean;
  isExpired: boolean;
  clubName: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const CLUB_NAME = "Deshapriya Park Sarbojanin Durgotsav";

// ---------------------------------------------------------------------------
// Sponsor purpose label helper
// ---------------------------------------------------------------------------

export function sponsorPurposeLabel(purpose: string): string {
  const map: Record<string, string> = {
    TITLE_SPONSOR: "Title Sponsor",
    GOLD_SPONSOR: "Gold Sponsor",
    SILVER_SPONSOR: "Silver Sponsor",
    FOOD_PARTNER: "Food Partner",
    MEDIA_PARTNER: "Media Partner",
    STALL_VENDOR: "Stall Vendor",
    MARKETING_PARTNER: "Marketing Partner",
  };
  return map[purpose] ?? purpose;
}

// ---------------------------------------------------------------------------
// Prisma includes
// ---------------------------------------------------------------------------

const sponsorSummarySelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  company: true,
  createdAt: true,
  createdById: true,
  createdBy: {
    select: { id: true, name: true },
  },
  transactions: {
    where: { approvalStatus: "APPROVED" },
    select: {
      id: true,
      amount: true,
      category: true,
      approvalStatus: true,
    },
  },
} satisfies Prisma.SponsorSelect;

// ---------------------------------------------------------------------------
// listSponsors
// ---------------------------------------------------------------------------

/**
 * List sponsors with pagination and optional search.
 * Includes total contribution amount (sum of APPROVED SPONSORSHIP transactions).
 */
export async function listSponsors(
  filters: SponsorListQuery
): Promise<ServiceResult<PaginatedSponsors>> {
  const { search, page, limit } = filters;
  const skip = (page - 1) * limit;

  const where: Prisma.SponsorWhereInput = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { company: { contains: search, mode: "insensitive" } },
    ];
  }

  const [sponsors, total] = await Promise.all([
    prisma.sponsor.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: sponsorSummarySelect,
    }),
    prisma.sponsor.count({ where }),
  ]);

  const data: SponsorSummary[] = sponsors.map((s) => ({
    id: s.id,
    name: s.name,
    phone: s.phone,
    email: s.email,
    company: s.company,
    createdAt: s.createdAt,
    totalContributions: s.transactions.reduce(
      (sum, t) => sum + Number(t.amount),
      0
    ),
  }));

  return {
    success: true,
    data: {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ---------------------------------------------------------------------------
// getSponsor
// ---------------------------------------------------------------------------

/**
 * Retrieve a single sponsor by ID with all related transactions and sponsor links.
 */
export async function getSponsor(
  id: string
): Promise<ServiceResult<SponsorWithRelations>> {
  const sponsor = await prisma.sponsor.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true } },
      transactions: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          amount: true,
          category: true,
          sponsorPurpose: true,
          approvalStatus: true,
          createdAt: true,
        },
      },
      sponsorLinks: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          token: true,
          amount: true,
          isActive: true,
          expiresAt: true,
          createdAt: true,
        },
      },
    },
  });

  if (!sponsor) {
    return { success: false, error: "Sponsor not found", status: 404 };
  }

  const totalContributions = sponsor.transactions
    .filter((t) => t.approvalStatus === "APPROVED")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  return {
    success: true,
    data: {
      ...sponsor,
      totalContributions,
    } as unknown as SponsorWithRelations,
  };
}

// ---------------------------------------------------------------------------
// createSponsor
// ---------------------------------------------------------------------------

/**
 * Create a new sponsor record.
 * Logged to ActivityLog.
 */
export async function createSponsor(
  data: CreateSponsorInput,
  createdBy: { id: string; name: string }
): Promise<ServiceResult<{ sponsorId: string }>> {
  const sponsor = await prisma.sponsor.create({
    data: {
      name: data.name,
      phone: data.phone,
      email: data.email,
      company: data.company ?? null,
      createdById: createdBy.id,
    },
  });

  await Promise.all([
    logAudit({
      entityType: "Sponsor",
      entityId: sponsor.id,
      action: "sponsor_created",
      previousData: null,
      newData: {
        id: sponsor.id,
        name: sponsor.name,
        email: sponsor.email,
        company: sponsor.company,
        createdById: sponsor.createdById,
      },
      performedById: createdBy.id,
    }),
    logActivity({
      userId: createdBy.id,
      action: "sponsor_created",
      description: `${createdBy.name} created sponsor: ${sponsor.name}${sponsor.company ? ` (${sponsor.company})` : ""}`,
      metadata: { sponsorId: sponsor.id, name: sponsor.name },
    }),
  ]);

  return { success: true, data: { sponsorId: sponsor.id }, status: 201 };
}

// ---------------------------------------------------------------------------
// updateSponsor
// ---------------------------------------------------------------------------

/**
 * Update sponsor fields. Logs to audit + activity.
 */
export async function updateSponsor(
  id: string,
  data: UpdateSponsorInput,
  updatedBy: { id: string; name: string }
): Promise<ServiceResult<{ sponsorId: string }>> {
  const existing = await prisma.sponsor.findUnique({ where: { id } });
  if (!existing) {
    return { success: false, error: "Sponsor not found", status: 404 };
  }

  if (Object.keys(data).length === 0) {
    return { success: false, error: "No fields provided for update", status: 400 };
  }

  const previousSnapshot = {
    name: existing.name,
    phone: existing.phone,
    email: existing.email,
    company: existing.company,
  };

  const updated = await prisma.sponsor.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.company !== undefined && { company: data.company ?? null }),
    },
  });

  await Promise.all([
    logAudit({
      entityType: "Sponsor",
      entityId: id,
      action: "sponsor_updated",
      previousData: previousSnapshot,
      newData: {
        name: updated.name,
        phone: updated.phone,
        email: updated.email,
        company: updated.company,
      },
      performedById: updatedBy.id,
    }),
    logActivity({
      userId: updatedBy.id,
      action: "sponsor_updated",
      description: `${updatedBy.name} updated sponsor: ${updated.name}`,
      metadata: { sponsorId: id, changes: data },
    }),
  ]);

  return { success: true, data: { sponsorId: id } };
}

// ---------------------------------------------------------------------------
// deleteSponsor
// ---------------------------------------------------------------------------

/**
 * Soft-delete a sponsor by removing their direct DB linkage.
 * In practice: logs the action and returns 204. If the sponsor has transactions,
 * we preserve the records (FK uses SetNull on sponsor deletion is not set — so
 * we just mark deleted via activity log; actual removal requires manual override).
 *
 * Note: Prisma schema does not define a `deletedAt` field on Sponsor.
 * For this implementation, we do a hard delete only if no transactions exist,
 * otherwise we return a 409 conflict to prevent orphaned financial data.
 */
export async function deleteSponsor(
  id: string,
  deletedBy: { id: string; name: string }
): Promise<ServiceResult<{ sponsorId: string }>> {
  const sponsor = await prisma.sponsor.findUnique({
    where: { id },
    include: {
      _count: {
        select: { transactions: true, sponsorLinks: true },
      },
    },
  });

  if (!sponsor) {
    return { success: false, error: "Sponsor not found", status: 404 };
  }

  if (sponsor._count.transactions > 0) {
    return {
      success: false,
      error:
        "Cannot delete sponsor with existing transactions. Deactivate sponsor links instead.",
      status: 409,
    };
  }

  // Deactivate all sponsor links first
  await prisma.sponsorLink.updateMany({
    where: { sponsorId: id },
    data: { isActive: false },
  });

  await prisma.sponsor.delete({ where: { id } });

  await Promise.all([
    logAudit({
      entityType: "Sponsor",
      entityId: id,
      action: "sponsor_deleted",
      previousData: { id: sponsor.id, name: sponsor.name, email: sponsor.email },
      newData: { deleted: true, deletedBy: deletedBy.id },
      performedById: deletedBy.id,
    }),
    logActivity({
      userId: deletedBy.id,
      action: "sponsor_deleted",
      description: `${deletedBy.name} deleted sponsor: ${sponsor.name}`,
      metadata: { sponsorId: id, name: sponsor.name },
    }),
  ]);

  return { success: true, data: { sponsorId: id } };
}

// ---------------------------------------------------------------------------
// generateSponsorLink
// ---------------------------------------------------------------------------

/**
 * Create a new SponsorLink with a cryptographically random token.
 *
 * Returns the full shareable URL: {APP_URL}/sponsor/{token}
 *
 * The link stores:
 *   - sponsorId (optional — can be generic)
 *   - amount (optional — open-ended if null)
 *   - upiId — required, the receiving UPI VPA
 *   - bankDetails — optional JSON { accountNumber, bankName, ifscCode }
 *   - expiresAt — optional expiry timestamp
 *   - sponsorPurpose — one of the 7 types (stored in bankDetails extra field for display)
 */
export async function generateSponsorLink(
  data: CreateSponsorLinkInput,
  createdBy: { id: string; name: string }
): Promise<ServiceResult<{ linkId: string; token: string; url: string }>> {
  // Validate sponsorId if provided
  if (data.sponsorId) {
    const sponsorExists = await prisma.sponsor.findUnique({
      where: { id: data.sponsorId },
    });
    if (!sponsorExists) {
      return { success: false, error: "Sponsor not found", status: 404 };
    }
  }

  const token = crypto.randomUUID();

  // Store sponsorPurpose in bankDetails metadata or as a separate field.
  // The SponsorLink model does not have a native sponsorPurpose field.
  // We store it inside bankDetails JSON as an extra key.
  const bankDetailsPayload = {
    ...(data.bankDetails ?? {}),
    sponsorPurpose: data.sponsorPurpose,
  };

  const link = await prisma.sponsorLink.create({
    data: {
      sponsorId: data.sponsorId ?? null,
      token,
      amount: data.amount != null ? new Prisma.Decimal(data.amount) : null,
      upiId: data.upiId,
      bankDetails: bankDetailsPayload as Prisma.InputJsonValue,
      isActive: true,
      createdById: createdBy.id,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    },
  });

  const url = `${APP_URL}/sponsor/${token}`;

  await Promise.all([
    logAudit({
      entityType: "SponsorLink",
      entityId: link.id,
      action: "sponsor_link_created",
      previousData: null,
      newData: {
        id: link.id,
        token: link.token,
        sponsorId: link.sponsorId,
        amount: link.amount?.toString() ?? null,
        upiId: link.upiId,
        sponsorPurpose: data.sponsorPurpose,
        isActive: true,
        expiresAt: link.expiresAt?.toISOString() ?? null,
        url,
      },
      performedById: createdBy.id,
    }),
    logActivity({
      userId: createdBy.id,
      action: "sponsor_link_created",
      description: `${createdBy.name} generated sponsor payment link for ${sponsorPurposeLabel(data.sponsorPurpose)}${data.amount ? ` — ₹${data.amount}` : " (open-ended)"}`,
      metadata: {
        linkId: link.id,
        token,
        sponsorId: data.sponsorId ?? null,
        purpose: data.sponsorPurpose,
        amount: data.amount ?? null,
        url,
      },
    }),
  ]);

  return {
    success: true,
    data: { linkId: link.id, token, url },
    status: 201,
  };
}

// ---------------------------------------------------------------------------
// deactivateSponsorLink
// ---------------------------------------------------------------------------

/**
 * Deactivate a sponsor link so it can no longer accept payments.
 */
export async function deactivateSponsorLink(
  id: string,
  updatedBy: { id: string; name: string }
): Promise<ServiceResult<{ linkId: string }>> {
  const link = await prisma.sponsorLink.findUnique({ where: { id } });
  if (!link) {
    return { success: false, error: "Sponsor link not found", status: 404 };
  }

  if (!link.isActive) {
    return {
      success: false,
      error: "Sponsor link is already inactive",
      status: 409,
    };
  }

  await prisma.sponsorLink.update({
    where: { id },
    data: { isActive: false },
  });

  await logActivity({
    userId: updatedBy.id,
    action: "sponsor_link_deactivated",
    description: `${updatedBy.name} deactivated sponsor link ${link.token}`,
    metadata: { linkId: id, token: link.token },
  });

  return { success: true, data: { linkId: id } };
}

// ---------------------------------------------------------------------------
// listSponsorLinks
// ---------------------------------------------------------------------------

/**
 * List all sponsor links with pagination. Admin + operator only.
 */
export async function listSponsorLinks(
  filters: SponsorLinkListQuery
): Promise<ServiceResult<PaginatedSponsorLinks>> {
  const { sponsorId, isActive, page, limit } = filters;
  const skip = (page - 1) * limit;

  const where: Prisma.SponsorLinkWhereInput = {};
  if (sponsorId) where.sponsorId = sponsorId;
  if (isActive !== undefined) where.isActive = isActive;

  const [links, total] = await Promise.all([
    prisma.sponsorLink.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        sponsor: { select: { id: true, name: true, company: true } },
        createdBy: { select: { id: true, name: true } },
      },
    }),
    prisma.sponsorLink.count({ where }),
  ]);

  const data: SponsorLinkWithRelations[] = links.map((l) => {
    const bd = l.bankDetails as Record<string, unknown> | null;
    const purpose = (bd?.sponsorPurpose as string) ?? "OTHER";
    return {
      id: l.id,
      sponsorId: l.sponsorId,
      token: l.token,
      amount: l.amount,
      upiId: l.upiId,
      bankDetails: l.bankDetails,
      isActive: l.isActive,
      createdById: l.createdById,
      createdAt: l.createdAt,
      expiresAt: l.expiresAt,
      sponsorPurpose: purpose,
      sponsor: l.sponsor,
      createdBy: l.createdBy,
      linkUrl: `${APP_URL}/sponsor/${l.token}`,
    };
  });

  return {
    success: true,
    data: {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ---------------------------------------------------------------------------
// getPublicSponsorLink
// ---------------------------------------------------------------------------

/**
 * Public read of a sponsor link by token — used by the checkout page.
 * No authentication required. Returns minimal safe data.
 *
 * Returns 404 if token not found.
 * Returns data with isExpired=true if past expiresAt.
 * Returns data with isActive=false if manually deactivated.
 */
export async function getPublicSponsorLink(
  token: string
): Promise<ServiceResult<PublicSponsorLinkData>> {
  const link = await prisma.sponsorLink.findUnique({
    where: { token },
    include: {
      sponsor: { select: { id: true, name: true, company: true } },
    },
  });

  if (!link) {
    return { success: false, error: "Sponsor link not found", status: 404 };
  }

  const now = new Date();
  const isExpired = link.expiresAt != null && link.expiresAt < now;

  const bd = link.bankDetails as Record<string, unknown> | null;
  const purpose = (bd?.sponsorPurpose as string) ?? "OTHER";

  // Strip sponsorPurpose from bankDetails before sending to client
  const publicBankDetails = bd
    ? (({ sponsorPurpose: _, ...rest }) => rest)(bd)
    : null;

  return {
    success: true,
    data: {
      token: link.token,
      sponsorName: link.sponsor?.name ?? null,
      sponsorCompany: link.sponsor?.company ?? null,
      amount: link.amount != null ? Number(link.amount) : null,
      purpose,
      purposeLabel: sponsorPurposeLabel(purpose),
      upiId: link.upiId,
      bankDetails: publicBankDetails,
      isActive: link.isActive,
      isExpired,
      clubName: CLUB_NAME,
    },
  };
}
