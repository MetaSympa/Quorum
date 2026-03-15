# Security

This document describes the security measures implemented in DPS Dashboard, covering application security, server hardening, and data protection.

---

## Authentication

### Password Hashing

All passwords are hashed using **bcrypt with 12 salt rounds** before storage. No plaintext passwords are ever written to the database.

```typescript
const hash = await bcrypt.hash(password, 12);
```

### Temporary Password Flow

New members receive a system-generated temporary password via WhatsApp. The `isTempPassword` flag is set to `true` in the database. On every request to a protected API route, the middleware checks this flag:

```typescript
export function requirePasswordChanged(session: Session | null): SessionUser {
  const user = requireAuth(session);
  if (user.isTempPassword) {
    throw Object.assign(new Error("Password change required"), { status: 403 });
  }
  return user;
}
```

The user cannot perform any dashboard operation until they change their password at `/change-password`. After changing, `isTempPassword` is set to `false`.

### JWT Sessions

- **Strategy**: JWT stored in an HTTP-only cookie named `dps.session-token`
- **Expiry**: 15-minute token lifetime (refreshed on each authenticated request)
- **Cookie flags**: `httpOnly: true`, `sameSite: "lax"`, `secure: true` in production
- **No localStorage**: tokens are never accessible to JavaScript on the page

JWT payload:
```json
{
  "id": "uuid",
  "email": "rajesh.m@gmail.com",
  "name": "Rajesh Mukherjee",
  "role": "MEMBER",
  "memberId": "DPC-2026-0025-00",
  "isTempPassword": false,
  "isSubMember": false,
  "exp": 1710500000
}
```

### Login Rate Limiting

Login attempts are rate-limited per email address:
- **Limit**: 5 attempts per 15 minutes
- **Exceeded**: Returns HTTP 429, logs the event to ActivityLog
- **Implementation**: In-memory sliding window (no Redis required for single-instance deployment)

Failed login attempts (wrong password, disabled account, rate limit) are logged to ActivityLog but never reveal whether the email address exists.

---

## Role-Based Access Control

Three roles with strictly enforced server-side permissions:

| Role | Access |
|------|--------|
| ADMIN | Full access including approval queue |
| OPERATOR | Member management + cash + sponsorship (all changes require admin approval) |
| MEMBER | Own membership view and payment only |

Every API route calls `requireAuth()` or `requireRole()` from `lib/permissions.ts` before executing business logic:

```typescript
// Example in an API route handler
const session = await getServerSession(authOptions);
const user = requireRole(session, "ADMIN", "OPERATOR");
```

Client-side role checks in the sidebar and UI are for display only. The server enforces permissions independently on every request.

---

## Input Validation

Every API route validates its request body with a **Zod schema** before calling the service layer:

```typescript
const result = createMemberSchema.safeParse(await req.json());
if (!result.success) {
  return NextResponse.json({ error: result.error.issues }, { status: 400 });
}
```

SQL injection is not possible because all database access goes through Prisma's parameterised query builder — no raw SQL is used anywhere in the application.

React's JSX auto-escaping prevents reflected XSS in rendered output.

---

## Encryption at Rest

Sensitive PII fields are encrypted using **AES-256-GCM** before being written to the database. Decryption happens automatically on read via Prisma middleware.

### Encrypted fields

- `User.phone`, `User.address`
- `SubMember.phone`
- `Member.phone`, `Member.address`
- `Sponsor.phone`
- `Transaction.senderPhone`, `Transaction.senderBankAccount`

### Format

Encrypted values are stored as `enc:<base64>` where the base64 blob contains:
```
[12-byte IV] + [N-byte ciphertext] + [16-byte GCM auth tag]
```

The GCM auth tag provides tamper detection — any modification to the ciphertext causes decryption to fail.

### Key generation

```bash
openssl rand -hex 32
```

The 64-character hex string is set as `ENCRYPTION_KEY` in `.env`. This key must:
- Never be committed to version control
- Never change after production data is written (doing so would make existing encrypted values unreadable)
- Be backed up securely outside the server

---

## Razorpay Webhook Verification

Every incoming Razorpay webhook is verified with HMAC-SHA256 before processing:

```typescript
const expectedSignature = crypto
  .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
  .update(rawBody)
  .digest("hex");

if (signature !== expectedSignature) {
  return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
}
```

