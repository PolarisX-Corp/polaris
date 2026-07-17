import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth/config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = Boolean(req.auth);
  const { pathname } = req.nextUrl;

  // API routes self-guard and return 401 JSON; middleware only guards pages.
  const isPublic = pathname.startsWith("/login") || pathname.startsWith("/api");

  if (!isLoggedIn && !isPublic) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  // Run on everything except Next.js internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
