/**
 * T35 — Integration tests: Auth flow structure.
 *
 * These tests validate that:
 *   1. Auth route handlers exist and export the correct HTTP methods
 *   2. The NextAuth config object has the required shape
 *   3. The permissions module is importable and exports the expected functions
 *
 * DB-dependent tests use describeIntegration (auto-skipped without DATABASE_URL).
 */

import { describe, it, expect } from "vitest";
import { describeIntegration } from "./helpers";

// ---------------------------------------------------------------------------
// T35a — Auth route handler exports (no DB required)
// ---------------------------------------------------------------------------

describe("auth route — module structure", () => {
  it("next-auth route exports GET and POST handlers", async () => {
    const module = await import("@/app/api/auth/[...nextauth]/route");
    expect(typeof module.GET).toBe("function");
    expect(typeof module.POST).toBe("function");
  });

  it("change-password route exports POST handler", async () => {
    const module = await import("@/app/api/auth/change-password/route");
    expect(typeof module.POST).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// T35b — NextAuth config shape (no DB required)
// ---------------------------------------------------------------------------

describe("NextAuth config — structure validation", () => {
  it("authOptions has required fields", async () => {
    const { authOptions } = await import("@/lib/auth");
    expect(authOptions).toBeDefined();
    expect(typeof authOptions).toBe("object");
    // NextAuth requires at minimum: providers, callbacks
    expect(authOptions).toHaveProperty("providers");
    expect(Array.isArray(authOptions.providers)).toBe(true);
  });

  it("authOptions has at least one provider", async () => {
    const { authOptions } = await import("@/lib/auth");
    expect(authOptions.providers.length).toBeGreaterThan(0);
  });

  it("authOptions has session callback defined", async () => {
    const { authOptions } = await import("@/lib/auth");
    expect(authOptions.callbacks).toBeDefined();
    expect(typeof authOptions.callbacks?.session).toBe("function");
  });

  it("authOptions has jwt callback defined", async () => {
    const { authOptions } = await import("@/lib/auth");
    expect(authOptions.callbacks).toBeDefined();
    expect(typeof authOptions.callbacks?.jwt).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// T35c — Permissions module (no DB required)
// ---------------------------------------------------------------------------

describe("permissions module — exports", () => {
  it("exports requireAuth", async () => {
    const module = await import("@/lib/permissions");
    expect(typeof module.requireAuth).toBe("function");
  });

  it("exports requireRole", async () => {
    const module = await import("@/lib/permissions");
    expect(typeof module.requireRole).toBe("function");
  });

  it("exports requirePasswordChanged", async () => {
    const module = await import("@/lib/permissions");
    expect(typeof module.requirePasswordChanged).toBe("function");
  });

  it("exports isAdmin, isOperator, isMember", async () => {
    const module = await import("@/lib/permissions");
    expect(typeof module.isAdmin).toBe("function");
    expect(typeof module.isOperator).toBe("function");
    expect(typeof module.isMember).toBe("function");
  });

  it("exports canAccessRoute", async () => {
    const module = await import("@/lib/permissions");
    expect(typeof module.canAccessRoute).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// T35d — DB-dependent auth tests (auto-skipped without DATABASE_URL)
// ---------------------------------------------------------------------------

describeIntegration("auth — DB integration", () => {
  it("can import prisma client without error", async () => {
    const { prisma } = await import("@/lib/prisma");
    expect(prisma).toBeDefined();
  });
});
