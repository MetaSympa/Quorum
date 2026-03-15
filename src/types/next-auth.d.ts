/**
 * NextAuth module augmentation.
 *
 * Extends the default NextAuth Session and JWT types to include the
 * custom fields added by the DPS Dashboard auth callbacks in src/lib/auth.ts.
 *
 * These fields are set in the `jwt` and `session` callbacks:
 *   - id           UUID of the User or SubMember
 *   - role         ADMIN | OPERATOR | MEMBER
 *   - memberId     DPC-YYYY-NNNN-SS format ID
 *   - isTempPassword  true = forced password change required before any dashboard op
 *   - isSubMember  true = authenticated as a SubMember (not a primary User)
 *   - parentUserId UUID of parent User (sub-members only, for pay-on-behalf flows)
 */

import type { DefaultSession, DefaultJWT } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      memberId: string;
      isTempPassword: boolean;
      isSubMember: boolean;
      parentUserId?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id?: string;
    role?: string;
    memberId?: string;
    isTempPassword?: boolean;
    isSubMember?: boolean;
    parentUserId?: string;
  }
}
