"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut, Menu, User } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import Sidebar from "@/components/layout/Sidebar";
import type { Role } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HeaderProps {
  user: {
    name: string;
    role: Role;
    memberId: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a human-readable page title from the current pathname.
 * Keeps the title in sync with the sidebar nav labels.
 */
function pageTitleFromPathname(pathname: string): string {
  if (pathname === "/dashboard") return "Dashboard Home";
  if (pathname.startsWith("/dashboard/my-membership")) return "My Membership";
  if (pathname.startsWith("/dashboard/members")) return "Member Management";
  if (pathname.startsWith("/dashboard/cash")) return "Cash Management";
  if (pathname.startsWith("/dashboard/sponsorship")) return "Sponsorship Management";
  if (pathname.startsWith("/dashboard/approvals")) return "Approval Queue";
  if (pathname.startsWith("/dashboard/audit-log")) return "Financial Audit Log";
  if (pathname.startsWith("/dashboard/activity-log")) return "Activity Log";
  return "Dashboard";
}

/**
 * Generate up-to-two initials from a name string.
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

/**
 * Dashboard top header bar.
 *
 * - Mobile: hamburger button that opens a Sheet overlay containing the Sidebar
 * - Center/left: current page title (derived from route)
 * - Right: user avatar with dropdown (name, role, logout)
 *
 * @param user - Signed-in user's name, role, and memberId
 */
export default function Header({ user }: HeaderProps) {
  const pathname = usePathname();
  const pageTitle = pageTitleFromPathname(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    await signOut({ callbackUrl: "/login" });
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 lg:px-6">
      {/* Mobile hamburger — visible only below lg breakpoint */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Mobile sidebar sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
          <Sidebar user={user} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Page title */}
      <h1 className="flex-1 text-base font-semibold text-foreground truncate">
        {pageTitle}
      </h1>

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="relative flex items-center gap-2 px-2 py-1.5 h-auto"
            aria-label={`User menu for ${user.name}`}
          >
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            {/* Name — hidden on very small screens */}
            <span className="hidden sm:block text-sm font-medium text-foreground max-w-[160px] truncate">
              {user.name}
            </span>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
              <p className="text-xs text-muted-foreground font-mono">{user.memberId}</p>
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <a href="/dashboard/my-membership" className="flex items-center gap-2 cursor-pointer">
              <User className="h-4 w-4" />
              My Membership
            </a>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={handleLogout}
            className="flex items-center gap-2 text-destructive focus:text-destructive cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
