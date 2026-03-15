# DPS Dashboard -- Technical Architecture

**Version**: 1.0
**Date**: 2026-03-15
**Author**: Architect Agent

---

## 1. Tech Stack Decisions

| Layer | Technology | Version / Notes |
|-------|-----------|-----------------|
| Framework | Next.js 14 (App Router) | Single codebase: SSR landing page + API routes + dashboard SPA |
| Language | TypeScript (strict mode) | No `any` types; all function signatures typed |
| Database | PostgreSQL 16 | Financial data, audit trails, ACID compliance |
| ORM | Prisma 5.x | Type-safe queries, migration management, encryption middleware |
| Auth | NextAuth.js 4.x (Credentials provider) | JWT sessions, HTTP-only cookies, role-based access |
| Styling | Tailwind CSS 3.x + shadcn/ui | Utility-first CSS, pre-built accessible components |
| Payments | Razorpay (Node SDK) | UPI Intent/Collect, Virtual Accounts (VAN) for bank transfers, webhooks |
| Notifications | Meta WhatsApp Cloud API | Direct HTTP POST to graph.facebook.com, pre-approved templates |
| Testing | Vitest + React Testing Library + Supertest | Unit, integration, and component tests |
| Deployment | Docker Compose + Caddy | LunaNode VPS, HTTP on IP (HTTPS-ready via Caddy when domain added) |
| Validation | Zod | Server-side schema validation on every API route |
| Encryption | AES-256-GCM | Field-level encryption for PII via Prisma middleware |

---

## 2. High-Level Architecture

```
+---------------------------------------------------+
|                   INTERNET                         |
+---------------------------------------------------+
          |                          |
     [Browser]              [Razorpay Webhook]
          |                          |
+---------------------------------------------------+
|              Caddy Reverse Proxy                   |
|        (HTTP on IP / HTTPS when domain)            |
+---------------------------------------------------+
          |
+---------------------------------------------------+
|            Next.js 14 Application                  |
|  +---------------------------------------------+  |
|  |  App Router                                  |  |
|  |  +------------------+  +------------------+  |  |
|  |  | Public Pages     |  | Dashboard Pages  |  |  |
|  |  | /                |  | /dashboard/*     |  |  |
|  |  | /login           |  | /change-password |  |  |
|  |  | /membership-form |  |                  |  |  |
|  |  | /sponsor/[token] |  |                  |  |  |
|  |  +------------------+  +------------------+  |  |
|  |                                              |  |
|  |  +------------------------------------------+  |
|  |  | API Routes (/api/*)                       |  |
|  |  |  auth | members | memberships | payments  |  |
|  |  |  transactions | sponsors | sponsor-links  |  |
|  |  |  approvals | audit-log | activity-log     |  |
|  |  |  receipts | notifications | dashboard     |  |
|  |  |  webhooks/razorpay                        |  |
|  |  +------------------------------------------+  |
|  |                                              |  |
|  |  +------------------------------------------+  |
|  |  | Service Layer (lib/services/)             |  |
|  |  |  member | membership | transaction        |  |
|  |  |  approval | sponsor | notification        |  |
|  |  +------------------------------------------+  |
|  |                                              |  |
|  |  +------------------------------------------+  |
|  |  | Shared Libraries (lib/)                   |  |
|  |  |  prisma | auth | permissions | razorpay   |  |
|  |  |  whatsapp | receipt | member-id           |  |
|  |  |  validators | encrypt | rate-limit        |  |
|  |  |  audit | cron                             |  |
|  |  +------------------------------------------+  |
|  +---------------------------------------------+  |
+---------------------------------------------------+
          |
+---------------------------------------------------+
|              PostgreSQL 16                         |
|  (Docker named volume for persistence)             |
+---------------------------------------------------+
```

---

## 3. Module Boundaries

### 3.1 API Route Layer (thin controllers)

