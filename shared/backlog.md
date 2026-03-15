# DPS Dashboard -- Implementation Backlog

**Generated**: 2026-03-15
**Source**: Frozen project plan v2 (section 9)
**Total tickets**: 55 (T01-T44 + R01-R05 + A01-A06)

---

## Status Legend

- DONE: Completed
- TODO: Ready to start
- BLOCKED: Waiting on dependency

---

## Phase 1: Research (R01-R05) -- DONE

### R01: Club History Research
- **Agent**: Scout
- **Status**: DONE
- **Acceptance Criteria**:
  - Research founding date, heritage, significance
  - Document record-breaking achievements
  - Include sources
- **Dependencies**: None

### R02: Club Activities Research
- **Agent**: Scout
- **Status**: DONE
- **Acceptance Criteria**:
  - Document annual Durga Puja themes by year
  - Document community and social work activities
  - Include sources
- **Dependencies**: None

### R03: Latest News Research
- **Agent**: Scout
- **Status**: DONE
- **Acceptance Criteria**:
  - Document 2024-2025 Durga Puja coverage
  - Document awards and recognition
  - Include sources from Bengali media
- **Dependencies**: None

### R04: Contact Information Research
- **Agent**: Scout
- **Status**: DONE
- **Acceptance Criteria**:
  - Address, phone, social media confirmed
  - Nearest metro and landmarks documented
- **Dependencies**: None

### R05: Peer Club Research
- **Agent**: Scout
- **Status**: DONE
- **Acceptance Criteria**:
  - 6+ peer clubs documented with location and known-for
  - Sources included
- **Dependencies**: None

---

## Phase 2: Architecture (A01-A06) -- DONE

### A01: Technical Architecture Document
- **Agent**: Architect
- **Status**: DONE
- **Acceptance Criteria**:
  - Tech stack decisions documented
  - Module boundaries defined
  - Component diagram created
  - Auth, payment, approval flows documented
- **Artifacts**: `shared/architecture.md`
- **Dependencies**: R01-R05

### A02: Database Schema (Reference SQL)
- **Agent**: Architect
- **Status**: DONE
- **Acceptance Criteria**:
  - All 10 models defined (User, SubMember, Member, Membership, Transaction, Sponsor, SponsorLink, Approval, AuditLog, ActivityLog)
  - All 10 enums defined
  - All constraints, foreign keys, indexes
  - Matches project plan section 4 exactly
- **Artifacts**: `shared/schema.sql`
- **Dependencies**: R01-R05

### A03: API Specification (OpenAPI 3.0)
- **Agent**: Architect
- **Status**: DONE
- **Acceptance Criteria**:
  - All routes from project plan section 8 covered
  - Request/response schemas for every endpoint
  - Auth requirements (role access) documented per route
  - Error responses defined
- **Artifacts**: `shared/api_spec.yaml`
- **Dependencies**: A02

### A04: Implementation Backlog
- **Agent**: Architect
- **Status**: DONE
- **Acceptance Criteria**:
  - All tickets T01-T44 with acceptance criteria
  - Agent assignments
  - Dependency graph
- **Artifacts**: `shared/backlog.md`
- **Dependencies**: A01-A03

### A05: Service Layer Design
- **Agent**: Architect
- **Status**: DONE
- **Acceptance Criteria**:
  - 6 services documented (member, membership, transaction, approval, sponsor, notification)
  - Shared libraries documented (prisma, auth, permissions, razorpay, whatsapp, etc.)
  - Data flow between modules defined
- **Artifacts**: `shared/architecture.md` (sections 3.2, 3.3, 7)
- **Dependencies**: A01

### A06: Deployment Architecture
- **Agent**: Architect
- **Status**: DONE
- **Acceptance Criteria**:
  - Docker Compose service topology
  - Caddy reverse proxy configuration
  - Environment variables documented
  - Server hardening plan
- **Artifacts**: `shared/architecture.md` (sections 8, 9)
- **Dependencies**: A01

---

## Phase 3a: Foundation (T01-T04) -- TODO

### T01: Project Scaffold
- **Agent**: Backend
- **Status**: TODO
- **Acceptance Criteria**:
  - Next.js 14 App Router project initialized with TypeScript strict mode
  - Prisma installed and configured for PostgreSQL
  - Tailwind CSS + shadcn/ui installed and configured
  - Razorpay Node SDK added to dependencies
  - Vitest + React Testing Library + Supertest added
  - `package.json` has all required dependencies
  - `tsconfig.json` has strict mode enabled
  - Project compiles with zero errors
