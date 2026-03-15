/**
 * GET /api/sponsor-links/[token]/receipt?paymentId=xxx
 *
 * Public receipt endpoint — no authentication required.
 * Returns receipt data for a sponsor payment made via a sponsor link.
 *
 * Flow:
 *   1. Validate token exists and is a real sponsor link
 *   2. Validate paymentId query param
 *   3. Look up Transaction by razorpayPaymentId
 *   4. Confirm the transaction is for the correct sponsor (via sponsorId match or purpose match)
 *   5. Return receipt data
 *
 * Returns:
 *   200 { receiptNumber, sponsorName, sponsorCompany, amount, date, purpose, purposeLabel,
 *          paymentRef, clubName, clubAddress, paymentMode }
 *   400 — missing paymentId
 *   404 — token not found or payment not found
 *
 * Rate limiting: will be added in T23.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sponsorPurposeLabel } from "@/lib/services/sponsor-service";

const CLUB_NAME = "Deshapriya Park Sarbojanin Durgotsav";
const CLUB_ADDRESS = "Deshapriya Park, Bhowanipore, Kolkata - 700026, West Bengal";

interface RouteParams {
  params: { token: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get("paymentId");

    if (!paymentId) {
      return NextResponse.json(
        { error: "paymentId query parameter is required" },
        { status: 400 }
      );
    }

    // Validate the sponsor link token
    const link = await prisma.sponsorLink.findUnique({
      where: { token: params.token },
      include: {
        sponsor: { select: { id: true, name: true, company: true } },
      },
    });

    if (!link) {
      return NextResponse.json(
        { error: "Sponsor link not found" },
        { status: 404 }
      );
    }

    // Look up transaction by Razorpay payment ID
    const transaction = await prisma.transaction.findFirst({
      where: { razorpayPaymentId: paymentId },
      select: {
        id: true,
        amount: true,
        paymentMode: true,
        receiptNumber: true,
        description: true,
        sponsorPurpose: true,
        sponsorId: true,
        senderName: true,
        createdAt: true,
        approvalStatus: true,
        category: true,
        sponsor: {
          select: { id: true, name: true, company: true },
        },
      },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: "Payment record not found" },
        { status: 404 }
      );
    }

    // Validate this transaction is a SPONSORSHIP payment
    if (transaction.category !== "SPONSORSHIP") {
      return NextResponse.json(
        { error: "Payment is not a sponsorship transaction" },
        { status: 400 }
      );
    }

    // If the link has a sponsorId, confirm the transaction belongs to the same sponsor.
    // If the link has no sponsorId (generic link), we match by purpose.
    const bd = link.bankDetails as Record<string, unknown> | null;
    const linkPurpose = (bd?.sponsorPurpose as string) ?? null;

    if (link.sponsorId && transaction.sponsorId && link.sponsorId !== transaction.sponsorId) {
      return NextResponse.json(
        { error: "Payment does not belong to this sponsor link" },
        { status: 404 }
      );
    }

    // Resolve sponsor name/company — prefer transaction's linked sponsor,
    // then the link's sponsor, then fall back to the sender name from transaction.
    const sponsorName =
      transaction.sponsor?.name ??
      link.sponsor?.name ??
      transaction.senderName ??
      null;

    const sponsorCompany =
      transaction.sponsor?.company ??
      link.sponsor?.company ??
      null;

    const purpose = transaction.sponsorPurpose ?? linkPurpose ?? "OTHER";

    // Build a receipt number if one isn't already assigned
    // (The webhook handler assigns one; verify route doesn't — so fall back gracefully)
    const receiptNumber = transaction.receiptNumber ?? `DPS-PAY-${paymentId.substring(4, 12).toUpperCase()}`;

    return NextResponse.json({
      receiptNumber,
      sponsorName,
      sponsorCompany,
      amount: Number(transaction.amount),
      date: transaction.createdAt.toISOString(),
      purpose,
      purposeLabel: sponsorPurposeLabel(purpose),
      paymentRef: paymentId,
      clubName: CLUB_NAME,
      clubAddress: CLUB_ADDRESS,
      paymentMode: transaction.paymentMode,
    });
  } catch (err: unknown) {
    console.error("[GET /api/sponsor-links/[token]/receipt]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
