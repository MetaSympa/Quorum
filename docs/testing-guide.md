# Testing Guide

Quorum uses Vitest as the test runner with React Testing Library for component tests. Tests are organised into three categories: unit, integration, and component.

---

## Running Tests

### Run all tests

```bash
npm test
```

### Run with watch mode (re-runs on file changes)

```bash
npm run test:watch
```

### Run with coverage report

```bash
npm run test:coverage
```

Coverage output is written to `coverage/` in HTML and text formats.

### Run a specific test file

```bash
npx vitest run tests/unit/member-id.test.ts
```

### Run tests matching a pattern

```bash
npx vitest run --reporter verbose -t "should generate"
```

---

## Test Structure

```
tests/
├── unit/
│   ├── member-id.test.ts          # DPC-YYYY-NNNN-SS ID generation logic
│   ├── member-id-extended.test.ts # Year rollover, gap filling, boundary values
│   ├── validators.test.ts         # Zod schema validation (core schemas)
│   ├── validators-extended.test.ts # Zod schema validation (extended schemas)
│   ├── encrypt.test.ts            # AES-256 encrypt/decrypt
│   ├── encrypt-extended.test.ts   # Unicode, long strings, edge cases
│   ├── razorpay.test.ts           # Razorpay utilities
│   └── utils-extended.test.ts     # cn(), formatCurrency, formatDate, etc.
├── integration/
│   ├── helpers.ts                 # describeIntegration helper, test UUIDs
│   ├── auth.test.ts               # Auth route structure, NextAuth config
│   └── api-routes.test.ts         # All 29 API route handlers (import + method exports)
└── components/
    ├── layout.test.ts             # Sidebar, Header, DashboardShell, shadcn/ui
    └── pages.test.ts              # All 16 page components (import + default exports)
```

Total: ~750 passing tests, 3 intentionally skipped (root layout uses `next/font/local` which is not available in jsdom).

---

## Test Accounts (Seed Data)

The seed script (`npx prisma db seed` or `npm run db:seed`) creates:

| Role | Email | Password | Member ID |
|------|-------|----------|-----------|
| Admin | admin@dps.club | Admin@123 | DPC-2026-0000-00 |
| Operator | operator@dps.club | Operator@123 | DPC-2026-0001-00 |
| Member 1 | member1@dps.club | Member@123 | DPC-2026-0002-00 |
| Member 2 | member2@dps.club | Member@123 | DPC-2026-0003-00 |
| Member 3 | member3@dps.club | Member@123 | DPC-2026-0004-00 |
| Member 4 | member4@dps.club | Member@123 | DPC-2026-0005-00 |
| Member 5 | member5@dps.club | Member@123 | DPC-2026-0006-00 |

Member 1 has sub-members (member IDs ending in `-01`, `-02`).

All seed accounts have `isTempPassword=false` — no forced password change is required.

---

## Test Mode Login Page

When running in development mode (`NODE_ENV=development`) or with `NEXT_PUBLIC_TEST_MODE=true`, the login page (`/login`) shows auto-fill buttons:

- **Admin** — fills email/password fields with admin credentials
- **Operator** — fills operator credentials
- **Member 1** through **Member 5** — fills each member's credentials

Click a button then click **Login** to authenticate instantly. This is useful for quickly switching between roles during manual testing.

---

## Writing Unit Tests

Unit tests cover pure business logic with no database or HTTP dependencies.

```typescript
// tests/unit/member-id.test.ts
import { describe, it, expect } from "vitest";
import { generateMemberId } from "@/lib/member-id";

describe("generateMemberId", () => {
  it("generates primary member ID in correct format", () => {
    const id = generateMemberId(2026, 25, 0);
    expect(id).toBe("DPC-2026-0025-00");
  });

  it("generates sub-member ID with correct suffix", () => {
    const id = generateMemberId(2026, 25, 1);
    expect(id).toBe("DPC-2026-0025-01");
  });
});
```

Key rule: unit tests must not import `prisma` or make network calls. Mock any dependencies with `vi.mock()`.

---

## Writing Integration Tests

Integration tests verify that API route modules export the correct HTTP method handlers. They import the route files but do not make actual HTTP requests.

```typescript
// tests/integration/api-routes.test.ts
import { describe, it, expect } from "vitest";

describe("members route", () => {
  it("exports GET and POST handlers", async () => {
    const route = await import("@/app/api/members/route");
    expect(typeof route.GET).toBe("function");
    expect(typeof route.POST).toBe("function");
  });
});
```

For routes that require a live database, use the `describeIntegration` helper from `tests/integration/helpers.ts`. These tests are skipped unless `DATABASE_URL` points to a real database.

---

## Writing Component Tests

Component tests use React Testing Library to verify that components render without errors and export a default export.

```typescript
// tests/components/pages.test.ts
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import LoginPage from "@/app/login/page";

describe("LoginPage", () => {
  it("renders without crashing", () => {
    const { container } = render(<LoginPage />);
    expect(container).toBeTruthy();
  });
});
```

For components that use `next/navigation` or `next-auth`, mock those modules:

```typescript
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard",
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));
```

---

## Vitest Configuration

The test setup is in `vitest.config.ts` (or `vite.config.ts`). Key settings:

```typescript
{
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  }
}
```

The setup file configures `@testing-library/jest-dom` matchers for assertions like `toBeInTheDocument()`.

---

## Coverage Targets

| Area | Target |
|------|--------|
| Business logic (lib/services, lib/) | 80%+ |
| API route handlers | 100% import coverage |
| UI components | Default export verified |

Run `npm run test:coverage` and open `coverage/index.html` to see the full report.

---

## Common Test Patterns

### Testing Zod validators

```typescript
import { createMemberSchema } from "@/lib/validators";

it("rejects missing email", () => {
  const result = createMemberSchema.safeParse({ name: "Rajesh Mukherjee" });
  expect(result.success).toBe(false);
});
```

### Testing encryption round-trips

```typescript
import { encrypt, decrypt } from "@/lib/encrypt";

it("encrypts and decrypts a phone number", () => {
  process.env.ENCRYPTION_KEY = "a".repeat(64);
  const phone = "+919876543210";
  const encrypted = encrypt(phone);
  expect(encrypted).toMatch(/^enc:/);
  expect(decrypt(encrypted)).toBe(phone);
});
```

### Testing rate limiting

```typescript
import { rateLimit, clearRateLimitStore } from "@/lib/rate-limit";

beforeEach(() => clearRateLimitStore());

it("blocks after 5 attempts", () => {
  for (let i = 0; i < 5; i++) {
    rateLimit("test-key", 5, 60000);
  }
  const result = rateLimit("test-key", 5, 60000);
  expect(result.success).toBe(false);
});
```