- **Dependencies**: A01-A06

### T02: Database Schema + Prisma Migrations
- **Agent**: Backend
- **Status**: TODO
- **Acceptance Criteria**:
  - `prisma/schema.prisma` defines all 10 models matching `shared/schema.sql` exactly
  - All 10 enums defined in Prisma schema
  - All sender fields, approvalSource, razorpay fields, isTempPassword, sub-member login fields present
  - `npx prisma migrate dev` runs without errors
  - `npx prisma generate` produces valid client
  - All foreign keys, indexes, and constraints match schema.sql
- **Dependencies**: T01

### T03: Auth System
- **Agent**: Backend
- **Status**: TODO
- **Acceptance Criteria**:
  - NextAuth.js configured with Credentials provider
  - JWT strategy with HTTP-only cookies (15-min expiry)
  - Login via email + password (bcrypt comparison)
  - `isTempPassword` check in session callback
  - Forced redirect to `/change-password` if `isTempPassword=true`
  - `/api/auth/change-password` endpoint: validates old password, updates new, sets `isTempPassword=false`
  - Role included in JWT token payload
  - `lib/auth.ts` exports NextAuth config
  - `lib/permissions.ts` exports `requireRole()` middleware
  - Sub-member login supported (their own email/password, JWT includes parentUserId)
- **Dependencies**: T02

### T04: Dashboard Layout
- **Agent**: Frontend
- **Status**: TODO
- **Acceptance Criteria**:
  - `dashboard/layout.tsx` with responsive sidebar
  - Sidebar navigation items differ by role (Admin: 8 items, Operator: 6 items, Member: 1 item)
  - `components/layout/Sidebar.tsx` renders role-based navigation
  - `components/layout/Header.tsx` shows user name, role badge, logout button
  - `components/layout/DashboardShell.tsx` wraps page content
  - Active nav item highlighted
  - Mobile-responsive: sidebar collapses to hamburger menu
  - Session check: redirects unauthenticated users to /login
  - Temp password check: redirects to /change-password if needed
- **Dependencies**: T03

---

## Phase 3b: Core Features (T05-T11) -- TODO

### T05: Landing Page
- **Agent**: Frontend
- **Status**: TODO
- **Acceptance Criteria**:
  - `/` route renders landing page with 6 sections:
    1. Hero (club name, tagline, featured image)
    2. Club Activities (from research brief)
    3. History and Heritage (from research brief, 1938 founding, 88ft idol)
    4. Latest News (2024-2025 coverage from research brief)
    5. Contact Information (address, phone, Facebook, nearest metro)
    6. Membership button linking to `/membership-form`
  - Login button top-right in header
  - SSR for SEO
  - Responsive design
- **Dependencies**: T01

### T06: Printable Membership Application Form
- **Agent**: Frontend
- **Status**: TODO
- **Acceptance Criteria**:
  - `/membership-form` route renders a print-friendly static page
  - Instructions section: how to fill, where to submit, operator contact, payment details (application fee 10000 + membership), accepted modes (UPI/Bank/Cash)
  - Fields: applicant name, WhatsApp number, email, address
  - Sub-members section (up to 3): name, WhatsApp number, relation
  - All phone fields labeled "WhatsApp Number"
  - Print button triggers browser print dialog
  - `@media print` styles for clean output
- **Dependencies**: T01

### T07: Member Management
- **Agent**: Backend
- **Status**: TODO
- **Acceptance Criteria**:
  - `POST /api/members`: Creates member with auto-generated DPC-YYYY-NNNN-00 ID
    - Admin: creates directly
    - Operator: creates Approval record (MEMBER_ADD)
  - `GET /api/members`: List all members (Admin/Operator only), pagination, search, status filter
  - `GET /api/members/[id]`: Single member with sub-members
  - `PUT /api/members/[id]`: Update member
    - Admin: updates directly
    - Operator: creates Approval record (MEMBER_EDIT) with previousData/newData
  - `DELETE /api/members/[id]`: Delete member
    - Admin: deletes directly
    - Operator: creates Approval record (MEMBER_DELETE)
  - `POST /api/members/[id]/sub-members`: Add sub-member (max 3 enforced), auto-generates DPC-YYYY-NNNN-SS ID
  - `PUT /api/members/[id]/sub-members`: Update sub-member
  - `DELETE /api/members/[id]/sub-members`: Delete sub-member
  - `lib/member-id.ts`: DPC-YYYY-NNNN-SS generation with auto-increment
  - `lib/services/member-service.ts`: business logic
  - Zod validation on all inputs
  - Audit + activity log entries on all operations
