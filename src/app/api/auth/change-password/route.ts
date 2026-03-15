/**
 * POST /api/auth/change-password
 *
 * Allows an authenticated user (User or SubMember) to change their password.
 * Validates the current password before updating.
 * Sets isTempPassword = false after a successful change.
 *
 * Rate limited: 5 attempts per 15 minutes per user ID.
 *
 * Request body: { currentPassword: string; newPassword: string }
 * Response: { success: true } | { error: string }
 */

import { NextRequest, NextResponse } from "next/server";

import bcrypt from "bcryptjs";
import { getAuthSession } from "@/lib/auth";
import { requireAuth } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { changePasswordSchema } from "@/lib/validators";
import {
  rateLimit,
  getRateLimitKeyForUser,
  LOGIN_RATE_LIMIT,
} from "@/lib/rate-limit";

const BCRYPT_ROUNDS = 12;

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const session = await getAuthSession(request);
    const sessionUser = requireAuth(session);

    // 2. Rate limit: 5 attempts per 15 min per user
    const rateLimitKey = getRateLimitKeyForUser(sessionUser.id, "change-password");
    const rl = rateLimit(
      rateLimitKey,
      LOGIN_RATE_LIMIT.maxAttempts,
      LOGIN_RATE_LIMIT.windowMs
    );

    if (!rl.success) {
      return NextResponse.json(
        {
          error: "Too many password change attempts — please try again later",
          resetAt: rl.resetAt.toISOString(),
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.floor(rl.resetAt.getTime() / 1000)),
          },
        }
      );
    }

    // 3. Parse and validate body
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = changePasswordSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = parsed.data;

    // 4. Look up stored password hash — check User first, then SubMember
    if (sessionUser.isSubMember) {
      // Sub-member flow
      const subMember = await prisma.subMember.findUnique({
        where: { id: sessionUser.id },
        select: { id: true, password: true },
      });

      if (!subMember) {
        return NextResponse.json({ error: "Account not found" }, { status: 404 });
      }

      const passwordMatch = await bcrypt.compare(
        currentPassword,
        subMember.password
      );
      if (!passwordMatch) {
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 400 }
        );
      }

      const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

      await prisma.subMember.update({
        where: { id: sessionUser.id },
        data: {
          password: newHash,
          isTempPassword: false,
        },
      });

      logActivity({
        userId: sessionUser.id,
        action: "password_changed",
        description: `Sub-member ${sessionUser.email} changed their password`,
        metadata: { isSubMember: true, wasTempPassword: sessionUser.isTempPassword },
      }).catch(() => {});
    } else {
      // User (admin/operator/primary member) flow
      const user = await prisma.user.findUnique({
        where: { id: sessionUser.id },
        select: { id: true, password: true },
      });

      if (!user) {
        return NextResponse.json({ error: "Account not found" }, { status: 404 });
      }

      const passwordMatch = await bcrypt.compare(
        currentPassword,
        user.password
      );
      if (!passwordMatch) {
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 400 }
        );
      }

      const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

      await prisma.user.update({
        where: { id: sessionUser.id },
        data: {
          password: newHash,
          isTempPassword: false,
        },
      });

      logActivity({
        userId: sessionUser.id,
        action: "password_changed",
        description: `User ${sessionUser.email} changed their password`,
        metadata: { isSubMember: false, wasTempPassword: sessionUser.isTempPassword },
      }).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string };
    if (error.status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[change-password] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
