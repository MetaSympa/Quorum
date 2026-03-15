# Deshapriya Park Durga Puja Club — Management Dashboard
## Project Plan v2 — FROZEN (approved 2026-03-14, updated 2026-03-14)

---

## 1. Product Overview

A minimal web-based management dashboard for the Deshapriya Park Durga Puja Club, Kolkata. Features a public landing page with a login entry point leading to a role-based dashboard for club administration, finances, and membership.

---

## 2. Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js 14 (App Router) | Single codebase for frontend + API, SSR for landing page |
| Language | TypeScript | Type safety across full stack |
| Database | PostgreSQL | Reliable for financial data, audit trails |
| ORM | Prisma | Type-safe DB access, easy migrations |
| Auth | NextAuth.js (Credentials provider) | Simple role-based auth, JWT sessions |
| Styling | Tailwind CSS + shadcn/ui | Minimal, polished UI with no custom CSS bloat |
| Payments | Razorpay (Payment Gateway) | UPI auto-detect via Razorpay UPI Intent/Collect + payment links. Bank transfer auto-detect via Razorpay Virtual Accounts (VAN) — incoming NEFT/RTGS/IMPS auto-matched. Webhook callbacks for real-time payment confirmation. Used for both member payments and sponsor link payments. |
| Notifications | WhatsApp Business API (Meta Cloud API, free tier — 1000 conversations/month) | Direct HTTP POST to graph.facebook.com, pre-approved message templates, no third-party SDK |
| Testing | Vitest + React Testing Library + Supertest | Unit + integration coverage |
| Deployment | Docker Compose → LunaNode Cloud VPS | Single-command deploy to LunaNode VPS (API keys + credits available) |

---

## 3. Roles & Permissions Matrix

| Capability | Admin | Operator | Member |
|------------|-------|----------|--------|
| View all members | Yes | Yes | No |
| Add/edit/delete members | Yes | Add/edit/delete (all require admin approval) | No |
| View own membership | Yes | Yes | Yes |
| Manage own membership | Yes | Yes | Yes |
| Cash in/out entry | Yes | Add/edit/delete (all require admin approval) | No |
| Approve/reject entries | Yes | No | No |
| Sponsorship management | Yes (full + generate link) | Generate link + record cash | No |
| Financial audit log | Yes (full) | Yes (read-only) | No |
| System activity log | Yes (full) | Yes (read-only) | No |
| Generate receipts | Yes | Yes | No |
| WhatsApp notifications | Receives all | Receives all | Receives membership notifications (primary + sub-members) |
| Pay on behalf of primary member | N/A | N/A | Yes (sub-members can pay for primary) |

---

## 4. Data Model

### 4.1 Users
```
User {
  id            UUID PK
  memberId      String UNIQUE (format: DPC-YYYY-NNNN-00, e.g. DPC-2026-0025-00. 00 = primary member)
  name          String
  email         String UNIQUE
  phone         String
  address       String
  password      String (hashed)
  isTempPassword Boolean (default true, must change before any dashboard access)
  role          Enum(ADMIN, OPERATOR, MEMBER)
  membershipStatus   Enum(PENDING_APPROVAL, PENDING_PAYMENT, ACTIVE, EXPIRED, SUSPENDED) (default: PENDING_APPROVAL)
  membershipType     Enum(MONTHLY, HALF_YEARLY, ANNUAL) (nullable, set after first payment)
  membershipStart    Date (nullable)
  membershipExpiry   Date (nullable)
  totalPaid          Decimal (default 0, running total of all approved payments)
  applicationFeePaid Boolean (default false)
  subMembers    SubMember[] (max 3, enforced in business logic)
  createdAt     DateTime
  updatedAt     DateTime
}

SubMember {
  id            UUID PK
  memberId      String UNIQUE (format: DPC-YYYY-NNNN-SS, e.g. DPC-2026-0025-01. SS = 01-03)
  parentUser    User
  name          String
  email         String UNIQUE (for login)
  phone         String (WhatsApp number)
  password      String (hashed)
  isTempPassword Boolean (default true)
  relation      String (e.g. "Spouse", "Child", "Parent")
  canLogin      Boolean (default true — sub-members can log into their own dashboard)
  createdAt     DateTime
}
```
- memberId format: `DPC-YYYY-NNNN-SS` where YYYY = joining year, NNNN = auto-increment primary member number, SS = sub-member index (00 = primary, 01-03 = sub-members)
- All memberIds are unique across the system
- Sub-members inherit parent's memberId prefix, only the last two digits differ
- Sub-members can login, view their dashboard, pay on behalf of primary member, receive WhatsApp notifications
```
```

