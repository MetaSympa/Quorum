# DPS Dashboard — Task Board (FROZEN)
> **FROZEN — Project shipped 2026-03-15. This is a historical record.**
> Tracks all 42 tickets across 8 phases.

---

## Phase 1: Research
**Agent: Scout** | Status: COMPLETED

- [x] **R01** — Research Deshapriya Park Durga Puja club history, heritage, founding story
- [x] **R02** — Gather latest news from Bengali media (ABP Ananda, Anandabazar Patrika, Ei Samay, TOI Kolkata)
- [x] **R03** — Collect club activities, cultural programs, community work details
- [x] **R04** — Gather contact information, social links, office address
- [x] **R05** — Write `shared/research_brief.md`

---

## Phase 2: Architecture
**Agent: Architect** | Status: COMPLETED

- [x] **A01** — Finalize data model in Prisma schema format (all 9 models + enums)
- [x] **A02** — Define API route contracts (request/response types for all 30+ routes)
- [x] **A03** — Write `shared/architecture.md` (tech decisions, module boundaries, service layer design)
- [x] **A04** — Write `shared/schema.sql` (reference SQL from Prisma schema)
- [x] **A05** — Write `shared/api_spec.yaml` (OpenAPI spec for all routes)
- [x] **A06** — Write `shared/backlog.md` (final ordered ticket list with acceptance criteria)

---

## Phase 3a: Foundation
**Agent: Backend + Frontend** | Status: COMPLETED

- [x] **T01** — Project scaffold
  - [x] Initialize Next.js 14 (App Router) + TypeScript
  - [x] Install Prisma, Tailwind CSS, shadcn/ui
  - [x] Install Razorpay SDK
  - [x] Configure `tsconfig.json` (strict mode)
  - [x] Create `.env.example` with all placeholder keys
  - [x] Set up project directory structure per plan §12
- [x] **T02** — Database schema + Prisma migrations
  - [x] User model (memberId DPC format, isTempPassword, membership fields, address)
  - [x] SubMember model (login fields, parentUser relation, email, password)
  - [x] Member model (user relation, parentMember, status)
  - [x] Membership model (member relation, type, amount, dates, applicationFee flag)
  - [x] Transaction model (all sender fields, razorpay fields, approvalSource, sponsorPurpose)
  - [x] Sponsor model (createdBy relation)
  - [x] SponsorLink model (sponsor relation, token, UPI/bank details, createdBy)
  - [x] Approval model (entityType, requestedBy, reviewedBy)
  - [x] AuditLog model (full Transaction relation, performedBy, append-only)
  - [x] ActivityLog model (user relation, action, metadata)
  - [x] All enums (Role, MembershipStatus, MembershipType, TransactionType, TransactionCategory, PaymentMode, SponsorPurpose, ApprovalStatus, ApprovalEntityType, ApprovalSource)
  - [x] Run initial migration, verify schema
- [x] **T03** — Auth system
  - [x] NextAuth.js credentials provider setup
  - [x] JWT session with HTTP-only cookies
  - [x] Role-based middleware (`lib/permissions.ts`)
  - [x] Temp password detection middleware (block dashboard if `isTempPassword=true`)
  - [x] `/api/auth/change-password` route
  - [x] `/change-password` page (forced redirect)
  - [x] Sub-member login support (same auth flow)
- [x] **T04** — Dashboard layout
  - [x] Sidebar component with role-based nav items
  - [x] Header component (user info, logout)
  - [x] DashboardShell wrapper
  - [x] Admin sidebar: Dashboard Home, My Membership, Member Mgmt, Cash Mgmt, Sponsorship, Approvals, Audit Log, Activity Log
  - [x] Operator sidebar: Dashboard Home, My Membership, Member Mgmt, Cash Mgmt, Audit Log, Activity Log
  - [x] Member sidebar: My Membership
  - [x] Responsive sidebar (mobile collapse)

---

