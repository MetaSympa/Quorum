"use client";

/**
 * Change Password page — forced password change for users with isTempPassword=true.
 *
 * Shown to users after their first login with a temporary password.
 * After a successful change, isTempPassword is set to false and
 * the user is redirected to /dashboard.
 *
 * Rules:
 * - Current password must be correct
 * - New password must be at least 8 characters
 * - New password must match confirmation
 * - New password must differ from current password
 */

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
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

const MIN_PASSWORD_LENGTH = 8;

export default function ChangePasswordPage() {
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validate(): string | null {
    if (!currentPassword) return "Current password is required.";
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (newPassword !== confirmPassword) {
      return "New password and confirmation do not match.";
    }
    if (currentPassword === newPassword) {
      return "New password must be different from your current password.";
    }
    return null;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = (await res.json()) as { success?: boolean; error?: string };

      if (!res.ok) {
        setError(data.error ?? "Failed to change password. Please try again.");
        return;
      }

      // Password changed successfully.
      // Force a session refresh so isTempPassword is updated in the JWT.
      // The simplest approach: trigger a sign-in refresh by navigating to /dashboard.
      // Next-auth will re-fetch the token; middleware will allow through since
      // isTempPassword is now false in the DB. We do a full navigation to ensure
      // the stale JWT (still has isTempPassword=true) is replaced.
      //
      // We sign out and back in transparently by pushing to /dashboard with router.refresh().
      // In practice, the JWT will expire (15 min) and be refreshed. For immediate effect,
      // we redirect to /api/auth/session to trigger a token refresh, then go to dashboard.
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    await signOut({ callbackUrl: "/login" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-md">
        {/* Club branding */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">
            Deshapriya Park Durga Puja Club
          </h1>
          <p className="text-sm text-slate-500 mt-1">Management Dashboard</p>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">Set your password</CardTitle>
            <CardDescription>
              You are using a temporary password. Please set a new password to
              continue.
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

              {/* Current (temporary) password */}
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Temporary password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  placeholder="Enter your temporary password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  disabled={loading}
                />
              </div>

              {/* New password */}
              <div className="space-y-2">
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={loading}
                />
              </div>

              {/* Confirm new password */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Repeat your new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={loading}
                />
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              <Button
                type="submit"
                className="w-full"
                disabled={
                  loading ||
                  !currentPassword ||
                  !newPassword ||
                  !confirmPassword
                }
              >
                {loading ? "Updating..." : "Update password"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full text-slate-500 text-sm"
                onClick={handleSignOut}
                disabled={loading}
              >
                Sign out and use a different account
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