### 4.2 Members
```
Member {
  id              UUID PK
  user            User (nullable, linked if member has login)
  name            String
  phone           String
  email           String
  address         String
  parentMember    Member (nullable, for sub-members)
  membershipStatus Enum(PENDING_APPROVAL, PENDING_PAYMENT, ACTIVE, EXPIRED, SUSPENDED) (default: PENDING_APPROVAL)
  joinedAt        DateTime
  createdAt       DateTime
  updatedAt       DateTime
}
```
- Max 3 sub-members per parent member (enforced in business logic)
- Default status: PENDING_APPROVAL (moves to ACTIVE after admin approves the payment)

### 4.3 Memberships (payment periods)
```
Membership {
  id              UUID PK
  member          Member
  type            Enum(MONTHLY, HALF_YEARLY, ANNUAL)
  amount          Decimal
  startDate       Date
  endDate         Date
  isApplicationFee Boolean (default false)
  status          Enum(PENDING_APPROVAL, APPROVED, REJECTED)
  createdAt       DateTime
}
```
- Fee: 250/month. Half-yearly: 1500. Annual: 3000.
- Application fee: 10000 (one-time, first membership only)
- Sub-members: no extra payment
- Note: Membership.status (PENDING_APPROVAL/APPROVED/REJECTED) is the approval status of a payment period, NOT the member lifecycle status. Do not confuse with User/Member.membershipStatus.

### 4.4 Transactions (cash in/out)
```
Transaction {
  id              UUID PK
  type            Enum(CASH_IN, CASH_OUT)
  category        Enum(MEMBERSHIP_FEE, APPLICATION_FEE, SPONSORSHIP, EXPENSE, OTHER)
  amount          Decimal
  paymentMode     Enum(UPI, BANK_TRANSFER, CASH)
  description     String
  sponsorPurpose  Enum(TITLE_SPONSOR, GOLD_SPONSOR, SILVER_SPONSOR, FOOD_PARTNER, MEDIA_PARTNER, STALL_VENDOR, MARKETING_PARTNER) (nullable, required when category = SPONSORSHIP)
  member          Member (nullable)
  sponsor         Sponsor (nullable)
  enteredBy       User (SYSTEM user for auto-detected payments)
  approvalStatus  Enum(PENDING_APPROVAL, APPROVED, REJECTED)
  approvalSource  Enum(MANUAL, RAZORPAY_WEBHOOK) (how this transaction was recorded)
  approvedBy      User (nullable, null for auto-approved)
  approvedAt      DateTime (nullable)
  razorpayPaymentId   String (nullable, Razorpay payment ID for auto-detected payments)
  razorpayOrderId     String (nullable)
  senderName          String (nullable, payer name from Razorpay or manually entered)
  senderPhone         String (nullable, payer phone/WhatsApp)
  senderUpiId         String (nullable, UPI VPA from Razorpay for UPI payments)
  senderBankAccount   String (nullable, masked account number from Razorpay for bank transfers)
  senderBankName      String (nullable, bank name from Razorpay)
  receiptNumber   String (nullable)
  createdAt       DateTime
}
```
- Refunds are recorded as type=CASH_OUT with category=EXPENSE (no separate REFUND category)

### 4.5 Sponsors
```
Sponsor {
  id              UUID PK
  name            String
  phone           String
  email           String
  company         String (nullable)
  createdBy       User (admin/operator who created this sponsor)
  createdAt       DateTime
}
```

### 4.6 Sponsor Links
```
SponsorLink {
  id              UUID PK
  sponsor         Sponsor (nullable, can be generic)
  token           String UNIQUE
  amount          Decimal (nullable, can be open-ended)
  upiId           String
  bankDetails     JSON (nullable) — schema: { accountNumber, bankName, ifscCode }
  isActive        Boolean
  createdBy       User
  createdAt       DateTime
  expiresAt       DateTime (nullable)
}
```

### 4.7 Approval Queue
```
Approval {
  id              UUID PK
  entityType      Enum(TRANSACTION, MEMBER_ADD, MEMBER_EDIT, MEMBER_DELETE, MEMBERSHIP)
  entityId        UUID
  action          String
  previousData    JSON (nullable)
  newData         JSON (nullable)
  requestedBy     User
  status          Enum(PENDING, APPROVED, REJECTED)
  reviewedBy      User (nullable)
  reviewedAt      DateTime (nullable)
  notes           String (nullable)
  createdAt       DateTime
}
```

