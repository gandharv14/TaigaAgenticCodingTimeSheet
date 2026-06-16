import { NextResponse } from "next/server";

import { auth0, isAuth0Configured } from "@/lib/auth0";
import { isDebugAuthBypassEnabled } from "@/lib/auth0";

export async function proxy(request: Request) {
  if (isDebugAuthBypassEnabled() || !isAuth0Configured() || !auth0) {
    return NextResponse.next();
  }

  return auth0.middleware(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"]
};