Unsigned requests are rejected immediately with HTTP 400. This prevents spoofed payment events from crediting memberships without actual payment.

The webhook endpoint is rate-limited to 50 requests per minute per IP.

---

## Security Headers

The following HTTP security headers are applied to all responses:

| Header | Value |
|--------|-------|
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Content-Security-Policy` | Script sources restricted to self + Razorpay |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (when HTTPS) |

Headers are configured in `next.config.js` and applied at the Next.js middleware layer.

Caddy removes the `Server` header to avoid leaking software version information.

---

## Sponsor Link Tokens

Sponsor payment link tokens are generated using `crypto.randomUUID()`:

```typescript
const token = crypto.randomUUID(); // Cryptographically random, 128-bit
```

Links can be time-limited via `expiresAt`. Expired links return HTTP 410 on the public checkout page. The token is never guessable — it is not sequential or derived from any predictable value.

---

## Audit Log Immutability

The `AuditLog` and `ActivityLog` tables are **append-only**:
- No `UPDATE` or `DELETE` API endpoints exist for these tables
- The Prisma schema has no update or delete operations defined for audit records
- Service functions call `prisma.auditLog.create()` — never `.update()` or `.delete()`

This ensures a tamper-evident financial trail. Every transaction approval, rejection, member change, and login event is permanently recorded.

---

## Rate Limiting Summary

| Endpoint | Limit | Window |
|----------|-------|--------|
| Login (`/api/auth`) | 5 per email | 15 minutes |
| Change password | 5 per user | 15 minutes |
| General API routes | 100 per user | 1 minute |
| Webhooks (`/api/webhooks/*`) | 50 per IP | 1 minute |
| Public sponsor checkout | 30 per IP | 1 minute |

Rate limiting uses an in-memory sliding window. This is appropriate for single-instance deployment. If horizontal scaling is added, replace with Redis-backed rate limiting.

---

## Server Security (LunaNode VPS)

The deployment guide covers server hardening in detail. Summary:

- **Firewall (UFW)**: ports 22, 80, 443 only — all others denied
- **SSH**: key-only authentication, password login disabled
- **Fail2ban**: auto-bans IPs after 5 failed SSH attempts for 10 minutes
- **Non-root user**: app runs as `dps` user, not root
- **File permissions**: `.env` is `chmod 600`, readable only by the `dps` user
- **Docker socket**: not exposed to application containers
- **Unattended upgrades**: security patches auto-installed

---

## Backup and Restore

### Backup

Automated daily backup via cron at 02:00:

```bash
0 2 * * * /home/dps/dps-dashboard/scripts/backup.sh
```

The script:
1. Runs `pg_dump` against the running PostgreSQL container
2. Compresses the output with gzip
3. Saves to `/var/backups/dps-dashboard/dps_dashboard_YYYYMMDD_HHMMSS.sql.gz`
4. Deletes backups older than 30 days
5. Optionally rsync-copies to an offsite location (`OFFSITE_BACKUP_PATH` env var)

Run a manual backup at any time:

```bash
/home/dps/dps-dashboard/scripts/backup.sh
```

### Restore

```bash
./scripts/restore.sh /var/backups/dps-dashboard/dps_dashboard_20260315_020000.sql.gz
```

The script:
1. Prompts for confirmation (cannot be undone)
2. Drops the existing database
3. Recreates it from the backup file
4. Runs the gunzipped SQL through psql

Stop the app before restoring to avoid mid-restore writes:

```bash
docker compose stop app
./scripts/restore.sh /path/to/backup.sql.gz
docker compose start app
```

### What is backed up

The `pg_dump` backup includes:
- All tables (schema + data)
- Sequences (member ID counters)
- Indexes and constraints
- Enum types

It does not include Docker volumes or uploaded files (there are none — the app stores no binary files).

---

## No Secrets in Code

All secrets are in `.env` which is listed in `.gitignore`. The `.env.example` file contains only placeholder values and is safe to commit. Never commit a `.env` file with real values.

Checklist of secrets that must be in `.env` and never in code:
- `NEXTAUTH_SECRET`
- `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `ENCRYPTION_KEY`
- `WHATSAPP_API_TOKEN`
- `CRON_SECRET`
- `DB_PASSWORD`