### 4.8 Audit Log (financial)
```
AuditLog {
  id              UUID PK
  entityType      String
  entityId        UUID
  action          String
  previousData    JSON (nullable)
  newData         JSON
  transaction     Transaction (nullable, full related Transaction record)
  performedBy     User
  createdAt       DateTime
}
```

### 4.9 Activity Log (system-wide)
```
ActivityLog {
  id              UUID PK
  user            User
  action          String
  description     String
  metadata        JSON (nullable)
  createdAt       DateTime
}
```

---

## 5. Pages & Navigation

### 5.1 Public
- **/** — Landing page (stunning, minimal — login button top-right). Sections:
  1. Hero section (club name, tagline, featured image)
  2. Club Activities (annual events, cultural programs, community work)
  3. History & Heritage (founding story, legacy, notable years)
  4. Latest News (pulled from research — PM agent will web-search major Bengali media like ABP Ananda, Anandabazar Patrika, Ei Samay, Times of India Kolkata for Deshapriya Park Durga Puja coverage)
  5. Contact Information (address, phone, email, social links)
  6. Membership button → opens a printable static membership application form (print-friendly page) containing:
     - Instructions: how to fill the form, where to submit (club office address), who to contact (operator phone), payment details (application fee 10000 + membership fee), accepted payment modes (UPI/Bank/Cash)
     - Fields: applicant name, WhatsApp number (used as primary phone), email, address
     - Sub-members section (up to 3): name, WhatsApp number, relation
     - All phone number fields labeled as "WhatsApp Number"
     - Member prints, fills by hand, and submits physically to the operator
- **/login** — Login form. In test mode (RAZORPAY_TEST_MODE=true): shows auto-fill buttons to quickly login as admin, operator, or any of the 5 seeded test members

### 5.2 Dashboard (authenticated, sidebar navigation)

**Admin sidebar:**
1. Dashboard Home (member summary, financial summary, recent activity log, recent audit entries, quick actions, pending approvals count)
2. My Membership
3. Member Management
4. Cash Management (receive/spend)
5. Sponsorship Management
6. Approval Queue
7. Financial Audit Log
8. Activity Log

**Operator sidebar:**
1. Dashboard Home (member summary, financial summary, recent activity log, recent audit entries, quick actions)
2. My Membership
3. Member Management (add/edit/delete — all trigger admin approval before applying)
4. Cash Management (add/edit/delete — all trigger admin approval before applying)
5. Financial Audit Log (read-only)
6. Activity Log (read-only)

**Member sidebar (primary + sub-members):**
1. My Membership (view + manage own data, payment, pay on behalf of primary member for sub-members)

---

## 6. Key Workflows

### 6.1 New Member Registration
1. Operator adds new member → status = PENDING_APPROVAL
2. Approval request created → appears in Admin approval queue
3. Member pays application fee (₹10,000) + first period fee via Razorpay (UPI/bank auto-detect) or cash
4. If Razorpay: auto-approved, no admin approval needed. If cash: operator records payment → approval request to Admin
5. Admin approves payment → status changes to ACTIVE
6. System generates a temporary password and sends WhatsApp notification to member with: approval confirmation, registered email, temporary password, login URL
7. Member logs in with email + temp password → forced to change password before any dashboard operation is allowed
8. After password change, full dashboard access is granted

### 6.2 Membership Payment (existing member)
1. Member chooses payment type (monthly/half-yearly/annual)
2. Member chooses payment mode:
   - **UPI**: Razorpay UPI payment link generated → member pays → Razorpay webhook fires → system creates full Transaction from Razorpay data (amount, sender name, sender UPI VPA, razorpay payment ID, category, linked member) → auto-approved → membership ACTIVE → receipt auto-generated → full Transaction written to audit log + activity log
   - **Bank transfer**: Razorpay VAN assigned → member transfers via NEFT/RTGS/IMPS → Razorpay webhook fires → system creates full Transaction from Razorpay data (amount, sender name, sender bank name, masked account number, razorpay payment ID, category, linked member) → auto-approved → membership ACTIVE → receipt auto-generated → full Transaction written to audit log + activity log
   - **Cash**: member visits operator physically → operator enters financial data manually (amount, sender name, category) → admin approval queue + WhatsApp notification → admin approves → operator generates receipt → membership ACTIVE → full Transaction written to audit log + activity log
