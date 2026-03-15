/**
 * POST /api/payments/create-order
 *
 * Create a Razorpay order for a membership payment.
 * Any authenticated user may call this (member paying for self,
 * sub-member paying on behalf of primary).
 *
 * Body:
 *   { memberId: string, membershipType: MembershipType, isApplicationFee?: boolean }
 *
 * Returns:
 *   { orderId, amount, currency, keyId }
 *
 * Business rules:
 *   - Amount is calculated server-side based on membershipType + isApplicationFee.
 *   - No partial payments — the amount is fixed by the server.
 *   - Application fee (₹10,000) is only valid if User.applicationFeePaid === false.
 *   - Notes on the order carry: memberId, membershipType, isApplicationFee — read back in webhook.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAuthSession } from "@/lib/auth";
import { createOrder, rupeesToPaise } from "@/lib/razorpay";
import { createOrderSchema } from "@/lib/validators";
import { prisma } from "@/lib/prisma";
import { MEMBERSHIP_FEES, APPLICATION_FEE } from "@/types";
import type { MembershipType } from "@/types";

export async function POST(request: NextRequest) {
  // Auth: any authenticated user
  const session = await getAuthSession(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse + validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = createOrderSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", details: result.error.flatten() },
      { status: 400 }
    );
  }

  const { memberId, membershipType, isApplicationFee } = result.data;

  // Fetch Member record to validate existence and application fee status
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      user: {
        select: {
          id: true,
          applicationFeePaid: true,
          memberId: true,
        },
      },
    },
  });

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Validate application fee eligibility
  if (isApplicationFee) {
    if (!member.user) {
      return NextResponse.json(
        { error: "Member has no linked user account — cannot process application fee" },
        { status: 400 }
      );
    }
    if (member.user.applicationFeePaid) {
      return NextResponse.json(
        { error: "Application fee has already been paid for this member" },
        { status: 400 }
      );
    }
  }

  // Calculate expected amount
  const membershipFee = MEMBERSHIP_FEES[membershipType as MembershipType];
  const totalAmountINR = isApplicationFee
    ? membershipFee + APPLICATION_FEE
    : membershipFee;

  // Generate receipt reference (max 40 chars for Razorpay)
  const timestamp = Date.now();
  const receipt = `DPS-${memberId.substring(0, 8)}-${timestamp}`.substring(0, 40);

  // Create Razorpay order
  let order;
  try {
    order = await createOrder({
      amount: rupeesToPaise(totalAmountINR), // convert to paise
      currency: "INR",
      receipt,
      notes: {
        memberId,
        membershipType,
        isApplicationFee: String(isApplicationFee),
        memberName: member.name,
        ...(member.user?.memberId && { userMemberId: member.user.memberId }),
      },
    });
  } catch (err) {
    console.error("[create-order] Razorpay order creation failed:", err);
    return NextResponse.json(
      { error: "Payment gateway error — please try again" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    orderId: order.id,
    amount: order.amount, // in paise
    currency: order.currency,
    keyId: process.env.RAZORPAY_KEY_ID ?? "",
    receipt: order.receipt,
  });
}
