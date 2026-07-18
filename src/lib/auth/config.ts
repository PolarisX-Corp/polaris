import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge-safe base config: no database adapter, so it can run in middleware.
 * The full config in ./index.ts adds the Drizzle adapter and sign-in gating.
 */
export const authConfig = {
  providers: [Google],
  pages: { signIn: "/login" },
  callbacks: {
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
