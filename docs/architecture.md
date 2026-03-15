# Architecture

DPS Dashboard is a monolithic Next.js 14 application with server-side rendering, API routes, and a PostgreSQL database. All layers live in one repository and deploy as a single Docker service.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 14.x |
| Language | TypeScript (strict mode) | 5.x |
| Database | PostgreSQL | 16 |
| ORM | Prisma | 6.x |
| Authentication | NextAuth.js (Credentials provider) | 4.x |
| Styling | Tailwind CSS + shadcn/ui | 3.x |
| Form handling | React Hook Form + Zod | latest |
| Payments | Razorpay Node SDK | 2.x |
| Notifications | Meta WhatsApp Cloud API (native fetch) | graph API v18 |
| Testing | Vitest + React Testing Library | latest |
| Deployment | Docker Compose + Caddy | latest stable |

---

## High-Level Architecture

```
Internet
   |
Caddy (port 80/443)
   |   reverse proxy, removes Server header
   |
Next.js App (port 3000)
   |
   +-- Public Pages (SSR)
   |     / (landing page)
   |     /login
   |     /membership-form
   |     /sponsor/[token] (public checkout)
   |
   +-- Dashboard Pages (SSR + client components)
   |     /dashboard/*  (role-based, auth-gated)
   |     /change-password
   |
   +-- API Routes (/api/*)
   |     auth | members | memberships | payments
   |     transactions | sponsors | sponsor-links
   |     approvals | audit-log | activity-log
   |     receipts | notifications | dashboard/stats
   |     webhooks/razorpay
   |
   +-- Service Layer (lib/services/)
   |     member-service  membership-service
   |     transaction-service  approval-service
   |     sponsor-service  notification-service
   |
   +-- Shared Libraries (lib/)
         prisma  auth  permissions  razorpay
         whatsapp  receipt  member-id
         validators  encrypt  rate-limit
         audit  cron
   |
PostgreSQL 16 (Docker named volume)
```

---

## Module Structure

### API Route Layer (thin controllers)

Location: `src/app/api/`

Each route file follows a strict 5-step pattern:
1. **Authenticate** — call `getServerSession(authOptions)`
2. **Authorize** — call `requireRole(session, "ADMIN", "OPERATOR")` etc.
3. **Validate** — parse request body with a Zod schema from `lib/validators.ts`
4. **Delegate** — call the appropriate service function
5. **Respond** — return `NextResponse.json(result)`

Routes contain no business logic. They are thin wrappers that translate HTTP to service calls.

```typescript
// Example: POST /api/members
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const user = requireRole(session, "ADMIN", "OPERATOR");           // step 2
  const body = createMemberSchema.parse(await req.json());          // step 3
  const result = await memberService.createMember(body, user);      // step 4
  return NextResponse.json(result, { status: 201 });                // step 5
}
```

### Service Layer

Location: `src/lib/services/`

| Service | Responsibilities |
|---------|----------------|
| `member-service.ts` | CRUD members and sub-members, DPC-YYYY-NNNN-SS ID generation, approval-gating for operators |
| `membership-service.ts` | Membership periods, fee calculation (no partial payments), status lifecycle, expiry checks |
| `transaction-service.ts` | Cash in/out creation, Razorpay transaction creation from webhook data, approval-gating |
| `approval-service.ts` | Create/list/approve/reject approvals, apply `newData` to target entity on approval |
| `sponsor-service.ts` | Sponsor CRUD, sponsor link generation and token management, sponsor payment processing |
| `notification-service.ts` | WhatsApp notifications via Meta Cloud API, graceful skip if unconfigured |

Services contain all business rules. They call Prisma directly, use `lib/audit.ts` for logging, and call `notification-service` for notifications.

### Shared Libraries

Location: `src/lib/`

| Library | Purpose |
|---------|---------|
| `prisma.ts` | Prisma client singleton with AES-256 encryption/decryption middleware for PII fields |
| `auth.ts` | NextAuth config: Credentials provider, JWT strategy, login rate limiting, sub-member auth |
| `permissions.ts` | `requireAuth()`, `requireRole()`, `requirePasswordChanged()`, route permission map |
| `razorpay.ts` | Razorpay client init, order creation, payment verification, HMAC webhook validation |
| `whatsapp.ts` | `sendMessage()` helper using native `fetch()` to graph.facebook.com |
| `receipt.ts` | Generate printable HTML receipt for member and sponsor transactions |
| `member-id.ts` | Generate and parse DPC-YYYY-NNNN-SS format IDs with auto-increment logic |
| `validators.ts` | Zod schemas for every API input — single source of truth for request shapes |
| `encrypt.ts` | AES-256-GCM `encrypt()` / `decrypt()` / `isEncrypted()` functions |
| `rate-limit.ts` | In-memory sliding window rate limiter with per-email, per-user, and per-IP keys |
| `audit.ts` | `logAudit()` and `logActivity()` helpers — append-only, never throw |
| `cron.ts` | Daily membership expiry check: 15-day reminders, auto-expire on expiry date |

### Component Layer

Location: `src/components/`

| Directory | Contents |
|-----------|---------|
| `ui/` | shadcn/ui primitives: Button, Card, Dialog, Table, Input, Select, Badge, etc. |
| `layout/` | Sidebar (role-based nav), Header (user info + logout), DashboardShell wrapper |
| `members/` | MemberTable, MemberForm, SubMemberForm, MemberDetail |
| `cash/` | TransactionTable, TransactionForm, TransactionDetail |
| `approvals/` | ApprovalQueue, ApprovalCard, ApprovalActions |
| `sponsorship/` | SponsorTable, SponsorForm, SponsorLinkGenerator, SponsorCheckout |
| `receipts/` | ReceiptTemplate, PrintableReceipt |