- **Dependencies**: T03, T09

### T08: Membership Management
- **Agent**: Backend
- **Status**: TODO
- **Acceptance Criteria**:
  - `POST /api/memberships`: Create membership period
    - Amount auto-calculated: Monthly 250, Half-yearly 1500, Annual 3000
    - Application fee: 10000 (one-time, `isApplicationFee=true`)
    - No partial payments: reject if amount does not match type
  - `GET /api/memberships`: List with pagination and filters
  - `GET /api/memberships/[id]`: Single membership
  - `PUT /api/memberships/[id]`: Update membership
  - Status lifecycle: PENDING_APPROVAL -> ACTIVE (on payment approval)
  - User fields updated: `membershipType`, `membershipStart`, `membershipExpiry`, `totalPaid`, `applicationFeePaid`
  - Sub-member pay-on-behalf: sub-member JWT `parentUserId` used to identify primary member
  - `lib/services/membership-service.ts`: fee calculation, period dates, status transitions
  - Audit + activity log entries
- **Dependencies**: T07

### T09: Approval Queue System
- **Agent**: Backend
- **Status**: TODO
- **Acceptance Criteria**:
  - `GET /api/approvals`: List pending approvals (Admin only), pagination, entityType filter
  - `POST /api/approvals/[id]/approve`: Admin approves
    - Apply change to target entity based on entityType:
      - TRANSACTION: update Transaction.approvalStatus -> APPROVED
      - MEMBER_ADD: create Member from newData
      - MEMBER_EDIT: apply newData to Member, overwriting previousData fields
      - MEMBER_DELETE: delete/deactivate Member
      - MEMBERSHIP: update Membership.status -> APPROVED, activate membership
    - Write audit log + activity log
    - Send WhatsApp notification (confirmation to all parties)
  - `POST /api/approvals/[id]/reject`: Admin rejects
    - Set Approval.status -> REJECTED, no DB changes to target entity
    - Write audit log + activity log
    - Send WhatsApp to operator (rejection notice)
  - Multiple admins supported: any single admin approval suffices
  - `lib/services/approval-service.ts`: generic approve/reject logic
  - Cannot approve/reject already-resolved approvals
- **Dependencies**: T03

### T10: Cash Management
- **Agent**: Backend
- **Status**: TODO
- **Acceptance Criteria**:
  - `POST /api/transactions`: Create cash transaction
    - Admin: creates directly (approvalStatus=APPROVED, approvalSource=MANUAL)
    - Operator: creates with approvalStatus=PENDING, creates Approval record (TRANSACTION)
  - `GET /api/transactions`: List with pagination, type/category/status filters
  - `GET /api/transactions/[id]`: Single transaction with full details
  - `PUT /api/transactions/[id]`: Update transaction
    - Cannot update auto-approved Razorpay transactions
    - Operator: creates Approval record
  - `DELETE /api/transactions/[id]`: Delete transaction
    - Cannot delete auto-approved Razorpay transactions
    - Operator: creates Approval record
  - `sponsorPurpose` required when category=SPONSORSHIP
  - `lib/services/transaction-service.ts`: business logic
  - Zod validation, audit + activity log entries
- **Dependencies**: T09

### T11: Receipt Generation
- **Agent**: Backend
- **Status**: TODO
- **Acceptance Criteria**:
  - `GET /api/receipts/[id]`: Generate receipt for a transaction
  - Receipt includes: receipt number, date, member/sponsor name, amount, payment mode, category, description
  - HTML content suitable for printing
  - Receipt number auto-generated (sequential)
  - `lib/receipt.ts`: receipt generation logic
  - Admin/Operator can generate receipts
  - Sponsor receipts available on public checkout confirmation page
- **Dependencies**: T10

---

## Phase 3c: Payment Integration (T12-T15) -- TODO

