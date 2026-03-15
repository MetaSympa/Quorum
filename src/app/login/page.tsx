"use client";

/**
 * Login page — email + password form using NextAuth Credentials provider.
 *
 * On success:
 *   - isTempPassword=true  → redirect to /change-password
 *   - isTempPassword=false → redirect to /dashboard
 *
 * Test mode auto-fill buttons (T33):
 *   Visible when NODE_ENV !== 'production' OR NEXT_PUBLIC_TEST_MODE=true.
 *   Clicking a button fills the form and immediately submits it.
 *
 * Note: useSearchParams() must live inside a Suspense boundary (Next.js 14
 * static generation requirement). The inner LoginForm component is
 * wrapped in Suspense below.
 */

import { Suspense, useState, FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Test accounts — shown in development / test mode only
// ---------------------------------------------------------------------------

const TEST_ACCOUNTS = [
  { label: "Admin",    email: "admin@dps.club",    password: "Admin@123" },
  { label: "Operator", email: "operator@dps.club", password: "Operator@123" },
  { label: "Member 1", email: "member1@dps.club",  password: "Member@123" },
  { label: "Member 2", email: "member2@dps.club",  password: "Member@123" },
  { label: "Member 3", email: "member3@dps.club",  password: "Member@123" },
  { label: "Member 4", email: "member4@dps.club",  password: "Member@123" },
  { label: "Member 5", email: "member5@dps.club",  password: "Member@123" },
] as const;

const isTestMode =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_TEST_MODE === "true";

// ---------------------------------------------------------------------------
// Inner form — uses useSearchParams(), must be inside Suspense
// ---------------------------------------------------------------------------

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Preserve the callbackUrl if set (e.g. redirect after auth)
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  async function doSignIn(emailValue: string, passwordValue: string) {
    setError(null);
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email: emailValue.toLowerCase().trim(),
        password: passwordValue,
        redirect: false,
      });

      if (!result) {
        setError("An unexpected error occurred. Please try again.");
        return;
      }

      if (result.error) {
        // Generic message — do not reveal whether email exists
        setError("Invalid email or password.");
        return;
      }

      // Fetch updated session to check isTempPassword.
      // NextAuth sets the cookie; we need a page refresh to read it.
      // The middleware will redirect to /change-password if isTempPassword is true.
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await doSignIn(email, password);
  }

  async function handleTestLogin(testEmail: string, testPassword: string) {
    setEmail(testEmail);
    setPassword(testPassword);
    await doSignIn(testEmail, testPassword);
  }

  return (
    <Card className="shadow-lg">
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl">Sign in</CardTitle>
        <CardDescription>
          Enter your registered email and password to access the dashboard.
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {/* Error message */}
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Email field */}
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={loading}
            />
          </div>

          {/* Password field */}
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={loading}
            />
          </div>

          {/* Test mode auto-fill section */}
          {isTestMode && (
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-3 space-y-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Test accounts — development only
              </p>
              <div className="flex flex-wrap gap-2">
                {TEST_ACCOUNTS.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() =>
                      handleTestLogin(account.email, account.password)
                    }
                    disabled={loading}
                    className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {account.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-4">
          <Button
            type="submit"
            className="w-full"
            disabled={loading || !email || !password}
          >
            {loading ? "Signing in..." : "Sign in"}
          </Button>

          <Link
            href="/"
            className="text-sm text-slate-500 hover:text-slate-700 text-center"
          >
            Back to home
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page — wraps LoginForm in Suspense to satisfy Next.js static generation
// ---------------------------------------------------------------------------

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-md">
        {/* Club branding */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <h1 className="text-2xl font-bold text-slate-900">
              Deshapriya Park Durga Puja Club
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Management Dashboard
            </p>
          </Link>
        </div>

        <Suspense
          fallback={
            <Card className="shadow-lg">
              <CardContent className="py-8 text-center text-sm text-slate-500">
                Loading...
              </CardContent>
            </Card>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
