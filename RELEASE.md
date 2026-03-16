# Quorum v1.0.0

### Community membership management — built for transparency.

**Release Date**: 2026-03-16
**Maintainer**: Rajarshi Maitra
**License**: MIT

---

## What is Quorum?

A self-hosted dashboard for membership organizations, community clubs, and committees. It handles the things every community needs but nobody wants to build: member records, fee collection, approvals, financial audit trails, and notifications.

One app. One deploy. Full control over your data.

---

## At a Glance

| | |
|:---|:---|
| **25 features** | All planned. All shipped. |
| **748 tests** | Unit, integration, component. All passing. |
| **12 docs** | Setup to deployment to security hardening. |
| **3 roles** | Admin, Operator, Member — scoped dashboards. |
| **1 command** | `docker compose up` — everything runs. |
| **0 vendor lock-in** | Self-hosted, open source, MIT licensed. |

---

## Tech Stack

All open source at the core.

| Layer | Choice |
|-------|--------|
| Framework | **Next.js 14** (App Router) + TypeScript strict |
| Database | **PostgreSQL 16** + Prisma ORM |
| UI | **Tailwind CSS** + shadcn/ui |
| Auth | **NextAuth.js** — JWT, HTTP-only cookies, bcrypt |
| Testing | **Vitest** + React Testing Library |
| Deploy | **Docker Compose** + **Caddy** reverse proxy |

**Adapters for external services** (isolated, optional):
- **Razorpay** — UPI + bank transfer payments
- **Meta WhatsApp Cloud API** — notifications (graceful skip if unconfigured)

---

## Feature Inventory

### Membership
- Auto-generated hierarchical member IDs
- Sub-member support (up to 3 per primary, each with own login)
- Configurable tiers: Monthly | Half-yearly | Annual
- One-time application fee
- Auto-expiry cron with 15-day advance WhatsApp reminders

### Payments
- UPI and bank transfer via Razorpay webhooks — auto-detect sender, auto-approve
- Cash entry by operators — requires admin approval
- Printable receipts with auto-increment numbering
- Exact amount enforcement — no partial payments

### Governance
- Universal approval queue — every operator action requires admin sign-off
- Before/after data snapshots on every change
- Immutable financial audit log (append-only, no update/delete)
- Activity log tracking all user actions, including failed logins

### Sponsorship
- Token-based public checkout links with optional expiry
- 7 configurable sponsor tiers
- Same payment flow: online auto-approved, cash via approval queue

### Notifications
- 8 WhatsApp notification templates (payment, approval, expiry, registration...)
- Graceful degradation — works fully without WhatsApp configured

---

## Security

| Layer | Implementation |
|-------|---------------|
| Passwords | bcrypt (12 rounds), forced temp password change on first login |
| Sessions | JWT, 15-min expiry, HTTP-only SameSite cookies |
| PII encryption | AES-256-GCM at rest — phone, address, bank details |
| Input validation | Zod schemas on every API route |
| Payment verification | HMAC-SHA256, timing-safe comparison |
| Rate limiting | 4 tiers — login (5/15min), API (100/min), webhook (50/min), public (30/min) |
| Headers | CSP, HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff |
| Infrastructure | Non-root Docker user, UFW firewall, Fail2ban, SSH key-only auth |

---

## Quality

| Dimension | Score |
|-----------|:-----:|
| Code Quality | 4 / 5 |
| Test Coverage | 4 / 5 |
| Documentation | 5 / 5 |
| Security | 4 / 5 |
| UX | 4 / 5 |

- Clean three-layer architecture: thin API routes -> service layer -> Prisma ORM
- TypeScript strict mode throughout, Zod validation at every boundary
- 10 Prisma models, 10 enums, proper indexing on FK and query columns
- Comprehensive seed data covering all roles, statuses, and edge cases

---

## Quick Start

```bash
git clone <repo-url> && cd quorum
cp .env.example .env       # fill in your secrets
docker compose up           # PostgreSQL + App + Caddy
```

Open `http://<your-ip>` — login with seeded test accounts (see README).

---

## Documentation

| Doc | Covers |
|-----|--------|
| [Setup Guide](docs/setup-guide.md) | Local dev + Docker |
| [Deployment Guide](docs/deployment-guide.md) | Production VPS deploy |
| [API Reference](docs/api-reference.md) | All 29 routes with examples |
| [Data Model](docs/data-model.md) | 10 models, relationships |
| [Security](docs/security.md) | Auth, encryption, rate limiting |
| [Approval Flow](docs/approval-flow.md) | Universal approval system |
| [Razorpay Setup](docs/razorpay-setup.md) | Payment gateway config |
| [WhatsApp Setup](docs/whatsapp-setup.md) | Notification setup |
| [Testing Guide](docs/testing-guide.md) | Running + writing tests |
| [Architecture](docs/architecture.md) | System design |
| [Server Hardening](docs/server-hardening.md) | VPS security checklist |

---

## Known Limitations

| Limitation | Impact | Planned Fix |
|------------|--------|-------------|
| In-memory rate limiting | Resets on restart, single-instance only | Redis adapter |
| No real-time updates | Dashboard requires manual refresh | Server-Sent Events |
| No email notifications | WhatsApp only | Nodemailer fallback |
| Static landing page content | Requires code change to update | CMS integration |
| CSP `unsafe-eval` | Required by Next.js | Framework limitation |

---

## Roadmap

- [ ] Redis-backed rate limiting
- [ ] Playwright E2E tests
- [ ] Server-Sent Events for live dashboard updates
- [ ] Email notification fallback
- [ ] CMS for landing page content
- [ ] Cloud backup integration (S3-compatible)
- [ ] Health check monitoring + alerting

---

**Open source. Self-hosted. Community-first.**