### T12: Razorpay Integration -- Order Creation and Verification
- **Agent**: Backend
- **Status**: TODO
- **Acceptance Criteria**:
  - `POST /api/payments/create-order`: Create Razorpay order
    - Amount must match exact fee for membership type (250/1500/3000/10000)
    - Returns orderId, amount, currency, keyId
  - `POST /api/payments/verify`: Verify Razorpay payment signature
    - HMAC-SHA256 verification
    - Returns verified status + transactionId
  - `lib/razorpay.ts`: Razorpay client initialization, order creation, signature verification
  - UPI + bank transfer support via Razorpay checkout
  - Test mode support (RAZORPAY_TEST_MODE=true)
- **Dependencies**: T08

### T13: Razorpay Webhook Handler
- **Agent**: Backend
- **Status**: TODO
- **Acceptance Criteria**:
  - `POST /api/webhooks/razorpay`: Handles payment.captured events
  - HMAC signature verification (reject unsigned requests)
  - Extract from Razorpay payment object:
    - Amount, sender name, UPI VPA (if UPI), bank name + masked account (if bank transfer)
    - Razorpay payment ID, order ID
  - Create full Transaction record:
    - type=CASH_IN, category determined from order metadata
    - paymentMode=UPI or BANK_TRANSFER
    - approvalStatus=APPROVED, approvalSource=RAZORPAY_WEBHOOK
    - All sender fields populated
  - Update membership status to ACTIVE
  - Generate receipt
  - Write audit log + activity log (full Transaction data)
  - Send WhatsApp notification
  - Idempotent: skip if razorpayPaymentId already exists
- **Dependencies**: T12

### T14: Sponsor Link Generation + Checkout
- **Agent**: Backend + Frontend
- **Status**: TODO
- **Acceptance Criteria**:
  - `POST /api/sponsor-links`: Generate sponsor link (Admin/Operator)
    - Token: crypto.randomUUID
    - Optional amount, optional sponsor, UPI ID, bank details, expiry
  - `GET /api/sponsor-links`: List sponsor links (Admin/Operator)
  - `GET /api/sponsor-links/[token]`: Public endpoint returning checkout data
  - `/sponsor/[token]/page.tsx`: Public checkout page
    - Shows sponsor name (if linked), amount, payment options
    - Razorpay checkout for UPI/bank transfer
    - Validates token is active and not expired
  - `/sponsor/[token]/receipt/page.tsx`: Receipt page after payment
  - `lib/services/sponsor-service.ts`: sponsor link logic
- **Dependencies**: T12, T10

### T15: Sponsor Payment Webhook
- **Agent**: Backend
- **Status**: TODO
- **Acceptance Criteria**:
  - Razorpay webhook identifies sponsor payments via order metadata
  - Creates full Transaction:
    - category=SPONSORSHIP
    - sponsorPurpose from order metadata
    - Linked to Sponsor record
    - All sender fields populated
    - approvalStatus=APPROVED, approvalSource=RAZORPAY_WEBHOOK
  - Receipt auto-generated on confirmation page
  - Audit + activity log with complete Transaction data
  - WhatsApp notification to admin + operator
- **Dependencies**: T13, T14

---

## Phase 3d: Logs and Notifications (T16-T20) -- TODO

### T16: Financial Audit Log
- **Agent**: Backend + Frontend
- **Status**: TODO
- **Acceptance Criteria**:
  - `GET /api/audit-log`: Paginated, filterable by entityType, date range
  - Admin: full access. Operator: read-only
  - Response includes full Transaction data when transactionId is present
  - Includes approval source, sender details -- no missing data
  - `dashboard/audit-log/page.tsx`: Table view with filters
  - `lib/audit.ts`: `logAudit()` helper used by all services
- **Dependencies**: T10, T04

### T17: System-wide Activity Log
- **Agent**: Backend + Frontend
- **Status**: TODO
- **Acceptance Criteria**:
  - `GET /api/activity-log`: Paginated, filterable by action, date range
  - Admin: full access. Operator: read-only
  - Logs: logins, CRUD ops, approvals, payments, system events
  - `dashboard/activity-log/page.tsx`: Table view with filters
  - `lib/audit.ts`: `logActivity()` helper used by all services
- **Dependencies**: T04

