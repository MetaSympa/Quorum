"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Activity,
  CheckSquare,
  FileText,
  Handshake,
  IndianRupee,
  LayoutDashboard,
  LogOut,
  Users,
  UserCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Role } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  /** Badge suffix shown next to label (e.g. "read-only") */
  badge?: string;
}

interface SidebarProps {
  /** Current signed-in user data passed from the server layout */
  user: {
    name: string;
    role: Role;
    memberId: string;
  };
  /** Optionally close the mobile sheet after navigation */
  onNavigate?: () => void;
}

// ---------------------------------------------------------------------------
// Nav item definitions per role
// ---------------------------------------------------------------------------

const ADMIN_NAV: NavItem[] = [
  { label: "Dashboard Home", icon: LayoutDashboard, href: "/dashboard" },
  { label: "My Membership", icon: UserCircle, href: "/dashboard/my-membership" },
  { label: "Member Management", icon: Users, href: "/dashboard/members" },
  { label: "Cash Management", icon: IndianRupee, href: "/dashboard/cash" },
  { label: "Sponsorship Management", icon: Handshake, href: "/dashboard/sponsorship" },
  { label: "Approval Queue", icon: CheckSquare, href: "/dashboard/approvals" },
  { label: "Financial Audit Log", icon: FileText, href: "/dashboard/audit-log" },
  { label: "Activity Log", icon: Activity, href: "/dashboard/activity-log" },
];

const OPERATOR_NAV: NavItem[] = [
  { label: "Dashboard Home", icon: LayoutDashboard, href: "/dashboard" },
  { label: "My Membership", icon: UserCircle, href: "/dashboard/my-membership" },
  { label: "Member Management", icon: Users, href: "/dashboard/members" },
  { label: "Cash Management", icon: IndianRupee, href: "/dashboard/cash" },
  {
    label: "Financial Audit Log",
    icon: FileText,
    href: "/dashboard/audit-log",
    badge: "read-only",
  },
  {
    label: "Activity Log",
    icon: Activity,
    href: "/dashboard/activity-log",
    badge: "read-only",
  },
];

const MEMBER_NAV: NavItem[] = [
  { label: "My Membership", icon: UserCircle, href: "/dashboard/my-membership" },
];

function getNavItems(role: Role): NavItem[] {
  switch (role) {
    case "ADMIN":
      return ADMIN_NAV;
    case "OPERATOR":
      return OPERATOR_NAV;
    case "MEMBER":
      return MEMBER_NAV;
    default:
      return MEMBER_NAV;
  }
}

/** Human-readable role label for the badge */
function roleBadgeLabel(role: Role): string {
  switch (role) {
    case "ADMIN":
      return "Admin";
    case "OPERATOR":
      return "Operator";
    case "MEMBER":
      return "Member";
  }
}

/** Badge variant per role */
function roleBadgeVariant(role: Role): "default" | "secondary" | "outline" {
  switch (role) {
    case "ADMIN":
      return "default";
    case "OPERATOR":
      return "secondary";
    case "MEMBER":
      return "outline";
  }
}

// ---------------------------------------------------------------------------
// Internal sub-components
// ---------------------------------------------------------------------------

/**
 * Club logo / name block displayed at the top of the sidebar.
 */
function SidebarBrand() {
  return (
    <div className="px-4 py-5">
      <div className="flex items-center gap-2">
        {/* Simple geometric logo mark */}
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold"
          aria-hidden="true"
        >
          DP
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight text-foreground">
            DPS Dashboard
          </p>
          <p className="truncate text-[10px] leading-tight text-muted-foreground">
            Deshapriya Park Sarbojanin
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * User info section displayed near the bottom of the sidebar.
 */
function SidebarUserInfo({
  name,
  role,
  memberId,
}: {
  name: string;
  role: Role;
  memberId: string;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex flex-col gap-1">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        <div className="flex items-center gap-2">
          <Badge variant={roleBadgeVariant(role)} className="text-[10px] px-1.5 py-0">
            {roleBadgeLabel(role)}
          </Badge>
          <span className="text-[11px] text-muted-foreground font-mono">{memberId}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * A single navigation item row.
 */
function NavItemRow({
  item,
  isActive,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
      aria-current={isActive ? "page" : undefined}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-accent-foreground"
        )}
      />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge && (
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] px-1 py-0 shrink-0",
            isActive && "border-primary-foreground/40 text-primary-foreground/80"
          )}
        >
          {item.badge}
        </Badge>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

/**
 * Role-based navigation sidebar.
 *
 * Renders different nav items for ADMIN, OPERATOR, and MEMBER roles.
 * Can be used both as a fixed desktop sidebar and inside a mobile Sheet overlay.
 *
 * @param user  - Signed-in user's name, role, and memberId
 * @param onNavigate - Optional callback invoked after a nav link is clicked
 *                     (used to close the mobile Sheet)
 */
export default function Sidebar({ user, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const navItems = getNavItems(user.role);

  /**
   * Determine if a nav item is "active".
   * Dashboard Home only matches exact /dashboard; all others match the prefix.
   */
  function isActive(href: string): boolean {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }
    return pathname === href || pathname.startsWith(href + "/");
  }

  async function handleLogout() {
    await signOut({ callbackUrl: "/login" });
  }

  return (
    <div className="flex h-full w-64 flex-col border-r bg-background">
      {/* Brand */}
      <SidebarBrand />

      <Separator />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Main navigation">
        <ul className="space-y-1" role="list">
          {navItems.map((item) => (
            <li key={item.href}>
              <NavItemRow
                item={item}
                isActive={isActive(item.href)}
                onClick={onNavigate}
              />
            </li>
          ))}
        </ul>
      </nav>

      <Separator />

      {/* User info + logout */}
      <SidebarUserInfo name={user.name} role={user.role} memberId={user.memberId} />

      <div className="px-3 pb-4">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          <span>Logout</span>
        </Button>
      </div>
    </div>
  );
}
