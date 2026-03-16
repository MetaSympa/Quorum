# Quorum

**Community membership management — built for transparency.**

A self-hosted dashboard for membership organizations, community clubs, and committees. Handles members, payments, sponsorships, approvals, and financial audit — all from a single deployable application.

Open source. Self-hosted. No vendor lock-in.

---

## Quick Start

### Docker (recommended)

```bash
cp .env.example .env
# Edit .env — set NEXTAUTH_SECRET, ENCRYPTION_KEY, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
docker compose up -d
```

Open http://localhost:3000

### Local Development

```bash
npm install
cp .env.example .env
# Edit .env — set DATABASE_URL to your local PostgreSQL instance
npx prisma migrate dev
npm run db:seed
npm run dev
```

Open http://localhost:3000

---

## VS Code Inline Preview

1. Start the dev server: `npm run dev`
2. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Select **Simple Browser: Show**
4. Enter `http://localhost:3000`

The full app opens inside VS Code. Use the test accounts below to explore all roles.

---

## Test Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@dps.club | Admin@123 |
| Operator | operator@dps.club | Operator@123 |
| Member 1 | member1@dps.club | Member@123 |
| Member 2 | member2@dps.club | Member@123 |
| Member 3 | member3@dps.club | Member@123 |

Set `NEXT_PUBLIC_TEST_MODE=true` to show auto-fill buttons on the login page.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | How to get it |
|----------|----------|---------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `DB_PASSWORD` | Yes (Docker) | Any strong password |
| `NEXTAUTH_SECRET` | Yes | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Yes | `http://localhost:3000` (or your domain) |
| `ENCRYPTION_KEY` | Yes | `openssl rand -hex 32` (must be 64 hex chars) |
| `RAZORPAY_KEY_ID` | Yes | From https://dashboard.razorpay.com |
| `RAZORPAY_KEY_SECRET` | Yes | From Razorpay Dashboard |
| `RAZORPAY_WEBHOOK_SECRET` | Yes | Set in Razorpay Dashboard when adding webhook |
| `RAZORPAY_TEST_MODE` | Yes | `true` for development, `false` for production |
| `CRON_SECRET` | Yes | Any random string, e.g. `openssl rand -base64 24` |
| `APP_URL` | Yes | `http://localhost:3000` (or your domain) |
| `WHATSAPP_API_TOKEN` | No | Meta Cloud API token (optional) |
| `WHATSAPP_PHONE_NUMBER_ID` | No | Meta WhatsApp Business phone number ID |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) + TypeScript |
| Database | PostgreSQL 16 + Prisma ORM |
| Authentication | NextAuth.js (JWT + HTTP-only cookies) |
| UI | Tailwind CSS + shadcn/ui |
| Payments | Razorpay (UPI + Bank Transfer) |
| Notifications | WhatsApp (Meta Cloud API, optional) |
| Encryption | AES-256-GCM (field-level, PII at rest) |
| Testing | Vitest + React Testing Library |
| Deployment | Docker Compose + Caddy |

---

## Features

- **Member management** with auto-generated hierarchical IDs
- **Sub-member support** — up to 3 per primary member, each with own login
- **Flexible membership tiers** — Monthly, Half-yearly, Annual with configurable fees
- **Universal approval queue** — all operator actions require admin sign-off
- **Cash management** with full audit trail
- **Online payments** — UPI and bank transfer with auto-detection via webhooks
- **Sponsor management** — token-based public checkout links with configurable tiers
- **Financial audit log** — append-only, immutable, full transaction data
- **Activity log** — all user actions including failed login attempts
- **WhatsApp notifications** — 8 template types, graceful skip if unconfigured
- **Role-based access** — Admin / Operator / Member with scoped dashboards
- **PII encryption** — AES-256-GCM for phone, address, and bank details
- **Printable receipts** — auto-increment numbering for members and sponsors
- **Membership expiry** — 15-day advance reminders and auto-expiry cron
- **Daily backups** — PostgreSQL pg_dump with 30-day retention

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                 # Landing page
│   ├── login/                   # Login (with test mode auto-fill)
│   ├── dashboard/               # Dashboard pages (role-gated)
│   ├── sponsor/[token]/         # Public sponsor checkout
│   └── api/                     # 29 API route handlers
├── components/
│   ├── ui/                      # shadcn/ui primitives
│   ├── layout/                  # Sidebar, Header, DashboardShell
│   ├── members/                 # Member management components
│   ├── cash/                    # Transaction components
│   ├── approvals/               # Approval queue components
│   ├── sponsorship/             # Sponsor components
│   └── receipts/                # Receipt templates
├── lib/
│   ├── services/                # Business logic service layer
│   ├── auth.ts                  # NextAuth config
│   ├── permissions.ts           # Role-based access helpers
│   ├── encrypt.ts               # AES-256-GCM field encryption
│   ├── razorpay.ts              # Payment gateway client
│   ├── whatsapp.ts              # Notification client
│   ├── validators.ts            # Zod schemas for all API inputs
│   ├── rate-limit.ts            # Sliding window rate limiter
│   └── audit.ts                 # Append-only audit + activity log
└── types/
    └── index.ts                 # Shared TypeScript types

prisma/
├── schema.prisma                # 10 models, 10 enums
└── seed.ts                      # Test data (admin, operator, members)

scripts/
├── backup.sh                    # Daily pg_dump, 30-day retention
└── restore.sh                   # Restore from backup

tests/
├── unit/                        # Business logic tests
├── integration/                 # API route structure tests
└── components/                  # Component render tests
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [Setup Guide](docs/setup-guide.md) | Local development (Node + PostgreSQL or Docker) |
| [Deployment Guide](docs/deployment-guide.md) | Production deployment with Docker Compose + Caddy |
| [API Reference](docs/api-reference.md) | All API routes with request/response schemas |
| [Data Model](docs/data-model.md) | Database models, relationships, and enums |
| [Security](docs/security.md) | Auth, encryption, rate limiting, backup/restore |
| [Approval Flow](docs/approval-flow.md) | Universal approval system walkthrough |
| [Razorpay Setup](docs/razorpay-setup.md) | Payment gateway configuration |
| [WhatsApp Setup](docs/whatsapp-setup.md) | Notification setup (optional) |
| [Testing Guide](docs/testing-guide.md) | Running tests, seed accounts, writing new tests |
| [Architecture](docs/architecture.md) | Tech stack, module structure, data flow |
| [Server Hardening](docs/server-hardening.md) | VPS security checklist |

---

## Commands

```bash
npm run dev              # Start development server
npm run build            # Production build
npm test                 # Run all tests
npm run test:coverage    # Tests with coverage report
npx prisma studio        # Database GUI
npx prisma migrate dev   # Apply schema migrations
npm run db:seed          # Load seed data
```

---

## License

MIT