### T18: WhatsApp Notification Integration
- **Agent**: Backend
- **Status**: TODO
- **Acceptance Criteria**:
  - `POST /api/notifications/whatsapp`: Trigger endpoint
  - `lib/whatsapp.ts`: `sendWhatsApp()` helper
    - POST to `https://graph.facebook.com/v18.0/{PHONE_NUMBER_ID}/messages`
    - Pre-approved message templates
    - Graceful skip if WHATSAPP_API_TOKEN not set (no errors, just returns)
  - `lib/services/notification-service.ts`: orchestrates who gets notified for each event
  - Triggers:
    - New approval pending -> admin + operator
    - Payment received -> admin + operator
    - New member registration -> admin + operator
    - Membership approved -> admin + operator + member + sub-members (includes email, temp password, login URL)
    - Expiry reminder 15 days -> member + sub-members
    - Membership expired -> member + sub-members + admin + operator
    - Sponsor payment received -> admin + operator
    - Any rejection -> operator
- **Dependencies**: T09

### T19: Membership Expiry Cron
- **Agent**: Backend
- **Status**: TODO
- **Acceptance Criteria**:
  - `lib/cron.ts`: Daily membership expiry check
  - Query all ACTIVE memberships where membershipExpiry is today or past -> set EXPIRED
  - Query all ACTIVE memberships where membershipExpiry is within 15 days -> send reminder
  - WhatsApp notifications:
    - 15-day reminder: member + sub-members
    - On expiry: member + sub-members + admin + operator
  - Expired members: dashboard access becomes read-only
  - Cron runs via Next.js API route or setInterval in production
  - Idempotent: safe to run multiple times per day
- **Dependencies**: T08, T18

### T20: Dashboard Home
- **Agent**: Frontend
- **Status**: TODO
- **Acceptance Criteria**:
  - `dashboard/page.tsx`: Role-appropriate dashboard home
  - Admin view:
    - Member summary cards (total, active, expired, pending)
    - Financial summary cards (total cash in, cash out, balance)
    - Pending approvals count with link to approvals page
    - Recent activity log entries (last 5)
    - Recent audit log entries (last 5)
    - Quick action buttons (add member, add transaction)
  - Operator view:
    - Member summary, financial summary, recent activity/audit, quick actions (no approvals count)
  - Member view:
    - Own membership details, payment history, renewal button
  - `GET /api/dashboard/stats`: Backend endpoint returning role-filtered data
- **Dependencies**: T04, T07, T08, T10, T16, T17

---

## Phase 3e: Security (T21-T27) -- TODO

### T21: Input Validation (Zod Schemas)
- **Agent**: Backend
- **Status**: TODO
- **Acceptance Criteria**:
  - `lib/validators.ts`: Zod schemas for every API input
  - Schemas cover: members, sub-members, memberships, transactions, sponsors, sponsor-links, approvals, auth
  - Phone validation: +91 format
  - Email validation
  - Amount validation: positive, matches fee schedule where applicable
  - String length limits
  - Enum validation for all enum fields
  - All API routes use `.parse()` or `.safeParse()` on request body
- **Dependencies**: T01

### T22: Auth Hardening
- **Agent**: Backend
- **Status**: TODO
- **Acceptance Criteria**:
  - bcrypt salt rounds >= 12
  - JWT expiry: 15 minutes
  - HTTP-only, SameSite=Lax cookies
  - No tokens in localStorage
  - CSRF token on state-changing requests (SameSite attribute + custom header)
  - Session invalidation on password change
- **Dependencies**: T03

### T23: Rate Limiting
- **Agent**: Backend
- **Status**: TODO
- **Acceptance Criteria**:
  - `lib/rate-limit.ts`: In-memory sliding window rate limiter
  - Login: 5 attempts per 15 minutes per IP
  - API routes: 100 requests per minute per user
  - Webhook endpoints: IP-based rate limiting
  - Returns 429 Too Many Requests with Retry-After header
- **Dependencies**: T03

### T24: Sensitive Data Encryption
- **Agent**: Backend
- **Status**: TODO
- **Acceptance Criteria**:
  - `lib/encrypt.ts`: AES-256-GCM encrypt/decrypt functions
  - Prisma middleware in `lib/prisma.ts` that:
    - Encrypts on write: phone, address, senderPhone, senderBankAccount, bankDetails
    - Decrypts on read: same fields
  - ENCRYPTION_KEY from environment variable (32-byte hex)
  - Encrypted data stored as base64 string in DB
  - Existing data migration script (if needed)
- **Dependencies**: T02

