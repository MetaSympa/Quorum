/**
 * T36 — Component test stubs: Page components.
 *
 * Verifies that all Next.js page components:
 *   1. Are importable without throwing
 *   2. Export a default export (React component function)
 *
 * These are structural / smoke tests only.
 * Full page rendering requires a Next.js environment with mocked navigation.
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Root-level pages
// ---------------------------------------------------------------------------

describe("Root pages — module structure", () => {
  it("/ (home) page exports a default component", async () => {
    const module = await import("@/app/page");
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe("function");
  });

  it("/login page exports a default component", async () => {
    const module = await import("@/app/login/page");
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe("function");
  });

  it("/change-password page exports a default component", async () => {
    const module = await import("@/app/change-password/page");
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe("function");
  });

  it("/membership-form page exports a default component", async () => {
    const module = await import("@/app/membership-form/page");
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Sponsor pages (public)
// ---------------------------------------------------------------------------

describe("Sponsor pages — module structure", () => {
  it("/sponsor/[token] page exports a default component", async () => {
    const module = await import("@/app/sponsor/[token]/page");
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe("function");
  });

  it("/sponsor/[token]/receipt page exports a default component", async () => {
    const module = await import("@/app/sponsor/[token]/receipt/page");
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Dashboard pages (authenticated)
// ---------------------------------------------------------------------------

describe("Dashboard pages — module structure", () => {
  it("/dashboard page exports a default component", async () => {
    const module = await import("@/app/dashboard/page");
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe("function");
  });

  it("/dashboard/members page exports a default component", async () => {
    const module = await import("@/app/dashboard/members/page");
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe("function");
  });

  it("/dashboard/cash page exports a default component", async () => {
    const module = await import("@/app/dashboard/cash/page");
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe("function");
  });

  it("/dashboard/approvals page exports a default component", async () => {
    const module = await import("@/app/dashboard/approvals/page");
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe("function");
  });

  it("/dashboard/sponsorship page exports a default component", async () => {
    const module = await import("@/app/dashboard/sponsorship/page");
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe("function");
  });

  it("/dashboard/my-membership page exports a default component", async () => {
    const module = await import("@/app/dashboard/my-membership/page");
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe("function");
  });

  it("/dashboard/audit-log page exports a default component", async () => {
    const module = await import("@/app/dashboard/audit-log/page");
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe("function");
  });

  it("/dashboard/activity-log page exports a default component", async () => {
    const module = await import("@/app/dashboard/activity-log/page");
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// App layouts
// ---------------------------------------------------------------------------

describe("App layouts — module structure", () => {
  // Root layout uses next/font/local (localFont) which is a Next.js build-time
  // API not available in the Vitest jsdom environment. We skip import-level
  // testing for the root layout and instead verify the dashboard layout.
  it.skip("Root layout exports a default component (skipped: uses next/font/local)", async () => {
    // next/font/local is not available outside the Next.js build pipeline.
    // The root layout is verified at build time via `tsc --noEmit`.
  });

  it("Dashboard layout exports a default component", async () => {
    const module = await import("@/app/dashboard/layout");
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe("function");
  });
});
