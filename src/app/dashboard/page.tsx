"use client";

/**
 * Dashboard Home — /dashboard
 *
 * Admin/Operator view:
 *   - 4 summary cards: Total Members, Total Income, Net Balance, Pending Approvals
 *   - Quick actions row: Add Member, Record Payment, Generate Sponsor Link
 *   - Recent Activity (last 10 entries)
 *   - Recent Audit (last 10 entries)
 *
 * Member view:
 *   - Membership Status card (status, type, expiry, days remaining)
 *   - Payment Summary (total paid, last payment date)
 *   - Sub-Members list
 *   - Pay/Renew membership quick action
 *
 * All amounts formatted as ₹X,XXX.XX
 * All dates in DD/MM/YYYY format
 * Single GET /api/dashboard/stats call for all data
 */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  UsersIcon,
  IndianRupeeIcon,
  TrendingUpIcon,
  ClockIcon,
  CheckCircleIcon,
  RefreshCwIcon,
  UserPlusIcon,
  ReceiptIcon,
  LinkIcon,
  AlertCircleIcon,
  CalendarIcon,
  WalletIcon,
  ActivityIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatMembershipType,
  formatMembershipStatus,
} from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminStats {
  members: { total: number; active: number; pending: number; expired: number };
  financial: {
    totalIncome: number;
    totalExpenses: number;
    pendingApprovals: number;
    netBalance: number;
  };
  approvals: { pending: number };
  recentActivity: Array<{
    id: string;
    action: string;
    description: string;
    createdAt: string;
    user: { id: string; name: string; role: string; memberId: string };
  }>;
  recentAudit: Array<{
    id: string;
    entityType: string;
    entityId: string;
    action: string;
    createdAt: string;
    performedBy: { id: string; name: string; role: string; memberId: string };
  }>;
}

interface MemberStats {
  membership: {
    status: string;
    type: string | null;
    expiry: string | null;
    daysLeft: number | null;
  };
  payments: { total: number; lastPayment: string | null };
  subMembers: Array<{
    id: string;
    memberId: string;
    name: string;
    relation: string;
    createdAt: string;
  }>;
}

// ---------------------------------------------------------------------------
// Local helpers (non-formatting)
// ---------------------------------------------------------------------------

function membershipStatusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "ACTIVE":
      return "default";
    case "EXPIRED":
      return "destructive";
    case "PENDING_APPROVAL":
    case "PENDING_PAYMENT":
      return "secondary";
    case "SUSPENDED":
      return "outline";
    default:
      return "outline";
  }
}

function roleVariant(
  role: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (role) {
    case "ADMIN":
      return "destructive";
    case "OPERATOR":
      return "secondary";
    default:
      return "outline";
  }
}

// formatMembershipType is imported from @/lib/utils

// ---------------------------------------------------------------------------
// Admin / Operator dashboard
// ---------------------------------------------------------------------------

