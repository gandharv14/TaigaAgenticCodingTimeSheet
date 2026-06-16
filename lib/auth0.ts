import { Auth0Client } from "@auth0/nextjs-auth0/server";

export const auth0 = new Auth0Client();

export type CurrentUser = {
  id: string;
  email: string | null;
  name: string;
  debug: boolean;
};

export function isDebugAuthBypassEnabled() {
  return process.env.AUTH_DEBUG_BYPASS === "true" && process.env.VERCEL !== "1";
}

export function getDebugUser(): CurrentUser {
  return {
    id: "debug|local-user",
    email: process.env.AUTH_DEBUG_EMAIL ?? "debug.alignerr@alignerr.com",
    name: process.env.AUTH_DEBUG_NAME ?? "Debug User",
    debug: true
  };
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (isDebugAuthBypassEnabled()) {
    return getDebugUser();
  }

  const session = await auth0.getSession();
  const id = typeof session?.user.sub === "string" ? session.user.sub : null;

  if (!id) {
    return null;
  }

  return {
    id,
    email: typeof session?.user.email === "string" ? session.user.email : null,
    name: typeof session?.user.name === "string" ? session.user.name : "Teammate",
    debug: false
  };
}
