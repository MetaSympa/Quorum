/**
 * Unit tests for src/lib/whatsapp.ts
 *
 * Tests: phone formatting, isConfigured guard, sendMessage (success + HTTP error + network error),
 * sendTextMessage, graceful skip when not configured.
 *
 * All fetch calls are mocked — no real network traffic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatIndianPhone,
  isConfigured,
  sendMessage,
  sendTextMessage,
} from "@/lib/whatsapp";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Response-like mock. */
function mockFetchResponse(
  ok: boolean,
  body: unknown,
  status = ok ? 200 : 400
): Response {
  return {
    ok,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => body,
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// formatIndianPhone
// ---------------------------------------------------------------------------

describe("formatIndianPhone", () => {
  it("returns +91XXXXXXXXXX unchanged", () => {
    expect(formatIndianPhone("+919876543210")).toBe("+919876543210");
  });

  it("prefixes + when 91XXXXXXXXXX (12 digits no plus)", () => {
    expect(formatIndianPhone("919876543210")).toBe("+919876543210");
  });

  it("prepends +91 for bare 10-digit number", () => {
    expect(formatIndianPhone("9876543210")).toBe("+919876543210");
  });

  it("strips spaces before processing", () => {
    expect(formatIndianPhone("+91 98765 43210")).toBe("+919876543210");
  });

  it("strips dashes before processing", () => {
    expect(formatIndianPhone("+91-9876-543210")).toBe("+919876543210");
  });

  it("handles international number (non-91) unchanged", () => {
    // Non-Indian number — should be returned with + prefix as-is
    const result = formatIndianPhone("+12125551234");
    expect(result).toBe("+12125551234");
  });
});

// ---------------------------------------------------------------------------
// isConfigured
// ---------------------------------------------------------------------------

describe("isConfigured", () => {
  const originalToken = process.env.WHATSAPP_API_TOKEN;
  const originalPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  afterEach(() => {
    // Restore original env
    if (originalToken === undefined) delete process.env.WHATSAPP_API_TOKEN;
    else process.env.WHATSAPP_API_TOKEN = originalToken;

    if (originalPhoneId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhoneId;
  });

  it("returns false when both vars are missing", () => {
    delete process.env.WHATSAPP_API_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    expect(isConfigured()).toBe(false);
  });

  it("returns false when only token is set", () => {
    process.env.WHATSAPP_API_TOKEN = "test-token";
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    expect(isConfigured()).toBe(false);
  });

  it("returns false when only phone number ID is set", () => {
    delete process.env.WHATSAPP_API_TOKEN;
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";
    expect(isConfigured()).toBe(false);
  });

  it("returns true when both vars are set", () => {
    process.env.WHATSAPP_API_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";
    expect(isConfigured()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sendMessage — not configured (graceful skip)
// ---------------------------------------------------------------------------

describe("sendMessage — not configured", () => {
  beforeEach(() => {
    delete process.env.WHATSAPP_API_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  });

  it("returns success=true without making any HTTP call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendMessage("+919876543210", "some_template", ["p1"]);

    expect(result.success).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// sendMessage — configured + success
// ---------------------------------------------------------------------------

describe("sendMessage — configured, success", () => {
  beforeEach(() => {
    process.env.WHATSAPP_API_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";
  });

  afterEach(() => {
    delete process.env.WHATSAPP_API_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    vi.unstubAllGlobals();
  });

  it("sends a POST to the Meta Graph API and returns success + messageId", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        mockFetchResponse(true, { messages: [{ id: "wamid.abc123" }] })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendMessage("9876543210", "test_template", [
      "param1",
      "param2",
    ]);

    expect(result.success).toBe(true);
    expect(result.messageId).toBe("wamid.abc123");

    // Verify URL and method
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("graph.facebook.com/v18.0");
    expect(url).toContain("1234567890/messages");
    expect(init.method).toBe("POST");

    // Verify Authorization header
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-token");
  });

  it("formats the request body with template name and parameters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        mockFetchResponse(true, { messages: [{ id: "wamid.xyz" }] })
      );
    vi.stubGlobal("fetch", fetchMock);

    await sendMessage("+919876543210", "my_template", ["value1", "value2"]);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body.messaging_product).toBe("whatsapp");
    expect(body.template.name).toBe("my_template");
    expect(body.template.components[0].parameters).toEqual([
      { type: "text", text: "value1" },
      { type: "text", text: "value2" },
    ]);
  });

  it("sends with empty components array when no params", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        mockFetchResponse(true, { messages: [{ id: "wamid.empty" }] })
      );
    vi.stubGlobal("fetch", fetchMock);

    await sendMessage("+919876543210", "simple_template", []);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.template.components).toEqual([]);
  });

  it("normalises bare 10-digit number to +91", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        mockFetchResponse(true, { messages: [{ id: "wamid.norm" }] })
      );
    vi.stubGlobal("fetch", fetchMock);

    await sendMessage("9876543210", "t", []);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.to).toBe("+919876543210");
  });
});

// ---------------------------------------------------------------------------
// sendMessage — configured + HTTP error
// ---------------------------------------------------------------------------

describe("sendMessage — configured, HTTP error", () => {
  beforeEach(() => {
    process.env.WHATSAPP_API_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";
  });

  afterEach(() => {
    delete process.env.WHATSAPP_API_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    vi.unstubAllGlobals();
  });

  it("returns success=false with error message on non-OK response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockFetchResponse(false, "Bad Request", 400));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendMessage("+919876543210", "t", ["p"]);

    expect(result.success).toBe(false);
    expect(result.error).toContain("400");
  });
});

