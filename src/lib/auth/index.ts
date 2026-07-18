import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import { db } from "@/lib/db";
import { authConfig } from "./config";
import { isAllowedEmail } from "./allowed";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db),
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,
    signIn({ profile }) {
      return isAllowedEmail(profile?.email, process.env.ALLOWED_EMAIL_DOMAINS);
    },
  },
});