## Phase 3b: Core Features
**Agent: Backend + Frontend** | Status: COMPLETED

- [x] **T05** — Landing page
  - [x] Hero section (club name, tagline, featured image)
  - [x] Club Activities section
  - [x] History & Heritage section
  - [x] Latest News section (content from research brief)
  - [x] Contact Information section
  - [x] Login button (top-right corner)
  - [x] Membership form button
  - [x] SSR for SEO
- [x] **T06** — Printable membership application form
  - [x] `/membership-form` page (print-friendly CSS)
  - [x] Instructions block (how to fill, where to submit, operator contact, fees, payment modes)
  - [x] Primary member fields: name, WhatsApp number, email, address
  - [x] Sub-member section (up to 3): name, WhatsApp number, relation
  - [x] All phone fields labeled "WhatsApp Number"
  - [x] Print button, clean print layout
- [x] **T07** — Member management
  - [x] `GET /api/members` — list all (admin + operator)
  - [x] `POST /api/members` — create member (DPC-YYYY-NNNN-00 ID auto-generation)
  - [x] `PUT /api/members/[id]` — edit member
  - [x] `DELETE /api/members/[id]` — soft-delete member
  - [x] `POST /api/members/[id]/sub-members` — add sub-member (max 3 enforced, DPC-YYYY-NNNN-SS)
  - [x] `PUT /api/members/[id]/sub-members/[subId]` — edit sub-member
  - [x] `DELETE /api/members/[id]/sub-members/[subId]` — remove sub-member
  - [x] All operator CRUD triggers approval flow (no direct DB write)
  - [x] Admin CRUD applies directly
  - [x] Members page UI — table, search, add/edit/delete dialogs
  - [x] Sub-member management UI within member detail
- [x] **T08** — Membership management
  - [x] Membership type selection (Monthly ₹250, Half-yearly ₹1,500, Annual ₹3,000)
  - [x] Application fee ₹10,000 (one-time, first membership only)
  - [x] No partial payments — exact amount enforced
  - [x] Status lifecycle: PENDING_APPROVAL → ACTIVE → EXPIRED
  - [x] Subscription fields on User (membershipStatus, type, start, expiry, totalPaid, applicationFeePaid)
  - [x] Sub-member pay-on-behalf flow
  - [x] My Membership page UI — current status, payment history, renew button, sub-member list
- [x] **T09** — Approval queue system
  - [x] Approval model operations (create, list pending, approve, reject)
  - [x] `GET /api/approvals` — list pending (admin only)
  - [x] `POST /api/approvals/[id]/approve` — apply change to DB + log everywhere
  - [x] `POST /api/approvals/[id]/reject` — discard change + log everywhere
  - [x] Entity types: TRANSACTION, MEMBER_ADD, MEMBER_EDIT, MEMBER_DELETE, MEMBERSHIP
  - [x] Store proposed changes in Approval.newData, original in Approval.previousData
  - [x] Any single admin approval suffices (multiple admins supported)
  - [x] On approve: apply to DB → audit log → activity log → WhatsApp notification
  - [x] On reject: discard → audit log → activity log → WhatsApp notification to operator
  - [x] Approvals page UI — pending list, approve/reject buttons, detail modal with diff view
- [x] **T10** — Cash management
  - [x] `GET /api/transactions` — list all (filtered by role)
  - [x] `POST /api/transactions` — create cash in/out
  - [x] `PUT /api/transactions/[id]` — edit transaction
  - [x] `DELETE /api/transactions/[id]` — delete transaction
  - [x] All operator CRUD triggers approval flow
  - [x] Admin CRUD applies directly
  - [x] Payment modes: UPI, Bank Transfer, Cash
  - [x] Categories: MEMBERSHIP_FEE, APPLICATION_FEE, SPONSORSHIP, EXPENSE, OTHER
  - [x] Sponsor purpose field (required when category = SPONSORSHIP)
  - [x] Cash page UI — transaction table, filters, add/edit/delete dialogs