// ---------------------------------------------------------------------------
// sendMessage — network error
// ---------------------------------------------------------------------------

describe("sendMessage — network error", () => {
  beforeEach(() => {
    process.env.WHATSAPP_API_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";
  });

  afterEach(() => {
    delete process.env.WHATSAPP_API_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    vi.unstubAllGlobals();
  });

  it("returns success=false with error message on fetch throw", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new Error("Network timeout"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendMessage("+919876543210", "t", []);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Network timeout");
  });

  it("does not throw — always returns a result object", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendMessage("+919876543210", "t", []);
    expect(result).toHaveProperty("success", false);
  });
});

// ---------------------------------------------------------------------------
// sendTextMessage — not configured (graceful skip)
// ---------------------------------------------------------------------------

describe("sendTextMessage — not configured", () => {
  beforeEach(() => {
    delete process.env.WHATSAPP_API_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  });

  it("returns success=true without HTTP call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendTextMessage("+919876543210", "Hello");

    expect(result.success).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// sendTextMessage — configured + success
// ---------------------------------------------------------------------------

describe("sendTextMessage — configured, success", () => {
  beforeEach(() => {
    process.env.WHATSAPP_API_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";
  });

  afterEach(() => {
    delete process.env.WHATSAPP_API_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    vi.unstubAllGlobals();
  });

  it("sends text body and returns messageId", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        mockFetchResponse(true, { messages: [{ id: "wamid.text1" }] })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendTextMessage("+919876543210", "Test message");

    expect(result.success).toBe(true);
    expect(result.messageId).toBe("wamid.text1");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.type).toBe("text");
    expect(body.text.body).toBe("Test message");
  });

  it("returns success=false on HTTP error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockFetchResponse(false, "Unauthorized", 401));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendTextMessage("+919876543210", "Hi");
    expect(result.success).toBe(false);
    expect(result.error).toContain("401");
  });

  it("does not throw on network error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("DNS failure"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendTextMessage("+919876543210", "Hi");
    expect(result.success).toBe(false);
    expect(result.error).toBe("DNS failure");
  });
});

// ---------------------------------------------------------------------------
// TEMPLATES registry
// ---------------------------------------------------------------------------

describe("TEMPLATES registry", () => {
  it("contains all 8 required templates", async () => {
    const { TEMPLATES } = await import("@/lib/services/notification-service");

    expect(TEMPLATES.NEW_APPROVAL.name).toBe("new_approval_request");
    expect(TEMPLATES.PAYMENT_RECEIVED.name).toBe("payment_received");
    expect(TEMPLATES.NEW_MEMBER.name).toBe("new_member_registration");
    expect(TEMPLATES.MEMBERSHIP_APPROVED.name).toBe("membership_approved");
    expect(TEMPLATES.EXPIRY_REMINDER.name).toBe("expiry_reminder");
    expect(TEMPLATES.MEMBERSHIP_EXPIRED.name).toBe("membership_expired");
    expect(TEMPLATES.SPONSOR_PAYMENT.name).toBe("sponsor_payment");
    expect(TEMPLATES.REJECTION.name).toBe("rejection_notice");
  });
});
