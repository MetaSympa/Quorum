/**
 * NextAuth.js catch-all API route handler.
 * Delegates all /api/auth/* requests to NextAuth using authOptions from lib/auth.ts.
 */

import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
