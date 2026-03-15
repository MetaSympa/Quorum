/**
 * Role-based permissions for DPS Dashboard.
 *
 * All permission checks are server-side — never trust client-side role checks.
 * Roles: ADMIN > OPERATOR > MEMBER
 *
 * Usage in API routes:
 *   const session = await getServerSession(authOptions);
 *   requireAuth(session);
 *   requireRole(session, "ADMIN", "OPERATOR");
 */

import type { Session } from "next-auth";
import type { Role } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The shape of session.user after our JWT/session callbacks */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  memberId: string;
  isTempPassword: boolean;
  isSubMember: boolean;
  parentUserId?: string;
}

// ---------------------------------------------------------------------------
// Route → Role mapping (project plan §5.2)
// ---------------------------------------------------------------------------

/**
 * Maps route path prefixes to the roles that can access them.
 * More specific paths should be listed before general ones.
 *
 * Note: Public routes (/api/webhooks/razorpay, /api/sponsor-links/[token] GET,
 * /api/sponsor-links/[token]/receipt, /api/payments/sponsor-order,
 * /api/payments/sponsor-verify) are NOT listed here — they are unauthenticated
 * by design and their handlers enforce their own security (HMAC, rate-limiting).
 *
 * The canAccessRoute() helper is used for UI-layer hints (e.g. Sidebar).
 * Server-side enforcement is always done by requireAuth/requireRole in API routes.
 */
export const ROUTE_PERMISSIONS: Record<string, Role[]> = {
  // Admin-only routes
  "/dashboard/approvals": ["ADMIN"],
  "/api/approvals": ["ADMIN"],
  "/api/cron": ["ADMIN"],
  "/api/notifications": ["ADMIN"],

  // Admin + Operator routes
  "/dashboard/members": ["ADMIN", "OPERATOR"],
  "/dashboard/cash": ["ADMIN", "OPERATOR"],
  "/dashboard/sponsorship": ["ADMIN", "OPERATOR"],
  "/dashboard/audit-log": ["ADMIN", "OPERATOR"],
  "/dashboard/activity-log": ["ADMIN", "OPERATOR"],
  "/api/members": ["ADMIN", "OPERATOR"],
  "/api/transactions": ["ADMIN", "OPERATOR"],
  "/api/sponsors": ["ADMIN", "OPERATOR"],
  "/api/sponsor-links": ["ADMIN", "OPERATOR"],
  "/api/audit-log": ["ADMIN", "OPERATOR"],
  "/api/activity-log": ["ADMIN", "OPERATOR"],
  "/api/receipts": ["ADMIN", "OPERATOR"],

  // All authenticated users (ADMIN + OPERATOR + MEMBER)
  "/dashboard/my-membership": ["ADMIN", "OPERATOR", "MEMBER"],
  "/dashboard": ["ADMIN", "OPERATOR", "MEMBER"],
  "/api/my-membership": ["ADMIN", "OPERATOR", "MEMBER"],
  "/api/memberships": ["ADMIN", "OPERATOR", "MEMBER"],
  "/api/payments/create-order": ["ADMIN", "OPERATOR", "MEMBER"],
  "/api/payments/verify": ["ADMIN", "OPERATOR", "MEMBER"],
  "/api/dashboard/stats": ["ADMIN", "OPERATOR", "MEMBER"],
  "/api/auth/change-password": ["ADMIN", "OPERATOR", "MEMBER"],
};

// ---------------------------------------------------------------------------
// Core permission helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the SessionUser from a Next-Auth session.
 * Returns null if session is invalid/missing.
 */
export function getSessionUser(session: Session | null): SessionUser | null {
  if (!session?.user) return null;
  return session.user as unknown as SessionUser;
}

/**
 * Throws a 401 error if the session is not authenticated.
 * Use at the start of every protected API route.
 *
 * @throws {Error} with status 401 if not authenticated
 */
export function requireAuth(session: Session | null): SessionUser {
  const user = getSessionUser(session);
  if (!user) {
    const err = new Error("Unauthorized") as Error & { status: number };
    err.status = 401;
    throw err;
  }
  return user;
}

/**
 * Throws a 403 error if the user does not have one of the required roles.
 * Always call requireAuth first.
 *
 * @throws {Error} with status 403 if role is insufficient
 */
export function requireRole(
  session: Session | null,
  ...roles: Role[]
): SessionUser {
  const user = requireAuth(session);
  if (!roles.includes(user.role)) {
    const err = new Error("Forbidden") as Error & { status: number };
    err.status = 403;
    throw err;
  }
  return user;
}

/**
 * Throws a 403 error if the user still has a temporary password.
 * Must be called before any business operation — users must change their
 * password before accessing dashboard features.
 *
 * @throws {Error} with status 403 if isTempPassword is true
 */
export function requirePasswordChanged(session: Session | null): SessionUser {
  const user = requireAuth(session);
  if (user.isTempPassword) {
    const err = new Error(
      "Password change required"
    ) as Error & { status: number };
    err.status = 403;
    throw err;
  }
  return user;
}

// ---------------------------------------------------------------------------
// Convenience role checkers
// ---------------------------------------------------------------------------

/** Returns true if the session user is an ADMIN. */
export function isAdmin(session: Session | null): boolean {
  const user = getSessionUser(session);
  return user?.role === "ADMIN";
}

/** Returns true if the session user is an OPERATOR. */
export function isOperator(session: Session | null): boolean {
  const user = getSessionUser(session);
  return user?.role === "OPERATOR";
}

/** Returns true if the session user is a MEMBER (primary or sub-member). */
export function isMember(session: Session | null): boolean {
  const user = getSessionUser(session);
  return user?.role === "MEMBER";
}

/**
 * Route-level permission check.
 * Returns true if the session user has access to the given route path.
 *
 * Checks by matching the most specific prefix from ROUTE_PERMISSIONS.
 * Returns false for unauthenticated sessions on protected routes.
 */
export function canAccessRoute(
  session: Session | null,
  route: string
): boolean {
  const user = getSessionUser(session);
  if (!user) return false;

  // Find the most specific matching prefix
  const matchingPrefixes = Object.keys(ROUTE_PERMISSIONS).filter((prefix) =>
    route.startsWith(prefix)
  );

  if (matchingPrefixes.length === 0) {
    // No rule defined — allow authenticated users (default permissive for unlisted routes)
    return true;
  }

  // Pick the longest (most specific) matching prefix
  const bestMatch = matchingPrefixes.reduce((a, b) =>
    a.length >= b.length ? a : b
  );

  return ROUTE_PERMISSIONS[bestMatch].includes(user.role);
}