- [x] **T11** — Receipt generation
  - [x] `GET /api/receipts/[id]` — generate receipt PDF/printable page
  - [x] Member payment receipt (amount, date, member ID, payment mode, receipt number)
  - [x] Sponsor payment receipt (amount, sponsor name, purpose, date, receipt number)
  - [x] Auto-increment receipt numbers
  - [x] Print-friendly layout
  - [x] Operator can generate + print from dashboard

---

## Phase 3c: Payment Integration
**Agent: Backend** | Status: COMPLETED

- [x] **T12** — Razorpay integration
  - [x] `lib/razorpay.ts` — Razorpay client initialization
  - [x] `POST /api/payments/create-order` — create Razorpay order (UPI + bank transfer)
  - [x] `POST /api/payments/verify` — verify payment signature
  - [x] Razorpay test mode support (RAZORPAY_TEST_MODE env var)
  - [x] Virtual Account (VAN) creation for bank transfers
  - [x] UPI payment link generation
- [x] **T13** — Razorpay webhook handler (member payments)
  - [x] `POST /api/webhooks/razorpay` — receive webhook
  - [x] HMAC signature verification
  - [x] Create full Transaction from Razorpay data:
    - [x] Extract sender name, UPI VPA, bank name, masked account number
    - [x] Map to correct category (MEMBERSHIP_FEE / APPLICATION_FEE)
    - [x] Link to member record
    - [x] Set approvalSource = RAZORPAY_WEBHOOK
  - [x] Auto-approve (no admin approval needed)
  - [x] Update membership status → ACTIVE
  - [x] Auto-generate receipt
  - [x] Write to audit log (full transaction data) + activity log
- [x] **T14** — Sponsor link generation + checkout
  - [x] `POST /api/sponsor-links` — generate link (admin + operator)
  - [x] `GET /api/sponsor-links/[token]` — public checkout page data
  - [x] `/sponsor/[token]` — public checkout page with Razorpay payment (UPI + bank)
  - [x] Sponsor purpose selection on link creation
  - [x] Link expiry support
- [x] **T15** — Sponsor payment webhook
  - [x] Handle sponsor payments in webhook handler
  - [x] Create full Transaction with sponsor purpose, linked sponsor
  - [x] Auto-approve
  - [x] `/sponsor/[token]/receipt` — auto-generated printable receipt on confirmation page
  - [x] Write to audit log + activity log

---

## Phase 3d: Logs & Notifications
**Agent: Backend + Frontend** | Status: COMPLETED

- [x] **T16** — Financial audit log
  - [x] `GET /api/audit-log` — list entries (admin: full, operator: read-only)
  - [x] Full Transaction data embedded in each entry (no missing sender/category data)
  - [x] Approval source recorded (RAZORPAY_WEBHOOK or MANUAL)
  - [x] Performer recorded (SYSTEM for auto-detect, user for manual)
  - [x] `lib/audit.ts` — helper to create audit entries
  - [x] Audit log page UI — table with filters (date, type, amount, category), detail modal
- [x] **T17** — System-wide activity log
  - [x] `GET /api/activity-log` — list entries (admin: full, operator: read-only)
  - [x] Log all actions: login, member CRUD, transactions, approvals, payments, password changes
  - [x] Activity log page UI — table with filters (user, action, date)
- [x] **T18** — WhatsApp notification integration
  - [x] `lib/whatsapp.ts` — Meta Cloud API helper (graph.facebook.com)
  - [x] Graceful skip if WHATSAPP_API_TOKEN not configured (no errors)
  - [x] Auto-start when env vars are set
  - [x] Pre-approved message templates for:
    - [x] New approval request (→ admin + operator)
    - [x] Payment received (→ admin + operator)
    - [x] New member registration (→ admin + operator)
    - [x] Membership approved (→ admin + operator + member + sub-members: email + temp password + login URL)
    - [x] Membership expiry reminder 15 days before (→ member + sub-members)
    - [x] Membership expired (→ member + sub-members + admin + operator)
    - [x] Sponsor payment received (→ admin + operator)
    - [x] Rejection (→ operator)
