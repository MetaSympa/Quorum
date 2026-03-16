# Data Model

Quorum uses PostgreSQL 16 with Prisma ORM. The schema defines 10 enums and 10 models. All PII fields (phone numbers, addresses, bank details) are encrypted at rest using AES-256-GCM via Prisma middleware.

---

## Relationships Overview

```
User (primary member, admin, operator)
  |-- SubMember[]          (up to 3 sub-members per user)
  |-- Member?              (linked Member record if has login)
  |-- Transaction[]        (entered by this user)
  |-- Approval[]           (requested by / reviewed by)
  |-- AuditLog[]           (performed by)
  |-- ActivityLog[]
  |-- Sponsor[]            (created by)
  |-- SponsorLink[]        (created by)

Member (canonical member record)
  |-- User?                (linked login account, if any)
  |-- Member? (parent)     (nullable — for sub-member records)
  |-- Member[] (children)  (sub-member records)
  |-- Membership[]         (payment periods)
  |-- Transaction[]        (linked to this member)

Membership (payment period)
  |-- Member               (owner)

Transaction (cash in/out)
  |-- Member?              (linked member for membership payments)
  |-- Sponsor?             (linked sponsor for sponsorship payments)
  |-- User (enteredBy)     (SYSTEM user for webhook auto-creates)
  |-- User? (approvedBy)
  |-- AuditLog[]

Sponsor
  |-- Transaction[]        (sponsorship payments)
  |-- SponsorLink[]

SponsorLink
  |-- Sponsor?             (nullable — can be generic)
  |-- User (createdBy)

Approval
  |-- User (requestedBy)
  |-- User? (reviewedBy)

AuditLog
  |-- Transaction?         (linked transaction, full record)
  |-- User (performedBy)

ActivityLog
  |-- User
```

---

## Member ID Format

All member IDs follow the format `DPC-YYYY-NNNN-SS`:

| Segment | Meaning | Example |
|---------|---------|---------|
| `DPC` | Organization prefix | `DPC` |
| `YYYY` | Year of joining | `2026` |
| `NNNN` | Auto-incremented member number (zero-padded to 4 digits) | `0025` |
| `SS` | Sub-member index: `00` = primary, `01`–`03` = sub-members | `00`, `01` |

Examples:
- `DPC-2026-0025-00` — primary member #25 who joined in 2026
- `DPC-2026-0025-01` — first sub-member of that primary member
- `DPC-2026-0025-02` — second sub-member

Member IDs are unique across the entire system. Sub-members share the prefix of their parent.

---

## Models

### User

Primary login accounts for admins, operators, and primary members.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID PK | Auto-generated |
| `memberId` | VARCHAR(20) UNIQUE | Format: DPC-YYYY-NNNN-00 |
| `name` | VARCHAR(255) | Full name |
| `email` | VARCHAR(255) UNIQUE | Login email |
| `phone` | TEXT | **Encrypted** — WhatsApp number in +91 format |
| `address` | TEXT | **Encrypted** |
| `password` | VARCHAR(255) | bcrypt hash, 12+ rounds |
| `isTempPassword` | BOOLEAN | Default: true — forces password change on first login |
| `role` | Role | ADMIN / OPERATOR / MEMBER |
| `membershipStatus` | MembershipStatus | Lifecycle status (not payment status) |
| `membershipType` | MembershipType? | Set after first payment |
| `membershipStart` | DATE? | Set after first payment |
| `membershipExpiry` | DATE? | Set after first payment |
| `totalPaid` | DECIMAL(12,2) | Running total of approved payments |
| `applicationFeePaid` | BOOLEAN | Whether Rs. 10,000 application fee paid |
| `createdAt` | TIMESTAMPTZ | |
| `updatedAt` | TIMESTAMPTZ | Auto-updated |

Indexes: `role`, `membershipStatus`, `membershipExpiry`

---

### SubMember

Sub-members linked to a primary User. Maximum 3 per parent (enforced in business logic).

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID PK | |
| `memberId` | VARCHAR(20) UNIQUE | Format: DPC-YYYY-NNNN-01 to 03 |
| `parentUserId` | UUID FK → User | Cascade delete |
| `name` | VARCHAR(255) | |
| `email` | VARCHAR(255) UNIQUE | Login email |
| `phone` | TEXT | **Encrypted** — WhatsApp number |
| `password` | VARCHAR(255) | bcrypt hash |
| `isTempPassword` | BOOLEAN | Default: true |
| `relation` | VARCHAR(100) | e.g. "Spouse", "Child", "Parent" |
| `canLogin` | BOOLEAN | Default: true |
| `createdAt` | TIMESTAMPTZ | |

Indexes: `parentUserId`

---

### Member

