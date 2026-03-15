/**
 * NextAuth.js configuration for DPS Dashboard.
 *
 * Supports login for both User (admin/operator/primary member) and SubMember.
 * User table is checked first; SubMember is checked as fallback.
 *
 * JWT strategy with HTTP-only SameSite=Lax cookies.
 * Token payload: { id, email, name, role, memberId, isTempPassword, isSubMember, parentUserId? }
 */

import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions, Session } from "next-auth";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/types";
import { rateLimit, LOGIN_RATE_LIMIT } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// getAuthSession — reliable session helper for App Router route handlers
//
// getServerSession has a known issue in Next.js 14 App Router where it fails
// to read the session cookie via its internal HTTP fetch. This helper uses
// getToken directly, which reads the JWT from the request cookie without any
// internal HTTP call, making it reliable in all Next.js 14 route handler contexts.
// ---------------------------------------------------------------------------

export async function getAuthSession(req: NextRequest): Promise<Session | null> {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName:
      process.env.NODE_ENV === "production"
        ? "__Secure-next-auth.session-token"
        : "next-auth.session-token",
  });

  if (!token) return null;

  return {
    user: {
      id: token.sub as string,
      email: token.email as string,
      name: token.name as string,
      role: token.role as Role,
      memberId: token.memberId as string,
      isTempPassword: token.isTempPassword as boolean,
      isSubMember: token.isSubMember as boolean,
      ...(token.parentUserId ? { parentUserId: token.parentUserId as string } : {}),
    },
    expires: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Auth options
// ---------------------------------------------------------------------------

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      /**
       * Authenticate against User table first, then SubMember.
       * Returns null for any failure — never reveals whether email exists.
       *
       * Rate limiting: 5 attempts per 15 minutes per email address.
       * Failed attempts are logged to ActivityLog for auditing.
       */
      async authorize(credentials, _req) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email.toLowerCase().trim();
        const password = credentials.password;

        // --- Rate limiting: per email (not IP, since we can't read IP in Edge here) ---
        const rateLimitKey = `login:email:${email}`;
        const rateLimitResult = rateLimit(
          rateLimitKey,
          LOGIN_RATE_LIMIT.maxAttempts,
          LOGIN_RATE_LIMIT.windowMs
        );

        if (!rateLimitResult.success) {
          // Log the rate limit hit (best-effort — no await to keep authorize fast)
          logLoginAttempt(email, false, "rate_limited").catch(() => {});
          return null;
        }

        // --- Step 1: Check User table ---
        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            memberId: true,
            password: true,
            isTempPassword: true,
          },
        });

        if (user) {
          const passwordMatch = await bcrypt.compare(password, user.password);
          if (!passwordMatch) {
            // Log failed attempt (best-effort)
            logLoginAttempt(email, false, "invalid_credentials", user.id).catch(() => {});
            return null;
          }

          // Log successful login (best-effort)
          logLoginAttempt(email, true, "success", user.id).catch(() => {});

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role as Role,
            memberId: user.memberId,
            isTempPassword: user.isTempPassword,
            isSubMember: false,
          };
        }

        // --- Step 2: Check SubMember table ---
        const subMember = await prisma.subMember.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            memberId: true,
            password: true,
            isTempPassword: true,
            canLogin: true,
            parentUserId: true,
            parentUser: {
              select: { role: true },
            },
          },
        });

        if (subMember) {
          if (!subMember.canLogin) {
            logLoginAttempt(email, false, "login_disabled", subMember.id).catch(() => {});
            return null;
          }

          const passwordMatch = await bcrypt.compare(
            password,
            subMember.password
          );
          if (!passwordMatch) {
            logLoginAttempt(email, false, "invalid_credentials", subMember.id).catch(() => {});
            return null;
          }

          // Log successful login
          logLoginAttempt(email, true, "success", subMember.id).catch(() => {});

          return {
            id: subMember.id,
            email: subMember.email,
            name: subMember.name,
            // Sub-members always have MEMBER role
            role: "MEMBER" as Role,
            memberId: subMember.memberId,
            isTempPassword: subMember.isTempPassword,
            isSubMember: true,
            parentUserId: subMember.parentUserId,
          };
        }

        // Neither User nor SubMember found — generic failure (don't reveal which)
        logLoginAttempt(email, false, "user_not_found").catch(() => {});
        return null;
      },
    }),
  ],

  session: {
    strategy: "jwt",
    // 15-minute access token (will be hardened further in T22)
    maxAge: 15 * 60,
  },

  callbacks: {
    /**
     * Persist extra fields into the JWT token after sign-in.
     * On subsequent requests, token is passed in without `user`.
     */
    async jwt({ token, user }) {
      if (user) {
        // user is only present on initial sign-in; it includes our custom fields
        token.sub = user.id;
        token.email = user.email;
        token.name = user.name;
        token.role = (user as { role: Role }).role;
        token.memberId = (user as { memberId: string }).memberId;
        token.isTempPassword = (user as { isTempPassword: boolean }).isTempPassword;
        token.isSubMember = (user as { isSubMember: boolean }).isSubMember;
        const parentUserId = (user as { parentUserId?: string }).parentUserId;
        if (parentUserId) {
          token.parentUserId = parentUserId;
        }
      }
      return token;
    },

    /**
     * Expose JWT fields to the client-accessible session object.
     */
    async session({ session, token }) {
      if (token) {
        session.user = {
          id: token.sub as string,
          email: token.email as string,
          name: token.name as string,
          role: token.role as Role,
          memberId: token.memberId as string,
          isTempPassword: token.isTempPassword as boolean,
          isSubMember: token.isSubMember as boolean,
          ...(token.parentUserId
            ? { parentUserId: token.parentUserId as string }
            : {}),
        };
      }
      return session;
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  // Cookie options — use default NextAuth cookie name so middleware withAuth
  // can locate the session token without extra configuration.
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production"
        ? "__Secure-next-auth.session-token"
        : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Login attempt logging
// ---------------------------------------------------------------------------

/**
 * Log a login attempt to the ActivityLog for auditing purposes.
 * This is best-effort — failures are silently swallowed.
 *
 * @param email     - Email used in the attempt
 * @param success   - Whether the login succeeded
 * @param reason    - Reason for failure (or "success")
 * @param userId    - User ID if identified (may be unknown for "user_not_found")
 */
async function logLoginAttempt(
  email: string,
  success: boolean,
  reason: "success" | "invalid_credentials" | "rate_limited" | "user_not_found" | "login_disabled",
  userId?: string
): Promise<void> {
  try {
    // We need a userId for the ActivityLog FK constraint.
    // For "user_not_found" cases we skip the log rather than violating the constraint.
    if (!userId) return;

    await prisma.activityLog.create({
      data: {
        userId,
        action: success ? "login_success" : "login_failed",
        description: success
          ? `Successful login for ${email}`
          : `Failed login attempt for ${email} — ${reason}`,
        metadata: {
          email,
          success,
          reason,
          timestamp: new Date().toISOString(),
        },
      },
    });
  } catch {
    // Best-effort — never throw from auth logging
  }
}