- [x] **T19** — Membership expiry cron
  - [x] `lib/cron.ts` — daily scheduled check
  - [x] 15 days before expiry → WhatsApp reminder to member + sub-members
  - [x] On expiry date → auto-change status to EXPIRED
  - [x] Notify member + sub-members + admin + operator via WhatsApp
  - [x] Expired members retain read-only dashboard access
- [x] **T20** — Dashboard home
  - [x] `GET /api/dashboard/stats` — summary stats
  - [x] Member summary card (total, active, pending, expired)
  - [x] Financial summary card (total income, expenses, pending approvals amount)
  - [x] Recent activity log (last 10 entries)
  - [x] Recent audit log entries (last 10)
  - [x] Quick actions (add member, record payment, generate sponsor link)
  - [x] Pending approvals count badge (admin only)
  - [x] Role-appropriate view (admin sees all, operator sees relevant, member sees own)

---

## Phase 3e: Security
**Agent: Backend** | Status: COMPLETED

- [x] **T21** — Input validation
  - [x] Zod schemas for every API route (request body + query params)
  - [x] Server-side sanitization on all string inputs
  - [x] Reject malformed requests with clear error messages
- [x] **T22** — Auth hardening
  - [x] bcrypt with 12+ salt rounds
  - [x] Short-lived JWT (15 min access tokens)
  - [x] HTTP-only secure cookies (no localStorage)
  - [x] CSRF protection (SameSite + CSRF token)
- [x] **T23** — Rate limiting
  - [x] `lib/rate-limit.ts`
  - [x] Login: 5 attempts per 15 min
  - [x] API routes: 100 req/min per user
  - [x] Webhook endpoints: IP-based limiting
- [x] **T24** — Sensitive data encryption
  - [x] `lib/encrypt.ts` — AES-256 encryption/decryption
  - [x] Prisma middleware for transparent encrypt/decrypt
  - [x] Encrypted fields: phone numbers, addresses, bank details
- [x] **T25** — Razorpay webhook HMAC verification
  - [x] Verify signature on every webhook request
  - [x] Reject unsigned/tampered requests
  - [x] Log rejected attempts in activity log
- [x] **T26** — Security headers
  - [x] Content-Security-Policy
  - [x] X-Frame-Options: DENY
  - [x] X-Content-Type-Options: nosniff
  - [x] Referrer-Policy: strict-origin-when-cross-origin
  - [x] Next.js `headers()` config in `next.config.js`
- [x] **T27** — Audit log immutability
  - [x] No PUT/DELETE endpoints for audit log
  - [x] No PUT/DELETE endpoints for activity log
  - [x] DB-level: remove UPDATE/DELETE grants on audit tables (if applicable)

---

## Phase 3f: Polish
**Agent: Frontend + Backend** | Status: COMPLETED

- [x] **T28** — Role-based access enforcement
  - [x] Server-side middleware on every API route
  - [x] Client-side route guards (redirect unauthorized users)
  - [x] UI component visibility per role (hide admin-only elements from members)
  - [x] Test all role combinations against all routes
- [x] **T29** — Data formatting
  - [x] Currency: ₹ INR format (e.g., ₹1,500.00)
  - [x] Dates: DD/MM/YYYY throughout UI
  - [x] Phone numbers: +91 format
  - [x] Member IDs: DPC-YYYY-NNNN-SS display format
- [x] **T30** — Responsive design pass
  - [x] Mobile sidebar collapse/hamburger
  - [x] Table responsiveness (horizontal scroll or card view on mobile)
  - [x] Form layouts on small screens
  - [x] Landing page mobile optimization
  - [x] Print layouts unaffected
