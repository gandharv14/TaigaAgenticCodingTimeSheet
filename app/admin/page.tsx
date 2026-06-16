import { ArrowRight, Clock3, ShieldAlert } from "lucide-react";

import { AdminPortal } from "@/components/admin-portal";
import { getCurrentUser, isAuth0Configured, isDebugAuthBypassEnabled } from "@/lib/auth0";

export default async function AdminPage() {
  const currentUser = await getCurrentUser();
  const auth0Missing = !isDebugAuthBypassEnabled() && !isAuth0Configured();

  if (auth0Missing) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <section className="w-full max-w-xl rounded-lg border border-amber-200 bg-white p-8 shadow-panel">
          <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-lg bg-amber-600 text-white">
            <Clock3 aria-hidden="true" className="h-5 w-5" />
          </div>
          <h1 className="text-3xl font-semibold tracking-normal text-ink">Configuration needed</h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Auth0 environment variables are missing in Vercel. Add the required Auth0 and Supabase variables, then
            redeploy to enable the admin portal.
          </p>
        </section>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <section className="w-full max-w-xl rounded-lg border border-stone-200 bg-white p-8 shadow-panel">
          <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-lg bg-fern text-white">
            <ShieldAlert aria-hidden="true" className="h-5 w-5" />
          </div>
          <h1 className="text-3xl font-semibold tracking-normal text-ink">Admin Portal</h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">Sign in with an approved admin email to continue.</p>
          <a
            className="mt-8 inline-flex h-11 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-medium text-white transition hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-fern focus:ring-offset-2"
            href="/auth/login"
          >
            Log in
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </a>
        </section>
      </main>
    );
  }

  if (!currentUser.isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <section className="w-full max-w-xl rounded-lg border border-red-200 bg-white p-8 shadow-panel">
          <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-lg bg-red-700 text-white">
            <ShieldAlert aria-hidden="true" className="h-5 w-5" />
          </div>
          <h1 className="text-3xl font-semibold tracking-normal text-ink">Admin access required</h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            You are signed in as {currentUser.email ?? "an unknown user"}, which is not on the admin allowlist.
          </p>
        </section>
      </main>
    );
  }

  return <AdminPortal adminEmail={currentUser.email ?? "Admin"} />;
}
