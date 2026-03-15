/**
 * WhatsApp Cloud API client for DPS Dashboard.
 *
 * Uses the Meta Graph API (graph.facebook.com/v18.0) to send WhatsApp messages
 * via pre-approved Business templates.
 *
 * Design rules:
 *   - Never throws — all errors are caught and returned as { success: false, error }
 *   - Graceful skip if WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID are not set
 *   - Phone numbers are normalised to E.164 +91XXXXXXXXXX format for Indian numbers
 *   - All HTTP calls use native fetch() — no axios dependency
 *
 * Configuration (add to .env):
 *   WHATSAPP_API_TOKEN        — Meta User or System User token
 *   WHATSAPP_PHONE_NUMBER_ID  — Business phone number ID from Meta Developer console
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * A single component parameter for a WhatsApp template body.
 * Supports text substitution variables only.
 */
export interface TemplateParam {
  type: "text";
  text: string;
}

// ---------------------------------------------------------------------------
// Configuration helpers
// ---------------------------------------------------------------------------

const GRAPH_API_BASE = "https://graph.facebook.com/v18.0";

/**
 * Returns true when both required environment variables are set.
 * Use this guard before sending any message.
 */
export function isConfigured(): boolean {
  return (
    Boolean(process.env.WHATSAPP_API_TOKEN) &&
    Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID)
  );
}

// ---------------------------------------------------------------------------
// Phone number formatting
// ---------------------------------------------------------------------------

/**
 * Normalises a phone number to E.164 format with the +91 country code.
 *
 * Handles:
 *   - "+91XXXXXXXXXX" — returned as-is
 *   - "91XXXXXXXXXX"  — prepends "+"
 *   - "XXXXXXXXXX"   — prepends "+91"
 *   - Any non-digit characters stripped before processing
 */
export function formatIndianPhone(phone: string): string {
  // Strip everything except digits and the leading +
  const stripped = phone.replace(/[^\d+]/g, "");
  const digits = stripped.replace(/^\+/, "");

  if (digits.startsWith("91") && digits.length === 12) {
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+91${digits}`;
  }

  // Already has a country code that isn't 91, or some other format — keep as-is
  return stripped.startsWith("+") ? stripped : `+${stripped}`;
}

// ---------------------------------------------------------------------------
// Core send helpers
// ---------------------------------------------------------------------------

/**
 * Sends a WhatsApp template message.
 *
 * @param to             Recipient phone number (will be normalised to +91…)
 * @param templateName   Name of the pre-approved Meta Business template
 * @param templateParams Ordered list of body variable values
 * @param languageCode   BCP-47 language tag; defaults to "en"
 */
export async function sendMessage(
  to: string,
  templateName: string,
  templateParams: string[],
  languageCode = "en"
): Promise<WhatsAppSendResult> {
  if (!isConfigured()) {
    console.debug(
      "[whatsapp] WhatsApp not configured, skipping message to",
      to
    );
    return { success: true };
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const token = process.env.WHATSAPP_API_TOKEN!;
  const recipient = formatIndianPhone(to);

  const body = {
    messaging_product: "whatsapp",
    to: recipient,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components:
        templateParams.length > 0
          ? [
              {
                type: "body",
                parameters: templateParams.map(
                  (text): TemplateParam => ({ type: "text", text })
                ),
              },
            ]
          : [],
    },
  };

  try {
    const response = await fetch(
      `${GRAPH_API_BASE}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[whatsapp] API error ${response.status} sending template "${templateName}" to ${recipient}:`,
        errorText
      );
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const data = (await response.json()) as {
      messages?: Array<{ id: string }>;
    };
    const messageId = data.messages?.[0]?.id;

    return { success: true, messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[whatsapp] Network error sending template "${templateName}" to ${recipient}:`,
      message
    );
    return { success: false, error: message };
  }
}

/**
 * Sends a freeform text message (for testing / development only).
 *
 * Note: Meta restricts freeform messages to within 24-hour customer-care windows.
 * For production notifications always use `sendMessage` with a pre-approved template.
 *
 * @param to   Recipient phone number
 * @param text Message body text
 */
export async function sendTextMessage(
  to: string,
  text: string
): Promise<WhatsAppSendResult> {
  if (!isConfigured()) {
    console.debug(
      "[whatsapp] WhatsApp not configured, skipping text message to",
      to
    );
    return { success: true };
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const token = process.env.WHATSAPP_API_TOKEN!;
  const recipient = formatIndianPhone(to);

  const body = {
    messaging_product: "whatsapp",
    to: recipient,
    type: "text",
    text: { preview_url: false, body: text },
  };

  try {
    const response = await fetch(
      `${GRAPH_API_BASE}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[whatsapp] API error ${response.status} sending text to ${recipient}:`,
        errorText
      );
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const data = (await response.json()) as {
      messages?: Array<{ id: string }>;
    };
    const messageId = data.messages?.[0]?.id;

    return { success: true, messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[whatsapp] Network error sending text to ${recipient}:`,
      message
    );
    return { success: false, error: message };
  }
}