- [x] **T31** — Service layer refactor
  - [x] `lib/services/member-service.ts` — all member business logic
  - [x] `lib/services/membership-service.ts` — fee calculation, status transitions
  - [x] `lib/services/transaction-service.ts` — transaction creation, approval integration
  - [x] `lib/services/approval-service.ts` — approval flow orchestration
  - [x] `lib/services/sponsor-service.ts` — sponsor + link management
  - [x] `lib/services/notification-service.ts` — WhatsApp dispatch logic
  - [x] API routes become thin: validate → call service → respond
- [x] **T32** — Comprehensive seed data
  - [x] 1 admin account (known credentials for test login)
  - [x] 1 operator account (known credentials for test login)
  - [x] 5 member accounts with sub-members (known credentials for test login)
  - [x] Randomized transactions (mix of UPI, bank, cash across all categories)
  - [x] Randomized approvals (pending, approved, rejected)
  - [x] Randomized sponsorships (all 7 purpose types)
  - [x] Audit log entries covering all transaction types
  - [x] Activity log entries covering all action types
  - [x] Mix of membership statuses (active, pending, expired)
  - [x] Various membership types (monthly, half-yearly, annual)
  - [x] High data variance — every UI view should have content
- [x] **T33** — Test mode login page
  - [x] Detect RAZORPAY_TEST_MODE=true
  - [x] Show auto-fill buttons: "Login as Admin", "Login as Operator", "Login as Member 1-5"
  - [x] One-click login with seeded credentials
  - [x] Hide auto-fill buttons in production mode

---

## Phase 4: Testing
**Agent: QA** | Status: COMPLETED

- [x] **T34** — Unit tests
  - [x] Fee calculation (monthly, half-yearly, annual, application fee)
  - [x] Member ID generation (DPC-YYYY-NNNN-SS format, auto-increment)
  - [x] Approval flow logic (create, approve, reject, apply/discard)
  - [x] Payment auto-detect logic (Razorpay webhook → Transaction creation)
  - [x] Membership expiry check logic
  - [x] Partial payment rejection
  - [x] Sub-member cap enforcement (max 3)
  - [x] Encryption/decryption round-trip
  - [x] Receipt number generation
  - [x] Role permission checks
- [x] **T35** — Integration tests
  - [x] Auth flow (login, temp password, change password, session)
  - [x] Member CRUD API (admin direct, operator via approval)
  - [x] Transaction CRUD API (admin direct, operator via approval)
  - [x] Razorpay webhook → auto-approve → audit + activity log
  - [x] Sponsor link → checkout → payment → receipt
  - [x] Approval flow end-to-end (create → approve/reject → DB state change)
  - [x] Sub-member pay-on-behalf
  - [x] Membership expiry cron
  - [x] Rate limiting (verify limits hit correctly)
  - [x] Role-based API access (verify unauthorized returns 403)
- [x] **T36** — Component tests
  - [x] Dashboard home renders correct data per role
  - [x] Approval queue renders pending items, approve/reject works
  - [x] Member management table, add/edit/delete dialogs
  - [x] Cash management table, filters
  - [x] Landing page renders all sections
  - [x] Login page (standard + test mode auto-fill)

---

## Phase 5: Ship
**Agent: Infra + Docs + PM** | Status: COMPLETED

- [x] **T37** — Backup system
  - [x] `scripts/backup.sh` — pg_dump with timestamp filename
  - [x] Cron job: daily at 2 AM
  - [x] 30-day retention (auto-delete older)
  - [x] `scripts/restore.sh` — restore from backup file
  - [x] Test backup + restore cycle
  - [x] Docker volume persistence for PostgreSQL data
  - [x] Optional offsite rsync/scp (configurable in .env, disabled by default)
- [x] **T38** — Docker Compose + Caddyfile
  - [x] `docker-compose.yml` — Next.js app + PostgreSQL + Caddy
  - [x] `Caddyfile` — reverse proxy, HTTP on IP for now, HTTPS-ready
  - [x] Health check endpoints
  - [x] `docker compose up` starts everything
  - [x] Environment variable passthrough from `.env`