### T25: Razorpay Webhook HMAC Verification
- **Agent**: Backend
- **Status**: TODO
- **Acceptance Criteria**:
  - Webhook handler verifies `X-Razorpay-Signature` header
  - HMAC-SHA256 using RAZORPAY_WEBHOOK_SECRET
  - Reject requests with invalid or missing signature (400)
  - Log rejected attempts in activity log
- **Dependencies**: T13

### T26: Security Headers
- **Agent**: Backend
- **Status**: TODO
- **Acceptance Criteria**:
  - `next.config.js` sets security headers:
    - Content-Security-Policy (restrictive, allow Razorpay domains)
    - X-Frame-Options: DENY
    - X-Content-Type-Options: nosniff
    - Referrer-Policy: strict-origin-when-cross-origin
    - Strict-Transport-Security (when HTTPS enabled)
  - Headers verified in response
- **Dependencies**: T01

### T27: Audit Log Immutability
- **Agent**: Backend
- **Status**: TODO
- **Acceptance Criteria**:
  - No PUT/DELETE endpoints for AuditLog or ActivityLog
  - API routes only expose GET for both logs
  - Prisma middleware or service layer rejects any attempt to update/delete log records
  - Verified by integration test
- **Dependencies**: T16, T17

---

## Phase 3f: Polish (T28-T33) -- TODO

### T28: Role-Based Access Enforcement
- **Agent**: Backend + Frontend
- **Status**: TODO
- **Acceptance Criteria**:
  - Every API route checks role via `requireRole()` middleware
  - Admin: all routes
  - Operator: members (CRUD), transactions (CRUD), sponsors (CRUD), sponsor-links (generate), logs (read-only)
  - Member: own membership, payments, dashboard stats (own data only)
  - Frontend: sidebar items filtered by role, pages redirect if unauthorized
  - No client-side-only role checks -- all enforced server-side
- **Dependencies**: T03, T04, T07, T08, T09, T10

### T29: Data Formatting
- **Agent**: Frontend
- **Status**: TODO
- **Acceptance Criteria**:
  - All currency displayed as INR with rupee symbol (e.g., "Rs. 1,500.00")
  - All dates displayed as DD/MM/YYYY
  - All phone numbers displayed in +91 format
  - Member IDs displayed as DPC-YYYY-NNNN-SS
  - Formatting utilities in `lib/` or component helpers
  - Consistent across all pages
- **Dependencies**: T04

### T30: Responsive Design Pass
- **Agent**: Frontend
- **Status**: TODO
- **Acceptance Criteria**:
  - All dashboard pages work on mobile (320px+), tablet (768px+), desktop (1024px+)
  - Sidebar collapses to hamburger on mobile
  - Tables scroll horizontally on small screens
  - Forms stack vertically on mobile
  - Landing page fully responsive
  - Print styles for membership form and receipts
- **Dependencies**: T04, T05, T06

### T31: Service Layer Refactor
- **Agent**: Backend
- **Status**: TODO
- **Acceptance Criteria**:
  - All business logic extracted from API routes into `lib/services/`
  - API routes are thin: validate -> call service -> respond
  - No direct Prisma calls in API route files
  - Services: member, membership, transaction, approval, sponsor, notification
  - All service methods have JSDoc comments
  - No file exceeds 300 lines
- **Dependencies**: T07, T08, T09, T10, T11

### T32: Comprehensive Seed Data
- **Agent**: Backend
- **Status**: TODO
- **Acceptance Criteria**:
  - `prisma/seed.ts` creates:
    - 1 admin user (admin@dpc.org)
    - 1 operator user (operator@dpc.org)
    - 5 member users with sub-members (variety of statuses: ACTIVE, EXPIRED, PENDING_APPROVAL)
    - Randomized transactions across all categories and payment modes
    - Pending + resolved approvals
    - Sponsor records with linked transactions
    - Audit log and activity log entries
  - High variance in data to fill all UI views
  - All passwords use bcrypt, temp passwords for members
  - `npx prisma db seed` runs without errors
- **Dependencies**: T02, T07, T08, T09, T10

### T33: Test Mode Login Page
- **Agent**: Frontend
- **Status**: TODO
- **Acceptance Criteria**:
  - `/login` page with standard email/password form
  - When `RAZORPAY_TEST_MODE=true`: show auto-fill buttons below form
    - "Login as Admin" (pre-fills admin credentials)
    - "Login as Operator" (pre-fills operator credentials)
    - 5 "Login as Member N" buttons (pre-fills each seeded member)
  - Auto-fill buttons hidden in production mode
  - Standard login works regardless of test mode
