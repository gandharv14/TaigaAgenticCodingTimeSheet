import { ArrowRight, Clock3 } from "lucide-react";

import { TimesheetApp } from "@/components/timesheet-app";
import { getCurrentUser } from "@/lib/auth0";

export default async function Home() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <section className="w-full max-w-xl rounded-lg border border-stone-200 bg-white p-8 shadow-panel">
          <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-lg bg-fern text-white">
            <Clock3 aria-hidden="true" className="h-5 w-5" />
          </div>
          <h1 className="text-3xl font-semibold tracking-normal text-ink">Live Compare Timesheet</h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Sign in with Auth0 to submit task timing, turn-level work type, and Taiga-blocker context.
          </p>
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

  return (
    <TimesheetApp
      debugMode={currentUser.debug}
      loginEmail={currentUser.email ?? ""}
      userName={currentUser.name}
    />
  );
}
