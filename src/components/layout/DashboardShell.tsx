/**
 * DashboardShell — server-renderable wrapper that composes the sidebar layout.
 *
 * Desktop (>= lg / 1024px):
 *   - Fixed 256px sidebar on the left
 *   - Content area fills remaining width
 *
 * Mobile/tablet (< lg):
 *   - Sidebar hidden; accessible via the Header hamburger button (Sheet overlay)
 *   - Content area is full width
 *
 * This component itself is a server component (no "use client").
 * The Sidebar and Header children are client components that handle
 * interactivity (active link highlighting, mobile sheet, logout).
 */

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import type { Role } from "@/types";

interface DashboardShellProps {
  children: React.ReactNode;
  user: {
    name: string;
    role: Role;
    memberId: string;
  };
}

/**
 * Root layout shell for all /dashboard/* pages.
 *
 * @param children  - Page content rendered in the main area
 * @param user      - Authenticated user's name, role, and memberId
 */
export default function DashboardShell({ children, user }: DashboardShellProps) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar — hidden on mobile via lg:flex */}
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:fixed lg:inset-y-0 lg:z-40">
        <Sidebar user={user} />
      </aside>

      {/* Main content column — offset by sidebar width on desktop */}
      <div className="flex flex-1 flex-col lg:pl-64">
        {/* Sticky header (contains mobile hamburger + user menu) */}
        <Header user={user} />

        {/* Page content */}
        <main className="flex-1 px-4 py-6 lg:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
