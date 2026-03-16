# Razorpay Setup

Quorum uses Razorpay to accept UPI and bank transfer payments from members and sponsors. This document covers account creation, API key configuration, and webhook setup.

---

## 1. Create a Razorpay Account

1. Go to https://dashboard.razorpay.com/signup
2. Complete KYC with your organization's business details
3. Activate the account. Test mode is available immediately without KYC completion

---

## 2. Obtain API Keys

In the Razorpay Dashboard:

1. Go to **Settings** > **API Keys**
2. Click **Generate Test Key** for test mode keys
3. Note the **Key ID** (`rzp_test_...`) and **Key Secret**

For live mode:
1. Complete KYC and account activation
2. Click **Generate Live Key**
3. Note the live **Key ID** (`rzp_live_...`) and **Key Secret**

Add these to your `.env`:

```env
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your-key-secret
RAZORPAY_TEST_MODE=true
```

Set `RAZORPAY_TEST_MODE=false` when switching to live mode.

---

## 3. Configure the Webhook

Razorpay sends webhook events when payments are completed. The Quorum webhook endpoint is:

```
https://yourdomain.com/api/webhooks/razorpay
```

For local development use a tunnel like ngrok:

```bash
npx ngrok http 3000
# Gives you: https://abc123.ngrok.io
# Webhook URL: https://abc123.ngrok.io/api/webhooks/razorpay
```

### Register the webhook in Razorpay Dashboard

1. Go to **Settings** > **Webhooks**
2. Click **Add New Webhook**
3. Enter your webhook URL
4. Set a **Webhook Secret** (any strong random string)
5. Enable the following events:

| Event | Purpose |
|-------|---------|
| `payment.captured` | UPI and card payments confirmed |
| `payment.failed` | Payment failure (for logging) |
| `virtual_account.credited` | Bank transfer (NEFT/RTGS/IMPS) received |

6. Click **Save**

Add the webhook secret to `.env`:

```env
RAZORPAY_WEBHOOK_SECRET=your-webhook-secret
```

### How webhook verification works

Every incoming webhook is verified with HMAC-SHA256:

```
HMAC = SHA256(raw_request_body, RAZORPAY_WEBHOOK_SECRET)
```

The handler at `/api/webhooks/razorpay` rejects any request where the `x-razorpay-signature` header does not match. This prevents spoofed payment events.

---

## 4. Test Mode vs Live Mode

| Setting | `RAZORPAY_TEST_MODE=true` | `RAZORPAY_TEST_MODE=false` |
|---------|--------------------------|---------------------------|
| Key prefix | `rzp_test_` | `rzp_live_` |
| Payments | Simulated, no real money | Real INR transactions |
| Login page | Shows test login buttons | No test buttons |
| Webhooks | Test events from Razorpay | Real payment events |

In test mode you can simulate payments using Razorpay's test cards and UPI IDs:
- **Test UPI**: `success@razorpay`
- **Test card**: `4111 1111 1111 1111`, CVV `123`, any future date
- **Test bank transfer**: Use Razorpay's virtual account test flow in the dashboard

---

## 5. Virtual Accounts for Bank Transfers

Quorum uses Razorpay Virtual Accounts (VANs) to auto-detect bank transfers (NEFT/RTGS/IMPS).

When a member or sponsor chooses "Bank Transfer":
1. The app calls `POST /api/payments/create-order` which creates a Razorpay order
2. A virtual account number is assigned to the order
3. The payer transfers money to that account number
4. Razorpay fires a `virtual_account.credited` webhook
5. The webhook handler creates a Transaction record with the sender's bank details

VAN support must be enabled on your Razorpay account. Contact Razorpay support if this feature is not visible in your dashboard.

---

## 6. Payment Amounts (Fixed)

The application enforces exact payment amounts — no partial payments are accepted:

| Type | Amount |
|------|--------|
| Monthly membership | Rs. 250 |
| Half-yearly membership | Rs. 1,500 |
| Annual membership | Rs. 3,000 |
| Application fee (one-time) | Rs. 10,000 |
| Sponsor payments | As set in sponsor link |

If a Razorpay payment amount does not match the expected amount, the webhook handler rejects the transaction.

---

## 7. Sponsor Links

Sponsor payment links use the same Razorpay infrastructure but are accessible without login. The public checkout page at `/sponsor/[token]` presents UPI and bank transfer options. After payment, the webhook auto-creates a Transaction with `category=SPONSORSHIP` and the configured `sponsorPurpose`.

---

## 8. Troubleshooting

**Webhook signature mismatch (HTTP 400)**
The `RAZORPAY_WEBHOOK_SECRET` in `.env` must exactly match the secret configured in the Razorpay Dashboard. No extra whitespace.

**Orders not being created**
Check that `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are correct and that test/live mode matches the key prefix (`rzp_test_` vs `rzp_live_`).

**Virtual account events not received**
Ensure `virtual_account.credited` is checked under webhook event subscriptions. Also confirm VAN is enabled on your account.

**Payments in test mode not triggering webhooks**
In the Razorpay Dashboard, go to **Webhooks** > select your webhook > click **Test** to send a sample event to your endpoint.