Canonical member record. Linked to a User when the member has login credentials. Can represent a non-login member as well.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID PK | |
| `userId` | UUID FK → User UNIQUE | Nullable — linked if has login |
| `name` | VARCHAR(255) | |
| `phone` | TEXT | **Encrypted** |
| `email` | VARCHAR(255) | |
| `address` | TEXT | **Encrypted** |
| `parentMemberId` | UUID FK → Member? | Nullable — for sub-member records |
| `membershipStatus` | MembershipStatus | PENDING_APPROVAL / PENDING_PAYMENT / ACTIVE / EXPIRED / SUSPENDED |
| `joinedAt` | TIMESTAMPTZ | |
| `createdAt` | TIMESTAMPTZ | |
| `updatedAt` | TIMESTAMPTZ | |

Indexes: `userId`, `parentMemberId`, `membershipStatus`

---

### Membership

A single membership payment period. The `status` field here is the approval status of the payment, not the member lifecycle status.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID PK | |
| `memberId` | UUID FK → Member | Cascade delete |
| `type` | MembershipType | MONTHLY / HALF_YEARLY / ANNUAL |
| `amount` | DECIMAL(12,2) | Exact fee: 250 / 1500 / 3000 (or 10000 for application fee) |
| `startDate` | DATE | |
| `endDate` | DATE | |
| `isApplicationFee` | BOOLEAN | True for the one-time Rs. 10,000 application fee |
| `status` | ApprovalStatus | PENDING / APPROVED / REJECTED |
| `createdAt` | TIMESTAMPTZ | |

Indexes: `memberId`, `status`, `endDate`

---

### Transaction

Cash in/out record. Auto-created by Razorpay webhook or manually entered by operator.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID PK | |
| `type` | TransactionType | CASH_IN / CASH_OUT |
| `category` | TransactionCategory | MEMBERSHIP_FEE / APPLICATION_FEE / SPONSORSHIP / EXPENSE / OTHER |
| `amount` | DECIMAL(12,2) | |
| `paymentMode` | PaymentMode | UPI / BANK_TRANSFER / CASH |
| `description` | TEXT | |
| `sponsorPurpose` | SponsorPurpose? | Required when category=SPONSORSHIP |
| `memberId` | UUID FK → Member? | Linked member for membership payments |
| `sponsorId` | UUID FK → Sponsor? | Linked sponsor for sponsorship payments |
| `enteredById` | UUID FK → User | SYSTEM user for auto-detected Razorpay payments |
| `approvalStatus` | ApprovalStatus | PENDING / APPROVED / REJECTED |
| `approvalSource` | ApprovalSource | MANUAL / RAZORPAY_WEBHOOK |
| `approvedById` | UUID FK → User? | Null for auto-approved (webhook) transactions |
| `approvedAt` | TIMESTAMPTZ? | |
| `razorpayPaymentId` | VARCHAR(255)? | Razorpay payment ID |
| `razorpayOrderId` | VARCHAR(255)? | Razorpay order ID |
| `senderName` | VARCHAR(255)? | Payer name from Razorpay or manual entry |
| `senderPhone` | TEXT? | **Encrypted** |
| `senderUpiId` | VARCHAR(255)? | UPI VPA for UPI payments |
| `senderBankAccount` | TEXT? | **Encrypted** — masked account number |
| `senderBankName` | VARCHAR(255)? | Bank name for bank transfers |
| `receiptNumber` | VARCHAR(50)? | Generated receipt reference |
| `createdAt` | TIMESTAMPTZ | |

Indexes: `type`, `category`, `memberId`, `sponsorId`, `approvalStatus`, `createdAt`, `razorpayPaymentId`, `razorpayOrderId`

Note: Refunds are recorded as `type=CASH_OUT`, `category=EXPENSE`. There is no separate REFUND category.

---

### Sponsor

A sponsor (individual or company) who has made or may make a donation to the organization.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID PK | |
| `name` | VARCHAR(255) | |
| `phone` | TEXT | **Encrypted** |
| `email` | VARCHAR(255) | |
| `company` | VARCHAR(255)? | Nullable |
| `createdById` | UUID FK → User | Admin/operator who created this record |
| `createdAt` | TIMESTAMPTZ | |

Indexes: `createdById`

---

### SponsorLink

Shareable public payment link with UPI and bank transfer details.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID PK | |
| `sponsorId` | UUID FK → Sponsor? | Nullable — generic links not tied to a specific sponsor |
| `token` | VARCHAR(255) UNIQUE | Cryptographically random UUID |
| `amount` | DECIMAL(12,2)? | Nullable — open-ended if null (sponsor chooses amount) |
| `upiId` | VARCHAR(255) | Organization UPI ID |
| `bankDetails` | JSON? | `{ accountNumber, bankName, ifscCode }` |
| `isActive` | BOOLEAN | Default: true |
| `createdById` | UUID FK → User | |
| `createdAt` | TIMESTAMPTZ | |
| `expiresAt` | TIMESTAMPTZ? | Optional expiry |