4. All payment events logged in both audit + activity logs with the complete Transaction record — no sender, category, or payment data missing from logs

### 6.3 Sponsor Payment
1. Admin/Operator generates sponsor link (Razorpay payment link with UPI + bank transfer options)
2. Link sent to sponsor
3. Sponsor pays via link:
   - **UPI**: Razorpay webhook fires → system creates full Transaction from Razorpay data (amount, sponsor name, sponsor UPI VPA, razorpay payment ID, category: SPONSORSHIP, sponsorPurpose, linked sponsor) → auto-approved → receipt auto-generated on confirmation page → full Transaction written to audit log + activity log
   - **Bank transfer**: Razorpay VAN webhook fires → system creates full Transaction from Razorpay data (amount, sponsor name, bank name, masked account number, razorpay payment ID, category: SPONSORSHIP, sponsorPurpose, linked sponsor) → auto-approved → receipt auto-generated on confirmation page → full Transaction written to audit log + activity log
   - **Cash**: sponsor pays operator in person → operator enters full data manually (amount, sponsor name, category, sponsorPurpose) → admin approval queue + WhatsApp notification → admin approves → receipt generated → full Transaction written to audit log + activity log
5. All sponsor payment events logged in both audit + activity logs with complete Transaction record — no sender, category, or sponsorship data missing from logs

### 6.4 Approval Flow (universal)
All operator data entries requiring approval:
- Cash in/out add/edit/delete (same as member — proposed changes stored in Approval record, only applied to Transaction table on admin approval)
- New member add
- Member data edit (stores proposed changes in Approval.newData, original in Approval.previousData — only written to Member table on admin approval)
- Member delete (soft-flags member for deletion — only removed/deactivated on admin approval; rejected = no change)
- Membership entry

Operator creates entry → Approval record created → Admin sees in approval queue + WhatsApp notification → Any one admin approves/rejects (suffices) → Change applied to DB or discarded → Logged in both audit + activity logs

- **Multiple admins/operators**: System supports multiple admins and operators. Any single admin approval is sufficient — no multi-approval required.

### 6.5 Membership Expiry
1. System runs a daily check (cron/scheduled task) on all active memberships
2. 15 days before expiry → WhatsApp reminder sent to member + sub-members
3. On expiry date → status auto-changes to EXPIRED → WhatsApp notification to member + sub-members + admin + operator
4. Expired members retain dashboard access (read-only) but cannot perform operations until renewed

### 6.6 Refund Policy
- Auto-approved Razorpay payments (UPI/bank transfer) **cannot** be rejected by admin
- If something is wrong with a payment, admin creates a CASH_OUT expense transaction and manually records the refund to the payer from the dashboard
- No automatic Razorpay refund integration

### 6.7 Sub-Member Payment
- Sub-members can log into their own dashboard
- Sub-members can pay membership fees on behalf of their primary member
- Payment flow is identical to primary member payment (UPI/bank/cash → same approval rules)

### 6.8 Payment Rules
- No partial payments allowed — member must pay the exact amount for the selected membership type
- Amounts: Monthly ₹250, Half-yearly ₹1,500, Annual ₹3,000, Application fee ₹10,000 (one-time)
- All currency in INR (₹). All dates in DD/MM/YYYY. All phone numbers in +91 format.

---

## 7. WhatsApp Notifications

Triggered on:
- New approval request pending (→ admin + operator)
- Payment received (any mode) (→ admin + operator)
- New member registration (→ admin + operator)
- Membership approved (→ admin + operator + member + sub-members: confirmation + email + temp password + login URL)
- Membership expiry reminder 15 days before (→ member + sub-members via WhatsApp)
- Membership expired (→ member + sub-members + admin + operator)
- Sponsor payment received (→ admin + operator)
- Any rejection by admin (→ operator)

**Graceful degradation**: If Meta Business account / WhatsApp API is not configured, system skips all notifications silently (no errors). Once configured via env vars, notifications auto-start.

Implementation: Meta Cloud API (graph.facebook.com). Single `fetch()` call per notification using pre-approved message templates. Requires: Meta Business account, registered WhatsApp number, API token in env vars. Free for first 1000 conversations/month.

---

## 8. API Route Structure

