import { Auth0Client } from "@auth0/nextjs-auth0/server";

import { isAdminEmail } from "@/lib/admin";

export type CurrentUser = {
  id: string;
  email: string | null;
  name: string;
  debug: boolean;
  isAdmin: boolean;
};

const REQUIRED_AUTH0_ENV = ["AUTH0_SECRET", "AUTH0_DOMAIN", "AUTH0_CLIENT_ID", "AUTH0_CLIENT_SECRET"] as const;

export function isAuth0Configured() {
  return REQUIRED_AUTH0_ENV.every((key) => Boolean(process.env[key]));
}

export const auth0 = isAuth0Configured() ? new Auth0Client() : null;

export function isDebugAuthBypassEnabled() {
  return process.env.AUTH_DEBUG_BYPASS === "true" && process.env.VERCEL !== "1";
}

async function readDebugCookie(name: string) {
  try {
    const { cookies } = await import("next/headers");
    return (await cookies()).get(name)?.value ?? null;
  } catch {
    return null;
  }
}

export async function getDebugUser(): Promise<CurrentUser> {
  const email = (await readDebugCookie("debug_user_email")) ?? process.env.AUTH_DEBUG_EMAIL ?? "debug.alignerr@alignerr.com";
  const name = (await readDebugCookie("debug_user_name")) ?? process.env.AUTH_DEBUG_NAME ?? "Debug User";

  return {
    id: `debug|${email.toLowerCase()}`,
    email,
    name,
    debug: true,
    isAdmin: isAdminEmail(email)
  };
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (isDebugAuthBypassEnabled()) {
    return getDebugUser();
  }

  if (!auth0) {
    return null;
  }

  const session = await auth0.getSession();
  const id = typeof session?.user.sub === "string" ? session.user.sub : null;

  if (!id) {
    return null;
  }

  const email = typeof session?.user.email === "string" ? session.user.email : null;

  return {
    id,
    email,
    name: typeof session?.user.name === "string" ? session.user.name : "Teammate",
    debug: false,
    isAdmin: isAdminEmail(email)
  };
}