---

## Data Flow

### Payment via Razorpay (UPI/Bank Transfer)

```
[Member] clicks Pay
    |
    v
POST /api/payments/create-order
    |
    Razorpay.orders.create()
    |
    Return orderId to client
    |
[Razorpay Checkout opens in browser]
    |
Member completes payment
    |
    v
POST /api/webhooks/razorpay (Razorpay fires this)
    |
    1. Verify HMAC signature
    2. Extract payment data (sender name, UPI VPA / bank details, amount)
    3. transaction-service.createFromWebhook()
       -> Create Transaction (approvalStatus=APPROVED, approvalSource=RAZORPAY_WEBHOOK)
       -> Update Member.membershipStatus = ACTIVE
       -> Update User.totalPaid
    4. audit.logAudit() + audit.logActivity()
    5. notification-service.notifyPaymentReceived()
    6. Return HTTP 200
```

### Cash Payment (Operator Entry)

```
[Operator] enters cash transaction
    |
    v
POST /api/transactions
    |
    [role=OPERATOR]
    |
    Create Transaction (approvalStatus=PENDING)
    Create Approval record
    notification-service.notifyNewApprovalRequest()
    |
    Return { approval: { status: "PENDING" } }

    ...Admin reviews /dashboard/approvals...

POST /api/approvals/[id]/approve
    |
    approval-service.approve()
    -> Update Transaction.approvalStatus = APPROVED
    -> Update membership status if applicable
    -> audit.logAudit() + audit.logActivity()
    -> notification-service (confirmation)
```

### Operator Action Gating

```
API route handler detects user.role
    |
    +-- ADMIN ---------> Apply change directly to DB
    |                    Log to audit + activity
    |
    +-- OPERATOR ------> Create Approval record (status=PENDING)
                         Store newData snapshot
                         Notify admins via WhatsApp
                         Return pending approval response
```

---

## File Organisation

```
dps-dashboard/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Landing page
│   │   ├── login/page.tsx              # Login
│   │   ├── change-password/page.tsx    # Forced password change
│   │   ├── membership-form/page.tsx    # Printable application form
│   │   ├── sponsor/[token]/page.tsx    # Public sponsor checkout
│   │   ├── sponsor/[token]/receipt/    # Sponsor receipt
│   │   ├── dashboard/
│   │   │   ├── layout.tsx              # Sidebar + auth shell
│   │   │   ├── page.tsx                # Home: stats + activity
│   │   │   ├── my-membership/
│   │   │   ├── members/
│   │   │   ├── cash/
│   │   │   ├── sponsorship/
│   │   │   ├── approvals/
│   │   │   ├── audit-log/
│   │   │   └── activity-log/
│   │   └── api/                        # All API route handlers
│   ├── components/                     # React components
│   ├── lib/                            # Business logic + utilities
│   │   └── services/                   # Service layer
│   └── types/
│       └── index.ts                    # Shared TypeScript types + enums
├── prisma/
│   ├── schema.prisma                   # DB schema (10 models, 10 enums)
│   └── seed.ts                         # Seed data for development
├── scripts/
│   ├── backup.sh                       # Daily pg_dump cron script
│   └── restore.sh                      # Restore from backup
├── tests/
│   ├── unit/                           # Pure business logic tests
│   ├── integration/                    # API route structure tests
│   └── components/                     # Component render tests
├── docs/                               # This documentation
├── docker-compose.yml                  # 3 services: app, postgres, caddy
├── Caddyfile                           # Reverse proxy config
├── Dockerfile                          # Multi-stage Next.js build
└── .env.example                        # Environment variable template
```

---

## Key Design Decisions

**Monolith over microservices.** A single Next.js app handles the frontend, API routes, and background cron. This simplifies deployment and development for a small club administration use case.

**Service layer pattern.** API routes are thin controllers. All business rules live in `lib/services/`. This makes business logic testable without HTTP overhead and prevents routes from becoming bloated.

**Approval as first-class entity.** The Approval table stores complete before/after JSON snapshots. The approval service applies the diff on approval or discards it on rejection. This makes the system generic — the same mechanism handles members, transactions, and memberships without domain-specific code in the approval layer.

**Dual logging.** AuditLog captures financial/entity changes with full transaction data embedded. ActivityLog captures all user actions (logins, page views, CRUD). Both are append-only — no update or delete endpoints exist.

**Prisma encryption middleware.** PII fields are encrypted/decrypted transparently via Prisma's `$extends` middleware. Application code always works with plaintext strings. No manual encrypt/decrypt calls outside `lib/prisma.ts`.

**Razorpay webhook as source of truth.** For UPI and bank payments, the webhook creates the Transaction record with all payer details extracted from Razorpay's payment object. No manual data entry is needed for online payments.

**In-memory rate limiting.** A `Map<string, number[]>` sliding window works correctly for single-instance deployment without requiring Redis. If horizontal scaling is added in the future, replace with a Redis-backed solution.

**WhatsApp graceful degradation.** All notification calls check for env vars before executing. If unconfigured, they return `{ success: true }` silently. Events are still logged to ActivityLog regardless of WhatsApp availability.