```
# Auth
/api/auth/[...nextauth]           — Login, session, JWT
/api/auth/change-password          — Forced password change (temp password flow)

# Members
/api/members                       — CRUD members (approval-gated for operator)
/api/members/[id]                  — Single member operations
/api/members/[id]/sub-members      — Sub-member CRUD (max 3 enforced)

# Membership
/api/memberships                   — Membership periods + status lifecycle
/api/memberships/[id]              — Single membership operations

# Payments (Razorpay)
/api/payments/create-order          — Create Razorpay order (UPI/bank transfer)
/api/payments/verify                — Verify Razorpay payment signature
/api/webhooks/razorpay              — Razorpay webhook (auto-detect UPI + bank transfers, create Transaction, auto-approve, log to audit + activity)

# Transactions
/api/transactions                   — Cash in/out CRUD (approval-gated for operator)
/api/transactions/[id]              — Single transaction operations

# Sponsors
/api/sponsors                       — Sponsor CRUD
/api/sponsors/[id]                  — Single sponsor operations
/api/sponsor-links                  — Generate/manage sponsor payment links (admin + operator)
/api/sponsor-links/[token]          — Public sponsor checkout page

# Approvals
/api/approvals                      — List pending approvals (admin)
/api/approvals/[id]/approve         — Approve entry (applies change to DB, logs everywhere)
/api/approvals/[id]/reject          — Reject entry (discards change, logs everywhere)

# Logs
/api/audit-log                      — Financial audit log (full Transaction data included)
/api/activity-log                   — System-wide activity log

# Receipts
/api/receipts/[id]                  — Generate/print receipt (member + sponsor)

# Notifications
/api/notifications/whatsapp         — WhatsApp webhook trigger (admin + operator + member)

# Dashboard
/api/dashboard/stats                — Summary stats cards
```

---

## 9. Implementation Backlog (ticket order)

### Phase 3a: Foundation
- T01: Project scaffold (Next.js + Prisma + Tailwind + shadcn/ui + Razorpay SDK)
- T02: Database schema + Prisma migrations (all models including sender fields, approvalSource, razorpay fields, isTempPassword, sub-member login fields)
- T03: Auth system (NextAuth + role-based middleware + forced password change for temp passwords)
- T04: Dashboard layout (sidebar + role-based nav per role)

### Phase 3b: Core Features
- T05: Landing page (hero, club activities, history & heritage, latest news, contact info, membership form button)
- T06: Printable membership application form (static page with instructions, WhatsApp number fields, sub-member section)
- T07: Member management (CRUD + sub-members + 3 cap + DPC-YYYY-NNNN-SS ID generation + approval-gated for operator)
- T08: Membership management (types, fees, exact amounts only — no partial payments, status lifecycle: PENDING_APPROVAL → ACTIVE, subscription fields on User, sub-member pay-on-behalf)
- T09: Approval queue system (universal approval flow — member add/edit/delete, cash add/edit/delete, membership, sponsorship)
- T10: Cash management (transactions in/out, payment modes, approval-gated for operator add/edit/delete)
- T11: Receipt generation + print (member + sponsor receipts)

### Phase 3c: Payment Integration
- T12: Razorpay integration — order creation, payment verification, UPI + bank transfer support
- T13: Razorpay webhook handler — auto-detect payments, create full Transaction from Razorpay data (sender name, UPI VPA, bank details, amount, category), auto-approve, log to audit + activity
- T14: Sponsor link generation (admin + operator) + public sponsor checkout page with Razorpay payment
- T15: Sponsor payment webhook — auto-detect, create full Transaction with sponsor purpose, auto-approve, receipt on confirmation page

### Phase 3d: Logs & Notifications
- T16: Financial audit log (full Transaction data embedded, approval source, sender details — no missing data)
- T17: System-wide activity log (all user/system actions)
- T18: WhatsApp notification integration (admin + operator for all events, member + sub-members for approval + temp password + expiry reminders). Graceful skip if Meta API not configured.
- T19: Membership expiry cron — daily check, 15-day reminder, auto-expire on date, WhatsApp notifications
- T20: Dashboard home (member summary, financial summary, recent activity/audit, quick actions, pending approvals)

### Phase 3e: Security
- T21: Input validation — Zod schemas on every API route, server-side sanitization
- T22: Auth hardening — bcrypt (12+ rounds), short-lived JWT, HTTP-only cookies, CSRF protection
- T23: Rate limiting — login (5/15min), API (100/min/user), webhooks (IP-based)
- T24: Sensitive data encryption — AES-256 at rest for phone numbers, addresses, bank details (Prisma middleware)
- T25: Razorpay webhook HMAC signature verification
- T26: Security headers — CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- T27: Audit log immutability — append-only, no update/delete endpoints

