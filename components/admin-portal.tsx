"use client";

import { Download, Home, Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { AdminTimesheetRecord } from "@/lib/types";

type AdminResponse = {
  entries?: AdminTimesheetRecord[];
  error?: string;
};

function formatDate(value: string) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "Invalid date";
  }

  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function formatHours(value: number) {
  return value.toLocaleString([], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function AdminPortal({ adminEmail }: { adminEmail: string }) {
  const [entries, setEntries] = useState<AdminTimesheetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadEntries() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/admin/timesheets", { cache: "no-store" });
        const data = (await response.json()) as AdminResponse;

        if (!response.ok) {
          throw new Error(data.error ?? "Unable to load admin timesheets.");
        }

        if (!cancelled) {
          setEntries(data.entries ?? []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load admin timesheets.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadEntries();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen">
      <header className="border-b border-stone-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink text-white">
              <ShieldCheck aria-hidden="true" className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-ink">Admin Portal</h1>
              <p className="text-sm text-stone-600">Signed in as {adminEmail}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-fern focus:ring-offset-2"
              href="/"
            >
              <Home aria-hidden="true" className="h-4 w-4" />
              User portal
            </Link>
            <a
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-fern px-3 text-sm font-medium text-white transition hover:bg-[#285f51] focus:outline-none focus:ring-2 focus:ring-fern focus:ring-offset-2"
              href="/api/admin/timesheets/export"
            >
              <Download aria-hidden="true" className="h-4 w-4" />
              Download CSV
            </a>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-stone-200 bg-white shadow-panel">
          <div className="border-b border-stone-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-ink">All Timesheets</h2>
            <p className="text-sm text-stone-600">{entries.length} submissions across all users</p>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 px-5 py-6 text-sm text-stone-600">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              Loading timesheets
            </div>
          ) : null}

          {error ? <div className="px-5 py-6 text-sm text-red-700">{error}</div> : null}

          {!loading && !error && entries.length === 0 ? (
            <div className="px-5 py-6 text-sm text-stone-600">No timesheets submitted yet.</div>
          ) : null}

          {!loading && !error && entries.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-stone-200 text-sm">
                <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-normal text-stone-500">
                  <tr>
                    <th className="px-4 py-3">Problem</th>
                    <th className="px-4 py-3">Login email</th>
                    <th className="px-4 py-3">Workforce email</th>
                    <th className="px-4 py-3">Languages</th>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Hours</th>
                    <th className="px-4 py-3">Turns</th>
                    <th className="px-4 py-3">Tokens</th>
                    <th className="px-4 py-3">Blocked</th>
                    <th className="px-4 py-3">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {entries.map((entry) => (
                    <tr key={entry.id} className="align-top">
                      <td className="max-w-52 px-4 py-3 font-medium text-ink">
                        <a className="hover:underline" href={entry.taskUrl}>
                          {entry.liveCompareProblemId}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-stone-700">{entry.auth0Email ?? "Unknown"}</td>
                      <td className="px-4 py-3 text-stone-700">{entry.workforceEmail}</td>
                      <td className="min-w-48 px-4 py-3 text-stone-700">
                        {entry.primaryProgrammingLanguage}
                        {entry.secondaryProgrammingLanguages ? (
                          <span className="block text-xs text-stone-500">{entry.secondaryProgrammingLanguages}</span>
                        ) : null}
                      </td>
                      <td className="min-w-56 px-4 py-3 text-stone-700">
                        {formatDate(entry.startAt)}
                        <br />
                        {formatDate(entry.endAt)}
                      </td>
                      <td className="px-4 py-3 text-stone-700">
                        {formatHours(entry.reportedHours)}
                        {entry.totalHoursOverride !== null ? (
                          <span className="block text-xs text-stone-500">
                            Auto: {formatHours(entry.calculatedHours)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-stone-700">{entry.turns.length}</td>
                      <td className="px-4 py-3 text-stone-700">
                        {entry.tokenUsage === null ? "None" : entry.tokenUsage.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-stone-700">{entry.blockedOnTaigaBug ? "Yes" : "No"}</td>
                      <td className="min-w-72 px-4 py-3 text-stone-700">{entry.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
