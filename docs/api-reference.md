# API Reference

All API routes are prefixed with `/api`. Unless marked **Public**, every route requires a valid session cookie set by NextAuth after login.

Role codes: **A** = Admin only, **AO** = Admin + Operator, **ALL** = All authenticated users, **PUB** = Public (no auth).

---

## Auth

### POST /api/auth/[...nextauth]

NextAuth credentials login endpoint.

**Public** (login itself) / session management handled by NextAuth.

**Login request:**
```json
{ "email": "admin@dps.club", "password": "Admin@123" }
```

**Response:** Sets `dps.session-token` HTTP-only cookie. Redirects to `/dashboard` or `/change-password`.

Rate limit: 5 attempts per 15 minutes per email address.

---

### POST /api/auth/change-password

Force-change a temporary password. Required on first login when `isTempPassword=true`.

**Auth:** ALL

**Request:**
```json
{
  "currentPassword": "TempPass@123",
  "newPassword": "MyNewPass@456"
}
```

**Response:**
```json
{ "message": "Password changed successfully" }
```

---

## Members

### GET /api/members

List all members with optional filtering.

**Auth:** AO

**Query params:** `status`, `search`, `page`, `limit`

**Example:**
```bash
curl -b cookies.txt "http://localhost:3000/api/members?status=ACTIVE&search=Rajesh"
```