### Phase 3f: Polish
- T28: Role-based access enforcement (API + UI — all routes and components)
- T29: Data formatting (all currency ₹ INR, dates DD/MM/YYYY, phones +91)
- T30: Responsive design pass
- T31: Service layer refactor — extract business logic from API routes into `lib/services/`, keep routes thin
- T32: Comprehensive seed data — 1 admin, 1 operator, 5 members (with sub-members), randomized transactions, approvals, sponsorships, audit/activity logs across all categories to fill every UI view. High variance in data.
- T33: Test mode login page — auto-fill buttons to quickly login as admin, operator, or any seeded member

### Phase 4: Testing
- T34: Unit tests (business logic, fee calculation, member ID generation, approval flow, auto-detect payment logic, expiry check, no partial payments, encryption/decryption)
- T35: Integration tests (API routes, Razorpay webhook, approval flows, payment flows, receipt generation, sub-member pay-on-behalf, expiry cron, rate limiting)
- T36: Component tests (key UI flows — dashboard, approvals, member management)

### Phase 5: Ship
- T37: Backup system — `scripts/backup.sh` (pg_dump daily cron, 30-day retention), `scripts/restore.sh` (tested)
- T38: Docker Compose + Caddyfile for deployment (VPS IP, HTTP for now, HTTPS-ready when domain added)
- T39: Docker deployment smoke test — run `docker compose up`, verify app starts, DB connects, all API routes respond, seed data loads, login works, no container errors. Fix any issues before proceeding.
- T40: Server hardening — UFW (22/80/443 only), SSH key-only, Fail2ban (SSH, 5 attempts/10min ban), non-root app user, .env chmod 600
- T41: Full `docs/` folder — setup guide, deployment guide, Razorpay setup, WhatsApp setup, API reference, data model, security docs, approval flow, testing guide, architecture
- T42: Local preview in VS Code — npm run dev on localhost:3000, VS Code Simple Browser inline preview, manual testing with seeded accounts
- T43: README — one-command start, VS Code preview instructions, test credentials, env checklist, doc links, tech stack, project structure
- T44: PM review + final polish (PM researches Bengali media for landing page content)

---

## 10. Security

### 10.1 Application Security
- **Password hashing**: bcrypt with salt rounds ≥ 12
- **JWT tokens**: short-lived access tokens (15 min), HTTP-only secure cookies, no tokens in localStorage
- **CSRF protection**: SameSite cookie attribute + CSRF token on state-changing requests
- **Input sanitization**: all user inputs validated + sanitized server-side (Zod schemas on every API route)
- **SQL injection**: prevented by Prisma parameterized queries (no raw SQL)
- **XSS**: React auto-escaping + Content-Security-Policy headers
- **Rate limiting**: on login (5 attempts/15 min), API routes (100 req/min per user), webhook endpoints (IP-based)
- **Role enforcement**: server-side middleware on every API route — never trust client-side role checks
- **Sensitive data encryption**: phone numbers, addresses, bank details encrypted at rest in DB (AES-256 via Prisma middleware)
- **Razorpay webhook verification**: HMAC signature validation on every webhook call — reject unsigned requests
- **Sponsor link tokens**: cryptographically random (crypto.randomUUID), time-expiring
- **No secrets in code**: all keys/tokens in .env, .env excluded from git, .env.example has placeholder values only
- **Audit trail immutability**: audit log and activity log records are append-only — no update/delete API exists

### 10.2 Server Security (LunaNode VPS — safe defaults, no lockout risk)
- **UFW firewall**: allow only ports 22 (SSH), 80 (HTTP), 443 (HTTPS) — deny all others
- **SSH key-only auth**: disable password SSH login (keep your key backed up)
- **Fail2ban**: on SSH only — auto-ban after 5 failed attempts for 10 min (short ban, no lockout risk)
- **Unattended upgrades**: auto-install security patches only (no major version upgrades)
- **Non-root app user**: run the app as a dedicated `dps` user, not root
- **Docker socket**: not exposed to the app container
- **HTTPS**: Let's Encrypt via Caddy reverse proxy (auto-renew, zero config) — when domain is ready; HTTP-only on IP for now
- **Environment isolation**: .env file readable only by `dps` user (chmod 600)