- **Dependencies**: T03, T32

---

## Phase 4: Testing (T34-T36) -- TODO

### T34: Unit Tests
- **Agent**: QA
- **Status**: TODO
- **Acceptance Criteria**:
  - Tests for:
    - Fee calculation (250/1500/3000/10000, no partial payments)
    - DPC-YYYY-NNNN-SS member ID generation
    - Approval flow state machine (PENDING -> APPROVED/REJECTED)
    - Auto-detect payment logic (webhook -> Transaction mapping)
    - Membership expiry check logic
    - AES-256 encryption/decryption
    - Zod schema validation (valid + invalid inputs)
    - Rate limiter logic
  - All tests pass with `npx vitest run`
  - Coverage > 80% for service layer
- **Dependencies**: T31

### T35: Integration Tests
- **Agent**: QA
- **Status**: TODO
- **Acceptance Criteria**:
  - Tests for:
    - All API routes (CRUD operations, auth checks, role enforcement)
    - Razorpay webhook processing (mock webhook payload)
    - Approval flows end-to-end (create -> approve/reject -> verify DB state)
    - Payment flows (create order -> verify -> check transaction)
    - Receipt generation
    - Sub-member pay-on-behalf
    - Expiry cron execution
    - Rate limiting (verify 429 after threshold)
  - Uses Supertest for HTTP assertions
  - Test database with seed data
  - All tests pass
- **Dependencies**: T34

### T36: Component Tests
- **Agent**: QA
- **Status**: TODO
- **Acceptance Criteria**:
  - Tests for key UI flows:
    - Dashboard home renders role-appropriate content
    - Approval queue shows pending items, approve/reject actions
    - Member management table, form, search, pagination
    - Login form (including test mode auto-fill)
  - Uses React Testing Library
  - All tests pass
- **Dependencies**: T34

---

## Phase 5: Ship (T37-T44) -- TODO

### T37: Backup System
- **Agent**: Infra
- **Status**: TODO
- **Acceptance Criteria**:
  - `scripts/backup.sh`:
    - pg_dump to `/backups/` directory
    - Filename: `dps_backup_YYYYMMDD_HHMMSS.sql.gz`
    - 30-day retention (auto-delete older)
    - Cron entry: daily at 2 AM
    - Optional offsite SCP/rsync (configurable, disabled by default)
  - `scripts/restore.sh`:
    - Takes backup filename as argument
    - Restores to database
    - Tested with seed data backup
  - Both scripts documented in `docs/`
- **Dependencies**: T02

### T38: Docker Compose + Caddyfile
- **Agent**: Infra
- **Status**: TODO
- **Acceptance Criteria**:
  - `docker-compose.yml`:
    - `app` service: Next.js production build, port 3000
    - `db` service: PostgreSQL 16, named volume `pgdata`, port 5432 (internal)
    - `caddy` service: reverse proxy, ports 80/443 mapped to host
    - Environment variables from `.env`
    - Health checks on all services
  - `Caddyfile`:
    - Reverse proxy from :80 to app:3000
    - Ready for HTTPS when domain added (just change address)
  - `.env.example`: all required variables with placeholder values
  - `docker compose up` starts all services
- **Dependencies**: T01

### T39: Docker Deployment Smoke Test
- **Agent**: Infra
- **Status**: TODO
- **Acceptance Criteria**:
  - Run `docker compose up -d`
  - Verify: all containers healthy
  - Verify: app responds on port 80
  - Verify: database connects
  - Verify: all API routes respond (basic health check)
  - Verify: seed data loads (`npx prisma db seed`)
  - Verify: login works with seeded credentials
  - Verify: no container errors in logs
  - Fix any issues found
- **Dependencies**: T38, T32

### T40: Server Hardening
- **Agent**: Infra
- **Status**: TODO
- **Acceptance Criteria**:
  - Documentation/scripts for LunaNode VPS setup:
    - UFW: allow 22, 80, 443 only
    - SSH: key-only auth (disable password login)
    - Fail2ban: SSH only, 5 attempts, 10-min ban
    - Non-root `dps` user created, runs Docker
    - `.env` file: chmod 600, owned by `dps`
    - Unattended security upgrades enabled
    - Docker socket not exposed to app container
