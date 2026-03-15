/**
 * Next.js Edge Middleware — Route protection for DPS Dashboard.
 *
 * Rules:
 * - Unauthenticated users accessing /dashboard/* → redirect to /login
 * - Authenticated users with isTempPassword=true accessing /dashboard/* → redirect to /change-password
 * - Public routes (no auth required): /, /login, /membership-form, /sponsor/[token]/*
 * - API routes: auth is handled in individual route handlers (not here)
 *
 * Note: Middleware runs on Edge Runtime — keep it lightweight, no Prisma/bcrypt.
 */

import { withAuth, NextRequestWithAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req: NextRequestWithAuth) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    // If token exists and user still has temp password,
    // redirect any dashboard access to /change-password.
    // The /change-password page itself is allowed through.
    if (
      token?.isTempPassword === true &&
      pathname.startsWith("/dashboard")
    ) {
      const changePasswordUrl = new URL("/change-password", req.url);
      return NextResponse.redirect(changePasswordUrl);
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      /**
       * Determines if the route requires authentication.
       * Returns true (authorized) if a valid token exists.
       * NextAuth will redirect to /login if false is returned.
       */
      authorized({ token }) {
        return !!token;
      },
    },
    pages: {
      signIn: "/login",
    },
  }
);

/**
 * Matcher: apply middleware only to dashboard routes.
 * API routes, public pages, and static assets are excluded.
 */
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/change-password",
  ],
};
