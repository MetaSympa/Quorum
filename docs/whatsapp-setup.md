# WhatsApp Setup

DPS Dashboard sends WhatsApp notifications via the Meta Cloud API using pre-approved Business message templates. This document covers account creation, API token setup, and template registration.

WhatsApp is entirely optional. If the environment variables are left empty, all notification calls return silently without errors. The system works fully without WhatsApp configured.

---

## 1. Create a Meta Business Account

1. Go to https://business.facebook.com and sign up
2. Complete business verification with your organisation details
3. Note your **Business Account ID** from the Business Settings overview

---

## 2. Set Up WhatsApp Business API

1. In Meta Business Suite, go to **Settings** > **Business Assets**
2. Click **Add Assets** > **WhatsApp Account**
3. Follow the onboarding wizard to register a phone number

Requirements:
- A phone number not previously registered on WhatsApp
- The number must be able to receive SMS or voice calls for verification

After verification:
- Note the **Phone Number ID** from the WhatsApp Manager
- Note the **WhatsApp Business Account ID**

---

## 3. Generate an API Token

### Option A: Temporary Token (Development)

1. In Meta Developers (https://developers.facebook.com), open your app
2. Go to **WhatsApp** > **API Setup**
3. Copy the temporary access token (valid 24 hours)

### Option B: System User Token (Production, recommended)

1. In Meta Business Suite, go to **Settings** > **Users** > **System Users**
2. Create a system user with **Admin** role
3. Click **Generate New Token**
4. Select your WhatsApp app and grant `whatsapp_business_messaging` permission
5. Copy the token (it does not expire unless revoked)

---

## 4. Configure Environment Variables

Add to your `.env`:

```env
WHATSAPP_API_TOKEN=your-meta-system-user-token
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_BUSINESS_ACCOUNT_ID=987654321098765
```

The `WHATSAPP_BUSINESS_ACCOUNT_ID` is used during template registration but not in the send API call itself. Only `WHATSAPP_API_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are required at runtime.

---

## 5. Register Message Templates

All outgoing notifications use pre-approved templates. You must register each template in Meta Business Manager before the system can send it.

### How to register a template

1. Go to https://business.facebook.com/wa/manage/message-templates
2. Select your WhatsApp Business Account
3. Click **Create Template**
4. Set Category to **Utility** (for transactional messages)
5. Enter the template name exactly as shown below
6. Add the template body with `{{1}}`, `{{2}}`, ... placeholders
7. Submit for review (typically approved within minutes for Utility templates)

### Required Templates

The following 8 templates must be registered. Template names are exact — do not modify them.

---

#### 1. `new_approval_request`

**Category**: Utility

**Body**:
```
New approval request received for {{1}} submitted by {{2}}. Please review in the DPS Dashboard approval queue.
```

**Parameters**: `{{1}}` = entity type (e.g. "MEMBER ADD"), `{{2}}` = requester name

**Sent to**: All admins and operators

---

#### 2. `payment_received`

**Category**: Utility

**Body**:
```
Payment received: Rs. {{1}} from {{2}} via {{3}}. Please review in the DPS Dashboard.
```

**Parameters**: `{{1}}` = amount, `{{2}}` = member/payer name, `{{3}}` = payment mode (UPI/BANK_TRANSFER/CASH)

**Sent to**: All admins and operators

---

#### 3. `new_member_registration`

**Category**: Utility

**Body**:
```
New member registration: {{1}} (ID: {{2}}) has been added and is pending approval.
```

**Parameters**: `{{1}}` = member name, `{{2}}` = member ID (e.g. DPC-2026-0025-00)

**Sent to**: All admins and operators

---

#### 4. `membership_approved`

**Category**: Utility

**Body**:
```
Welcome to Deshapriya Park Durgotsab Samity, {{1}}! Your membership has been approved. Login at {{2}} using email: {{3}} and temporary password: {{4}}. Please change your password on first login.
```

**Parameters**: `{{1}}` = member name, `{{2}}` = login URL, `{{3}}` = email, `{{4}}` = temporary password

**Sent to**: Member, sub-members, admins, and operators

---

#### 5. `expiry_reminder`

**Category**: Utility

**Body**:
```
Reminder: {{1}}, your DPS membership expires in {{2}} days on {{3}}. Please renew to avoid interruption.
```

**Parameters**: `{{1}}` = member name, `{{2}}` = days remaining, `{{3}}` = expiry date (DD/MM/YYYY)

**Sent to**: Member and sub-members only

---

#### 6. `membership_expired`

**Category**: Utility

**Body**:
```
Dear {{1}} (ID: {{2}}), your DPS membership has expired. Please contact the club to renew.
```

**Parameters**: `{{1}}` = member name, `{{2}}` = member ID

**Sent to**: Member, sub-members, admins, and operators

---

#### 7. `sponsor_payment`

**Category**: Utility

**Body**:
```
Sponsor payment received from {{1}}: Rs. {{2}} for {{3}}. Thank you for supporting Deshapriya Park Durga Puja.
```

**Parameters**: `{{1}}` = sponsor name, `{{2}}` = amount, `{{3}}` = sponsor purpose (e.g. "GOLD SPONSOR")

**Sent to**: All admins and operators

---

#### 8. `rejection_notice`

**Category**: Utility

**Body**:
```
Your {{1}} request has been rejected. Reason: {{2}}. Please contact an admin for more information.
```

**Parameters**: `{{1}}` = entity type, `{{2}}` = rejection reason

**Sent to**: Operator who submitted the rejected request

---

## 6. Free Tier Limits

Meta Cloud API provides 1,000 free conversations per month per WhatsApp Business account. A "conversation" is a 24-hour messaging window opened by a business-initiated template message.

For a club with under 500 members and typical notification volume (payments, renewals, approvals), the free tier is sufficient.

---

## 7. Graceful Degradation

If `WHATSAPP_API_TOKEN` or `WHATSAPP_PHONE_NUMBER_ID` are not set in `.env`, the notification service checks for them before every send call:

```typescript
export function isConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_API_TOKEN) &&
         Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID);
}
```

When unconfigured, `sendMessage()` returns `{ success: true }` immediately without making any HTTP call. All events are still logged to the ActivityLog so there is an audit trail even without WhatsApp.

---

## 8. Testing Notifications

To test a template send without going through a real payment flow:

```bash
curl -X POST https://yourdomain.com/api/notifications/whatsapp \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type": "payment_received", "phone": "+919876543210", "params": ["250.00", "Rajesh Kumar", "UPI"]}'
```

This endpoint requires ADMIN role authentication.

---

## 9. Phone Number Format

The system automatically normalises all Indian phone numbers to E.164 format before sending:
- `9876543210` becomes `+919876543210`
- `919876543210` becomes `+919876543210`
- `+919876543210` is passed through unchanged

Numbers stored in the database are expected to be in `+91XXXXXXXXXX` format.