Each API route file follows the pattern:
1. Authenticate (NextAuth session check)
2. Authorize (role-based permission check via `lib/permissions.ts`)
3. Validate (Zod schema from `lib/validators.ts`)
4. Delegate to service layer
5. Return JSON response

Routes do NOT contain business logic. They are thin wrappers.

### 3.2 Service Layer (`src/lib/services/`)

| Service | Responsibility |
|---------|---------------|
| `member-service.ts` | CRUD members + sub-members, DPC ID generation, approval-gated ops for operators |
| `membership-service.ts` | Membership periods, fee calculation, status lifecycle, expiry checks |
| `transaction-service.ts` | Cash in/out, Razorpay transaction creation, approval-gated ops for operators |
| `approval-service.ts` | Create/list/approve/reject approvals, apply changes to DB on approval |
| `sponsor-service.ts` | Sponsor CRUD, sponsor link generation, sponsor payment processing |
| `notification-service.ts` | WhatsApp notifications via Meta Cloud API, graceful skip if unconfigured |

### 3.3 Shared Libraries (`src/lib/`)

| Library | Responsibility |
|---------|---------------|
| `prisma.ts` | Prisma client singleton + AES-256 encryption middleware for PII fields |
| `auth.ts` | NextAuth configuration: Credentials provider, JWT strategy, session callbacks |
| `permissions.ts` | `requireRole()` middleware, role hierarchy checks, route-level enforcement |
| `razorpay.ts` | Razorpay client init, order creation, payment verification, HMAC webhook validation |
| `whatsapp.ts` | `sendWhatsApp()` helper: POST to graph.facebook.com, template-based, no-op if unconfigured |
| `receipt.ts` | Generate printable HTML receipt for members and sponsors |
| `member-id.ts` | Generate `DPC-YYYY-NNNN-SS` format IDs, auto-increment logic |
| `validators.ts` | Zod schemas for every API input (members, transactions, payments, etc.) |
| `encrypt.ts` | AES-256-GCM encrypt/decrypt functions for phone, address, bank details |
| `rate-limit.ts` | In-memory rate limiter (login: 5/15min, API: 100/min/user, webhooks: IP-based) |
| `audit.ts` | `logAudit()` and `logActivity()` helpers -- append-only, no update/delete |
| `cron.ts` | Daily membership expiry check, 15-day reminder trigger, auto-expire on date |

### 3.4 Component Layer (`src/components/`)

| Directory | Contents |
|-----------|---------|
| `ui/` | shadcn/ui primitives (Button, Card, Dialog, Table, Input, etc.) |
| `layout/` | Sidebar (role-based nav), Header (user info + logout), DashboardShell |
| `members/` | MemberTable, MemberForm, SubMemberForm, MemberDetail |
| `cash/` | TransactionTable, TransactionForm, TransactionDetail |
| `approvals/` | ApprovalQueue, ApprovalCard, ApprovalActions |
| `sponsorship/` | SponsorTable, SponsorForm, SponsorLinkGenerator, SponsorCheckout |
| `receipts/` | ReceiptTemplate, PrintableReceipt |

---

## 4. Auth Flow

```
[User] --POST /api/auth/[...nextauth]--> [NextAuth Credentials Provider]
  |                                            |
  |   email + password                   bcrypt.compare()
  |                                            |
  |                                    [Check isTempPassword]
  |                                            |
  |                           +----------------+----------------+
  |                           |                                 |
  |                    isTempPassword=true              isTempPassword=false
  |                           |                                 |
  |                  JWT token issued                  JWT token issued
  |                  (role, memberId, isTempPassword)  (role, memberId)
  |                           |                                 |
  |               Redirect: /change-password          Redirect: /dashboard
  |                           |
  |              POST /api/auth/change-password
  |                           |
  |                 Update password + isTempPassword=false
  |                           |
  |               Redirect: /dashboard
```

**JWT Token Contents**: `{ userId, role, memberId, isTempPassword, exp }`

**Session Strategy**: JWT stored in HTTP-only, SameSite=Lax cookie. 15-minute expiry. Refresh on each authenticated request via NextAuth session callback.

