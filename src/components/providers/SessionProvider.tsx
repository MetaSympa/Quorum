"use client";

/**
 * NextAuth SessionProvider wrapper.
 *
 * Wraps the application with NextAuth's SessionProvider so that
 * client components can call useSession() anywhere in the tree.
 *
 * Usage: wrap in src/app/layout.tsx
 */

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import type { Session } from "next-auth";

interface SessionProviderProps {
  children: React.ReactNode;
  session?: Session | null;
}

export default function SessionProvider({
  children,
  session,
}: SessionProviderProps) {
  return (
    <NextAuthSessionProvider session={session}>
      {children}
    </NextAuthSessionProvider>
  );
}