**Response:**
```json
{
  "members": [
    {
      "id": "uuid",
      "name": "Rajesh Mukherjee",
      "email": "rajesh.m@gmail.com",
      "phone": "+919831234567",
      "memberId": "DPC-2026-0001-00",
      "membershipStatus": "ACTIVE",
      "membershipType": "ANNUAL",
      "membershipExpiry": "2027-03-15T00:00:00.000Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

---

### POST /api/members

Add a new member. Operators submit to the approval queue; admins apply directly.

**Auth:** AO

**Request:**
```json
{
  "name": "Priya Bose",
  "email": "priya.bose@gmail.com",
  "phone": "+919876543210",
  "address": "12 Lake Terrace, Kolkata 700029"
}
```

**Response (admin):**
```json
{ "member": { "id": "uuid", "memberId": "DPC-2026-0042-00", ... } }
```

**Response (operator):**
```json
{ "approval": { "id": "uuid", "status": "PENDING", "entityType": "MEMBER_ADD" } }
```

---

### GET /api/members/[id]

Get a single member record.

**Auth:** AO

---

### PUT /api/members/[id]

Update a member. Operators submit to the approval queue; admins apply directly.

**Auth:** AO

**Request:** Partial member fields to update.

---

### DELETE /api/members/[id]

Delete a member. Operators submit to the approval queue; admins apply directly.

**Auth:** AO

---

### GET /api/members/[id]/sub-members

List sub-members for a given primary member.

**Auth:** AO

---

### POST /api/members/[id]/sub-members

Add a sub-member (max 3 per primary member, enforced server-side).

**Auth:** AO

**Request:**
```json
{
  "name": "Ananya Mukherjee",
  "email": "ananya.m@gmail.com",
  "phone": "+919831234568",
  "relation": "Spouse"
}
```

**Response:**
```json
{
  "subMember": {
    "id": "uuid",
    "memberId": "DPC-2026-0001-01",
    "name": "Ananya Mukherjee",
    "relation": "Spouse"
  }
}
```

---

## Memberships

### GET /api/memberships

List membership periods. Members see only their own; admin/operator see all.

**Auth:** ALL

**Query params:** `memberId`, `status`, `page`, `limit`

---

### POST /api/memberships

Create a membership payment period. Operators submit to approval queue; Razorpay payments are auto-approved.

**Auth:** ALL

**Request:**
```json
{
  "memberId": "uuid-of-member-record",
  "type": "ANNUAL",
  "isApplicationFee": false
}
```

**Response:**
```json
{
  "membership": {
    "id": "uuid",
    "type": "ANNUAL",
    "amount": "3000.00",
    "startDate": "2026-03-15",
    "endDate": "2027-03-15",
    "status": "PENDING"
  }
}
```

---

### GET /api/memberships/[id]

Get a single membership period.

**Auth:** ALL

---

### PUT /api/memberships/[id]

Update a membership period (admin only for status changes).

**Auth:** AO

---

## Payments

### POST /api/payments/create-order

Create a Razorpay order for UPI or bank transfer payment.

**Auth:** ALL

**Request:**
```json
{
  "membershipId": "uuid",
  "type": "UPI"
}
```

**Response:**
```json
{
  "orderId": "order_ABC123",
  "amount": 300000,
  "currency": "INR",
  "keyId": "rzp_test_xxxx"
}
```

Amount is in paise (300000 = Rs. 3,000).

---

### POST /api/payments/verify

Verify a Razorpay payment signature after client-side checkout completion.

**Auth:** ALL

**Request:**
```json
{
  "razorpay_order_id": "order_ABC123",
  "razorpay_payment_id": "pay_XYZ789",
  "razorpay_signature": "hmac-sha256-signature"
}
```

**Response:**
```json
{ "verified": true, "transactionId": "uuid" }
```

---

## Webhooks

### POST /api/webhooks/razorpay

Razorpay webhook endpoint. Handles `payment.captured`, `payment.failed`, and `virtual_account.credited` events.

**Public** (but HMAC-verified via `x-razorpay-signature` header)

**Headers:**
```
x-razorpay-signature: <hmac-sha256>
Content-Type: application/json
```

This endpoint:
1. Verifies HMAC signature
2. Extracts payment details (amount, sender name, UPI VPA or bank account)
3. Creates a Transaction record with `approvalSource=RAZORPAY_WEBHOOK`
4. Auto-approves the transaction
5. Updates membership status to ACTIVE
6. Generates receipt
7. Writes audit + activity logs
8. Sends WhatsApp notifications

Rate limit: 50 requests/minute per IP.

---

## Transactions

### GET /api/transactions

List cash in/out transactions.

**Auth:** AO

**Query params:** `type`, `category`, `approvalStatus`, `from`, `to`, `page`, `limit`

**Example:**
```bash
curl -b cookies.txt "http://localhost:3000/api/transactions?type=CASH_IN&category=MEMBERSHIP_FEE"
```

**Response:**
```json
{
  "transactions": [
    {
      "id": "uuid",
      "type": "CASH_IN",
      "category": "MEMBERSHIP_FEE",
      "amount": "3000.00",
      "paymentMode": "UPI",
      "approvalStatus": "APPROVED",
      "approvalSource": "RAZORPAY_WEBHOOK",
      "senderName": "Rajesh Mukherjee",
      "senderUpiId": "rajesh@okicici",
      "createdAt": "2026-03-15T10:30:00.000Z"
    }
  ],
  "total": 128
}
```

---

### POST /api/transactions

Create a cash transaction. Operators submit to approval queue; admins apply directly.

**Auth:** AO

**Request:**
```json
{
  "type": "CASH_IN",
  "category": "MEMBERSHIP_FEE",
  "amount": 3000,
  "paymentMode": "CASH",
  "description": "Annual membership fee from Rajesh Mukherjee",
  "memberId": "uuid-of-member-record",
  "senderName": "Rajesh Mukherjee"
}
```

---

### GET /api/transactions/[id]

Get a single transaction with full details.

**Auth:** AO

---

### PUT /api/transactions/[id]

Update a transaction. Operators submit to approval queue.

**Auth:** AO

---

### DELETE /api/transactions/[id]

Delete a transaction. Operators submit to approval queue.

**Auth:** AO

---

## Sponsors

### GET /api/sponsors

List all sponsors.

**Auth:** AO

---

### POST /api/sponsors

Create a sponsor record.

**Auth:** AO

**Request:**
```json
{
  "name": "Tarun Agarwal",
  "email": "tarun@agarwal-enterprises.in",
  "phone": "+919830011223",
  "company": "Agarwal Enterprises"
}
```

**Response:**
```json
{
  "sponsor": {
    "id": "uuid",
    "name": "Tarun Agarwal",
    "company": "Agarwal Enterprises",
    "createdAt": "2026-03-15T09:00:00.000Z"
  }
}
```

---

### GET /api/sponsors/[id]

Get a single sponsor.

**Auth:** AO

---

### PUT /api/sponsors/[id]

Update a sponsor.

**Auth:** AO

---

### DELETE /api/sponsors/[id]

Delete a sponsor.

**Auth:** AO

---

## Sponsor Links

### GET /api/sponsor-links

List sponsor payment links.

**Auth:** AO

---

### POST /api/sponsor-links

Generate a new sponsor payment link.

**Auth:** AO

**Request:**
```json
{
  "sponsorId": "uuid-optional",
  "amount": 50000,
  "upiId": "dps.club@okaxis",
  "bankDetails": {
    "accountNumber": "0123456789",
    "bankName": "Axis Bank",
    "ifscCode": "UTIB0001234"
  },
  "sponsorPurpose": "GOLD_SPONSOR",
  "expiresAt": "2026-10-31T00:00:00.000Z"
}
```

**Response:**
```json
{
  "link": {
    "id": "uuid",
    "token": "a1b2c3d4e5f6...",
    "url": "https://yourdomain.com/sponsor/a1b2c3d4e5f6",
    "isActive": true
  }
}
```

---

### GET /api/sponsor-links/[token]

Public endpoint — get sponsor checkout page data by token.

**Public**

**Response:**
```json
{
  "link": {
    "token": "a1b2c3d4e5f6",
    "amount": "50000.00",
    "upiId": "dps.club@okaxis",
    "bankDetails": { "accountNumber": "XXXX6789", "bankName": "Axis Bank", "ifscCode": "UTIB0001234" },
    "sponsor": { "name": "Tarun Agarwal", "company": "Agarwal Enterprises" },
    "isActive": true
  }
}
```

Rate limit: 30 requests/minute per IP.

---

## Approvals

### GET /api/approvals

List pending (or all) approval requests.

**Auth:** A

**Query params:** `status` (PENDING/APPROVED/REJECTED), `entityType`, `page`, `limit`

**Response:**
```json
{
  "approvals": [
    {
      "id": "uuid",
      "entityType": "MEMBER_ADD",
      "action": "add_member",
      "newData": { "name": "Priya Bose", "email": "priya.bose@gmail.com" },
      "previousData": null,
      "status": "PENDING",
      "requestedBy": { "name": "Operator Name", "email": "operator@dps.club" },
      "createdAt": "2026-03-15T08:00:00.000Z"
    }
  ],
  "total": 5
}
```

---

### POST /api/approvals/[id]/approve

Approve a pending request. Applies the change to the target entity in the database.

**Auth:** A

**Request:**
```json
{ "notes": "Approved — member verified in person" }
```

**Response:**
```json
{ "approval": { "id": "uuid", "status": "APPROVED", "reviewedAt": "..." } }
```

---

### POST /api/approvals/[id]/reject

Reject a pending request. No changes are applied to the target entity.

**Auth:** A

**Request:**
```json
{ "notes": "Duplicate entry — member already registered" }
```

**Response:**
```json
{ "approval": { "id": "uuid", "status": "REJECTED", "reviewedAt": "..." } }
```

---

## Logs

### GET /api/audit-log

Financial audit log — append-only, full transaction data embedded.

**Auth:** AO

**Query params:** `entityType`, `from`, `to`, `page`, `limit`

**Response:**
```json
{
  "logs": [
    {
      "id": "uuid",
      "entityType": "Transaction",
      "entityId": "uuid",
      "action": "approve_transaction",
      "newData": { "amount": "3000.00", "approvalStatus": "APPROVED", ... },
      "previousData": { "approvalStatus": "PENDING" },
      "transaction": { "id": "uuid", "type": "CASH_IN", "amount": "3000.00", ... },
      "performedBy": { "name": "Admin Name" },
      "createdAt": "2026-03-15T10:30:00.000Z"
    }
  ],
  "total": 342
}
```

---

### GET /api/activity-log

System-wide activity log — all user and system actions.

**Auth:** AO

**Query params:** `userId`, `action`, `from`, `to`, `page`, `limit`

---

## Receipts

### GET /api/receipts/[id]

Generate a printable HTML receipt for a transaction.

**Auth:** AO

Returns an HTML document formatted for A5 paper. Open in browser and print with `Ctrl+P`.

---

## Notifications

### POST /api/notifications/whatsapp

Manually trigger a WhatsApp notification (admin use / testing).

**Auth:** A

**Request:**
```json
{
  "type": "payment_received",
  "phone": "+919876543210",
  "params": ["3000.00", "Rajesh Mukherjee", "UPI"]
}
```

---

## Dashboard

### GET /api/dashboard/stats

Summary statistics for the dashboard home page.

**Auth:** ALL

**Response:**
```json
{
  "totalMembers": 42,
  "activeMembers": 38,
  "pendingApprovals": 3,
  "totalIncome": "125000.00",
  "totalExpenses": "22000.00",
  "recentActivity": [...],
  "recentAuditEntries": [...]
}
```

---

## Error Responses

All error responses follow the same shape:

```json
{ "error": "Human-readable message" }
```

| Status | Meaning |
|--------|---------|
| 400 | Invalid request body or parameters |
| 401 | Not authenticated (no session cookie) |
| 403 | Authenticated but insufficient role, or temp password not changed |
| 404 | Resource not found |
| 409 | Conflict (e.g. duplicate email, member cap exceeded) |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