function AdminDashboard({ stats }: { stats: AdminStats }) {
  const role = useSession().data?.user?.role;
  const isAdmin = role === "ADMIN";

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Total Members */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Members
            </CardTitle>
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.members.total}</div>
            <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
              <span className="text-green-600 dark:text-green-400">
                {stats.members.active} active
              </span>
              <span className="text-yellow-600 dark:text-yellow-400">
                {stats.members.pending} pending
              </span>
              <span className="text-red-600 dark:text-red-400">
                {stats.members.expired} expired
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Total Income */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Income
            </CardTitle>
            <TrendingUpIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(stats.financial.totalIncome)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Approved cash in
            </div>
          </CardContent>
        </Card>

        {/* Net Balance */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Net Balance
            </CardTitle>
            <IndianRupeeIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                stats.financial.netBalance >= 0
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {formatCurrency(stats.financial.netBalance)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Income minus expenses
            </div>
          </CardContent>
        </Card>

        {/* Pending Approvals — admin only */}
        {isAdmin ? (
          <Card className={stats.approvals.pending > 0 ? "border-yellow-400" : ""}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Approvals
              </CardTitle>
              <ClockIcon
                className={`h-4 w-4 ${
                  stats.approvals.pending > 0
                    ? "text-yellow-600 dark:text-yellow-400"
                    : "text-muted-foreground"
                }`}
              />
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${
                  stats.approvals.pending > 0
                    ? "text-yellow-600 dark:text-yellow-400"
                    : ""
                }`}
              >
                {stats.approvals.pending}
              </div>
              <div className="mt-1 text-xs">
                {stats.approvals.pending > 0 ? (
                  <Link
                    href="/dashboard/approvals"
                    className="text-yellow-600 hover:underline dark:text-yellow-400"
                  >
                    Review approvals
                  </Link>
                ) : (
                  <span className="text-muted-foreground">All clear</span>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Operator: show pending financial approvals total instead */
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Payments
              </CardTitle>
              <WalletIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {formatCurrency(stats.financial.pendingApprovals)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Awaiting approval
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/members">
                <UserPlusIcon className="mr-2 h-4 w-4" />
                Add Member
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/cash">
                <ReceiptIcon className="mr-2 h-4 w-4" />
                Record Payment
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/sponsorship">
                <LinkIcon className="mr-2 h-4 w-4" />
                Generate Sponsor Link
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity + Recent Audit */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Activity */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold">
              Recent Activity
            </CardTitle>
            <ActivityIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-0">
            {stats.recentActivity.length === 0 ? (
              <p className="px-6 py-4 text-sm text-muted-foreground">
                No activity yet.
              </p>
            ) : (
              <ul className="divide-y">
                {stats.recentActivity.map((entry) => (
                  <li key={entry.id} className="px-6 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{entry.description}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <span>{entry.user.name}</span>
                          <Badge
                            variant={roleVariant(entry.user.role)}
                            className="px-1 py-0 text-[10px]"
                          >
                            {entry.user.role}
                          </Badge>
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDateTime(entry.createdAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Separator />
            <div className="px-6 py-3">
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                <Link href="/dashboard/activity-log">View all</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Recent Audit */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold">
              Recent Audit Entries
            </CardTitle>
            <ShieldCheckIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-0">
            {stats.recentAudit.length === 0 ? (
              <p className="px-6 py-4 text-sm text-muted-foreground">
                No audit entries yet.
              </p>
            ) : (
              <ul className="divide-y">
                {stats.recentAudit.map((entry) => (
                  <li key={entry.id} className="px-6 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-[10px]">
                            {entry.entityType}
                          </Badge>
                          <span className="font-mono text-xs">
                            {entry.action}
                          </span>
                        </div>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <span>{entry.performedBy.name}</span>
                          <Badge
                            variant={roleVariant(entry.performedBy.role)}
                            className="px-1 py-0 text-[10px]"
                          >
                            {entry.performedBy.role}
                          </Badge>
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDateTime(entry.createdAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Separator />
            <div className="px-6 py-3">
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                <Link href="/dashboard/audit-log">View all</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Member dashboard
// ---------------------------------------------------------------------------

function MemberDashboard({ stats }: { stats: MemberStats }) {
  const daysLeft = stats.membership.daysLeft;

  let expiryColor = "text-green-600 dark:text-green-400";
  if (daysLeft !== null) {
    if (daysLeft <= 0) expiryColor = "text-red-600 dark:text-red-400";
    else if (daysLeft <= 15)
      expiryColor = "text-yellow-600 dark:text-yellow-400";
  }

  return (
    <div className="space-y-6">
      {/* Membership Status Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold">
            My Membership
          </CardTitle>
          <CheckCircleIcon className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge
                variant={membershipStatusVariant(stats.membership.status)}
                className="mt-1"
              >
                {formatMembershipStatus(stats.membership.status)}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Type</p>
              <p className="mt-1 text-sm font-medium">
                {formatMembershipType(stats.membership.type)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Expires</p>
              <p className="mt-1 text-sm font-medium">
                {formatDate(stats.membership.expiry)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Days Remaining</p>
              <p className={`mt-1 text-sm font-bold ${expiryColor}`}>
                {daysLeft !== null
                  ? daysLeft <= 0
                    ? "Expired"
                    : `${daysLeft} days`
                  : "—"}
              </p>
            </div>
          </div>

          {daysLeft !== null && daysLeft <= 15 && daysLeft > 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
              <AlertCircleIcon className="h-4 w-4 shrink-0" />
              Your membership expires in {daysLeft} day
              {daysLeft !== 1 ? "s" : ""}. Renew now to avoid interruption.
            </div>
          )}

          {(daysLeft === null || daysLeft <= 0) &&
            stats.membership.status !== "ACTIVE" && (
              <div className="mt-4 flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300">
                <AlertCircleIcon className="h-4 w-4 shrink-0" />
                Your membership has expired. Renew to regain full access.
              </div>
            )}
        </CardContent>
      </Card>

      {/* Payment Summary + Quick Action */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Payment Summary
            </CardTitle>
            <WalletIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(stats.payments.total)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Total paid to date
            </div>
            {stats.payments.lastPayment && (
              <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarIcon className="h-3 w-3" />
                Last payment: {formatDate(stats.payments.lastPayment)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Quick Action
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/dashboard/my-membership">
                <IndianRupeeIcon className="mr-2 h-4 w-4" />
                Pay / Renew Membership
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Sub-Members Card */}
      {stats.subMembers.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold">
              Sub-Members
            </CardTitle>
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {stats.subMembers.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center justify-between px-6 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">{member.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {member.memberId} · {member.relation}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    Sub-member
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [stats, setStats] = useState<AdminStats | MemberStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const role = session?.user?.role;

  useEffect(() => {
    if (status === "loading") return;

    let cancelled = false;

    async function fetchStats() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/dashboard/stats");
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) setStats(data);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load stats");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchStats();
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <RefreshCwIcon className="mr-2 h-5 w-5 animate-spin" />
        Loading dashboard…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <AlertCircleIcon className="mx-auto mb-3 h-8 w-8 text-destructive" />
          <p className="font-medium text-destructive">Failed to load stats</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  if (role === "ADMIN" || role === "OPERATOR") {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Overview of club activity and finances
          </p>
        </div>
        <AdminDashboard stats={stats as AdminStats} />
      </div>
    );
  }

  // MEMBER view
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back, {session?.user?.name}
        </p>
      </div>
      <MemberDashboard stats={stats as MemberStats} />
    </div>
  );
}
