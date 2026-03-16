# Setup Guide

This guide walks you through running Quorum on your local machine for development.

---

## Prerequisites

| Requirement | Minimum version | How to check |
|-------------|----------------|--------------|
| Node.js | 20.x | `node --version` |
| npm | 9.x | `npm --version` |
| PostgreSQL | 16.x | `psql --version` |
| Docker (optional) | 24.x | `docker --version` |

PostgreSQL is only required if you are not using Docker. If you have Docker installed, the Docker path below handles the database automatically.

---

## Option A: Local Development (Node + PostgreSQL)

### 1. Clone the repository

```bash
git clone <repo-url> dps-dashboard
cd dps-dashboard
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in the required values:

```env
# Point to your local PostgreSQL instance
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/dps_dashboard

# Generate with: openssl rand -base64 32
NEXTAUTH_SECRET=your-secret-here
NEXTAUTH_URL=http://localhost:3000

# Razorpay test keys — get from https://dashboard.razorpay.com
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your-razorpay-key-secret
RAZORPAY_WEBHOOK_SECRET=your-webhook-secret
RAZORPAY_TEST_MODE=true

# Generate with: openssl rand -hex 32
ENCRYPTION_KEY=your-64-char-hex-key

# For cron endpoint (can be any random string locally)
CRON_SECRET=local-cron-secret

APP_URL=http://localhost:3000
NODE_ENV=development

# Show test login buttons on the login page
NEXT_PUBLIC_TEST_MODE=false
```

WhatsApp (`WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`) can be left empty. Notifications will be silently skipped.

### 4. Create the database

```bash
# If the database does not exist yet:
createdb dps_dashboard
```

Or using psql:

```sql
CREATE DATABASE dps_dashboard;
```

### 5. Run migrations

```bash
npx prisma migrate dev
```

This applies all schema migrations and generates the Prisma client. On the first run it will ask for a migration name — enter anything descriptive like `init`.

### 6. Seed test data

```bash
npm run db:seed
```

This creates:
- 1 admin account (`admin@dps.club`)
- 1 operator account (`operator@dps.club`)
- 5 member accounts (`member1@dps.club` through `member5@dps.club`)
- Sub-members, transactions, approvals, sponsorships, and logs

All seed accounts use the password shown in [Test Accounts](#test-accounts) below.

### 7. Start the development server

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

---

## Option B: Docker Compose

Docker handles PostgreSQL, the app, and Caddy in one command.

### 1. Clone the repository

```bash
git clone <repo-url> dps-dashboard
cd dps-dashboard
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Minimum values needed for Docker:

```env
DB_PASSWORD=changeme
NEXTAUTH_SECRET=your-secret-here
ENCRYPTION_KEY=your-64-char-hex-key
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your-razorpay-key-secret
RAZORPAY_TEST_MODE=true
CRON_SECRET=local-cron-secret
APP_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
```

### 3. Start all services

```bash
docker compose up -d
```

On first boot the app container runs `prisma migrate deploy` and `prisma db seed` automatically before starting. Allow 30–60 seconds for the database to initialise.

### 4. Verify it is running

```bash
docker compose ps
docker compose logs app --tail 50
```

Open http://localhost:3000.

---

## Test Accounts

All test accounts are created by the seed script. Passwords are pre-set.

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@dps.club | Admin@123 |
| Operator | operator@dps.club | Operator@123 |
| Member 1 | member1@dps.club | Member@123 |
| Member 2 | member2@dps.club | Member@123 |
| Member 3 | member3@dps.club | Member@123 |
| Member 4 | member4@dps.club | Member@123 |
| Member 5 | member5@dps.club | Member@123 |

All seeded accounts have `isTempPassword = false`, so no forced password change is required on first login.

Set `NEXT_PUBLIC_TEST_MODE=true` (or run in development mode) to see auto-fill buttons on the login page.

---

## Useful Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm test` | Run all tests |
| `npm run test:coverage` | Run tests with coverage report |
| `npx prisma studio` | Open Prisma database GUI |
| `npx prisma migrate dev` | Apply new migrations |
| `npx prisma migrate reset` | Drop and recreate DB, re-seed |
| `npm run db:seed` | Seed test data (without reset) |

---

## Generating Secret Keys

```bash
# NEXTAUTH_SECRET
openssl rand -base64 32

# ENCRYPTION_KEY (must be 64 hex chars = 32 bytes)
openssl rand -hex 32

# CRON_SECRET
openssl rand -base64 24
```

---

## VS Code Simple Browser Preview

When running `npm run dev` inside VS Code, you can open an inline browser:

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type `Simple Browser: Show` and select it
3. Enter `http://localhost:3000`

The preview opens in a VS Code panel tab alongside your editor. You can log in with any of the test accounts listed above and explore the full dashboard without leaving VS Code.

---

## Troubleshooting

**`Error: ENCRYPTION_KEY environment variable is not set`**
Generate a 32-byte hex key: `openssl rand -hex 32` and add it to `.env`.

**`P1001: Can't reach database server`**
Ensure PostgreSQL is running and the `DATABASE_URL` in `.env` matches your local setup.

**`PrismaClientInitializationError`**
Run `npx prisma generate` to regenerate the Prisma client after a schema change.

**Port 3000 already in use**
Run `npm run dev -- -p 3001` to use a different port and update `NEXTAUTH_URL` and `APP_URL` accordingly.