Indexes: `token`, `sponsorId`, `isActive`

---

### Approval

Stores complete before/after snapshots for operator-submitted changes awaiting admin review.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID PK | |
| `entityType` | ApprovalEntityType | TRANSACTION / MEMBER_ADD / MEMBER_EDIT / MEMBER_DELETE / MEMBERSHIP |
| `entityId` | UUID | Target entity's ID |
| `action` | VARCHAR(100) | Human-readable action (e.g. "add_member", "edit_transaction") |
| `previousData` | JSON? | Snapshot before change (for edits/deletes) |
| `newData` | JSON? | Proposed changes to apply on approval |
| `requestedById` | UUID FK → User | Operator who submitted |
| `status` | ApprovalStatus | PENDING / APPROVED / REJECTED |
| `reviewedById` | UUID FK → User? | Admin who reviewed |
| `reviewedAt` | TIMESTAMPTZ? | |
| `notes` | TEXT? | Admin's notes on approve/reject |
| `createdAt` | TIMESTAMPTZ | |

Indexes: `status`, `(entityType, entityId)`, `requestedById`, `createdAt`

---

### AuditLog

Financial audit log. Append-only — no UPDATE or DELETE endpoints exist for this table.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID PK | |
| `entityType` | VARCHAR(100) | e.g. "Transaction", "Member" |
| `entityId` | UUID | Audited entity ID |
| `action` | VARCHAR(100) | e.g. "approve_transaction", "create_member" |
| `previousData` | JSON? | State before the change |
| `newData` | JSON | State after the change (required) |
| `transactionId` | UUID FK → Transaction? | Linked transaction (full record via relation) |
| `performedById` | UUID FK → User | Actor |
| `createdAt` | TIMESTAMPTZ | |

Indexes: `(entityType, entityId)`, `performedById`, `createdAt`, `transactionId`

---

### ActivityLog

System-wide activity log. Append-only — no UPDATE or DELETE endpoints exist for this table.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID PK | |
| `userId` | UUID FK → User | Actor |
| `action` | VARCHAR(100) | e.g. "login_success", "create_member", "whatsapp_notification_sent" |
| `description` | TEXT | Human-readable description |
| `metadata` | JSON? | Extra context (IP, amounts, IDs) |
| `createdAt` | TIMESTAMPTZ | |

Indexes: `userId`, `createdAt`, `action`

---

## Enums

### Role
```
ADMIN | OPERATOR | MEMBER
```

### MembershipStatus
```
PENDING_APPROVAL | PENDING_PAYMENT | ACTIVE | EXPIRED | SUSPENDED
```

Note: This is the member lifecycle status (on User and Member models). Do not confuse with `ApprovalStatus`, which is the payment/approval state on Membership and Approval records.

### MembershipType
```
MONTHLY | HALF_YEARLY | ANNUAL
```

Fees: MONTHLY = Rs. 250, HALF_YEARLY = Rs. 1,500, ANNUAL = Rs. 3,000

### TransactionType
```
CASH_IN | CASH_OUT
```

### TransactionCategory
```
MEMBERSHIP_FEE | APPLICATION_FEE | SPONSORSHIP | EXPENSE | OTHER
```

### PaymentMode
```
UPI | BANK_TRANSFER | CASH
```

### SponsorPurpose
```
TITLE_SPONSOR | GOLD_SPONSOR | SILVER_SPONSOR | FOOD_PARTNER | MEDIA_PARTNER | STALL_VENDOR | MARKETING_PARTNER
```

### ApprovalStatus
```
PENDING | APPROVED | REJECTED
```

Used in: Approval.status, Membership.status, Transaction.approvalStatus

### ApprovalEntityType
```
TRANSACTION | MEMBER_ADD | MEMBER_EDIT | MEMBER_DELETE | MEMBERSHIP
```

### ApprovalSource
```
MANUAL | RAZORPAY_WEBHOOK
```

---

## Encryption

The following fields are encrypted at rest using AES-256-GCM via Prisma middleware (`src/lib/prisma.ts`). Application code always works with plaintext:

- `User.phone`, `User.address`
- `SubMember.phone`
- `Member.phone`, `Member.address`
- `Sponsor.phone`
- `Transaction.senderPhone`, `Transaction.senderBankAccount`

Encrypted values are stored as `enc:<base64>` in the database. The `ENCRYPTION_KEY` environment variable (64 hex chars = 32 bytes) must be set and never changed after data is written.