**Middleware**: Every dashboard route and API route checks:
1. Valid JWT exists (authenticated)
2. If `isTempPassword === true`, redirect to /change-password (except the change-password route itself)
3. Role matches required permission for the route

**Sub-member Auth**: Sub-members authenticate with their own email/password. JWT contains `parentUserId` for pay-on-behalf flows.

---

## 5. Payment Flow

### 5.1 UPI / Bank Transfer (Razorpay Auto-Detect)

```
[Member/Sponsor] --> POST /api/payments/create-order
                          |
                    Razorpay.orders.create({
                      amount, currency: "INR",
                      receipt: "DPC-..."
                    })
                          |
                    Return orderId to client
                          |
              [Client opens Razorpay checkout]
                          |
                    Member/Sponsor pays (UPI or Bank)
                          |
              [Razorpay fires webhook]
                          |
              POST /api/webhooks/razorpay
                          |
                    1. Verify HMAC signature
                    2. Extract payment data (amount, sender name,
                       UPI VPA or bank name + masked account)
                    3. Create full Transaction record
                       (approvalStatus=APPROVED,
                        approvalSource=RAZORPAY_WEBHOOK)
                    4. Update membership status -> ACTIVE
                    5. Generate receipt
                    6. Write audit log + activity log
                    7. Send WhatsApp notification
```

### 5.2 Cash (Manual Entry)

```
[Operator] --> POST /api/transactions
                    |
              1. Create Transaction (approvalStatus=PENDING_APPROVAL,
                                     approvalSource=MANUAL)
              2. Create Approval record (entityType=TRANSACTION)
              3. Send WhatsApp to admin(s)
                    |
[Admin] --> POST /api/approvals/[id]/approve
                    |
              1. Update Transaction.approvalStatus=APPROVED
              2. Update membership status -> ACTIVE (if membership fee)
              3. Write audit log + activity log
              4. Send WhatsApp confirmation
```

### 5.3 Sponsor Payment

Same as above but with:
- `category=SPONSORSHIP`
- `sponsorPurpose` set (TITLE_SPONSOR, GOLD_SPONSOR, etc.)
- Linked to `Sponsor` record instead of `Member`
- Sponsor link token used for public checkout page

---

## 6. Approval Flow (Universal)

```
[Operator action] --> Create Approval record
                        entityType: TRANSACTION | MEMBER_ADD | MEMBER_EDIT |
                                    MEMBER_DELETE | MEMBERSHIP
                        entityId: UUID of target entity
                        previousData: JSON snapshot (for edits)
                        newData: JSON of proposed changes
                        status: PENDING
                            |
                      WhatsApp to admin(s)
                            |
[Admin] --> /api/approvals/[id]/approve  OR  /api/approvals/[id]/reject
                            |
                  +--------+---------+
                  |                   |
              APPROVE              REJECT
                  |                   |
          Apply changes         Discard changes
          to target entity      (no DB changes)
                  |                   |
          Audit log +           Audit log +
          Activity log          Activity log
                  |                   |
          WhatsApp:             WhatsApp:
          confirmation          rejection notice
          to all parties        to operator
```

**Approval-gated operations** (operator only; admin bypasses approval):
- Member: add, edit, delete
- Transaction: add, edit, delete (cash only)
- Membership: create period

**Auto-approved operations** (no approval needed):
- Razorpay webhook payments (UPI/bank transfer)

---

## 7. Data Flow Between Modules

```
+-------------+     creates      +-------------+
|   Member    |<-----------------| Approval    |
|   Service   |    (MEMBER_ADD/  |   Service   |
|             |     EDIT/DELETE) |             |
+------+------+                  +------+------+
       |                                |
       | links to                       | on approve/reject
       v                                v
+-------------+                  +-------------+
| Membership  |    creates       |   Audit     |
|   Service   |<--(MEMBERSHIP)---| + Activity  |
|             |                  |   Loggers   |
+------+------+                  +-------------+
       |                                ^
       | fee payment                    | logs everything
       v                                |
+-------------+                  +-------------+
| Transaction |----------------->| Notification|
|   Service   |   on any state   |   Service   |
|             |   change         | (WhatsApp)  |
+------+------+                  +-------------+
       ^
       | webhook auto-creates
       |
+-------------+
|  Razorpay   |
|  Webhook    |
+-------------+
```