- [x] **T39** — Docker deployment smoke test
  - [x] Run `docker compose up` — verify all containers start without errors
  - [x] Verify PostgreSQL connects and migrations run
  - [x] Verify seed data loads correctly
  - [x] Verify all API routes respond (health check + sample requests)
  - [x] Verify login works (admin, operator, member)
  - [x] Verify landing page renders
  - [x] Check container logs for errors/warnings — fix any issues
  - [x] Verify app survives container restart (`docker compose restart`)
- [x] **T40** — Server hardening (LunaNode VPS)
  - [x] UFW: allow 22, 80, 443 only
  - [x] SSH key-only auth (document key backup!)
  - [x] Fail2ban on SSH (5 attempts / 10 min ban — short, no lockout risk)
  - [x] Unattended security upgrades only
  - [x] Non-root `dps` user for running the app
  - [x] `.env` file chmod 600 (readable only by `dps`)
  - [x] Docker socket not exposed to app container
  - [x] Document all hardening steps in `docs/server-hardening.md`
- [x] **T41** — Developer documentation (`docs/` folder)
  - [x] `docs/setup-guide.md` — Node, PostgreSQL, Docker, env vars, seed data
  - [x] `docs/deployment-guide.md` — LunaNode VPS, Docker Compose, UFW, SSH, backups
  - [x] `docs/razorpay-setup.md` — account creation, test/live mode, webhook config
  - [x] `docs/whatsapp-setup.md` — Meta Business account, API token, message templates
  - [x] `docs/api-reference.md` — all routes, request/response schemas, auth requirements
  - [x] `docs/data-model.md` — complete DB schema, relationships, constraints
  - [x] `docs/security.md` — all security measures, backup/restore procedures
  - [x] `docs/approval-flow.md` — detailed workflow with examples
  - [x] `docs/testing-guide.md` — run tests, seed data, test mode login
  - [x] `docs/architecture.md` — module structure, service layer, file organization
- [x] **T42** — Local preview in VS Code
  - [x] `npm run dev` starts app on localhost:3000
  - [x] VS Code Simple Browser auto-opens for inline preview
  - [x] Full web app visible inside VS Code for manual testing
  - [x] All seeded test accounts work in local preview
  - [x] Verify all pages, workflows, and roles manually
- [x] **T43** — README
  - [x] One-command start: `docker compose up`
  - [x] Local dev: `npm run dev`
  - [x] How to open local preview in VS Code (Simple Browser on localhost:3000)
  - [x] Default test login credentials
  - [x] Environment variables checklist
  - [x] Links to every doc in `docs/`
  - [x] Tech stack summary
  - [x] Project structure overview
- [x] **T44** — PM review + final polish
  - [x] PM agent reviews full product against research brief
  - [x] PM web-searches Bengali media for latest landing page content
  - [x] All UI views populated with data (no empty states in demo)
  - [x] All workflows tested end-to-end via VS Code local preview
  - [x] Ship/no-ship verdict in `shared/review.md`
  - [x] If no-ship: punch list → fix → re-review

---

## Summary

| Phase | Tickets | Status |
|-------|---------|--------|
| Phase 1: Research | R01–R05 | COMPLETED |
| Phase 2: Architecture | A01–A06 | COMPLETED |
| Phase 3a: Foundation | T01–T04 | COMPLETED |
| Phase 3b: Core Features | T05–T11 | COMPLETED |
| Phase 3c: Payment Integration | T12–T15 | COMPLETED |
| Phase 3d: Logs & Notifications | T16–T20 | COMPLETED |
| Phase 3e: Security | T21–T27 | COMPLETED |
| Phase 3f: Polish | T28–T33 | COMPLETED |
| Phase 4: Testing | T34–T36 | COMPLETED |
| Phase 5: Ship | T37–T44 | COMPLETED |
| **Total** | **55 tickets (R5 + A6 + T44)** | **100% complete** |
