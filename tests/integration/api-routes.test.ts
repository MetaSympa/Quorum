/**
 * T35 — Integration tests: API route handler exports.
 *
 * Verifies that all API routes:
 *   1. Are importable without throwing
 *   2. Export the correct HTTP method handlers (GET, POST, PUT, DELETE)
 *
 * These tests do NOT make HTTP requests or touch the database.
 * They validate the module structure / API contract at the import level.
 */

import { describe, it, expect } from "vitest";
import { describeIntegration } from "./helpers";

// ---------------------------------------------------------------------------
// Members API
// ---------------------------------------------------------------------------

describe("/api/members — route handler exports", () => {
  it("exports GET and POST", async () => {
    const module = await import("@/app/api/members/route");
    expect(typeof module.GET).toBe("function");
    expect(typeof module.POST).toBe("function");
  });

  it("/api/members/[id] exports GET, PUT, DELETE", async () => {
    const module = await import("@/app/api/members/[id]/route");
    expect(typeof module.GET).toBe("function");
    expect(typeof module.PUT).toBe("function");
    expect(typeof module.DELETE).toBe("function");
  });

  it("/api/members/[id]/sub-members exports GET, POST, PUT, DELETE", async () => {
    const module = await import("@/app/api/members/[id]/sub-members/route");
    expect(typeof module.GET).toBe("function");
    expect(typeof module.POST).toBe("function");
    expect(typeof module.PUT).toBe("function");
    expect(typeof module.DELETE).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Memberships API
// ---------------------------------------------------------------------------

describe("/api/memberships — route handler exports", () => {
  it("exports GET and POST", async () => {
    const module = await import("@/app/api/memberships/route");
    expect(typeof module.GET).toBe("function");
    expect(typeof module.POST).toBe("function");
  });

  it("/api/memberships/[id] exports GET and PUT", async () => {
    const module = await import("@/app/api/memberships/[id]/route");
    expect(typeof module.GET).toBe("function");
    expect(typeof module.PUT).toBe("function");
  });

  it("/api/my-membership exports GET", async () => {
    const module = await import("@/app/api/my-membership/route");
    expect(typeof module.GET).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Transactions API
// ---------------------------------------------------------------------------

describe("/api/transactions — route handler exports", () => {
  it("exports GET and POST", async () => {
    const module = await import("@/app/api/transactions/route");
    expect(typeof module.GET).toBe("function");
    expect(typeof module.POST).toBe("function");
  });

  it("/api/transactions/[id] exports GET, PUT, DELETE", async () => {
    const module = await import("@/app/api/transactions/[id]/route");
    expect(typeof module.GET).toBe("function");
    expect(typeof module.PUT).toBe("function");
    expect(typeof module.DELETE).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Approvals API
// ---------------------------------------------------------------------------

describe("/api/approvals — route handler exports", () => {
  it("exports GET", async () => {
    const module = await import("@/app/api/approvals/route");
    expect(typeof module.GET).toBe("function");
  });

  it("/api/approvals/[id]/approve exports POST", async () => {
    const module = await import("@/app/api/approvals/[id]/approve/route");
    expect(typeof module.POST).toBe("function");
  });

  it("/api/approvals/[id]/reject exports POST", async () => {
    const module = await import("@/app/api/approvals/[id]/reject/route");
    expect(typeof module.POST).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Payments API
// ---------------------------------------------------------------------------

describe("/api/payments — route handler exports", () => {
  it("/api/payments/create-order exports POST", async () => {
    const module = await import("@/app/api/payments/create-order/route");
    expect(typeof module.POST).toBe("function");
  });

  it("/api/payments/verify exports POST", async () => {
    const module = await import("@/app/api/payments/verify/route");
    expect(typeof module.POST).toBe("function");
  });

  it("/api/payments/sponsor-order exports POST", async () => {
    const module = await import("@/app/api/payments/sponsor-order/route");
    expect(typeof module.POST).toBe("function");
  });

  it("/api/payments/sponsor-verify exports POST", async () => {
    const module = await import("@/app/api/payments/sponsor-verify/route");
    expect(typeof module.POST).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Sponsors API
// ---------------------------------------------------------------------------

describe("/api/sponsors — route handler exports", () => {
  it("exports GET and POST", async () => {
    const module = await import("@/app/api/sponsors/route");
    expect(typeof module.GET).toBe("function");
    expect(typeof module.POST).toBe("function");
  });

  it("/api/sponsors/[id] exports GET, PUT, DELETE", async () => {
    const module = await import("@/app/api/sponsors/[id]/route");
    expect(typeof module.GET).toBe("function");
    expect(typeof module.PUT).toBe("function");
    expect(typeof module.DELETE).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Sponsor Links API
// ---------------------------------------------------------------------------

describe("/api/sponsor-links — route handler exports", () => {
  it("exports GET and POST", async () => {
    const module = await import("@/app/api/sponsor-links/route");
    expect(typeof module.GET).toBe("function");
    expect(typeof module.POST).toBe("function");
  });

  it("/api/sponsor-links/[token] exports GET", async () => {
    const module = await import("@/app/api/sponsor-links/[token]/route");
    expect(typeof module.GET).toBe("function");
  });

  it("/api/sponsor-links/[token]/receipt exports GET", async () => {
    const module = await import("@/app/api/sponsor-links/[token]/receipt/route");
    expect(typeof module.GET).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Receipts, Audit & Activity Logs
// ---------------------------------------------------------------------------

describe("utility API routes — handler exports", () => {
  it("/api/receipts/[id] exports GET", async () => {
    const module = await import("@/app/api/receipts/[id]/route");
    expect(typeof module.GET).toBe("function");
  });

  it("/api/audit-log exports GET", async () => {
    const module = await import("@/app/api/audit-log/route");
    expect(typeof module.GET).toBe("function");
  });

  it("/api/activity-log exports GET", async () => {
    const module = await import("@/app/api/activity-log/route");
    expect(typeof module.GET).toBe("function");
  });

  it("/api/dashboard/stats exports GET", async () => {
    const module = await import("@/app/api/dashboard/stats/route");
    expect(typeof module.GET).toBe("function");
  });

  it("/api/cron exports POST", async () => {
    const module = await import("@/app/api/cron/route");
    expect(typeof module.POST).toBe("function");
  });

  it("/api/notifications/whatsapp exports POST", async () => {
    const module = await import("@/app/api/notifications/whatsapp/route");
    expect(typeof module.POST).toBe("function");
  });

  it("/api/webhooks/razorpay exports POST", async () => {
    const module = await import("@/app/api/webhooks/razorpay/route");
    expect(typeof module.POST).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// DB-dependent route smoke tests (auto-skipped without DATABASE_URL)
// ---------------------------------------------------------------------------

describeIntegration("API routes — DB-level smoke tests", () => {
  it("placeholder: add DB-level route tests here when DATABASE_URL is available", () => {
    expect(true).toBe(true);
  });
});