---

## 8. Deployment Architecture

```
+------------------------------------------+
|         LunaNode VPS (Ubuntu)            |
|                                          |
|  +------------------------------------+  |
|  |        Docker Compose              |  |
|  |                                    |  |
|  |  +----------+    +-------------+   |  |
|  |  |  Caddy   |--->|  Next.js    |   |  |
|  |  |  :80/:443|    |  :3000      |   |  |
|  |  +----------+    +------+------+   |  |
|  |                         |          |  |
|  |                  +------+------+   |  |
|  |                  | PostgreSQL  |   |  |
|  |                  |  :5432      |   |  |
|  |                  | (named vol) |   |  |
|  |                  +-------------+   |  |
|  +------------------------------------+  |
|                                          |
|  UFW: 22, 80, 443 only                  |
|  SSH: key-only, Fail2ban                |
|  User: dps (non-root)                   |
|  .env: chmod 600                        |
|  Cron: daily pg_dump backup             |
+------------------------------------------+
```

**Docker Services**:
1. `app` -- Next.js production build (`node server.js`), port 3000
2. `db` -- PostgreSQL 16, named volume `pgdata`, port 5432 (internal only)
3. `caddy` -- Reverse proxy, port 80/443 mapped to host

---

## 9. Environment Variables

```env
# Database
DATABASE_URL=postgresql://dps:password@db:5432/dps_dashboard

# NextAuth
NEXTAUTH_SECRET=<random-32-char>
NEXTAUTH_URL=http://YOUR_VPS_IP

# Razorpay
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=xxx
RAZORPAY_WEBHOOK_SECRET=xxx
RAZORPAY_TEST_MODE=true

# WhatsApp (Meta Cloud API) -- optional, graceful skip if missing
WHATSAPP_API_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=

# Encryption
ENCRYPTION_KEY=<32-byte-hex-key>

# App
APP_URL=http://YOUR_VPS_IP
NODE_ENV=production
```

---

## 10. Key Design Decisions

1. **Monolith over microservices**: Single Next.js app handles frontend, API, and cron. Simplifies deployment and development for a small team.

2. **Service layer pattern**: API routes are thin controllers. All business logic lives in `lib/services/`. This allows backend tests to test services directly without HTTP overhead.

3. **Approval as first-class entity**: The `Approval` table stores complete before/after snapshots (`previousData`/`newData`). On approve, the service layer applies the diff to the target entity. On reject, nothing changes. This makes the approval flow generic across all entity types.

4. **Dual logging**: `AuditLog` captures financial/entity changes with full Transaction data. `ActivityLog` captures all user actions (logins, page views, CRUD operations). Both are append-only.

5. **Encryption middleware**: Prisma middleware intercepts reads/writes to encrypt/decrypt PII fields (phone, address, bank details) transparently. Application code works with plaintext.

6. **Razorpay webhook as source of truth**: For UPI/bank payments, the webhook creates the Transaction record with all sender details extracted from Razorpay's payment object. No manual data entry needed.

7. **In-memory rate limiting**: Acceptable for single-instance deployment. Uses a Map with sliding window. No Redis dependency.

8. **No partial payments**: Fee amounts are fixed constants. The API rejects any payment that does not match the exact fee for the selected membership type.

9. **Sub-member auth**: Sub-members get their own credentials and JWT. The JWT includes `parentUserId` so the system knows which primary member they can pay on behalf of.

10. **Graceful WhatsApp degradation**: All notification calls check for env vars first. If unconfigured, they return silently. No try/catch spam -- just an early return guard.