### 10.3 Data Backup
- **Automated daily PostgreSQL backup**: `pg_dump` via cron to local `/backups/` directory
- **Backup retention**: keep last 30 daily backups, auto-delete older
- **Backup script in repo**: `scripts/backup.sh` — can be run manually anytime
- **Backup restore script**: `scripts/restore.sh` — tested and documented in developer docs
- **Docker volume persistence**: PostgreSQL data on a named Docker volume (survives container restarts)
- **Optional offsite**: backup script supports optional SCP/rsync to a second location (configurable in .env, disabled by default)

---

## 11. Code Quality & Documentation

### 11.1 Development Flow & Git Commits

Every ticket follows this cycle:
```
Plan → Code → Review → Fix → Test → Fix → Review → All OK → Commit
```

- Commit after each completed ticket or logical batch (same phase)
- Never commit broken or untested code — every commit is a working checkpoint
- Commit message format:
  ```
  [PHASE] Brief summary

  Completed:
  - T01: Project scaffold
  - T02: Database schema + migrations

  Files: key files changed
  ```
- `shared/taskboard.md` checkboxes are source of truth — only commit checked-off items
- Git history should tell the full story of how the project was built

### 11.2 Code Standards
- **Modular architecture**: each domain (members, transactions, approvals, sponsors, auth) is a self-contained module with its own route, service logic, validators, and types
- **Service layer**: business logic lives in `lib/services/` — API routes are thin (validate → call service → respond)
- **Shared utilities**: common helpers in `lib/` (audit, notifications, permissions, validators) — no duplication
- **TypeScript strict mode**: enabled, no `any` types, all function signatures typed
- **Consistent naming**: files kebab-case, components PascalCase, functions camelCase, DB enums UPPER_SNAKE
- **Small files**: no file exceeds ~300 lines — split if it does
- **JSDoc comments**: on all exported functions, service methods, and non-obvious business logic

### 11.3 Final Documentation (`docs/` folder)
```
docs/
├── README.md                    # Project overview, quick start, architecture summary
├── setup-guide.md               # Full setup: Node, PostgreSQL, Docker, env vars, seed data
├── deployment-guide.md          # LunaNode VPS deploy: Docker Compose, UFW, SSH, backups
├── razorpay-setup.md            # Razorpay account, test/live mode, webhook config
├── whatsapp-setup.md            # Meta Business account, API token, message templates
├── api-reference.md             # All API routes, request/response schemas, auth requirements
├── data-model.md                # Complete DB schema with relationships and constraints
├── security.md                  # Security measures, backup/restore procedures
├── approval-flow.md             # Detailed approval workflow with diagrams
├── testing-guide.md             # How to run tests, seed data, test mode login
└── architecture.md              # Module structure, service layer, file organization
```

### 11.4 Local Preview (VS Code)
- After build, the app runs locally via `npm run dev` on `localhost:3000`
- VS Code Simple Browser or port forwarding panel opens the preview inline — the full web app is visible inside VS Code for manual testing
- The `dev` script auto-opens VS Code Simple Browser if running inside VS Code terminal
- All seeded test accounts work in local preview for end-to-end manual testing

### 11.5 README Requirements
The root `README.md` must include:
1. One-command start: `docker compose up` (or `npm run dev` for local)
2. How to open local preview inside VS Code (Simple Browser on localhost:3000)
3. Default login credentials for test mode
4. Environment variables checklist
5. Link to every doc in `docs/`
6. Tech stack summary
7. Project structure overview

---

## 12. File Structure