- **Dependencies**: T38

### T41: Full Documentation
- **Agent**: Docs
- **Status**: TODO
- **Acceptance Criteria**:
  - `docs/` folder with 11 files:
    - `README.md`: project overview, quick start, architecture summary
    - `setup-guide.md`: Node, PostgreSQL, Docker, env vars, seed data
    - `deployment-guide.md`: LunaNode VPS, Docker Compose, UFW, SSH, backups
    - `razorpay-setup.md`: Razorpay account, test/live, webhook config
    - `whatsapp-setup.md`: Meta Business account, API token, message templates
    - `api-reference.md`: all routes, request/response schemas, auth
    - `data-model.md`: complete schema with relationships
    - `security.md`: security measures, backup/restore
    - `approval-flow.md`: approval workflow with diagrams
    - `testing-guide.md`: how to run tests, seed data, test mode
    - `architecture.md`: module structure, service layer
  - All docs accurate to implementation
- **Dependencies**: T01-T40

### T42: Local Preview in VS Code
- **Agent**: Infra
- **Status**: TODO
- **Acceptance Criteria**:
  - `npm run dev` starts app on localhost:3000
  - VS Code Simple Browser can open localhost:3000
  - All seeded test accounts work in local preview
  - Dev script documented in README
- **Dependencies**: T32

### T43: README
- **Agent**: Docs
- **Status**: TODO
- **Acceptance Criteria**:
  - Root `README.md` includes:
    1. One-command start: `docker compose up` (or `npm run dev` for local)
    2. VS Code preview instructions (Simple Browser on localhost:3000)
    3. Default login credentials for test mode
    4. Environment variables checklist
    5. Links to every doc in `docs/`
    6. Tech stack summary
    7. Project structure overview
  - Clean, scannable formatting
- **Dependencies**: T41

### T44: PM Review + Final Polish
- **Agent**: PM
- **Status**: TODO
- **Acceptance Criteria**:
  - PM reviews complete product against research brief and project plan
  - Landing page content verified against research (history, activities, news, contact)
  - All features functional per project plan
  - All roles tested (admin, operator, member, sub-member)
  - All payment flows tested (UPI, bank, cash)
  - All approval flows tested
  - Punch list created if issues found
  - Ship verdict: SHIP or NO-SHIP with reasons
- **Dependencies**: T01-T43

---

## Dependency Graph (simplified)

```
T01 (scaffold)
 +-- T02 (schema)
 |    +-- T03 (auth)
 |    |    +-- T04 (layout)          -- Frontend can start here
 |    |    +-- T09 (approvals)
 |    |    |    +-- T07 (members)
 |    |    |    +-- T10 (cash)
 |    |    |    +-- T18 (whatsapp)
 |    |    +-- T22 (auth hardening)
 |    |    +-- T23 (rate limiting)
 |    +-- T24 (encryption)
 |    +-- T32 (seed data)
 |    +-- T37 (backup)
 +-- T05 (landing)                   -- Frontend can start here (parallel with T02)
 +-- T06 (membership form)           -- Frontend can start here (parallel with T02)
 +-- T21 (zod validation)
 +-- T26 (security headers)
 +-- T38 (docker)

T07 + T08 --> T12 (razorpay) --> T13 (webhook) --> T14 (sponsor links) --> T15 (sponsor webhook)
T07 + T08 + T10 --> T16 (audit log) + T17 (activity log)
T08 + T18 --> T19 (expiry cron)
T04 + T07-T10 + T16 + T17 --> T20 (dashboard home)
T03 + T04 + T07-T10 --> T28 (role enforcement)
All T01-T33 --> T34-T36 (testing) --> T37-T40 (infra) --> T41-T43 (docs) --> T44 (PM review)
```

## Parallelization Strategy

The following can run in parallel once T01 is complete:

**Backend track** (sequential within): T02 -> T03 -> T09 -> T07 -> T08 -> T10 -> T11 -> T12 -> T13 -> T14 -> T15 -> T18 -> T19

**Frontend track** (start after T03/T04): T05, T06 (parallel with T02), T04 (after T03) -> T20 -> member/cash/approval/sponsor UI pages

**Security track** (parallel with features): T21, T26 (after T01), T22, T23 (after T03), T24 (after T02), T25 (after T13), T27 (after T16/T17)

**Infra track** (parallel): T38 (after T01), T37 (after T02)
