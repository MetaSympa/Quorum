# DPS Dashboard

**Deshapriya Park Sarbojanin Durgotsav — Club Management Dashboard**

Full-stack management dashboard for one of Kolkata's most iconic Durga Puja clubs (est. 1938). Handles members, finances, sponsorships, approvals, and notifications for Deshapriya Park Durgotsab Samity.

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

## Environment Variables Checklist

Copy `.env.example` to `.env` and fill in these values before starting:

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
| `WHATSAPP_API_TOKEN` | No | Meta Cloud API token (optional, skip if not needed) |
| `WHATSAPP_PHONE_NUMBER_ID` | No | Meta WhatsApp Business phone number ID |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) + TypeScript |
| Database | PostgreSQL 16 + Prisma ORM |
| Authentication | NextAuth.js (JWT + HTTP-only cookies) |
| UI | Tailwind CSS + shadcn/ui |
| Payments | Razorpay (UPI + Bank Transfer via Virtual Accounts) |
| Notifications | WhatsApp (Meta Cloud API) |
| Encryption | AES-256-GCM (field-level, PII at rest) |
| Testing | Vitest + React Testing Library |
| Deployment | Docker Compose + Caddy (HTTPS auto-configured) |

---

## Features

- Member management with DPC-YYYY-NNNN-SS ID system
- Sub-member support (up to 3 per primary member, with own login)
- Membership lifecycle: Monthly / Half-yearly / Annual (Rs. 250 / 1,500 / 3,000)
- One-time application fee: Rs. 10,000
- Universal approval queue for all operator actions
- Cash management with full audit trail
- Razorpay UPI and bank transfer (NEFT/RTGS/IMPS) with auto-detection via webhooks
- Sponsor link generation with public checkout page
- Financial audit log (append-only, full transaction data)
- System activity log (all user actions)
- WhatsApp notifications (8 template types, graceful skip if unconfigured)
- Role-based access: Admin / Operator / Member
- AES-256 encryption for phone numbers, addresses, and bank details
- Printable A5 receipts for members and sponsors
- Membership expiry reminders (15-day advance) and auto-expiry cron
- Daily PostgreSQL backup with 30-day retention

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
│   ├── razorpay.ts              # Razorpay client + HMAC verification
│   ├── whatsapp.ts              # Meta Cloud API client
│   ├── validators.ts            # Zod schemas for all API inputs
│   ├── rate-limit.ts            # In-memory sliding window rate limiter
│   └── audit.ts                 # Append-only audit + activity log helpers
└── types/
    └── index.ts                 # Shared TypeScript types

prisma/
├── schema.prisma                # 10 models, 10 enums
└── seed.ts                      # Test data (1 admin, 1 operator, 5 members)

scripts/
├── backup.sh                    # Daily pg_dump, 30-day retention
└── restore.sh                   # Restore from backup file

tests/
├── unit/                        # Business logic tests
├── integration/                 # API route structure tests
└── components/                  # Component render tests
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/setup-guide.md](docs/setup-guide.md) | Local development setup (Node + PostgreSQL or Docker) |
| [docs/deployment-guide.md](docs/deployment-guide.md) | Production deployment to LunaNode VPS |
| [docs/api-reference.md](docs/api-reference.md) | All API routes with request/response schemas |
| [docs/data-model.md](docs/data-model.md) | Database models, relationships, and enum values |
| [docs/security.md](docs/security.md) | Auth, encryption, rate limiting, backup/restore |
| [docs/approval-flow.md](docs/approval-flow.md) | Universal approval system walkthrough |
| [docs/razorpay-setup.md](docs/razorpay-setup.md) | Razorpay account, webhook, and test mode |
| [docs/whatsapp-setup.md](docs/whatsapp-setup.md) | Meta Business account and message templates |
| [docs/testing-guide.md](docs/testing-guide.md) | Running tests, seed accounts, writing new tests |
| [docs/architecture.md](docs/architecture.md) | Tech stack, module structure, data flow |

---

## Useful Commands

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

Private — Deshapriya Park Durgotsab Samity