```
dps-dashboard/
├── src/
│   ├── app/
│   │   ├── page.tsx                        # Landing page (hero, activities, history, news, contact)
│   │   ├── membership-form/page.tsx        # Printable membership application form
│   │   ├── login/page.tsx                  # Login (+ test mode auto-fill buttons)
│   │   ├── change-password/page.tsx        # Forced temp password change
│   │   ├── sponsor/[token]/page.tsx        # Public sponsor checkout page
│   │   ├── sponsor/[token]/receipt/page.tsx # Sponsor payment receipt
│   │   ├── dashboard/
│   │   │   ├── layout.tsx                  # Sidebar layout (role-based nav)
│   │   │   ├── page.tsx                    # Dashboard home (member summary, financial summary, activity/audit, quick actions)
│   │   │   ├── my-membership/page.tsx      # Own membership + subscription details
│   │   │   ├── members/page.tsx            # Member management (CRUD + sub-members)
│   │   │   ├── cash/page.tsx               # Cash management (transactions in/out)
│   │   │   ├── sponsorship/page.tsx        # Sponsorship management + link generation
│   │   │   ├── approvals/page.tsx          # Approval queue (admin only)
│   │   │   ├── audit-log/page.tsx          # Financial audit log (full transaction data)
│   │   │   └── activity-log/page.tsx       # System-wide activity log
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── auth/change-password/route.ts
│   │       ├── members/route.ts
│   │       ├── members/[id]/route.ts
│   │       ├── members/[id]/sub-members/route.ts
│   │       ├── memberships/route.ts
│   │       ├── memberships/[id]/route.ts
│   │       ├── payments/create-order/route.ts
│   │       ├── payments/verify/route.ts
│   │       ├── webhooks/razorpay/route.ts
│   │       ├── transactions/route.ts
│   │       ├── transactions/[id]/route.ts
│   │       ├── sponsors/route.ts
│   │       ├── sponsors/[id]/route.ts
│   │       ├── sponsor-links/route.ts
│   │       ├── sponsor-links/[token]/route.ts
│   │       ├── approvals/route.ts
│   │       ├── approvals/[id]/approve/route.ts
│   │       ├── approvals/[id]/reject/route.ts
│   │       ├── audit-log/route.ts
│   │       ├── activity-log/route.ts
│   │       ├── receipts/[id]/route.ts
│   │       ├── notifications/whatsapp/route.ts
│   │       └── dashboard/stats/route.ts
│   ├── components/
│   │   ├── ui/                             # shadcn/ui components
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── DashboardShell.tsx
│   │   ├── members/
│   │   ├── cash/
│   │   ├── approvals/
│   │   ├── sponsorship/
│   │   └── receipts/
│   ├── lib/
│   │   ├── prisma.ts                       # Prisma client (with encryption middleware)
│   │   ├── auth.ts                         # Auth config (JWT, HTTP-only cookies)
│   │   ├── permissions.ts                  # Role-based access (server-side enforcement)
│   │   ├── razorpay.ts                     # Razorpay client + order/verification + webhook HMAC
│   │   ├── whatsapp.ts                     # WhatsApp notification (graceful skip if unconfigured)
│   │   ├── receipt.ts                      # Receipt generation (member + sponsor)
│   │   ├── member-id.ts                    # DPC-YYYY-NNNN-SS ID generation
│   │   ├── validators.ts                   # Zod schemas for all API inputs
│   │   ├── encrypt.ts                      # AES-256 field-level encryption for sensitive data
│   │   ├── rate-limit.ts                   # Rate limiting (login, API, webhooks)
│   │   ├── audit.ts                        # Audit + activity log helpers (append-only)
│   │   ├── cron.ts                         # Membership expiry daily check + 15-day reminder
│   │   └── services/                       # Business logic service layer
│   │       ├── member-service.ts
│   │       ├── membership-service.ts
│   │       ├── transaction-service.ts
│   │       ├── approval-service.ts
│   │       ├── sponsor-service.ts
│   │       └── notification-service.ts
│   └── types/
│       └── index.ts                        # Shared types
├── prisma/
│   ├── schema.prisma
│   └── seed.ts                             # 1 admin, 1 operator, 5 members + sub-members, randomized transactions/approvals/sponsorships/logs — fills all UI views
├── scripts/
│   ├── backup.sh                           # PostgreSQL daily backup (pg_dump, 30-day retention)
│   └── restore.sh                          # Backup restore (tested + documented)
├── tests/
│   ├── unit/
│   ├── integration/
│   └── components/
├── docs/                                   # Full developer documentation (see §11.2)
├── public/
├── docker-compose.yml
├── Caddyfile                               # Reverse proxy (HTTPS when domain ready, HTTP on IP for now)
├── .env.example
└── package.json
```

---

## Open Questions for Approval

All questions resolved:
1. ~~**UPI integration**~~ — Razorpay payment gateway for UPI + bank transfer auto-detection
2. ~~**Sponsor link page**~~ — Public checkout page with Razorpay payment + auto-generated receipt
3. ~~**WhatsApp**~~ — Meta Cloud API (free tier, direct HTTP, no third-party)
4. ~~**Deployment target**~~ — LunaNode Cloud VPS (API keys + credits available)

---

**Status: PLAN FROZEN — approved for implementation.**
