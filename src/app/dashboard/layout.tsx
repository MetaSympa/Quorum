/**
 * Dashboard Layout — server component.
 *
 * Guards all /dashboard/* routes:
 * 1. No session → redirect to /login
 * 2. isTempPassword === true → redirect to /change-password
 * 3. Valid session → render DashboardShell with user data
 *
 * Depends on NextAuth session from @/lib/auth (T03 implements the full
 * Credentials provider; this layout works with any authOptions that return
 * a session with { user: SessionUser }).
 */

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import DashboardShell from "@/components/layout/DashboardShell";
import type { Role } from "@/types";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const session = await getServerSession(authOptions);

  // Not authenticated → send to login
  if (!session?.user) {
    redirect("/login");
  }

  const sessionUser = session.user as {
    id?: string;
    name?: string | null;
    email?: string | null;
    role?: Role;
    memberId?: string;
    isTempPassword?: boolean;
  };

  // Forced password change → redirect until complete
  if (sessionUser.isTempPassword === true) {
    redirect("/change-password");
  }

  // Normalise user data with sensible fallbacks in case T03 is still in
  // progress and the JWT callbacks haven't been wired up yet.
  const user = {
    name: sessionUser.name ?? sessionUser.email ?? "User",
    role: (sessionUser.role ?? "MEMBER") as Role,
    memberId: sessionUser.memberId ?? "DPC-????-????-00",
  };

  return <DashboardShell user={user}>{children}</DashboardShell>;
}
