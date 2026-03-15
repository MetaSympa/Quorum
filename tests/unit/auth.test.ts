/**
 * Unit tests for T03 — Auth System
 *
 * Tests:
 * 1. permissions.ts — requireAuth, requireRole, requirePasswordChanged, helpers
 * 2. SessionUser type shape
 */

import { describe, it, expect } from "vitest";
import type { Session } from "next-auth";
import {
  requireAuth,
  requireRole,
  requirePasswordChanged,
  isAdmin,
  isOperator,
  isMember,
  canAccessRoute,
  getSessionUser,
} from "@/lib/permissions";
import type { SessionUser } from "@/types";

// ---------------------------------------------------------------------------
// Helpers to build mock sessions
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<SessionUser> = {}): Session {
  const user: SessionUser = {
    id: "user-1",
    email: "test@example.com",
    name: "Test User",
    role: "MEMBER",
    memberId: "DPC-2026-0001-00",
    isTempPassword: false,
    isSubMember: false,
    ...overrides,
  };
  return {
    user: user as unknown as Session["user"],
    expires: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// requireAuth tests
// ---------------------------------------------------------------------------

describe("requireAuth", () => {
  it("returns the session user when authenticated", () => {
    const session = makeSession();
    const user = requireAuth(session);
    expect(user.id).toBe("user-1");
    expect(user.email).toBe("test@example.com");
  });

  it("throws 401 when session is null", () => {
    expect(() => requireAuth(null)).toThrowError("Unauthorized");
  });

  it("throws 401 when session has no user", () => {
    const session = { expires: "2099-01-01" } as unknown as Session;
    expect(() => requireAuth(session)).toThrowError("Unauthorized");
  });

  it("thrown error has status 401", () => {
    try {
      requireAuth(null);
    } catch (err: unknown) {
      expect((err as { status: number }).status).toBe(401);
    }
  });
});

// ---------------------------------------------------------------------------
// requireRole tests
// ---------------------------------------------------------------------------

describe("requireRole", () => {
  it("passes when user has the required role", () => {
    const session = makeSession({ role: "ADMIN" });
    expect(() => requireRole(session, "ADMIN")).not.toThrow();
  });

  it("passes when role is one of multiple allowed", () => {
    const session = makeSession({ role: "OPERATOR" });
    expect(() => requireRole(session, "ADMIN", "OPERATOR")).not.toThrow();
  });

  it("throws 403 when user lacks the required role", () => {
    const session = makeSession({ role: "MEMBER" });
    expect(() => requireRole(session, "ADMIN")).toThrowError("Forbidden");
  });

  it("thrown error has status 403", () => {
    const session = makeSession({ role: "MEMBER" });
    try {
      requireRole(session, "ADMIN", "OPERATOR");
    } catch (err: unknown) {
      expect((err as { status: number }).status).toBe(403);
    }
  });

  it("throws 401 when session is null", () => {
    expect(() => requireRole(null, "ADMIN")).toThrowError("Unauthorized");
  });
});

// ---------------------------------------------------------------------------
// requirePasswordChanged tests
// ---------------------------------------------------------------------------

describe("requirePasswordChanged", () => {
  it("passes when isTempPassword is false", () => {
    const session = makeSession({ isTempPassword: false });
    expect(() => requirePasswordChanged(session)).not.toThrow();
  });

  it("throws 403 when isTempPassword is true", () => {
    const session = makeSession({ isTempPassword: true });
    expect(() => requirePasswordChanged(session)).toThrowError(
      "Password change required"
    );
  });

  it("thrown error has status 403", () => {
    const session = makeSession({ isTempPassword: true });
    try {
      requirePasswordChanged(session);
    } catch (err: unknown) {
      expect((err as { status: number }).status).toBe(403);
    }
  });
});

// ---------------------------------------------------------------------------
// Role helper tests
// ---------------------------------------------------------------------------

describe("role helpers", () => {
  it("isAdmin returns true for ADMIN session", () => {
    expect(isAdmin(makeSession({ role: "ADMIN" }))).toBe(true);
  });

  it("isAdmin returns false for non-ADMIN", () => {
    expect(isAdmin(makeSession({ role: "OPERATOR" }))).toBe(false);
    expect(isAdmin(makeSession({ role: "MEMBER" }))).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });

  it("isOperator returns true for OPERATOR session", () => {
    expect(isOperator(makeSession({ role: "OPERATOR" }))).toBe(true);
  });

  it("isOperator returns false for non-OPERATOR", () => {
    expect(isOperator(makeSession({ role: "ADMIN" }))).toBe(false);
    expect(isOperator(null)).toBe(false);
  });

  it("isMember returns true for MEMBER session", () => {
    expect(isMember(makeSession({ role: "MEMBER" }))).toBe(true);
  });

  it("isMember returns false for non-MEMBER", () => {
    expect(isMember(makeSession({ role: "ADMIN" }))).toBe(false);
    expect(isMember(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canAccessRoute tests
// ---------------------------------------------------------------------------

describe("canAccessRoute", () => {
  it("returns false for null session", () => {
    expect(canAccessRoute(null, "/dashboard/members")).toBe(false);
  });

  it("allows ADMIN to access admin-only routes", () => {
    const session = makeSession({ role: "ADMIN" });
    expect(canAccessRoute(session, "/dashboard/approvals")).toBe(true);
    expect(canAccessRoute(session, "/api/approvals")).toBe(true);
  });

  it("denies OPERATOR from admin-only routes", () => {
    const session = makeSession({ role: "OPERATOR" });
    expect(canAccessRoute(session, "/dashboard/approvals")).toBe(false);
  });

  it("denies MEMBER from admin-only routes", () => {
    const session = makeSession({ role: "MEMBER" });
    expect(canAccessRoute(session, "/dashboard/approvals")).toBe(false);
  });

  it("allows OPERATOR to access admin+operator routes", () => {
    const session = makeSession({ role: "OPERATOR" });
    expect(canAccessRoute(session, "/dashboard/members")).toBe(true);
    expect(canAccessRoute(session, "/dashboard/cash")).toBe(true);
  });

  it("denies MEMBER from operator routes", () => {
    const session = makeSession({ role: "MEMBER" });
    expect(canAccessRoute(session, "/dashboard/members")).toBe(false);
    expect(canAccessRoute(session, "/dashboard/cash")).toBe(false);
  });

  it("allows all roles to access member routes", () => {
    const routes = ["/dashboard/my-membership", "/dashboard"];
    for (const role of ["ADMIN", "OPERATOR", "MEMBER"] as const) {
      const session = makeSession({ role });
      for (const route of routes) {
        expect(canAccessRoute(session, route)).toBe(true);
      }
    }
  });

  it("allows authenticated users to access unlisted routes by default", () => {
    const session = makeSession({ role: "MEMBER" });
    expect(canAccessRoute(session, "/dashboard/some-new-route")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getSessionUser tests
// ---------------------------------------------------------------------------

describe("getSessionUser", () => {
  it("returns null for null session", () => {
    expect(getSessionUser(null)).toBeNull();
  });

  it("returns the user from a valid session", () => {
    const session = makeSession({ role: "ADMIN" });
    const user = getSessionUser(session);
    expect(user?.role).toBe("ADMIN");
  });
});
