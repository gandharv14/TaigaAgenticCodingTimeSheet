"use client";

import {
  CheckCircle2,
  Clock3,
  History,
  Loader2,
  LogOut,
  Minus,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  SquarePen,
  UserRound
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { TASK_TYPES } from "@/lib/task-types";
import type { TaskType } from "@/lib/task-types";
import type { TimesheetInput, TimesheetRecord, UserProfileRecord } from "@/lib/types";
import { countWords } from "@/lib/validation";
import { calculateWorkSessionHours } from "@/lib/work-sessions";

type FormWorkSession = {
  startAt: string;
  endAt: string;
};

type FormState = {
  workforceEmail: string;
  primaryProgrammingLanguage: string;
  secondaryProgrammingLanguages: string;
  liveCompareProblemId: string;
  taskUrl: string;
  workSessions: FormWorkSession[];
  totalHours: string;
  usesHoursOverride: boolean;
  summary: string;
  comments: string;
  tokenUsage: string;
  blockedOnTaigaBug: boolean;
  turns: TaskType[];
};

type ProfileState = {
  name: string;
  workforceEmail: string;
  discordId: string;
  hubstaffEmail: string;
};

type Notice = {
  tone: "success" | "error";
  message: string;
};

const DEFAULT_TASK_TYPE: TaskType = "Debugging";
const MIN_TURNS = 5;
const WORKFORCE_EMAIL_PLACEHOLDER = "Kx9m**@alignerrworkforce.com";

function emptyForm(): FormState {
  return {
    workforceEmail: "",
    primaryProgrammingLanguage: "",
    secondaryProgrammingLanguages: "",
    liveCompareProblemId: "",
    taskUrl: "",
    workSessions: [{ startAt: "", endAt: "" }],
    totalHours: "",
    usesHoursOverride: false,
    summary: "",
    comments: "",
    tokenUsage: "",
    blockedOnTaigaBug: false,
    turns: Array.from({ length: MIN_TURNS }, () => DEFAULT_TASK_TYPE)
  };
}

function dateTimeLocalValue(value: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function hoursInputValue(value: number) {
  return Number(value.toFixed(2)).toString();
}

function formatHours(value: number) {
  return value.toLocaleString([], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function workSessionsForCalculation(workSessions: FormWorkSession[]) {
  return workSessions.map((session, index) => ({
    sessionNumber: index + 1,
    startAt: session.startAt,
    endAt: session.endAt
  }));
}

function parseOptionalHours(value: string) {
  if (value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPayload(form: FormState): TimesheetInput {
  return {
    workforceEmail: form.workforceEmail,
    primaryProgrammingLanguage: form.primaryProgrammingLanguage,
    secondaryProgrammingLanguages:
      form.secondaryProgrammingLanguages.trim().length > 0 ? form.secondaryProgrammingLanguages : null,
    liveCompareProblemId: form.liveCompareProblemId,
    taskUrl: form.taskUrl,
    workSessions: form.workSessions.map((session, index) => ({
      sessionNumber: index + 1,
      startAt: session.startAt,
      endAt: session.endAt
    })),
    totalHoursOverride: form.usesHoursOverride ? parseOptionalHours(form.totalHours) : null,
    summary: form.summary,
    comments: form.comments.trim().length > 0 ? form.comments : null,
    tokenUsage: form.tokenUsage.trim().length > 0 ? Number(form.tokenUsage) : null,
    blockedOnTaigaBug: form.blockedOnTaigaBug,
    turns: form.turns.map((taskType, index) => ({
      turnNumber: index + 1,
      taskType
    }))
  };
}

function formFromRecord(record: TimesheetRecord): FormState {
  return {
    workforceEmail: record.workforceEmail,
    primaryProgrammingLanguage: record.primaryProgrammingLanguage,
    secondaryProgrammingLanguages: record.secondaryProgrammingLanguages ?? "",
    liveCompareProblemId: record.liveCompareProblemId,
    taskUrl: record.taskUrl,
    workSessions: record.workSessions.map((session) => ({
      startAt: dateTimeLocalValue(session.startAt),
      endAt: dateTimeLocalValue(session.endAt)
    })),
    totalHours: record.totalHoursOverride === null ? "" : String(record.totalHoursOverride),
    usesHoursOverride: record.totalHoursOverride !== null,
    summary: record.summary,
    comments: record.comments ?? "",
    tokenUsage: record.tokenUsage === null ? "" : String(record.tokenUsage),
    blockedOnTaigaBug: record.blockedOnTaigaBug,
    turns: record.turns.map((turn) => turn.taskType)
  };
}

function emptyProfile(userName: string): ProfileState {
  return {
    name: userName,
    workforceEmail: "",
    discordId: "",
    hubstaffEmail: ""
  };
}

function profileFromRecord(profile: UserProfileRecord): ProfileState {
  return {
    name: profile.name,
    workforceEmail: profile.workforceEmail ?? "",
    discordId: profile.discordId ?? "",
    hubstaffEmail: profile.hubstaffEmail ?? ""
  };
}

function formatDateRange(startAt: string, endAt: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return "Time unavailable";
  }

  return `${start.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} to ${end.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  })}`;
}

export function TimesheetApp({
  debugMode,
  isAdmin,
  loginEmail,
  userName
}: {
  debugMode: boolean;
  isAdmin: boolean;
  loginEmail: string;
  userName: string;
}) {
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [entries, setEntries] = useState<TimesheetRecord[]>([]);
  const [profile, setProfile] = useState<ProfileState>(() => emptyProfile(userName));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [profileNotice, setProfileNotice] = useState<Notice | null>(null);

  const summaryWords = useMemo(() => countWords(form.summary), [form.summary]);
  const calculatedHours = useMemo(
    () => calculateWorkSessionHours(workSessionsForCalculation(form.workSessions)),
    [form.workSessions]
  );
  const totalHoursInput = form.usesHoursOverride ? form.totalHours : hoursInputValue(calculatedHours);
  const submittedHours = form.usesHoursOverride ? parseOptionalHours(form.totalHours) : calculatedHours;
  const overSummaryLimit = summaryWords > 100;

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      setLoadingHistory(true);
      try {
        const response = await fetch("/api/timesheets", { cache: "no-store" });
        const data = (await response.json()) as { entries?: TimesheetRecord[]; error?: string };

        if (!response.ok) {
          throw new Error(data.error ?? "Unable to load history.");
        }

        if (!cancelled) {
          setEntries(data.entries ?? []);
        }
      } catch (error) {
        if (!cancelled) {
          setNotice({
            tone: "error",
            message: error instanceof Error ? error.message : "Unable to load history."
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingHistory(false);
        }
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoadingProfile(true);
      try {
        const response = await fetch("/api/profile", { cache: "no-store" });
        const data = (await response.json()) as { profile?: UserProfileRecord; error?: string };

        if (!response.ok || !data.profile) {
          throw new Error(data.error ?? "Unable to load profile.");
        }

        if (!cancelled) {
          const nextProfile = profileFromRecord(data.profile);
          setProfile(nextProfile);
          setForm((current) => ({
            ...current,
            workforceEmail: current.workforceEmail || nextProfile.workforceEmail
          }));
        }
      } catch (error) {
        if (!cancelled) {
          setProfileNotice({
            tone: "error",
            message: error instanceof Error ? error.message : "Unable to load profile."
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingProfile(false);
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  }

  function updateWorkSession(index: number, key: keyof FormWorkSession, value: string) {
    setForm((current) => ({
      ...current,
      workSessions: current.workSessions.map((session, sessionIndex) =>
        sessionIndex === index ? { ...session, [key]: value } : session
      )
    }));
  }

  function addWorkSession() {
    setForm((current) => ({
      ...current,
      workSessions: [...current.workSessions, { startAt: "", endAt: "" }]
    }));
  }

  function removeWorkSession(index: number) {
    setForm((current) => {
      if (current.workSessions.length <= 1) {
        return current;
      }

      return {
        ...current,
        workSessions: current.workSessions.filter((_, sessionIndex) => sessionIndex !== index)
      };
    });
  }

  function updateTotalHours(value: string) {
    setForm((current) => ({
      ...current,
      totalHours: value,
      usesHoursOverride: true
    }));
  }

  function clearHoursOverride() {
    setForm((current) => ({
      ...current,
      totalHours: "",
      usesHoursOverride: false
    }));
  }

  function updateProfileField<K extends keyof ProfileState>(key: K, value: ProfileState[K]) {
    setProfile((current) => ({
      ...current,
      [key]: value
    }));
  }

  function setTurnCount(nextCount: number) {
    const count = Math.max(MIN_TURNS, nextCount);
    setForm((current) => {
      if (count === current.turns.length) {
        return current;
      }

      const turns =
        count > current.turns.length
          ? [...current.turns, ...Array.from({ length: count - current.turns.length }, () => DEFAULT_TASK_TYPE)]
          : current.turns.slice(0, count);

      return {
        ...current,
        turns
      };
    });
  }

  function setTurnType(index: number, taskType: TaskType) {
    setForm((current) => ({
      ...current,
      turns: current.turns.map((turn, turnIndex) => (turnIndex === index ? taskType : turn))
    }));
  }

  function resetForm() {
    setEditingId(null);
    setForm({
      ...emptyForm(),
      workforceEmail: profile.workforceEmail
    });
    setNotice(null);
  }

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true);
    setProfileNotice(null);

    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: profile.name,
          workforceEmail: profile.workforceEmail.trim().length > 0 ? profile.workforceEmail : null,
          discordId: profile.discordId.trim().length > 0 ? profile.discordId : null,
          hubstaffEmail: profile.hubstaffEmail.trim().length > 0 ? profile.hubstaffEmail : null
        })
      });
      const data = (await response.json()) as { profile?: UserProfileRecord; error?: string; issues?: string[] };

      if (!response.ok || !data.profile) {
        throw new Error(data.issues?.join(" ") || data.error || "Unable to save profile.");
      }

      const nextProfile = profileFromRecord(data.profile);
      setProfile(nextProfile);
      setForm((current) => ({
        ...current,
        workforceEmail: current.workforceEmail || nextProfile.workforceEmail
      }));
      setProfileNotice({
        tone: "success",
        message: "Profile saved."
      });
    } catch (error) {
      setProfileNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to save profile."
      });
    } finally {
      setSavingProfile(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);

    try {
      const response = await fetch(editingId ? `/api/timesheets/${editingId}` : "/api/timesheets", {
        method: editingId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(toPayload(form))
      });
      const data = (await response.json()) as { entry?: TimesheetRecord; error?: string; issues?: string[] };

      if (!response.ok || !data.entry) {
        throw new Error(data.issues?.join(" ") || data.error || "Unable to save timesheet.");
      }

      setEntries((current) => {
        const withoutCurrent = current.filter((entry) => entry.id !== data.entry?.id);
        return [data.entry as TimesheetRecord, ...withoutCurrent];
      });
      setNotice({
        tone: "success",
        message: editingId ? "Timesheet updated." : "Timesheet submitted."
      });
      setEditingId(null);
      setForm({
        ...emptyForm(),
        workforceEmail: profile.workforceEmail
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to save timesheet."
      });
    } finally {
      setSaving(false);
    }
  }

  function editEntry(entry: TimesheetRecord) {
    setEditingId(entry.id);
    setForm(formFromRecord(entry));
    setNotice({
      tone: "success",
      message: "Loaded entry for editing."
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-stone-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-fern text-white">
              <Clock3 aria-hidden="true" className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-ink">Live Compare Timesheet</h1>
              <p className="text-sm text-stone-600">Signed in as {userName}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdmin ? (
              <Link
                className="inline-flex h-10 w-fit items-center gap-2 rounded-lg bg-ink px-3 text-sm font-medium text-white transition hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-fern focus:ring-offset-2"
                href="/admin"
              >
                <ShieldCheck aria-hidden="true" className="h-4 w-4" />
                Admin portal
              </Link>
            ) : null}
            {debugMode ? (
              <span className="inline-flex h-10 w-fit items-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-sm font-medium text-amber-900">
                Debug auth bypass
              </span>
            ) : (
              <a
                className="inline-flex h-10 w-fit items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-fern focus:ring-offset-2"
                href="/auth/logout"
              >
                <LogOut aria-hidden="true" className="h-4 w-4" />
                Log out
              </a>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_25rem] lg:px-8">
        <section className="rounded-lg border border-stone-200 bg-white shadow-panel">
          <div className="border-b border-stone-200 px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-ink">{editingId ? "Edit timesheet" : "New timesheet"}</h2>
                <p className="text-sm text-stone-600">Capture problem details, turn work types, and timing.</p>
              </div>
              {editingId ? (
                <button
                  className="inline-flex h-10 w-fit items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-fern focus:ring-offset-2"
                  onClick={resetForm}
                  type="button"
                >
                  <RotateCcw aria-hidden="true" className="h-4 w-4" />
                  New entry
                </button>
              ) : null}
            </div>
          </div>

          <form className="space-y-6 px-5 py-5 sm:px-6" onSubmit={submit}>
            {notice ? (
              <div
                className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
                  notice.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-red-200 bg-red-50 text-red-900"
                }`}
                role="status"
              >
                {notice.tone === "success" ? (
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                ) : null}
                <span>{notice.message}</span>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-stone-700">Alignerr login email</span>
                <input
                  className="mt-1 h-11 w-full rounded-lg border-stone-200 bg-stone-50 text-sm text-stone-700 focus:border-stone-300 focus:ring-0"
                  readOnly
                  type="email"
                  value={loginEmail}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-stone-700">Google Workforce email</span>
                <input
                  className="mt-1 h-11 w-full rounded-lg border-stone-300 text-sm focus:border-fern focus:ring-fern"
                  onChange={(event) => updateField("workforceEmail", event.target.value)}
                  placeholder={WORKFORCE_EMAIL_PLACEHOLDER}
                  required
                  type="email"
                  value={form.workforceEmail}
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-stone-700">Live Compare problem ID</span>
                <input
                  className="mt-1 h-11 w-full rounded-lg border-stone-300 text-sm focus:border-fern focus:ring-fern"
                  onChange={(event) => updateField("liveCompareProblemId", event.target.value)}
                  required
                  type="text"
                  value={form.liveCompareProblemId}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-stone-700">Primary programming language</span>
                <input
                  className="mt-1 h-11 w-full rounded-lg border-stone-300 text-sm focus:border-fern focus:ring-fern"
                  onChange={(event) => updateField("primaryProgrammingLanguage", event.target.value)}
                  placeholder="TypeScript"
                  required
                  type="text"
                  value={form.primaryProgrammingLanguage}
                />
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-stone-700">Secondary programming languages</span>
              <input
                className="mt-1 h-11 w-full rounded-lg border-stone-300 text-sm focus:border-fern focus:ring-fern"
                onChange={(event) => updateField("secondaryProgrammingLanguages", event.target.value)}
                placeholder="Python, SQL"
                type="text"
                value={form.secondaryProgrammingLanguages}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-stone-700">Task URL</span>
              <input
                className="mt-1 h-11 w-full rounded-lg border-stone-300 text-sm focus:border-fern focus:ring-fern"
                onChange={(event) => updateField("taskUrl", event.target.value)}
                placeholder="https://"
                required
                type="url"
                value={form.taskUrl}
              />
            </label>

            <section className="rounded-lg border border-stone-200 bg-stone-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-ink">Work sessions</h3>
                  <p className="text-sm text-stone-600">
                    Add one row for each time you actively worked on this task. Gaps are excluded from the automatic total.
                  </p>
                </div>
                <span className="w-fit rounded-lg bg-white px-3 py-1 text-sm font-medium text-stone-700">
                  Auto: {formatHours(calculatedHours)} hours
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {form.workSessions.map((session, index) => (
                  <div className="rounded-lg border border-stone-200 bg-white p-3" key={index}>
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-xs font-semibold uppercase tracking-normal text-stone-500">
                        Session {index + 1}
                      </h4>
                      <button
                        className="inline-flex h-8 items-center rounded-lg border border-stone-300 px-2 text-xs font-medium text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-300"
                        disabled={form.workSessions.length <= 1}
                        onClick={() => removeWorkSession(index)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="block">
                        <span className="text-sm font-medium text-stone-700">Session {index + 1} start time</span>
                        <input
                          className="mt-1 h-11 w-full rounded-lg border-stone-300 text-sm focus:border-fern focus:ring-fern"
                          onChange={(event) => updateWorkSession(index, "startAt", event.target.value)}
                          required
                          type="datetime-local"
                          value={session.startAt}
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium text-stone-700">Session {index + 1} end time</span>
                        <input
                          className="mt-1 h-11 w-full rounded-lg border-stone-300 text-sm focus:border-fern focus:ring-fern"
                          onChange={(event) => updateWorkSession(index, "endAt", event.target.value)}
                          required
                          type="datetime-local"
                          value={session.endAt}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <button
                className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-fern focus:ring-offset-2"
                onClick={addWorkSession}
                type="button"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                Add work session
              </button>

              <div className="mt-4 grid gap-4 rounded-lg border border-stone-200 bg-white p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <label className="block">
                  <span className="text-sm font-medium text-stone-700">Total hours</span>
                  <input
                    className="mt-1 h-11 w-full rounded-lg border-stone-300 text-sm focus:border-fern focus:ring-fern"
                    min={0}
                    onChange={(event) => updateTotalHours(event.target.value)}
                    step="0.01"
                    type="number"
                    value={totalHoursInput}
                  />
                  <span className="mt-1 block text-xs leading-5 text-stone-600">
                    {form.usesHoursOverride
                      ? `Override active. Auto-calculated value is ${formatHours(calculatedHours)} hours.`
                      : "Auto-calculated from work sessions. Edit this field to override."}
                  </span>
                </label>
                <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
                  <span className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
                    Submitted: {formatHours(submittedHours ?? calculatedHours)} hours
                  </span>
                  {form.usesHoursOverride ? (
                    <button
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
                      onClick={clearHoursOverride}
                      type="button"
                    >
                      Clear override
                    </button>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-stone-200 bg-stone-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-ink">Turns</h3>
                  <p className="text-sm text-stone-600">Minimum 5 turns. Assign a task type to every turn.</p>
                </div>
                <div className="flex h-10 w-fit items-center overflow-hidden rounded-lg border border-stone-300 bg-white">
                  <button
                    aria-label="Decrease turns"
                    className="flex h-10 w-10 items-center justify-center text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-300"
                    disabled={form.turns.length <= MIN_TURNS}
                    onClick={() => setTurnCount(form.turns.length - 1)}
                    title="Decrease turns"
                    type="button"
                  >
                    <Minus aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <input
                    aria-label="Number of turns"
                    className="h-10 w-16 border-x border-y-0 border-stone-300 p-0 text-center text-sm font-semibold focus:ring-0"
                    min={MIN_TURNS}
                    onChange={(event) => setTurnCount(Number(event.target.value))}
                    type="number"
                    value={form.turns.length}
                  />
                  <button
                    aria-label="Increase turns"
                    className="flex h-10 w-10 items-center justify-center text-stone-700 transition hover:bg-stone-100"
                    onClick={() => setTurnCount(form.turns.length + 1)}
                    title="Increase turns"
                    type="button"
                  >
                    <Plus aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {form.turns.map((turn, index) => (
                  <label className="block rounded-lg border border-stone-200 bg-white p-3" key={`${index}-${turn}`}>
                    <span className="text-xs font-semibold uppercase tracking-normal text-stone-500">
                      Turn {index + 1}
                    </span>
                    <select
                      className="mt-2 h-10 w-full rounded-lg border-stone-300 text-sm focus:border-fern focus:ring-fern"
                      onChange={(event) => setTurnType(index, event.target.value as TaskType)}
                      value={turn}
                    >
                      {TASK_TYPES.map((taskType) => (
                        <option key={taskType} value={taskType}>
                          {taskType}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </section>

            <label className="block">
              <span className="flex items-center justify-between gap-3 text-sm font-medium text-stone-700">
                <span>In 100 words or less describe your task</span>
                <span className={overSummaryLimit ? "text-red-700" : "text-stone-500"}>{summaryWords}/100</span>
              </span>
              <textarea
                className="mt-1 min-h-28 w-full rounded-lg border-stone-300 text-sm focus:border-fern focus:ring-fern"
                onChange={(event) => updateField("summary", event.target.value)}
                required
                value={form.summary}
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-stone-700">Token usage</span>
                <input
                  className="mt-1 h-11 w-full rounded-lg border-stone-300 text-sm focus:border-fern focus:ring-fern"
                  min={0}
                  onChange={(event) => updateField("tokenUsage", event.target.value)}
                  type="number"
                  value={form.tokenUsage}
                />
              </label>

              <label className="flex h-full min-h-16 items-center gap-3 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3">
                <input
                  checked={form.blockedOnTaigaBug}
                  className="rounded border-stone-300 text-fern focus:ring-fern"
                  onChange={(event) => updateField("blockedOnTaigaBug", event.target.checked)}
                  type="checkbox"
                />
                <span className="text-sm font-medium text-stone-700">
                  Were you blocked on this task because of a Taiga error or bug?
                </span>
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-stone-700">Any comments</span>
              <textarea
                className="mt-1 min-h-24 w-full rounded-lg border-stone-300 text-sm focus:border-fern focus:ring-fern"
                onChange={(event) => updateField("comments", event.target.value)}
                value={form.comments}
              />
            </label>

            <div className="flex flex-col gap-3 border-t border-stone-200 pt-5 sm:flex-row sm:items-center sm:justify-end">
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-fern focus:ring-offset-2"
                onClick={resetForm}
                type="button"
              >
                <RotateCcw aria-hidden="true" className="h-4 w-4" />
                Reset
              </button>
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-fern px-4 text-sm font-medium text-white transition hover:bg-[#285f51] focus:outline-none focus:ring-2 focus:ring-fern focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-400"
                disabled={saving || overSummaryLimit}
                type="submit"
              >
                {saving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Save aria-hidden="true" className="h-4 w-4" />}
                {editingId ? "Update timesheet" : "Submit timesheet"}
              </button>
            </div>
          </form>
        </section>

        <aside className="space-y-6">
          <section className="rounded-lg border border-stone-200 bg-white shadow-panel">
            <div className="flex items-center gap-2 border-b border-stone-200 px-5 py-4">
              <UserRound aria-hidden="true" className="h-4 w-4 text-fern" />
              <h2 className="text-lg font-semibold text-ink">My Profile</h2>
            </div>
            <form className="space-y-4 px-4 py-4" onSubmit={submitProfile}>
              {profileNotice ? (
                <div
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    profileNotice.tone === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-red-200 bg-red-50 text-red-900"
                  }`}
                  role="status"
                >
                  {profileNotice.message}
                </div>
              ) : null}

              <label className="block">
                <span className="text-sm font-medium text-stone-700">Name</span>
                <input
                  className="mt-1 h-10 w-full rounded-lg border-stone-300 text-sm focus:border-fern focus:ring-fern"
                  disabled={loadingProfile}
                  onChange={(event) => updateProfileField("name", event.target.value)}
                  required
                  type="text"
                  value={profile.name}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-stone-700">Workforce email</span>
                <input
                  className="mt-1 h-10 w-full rounded-lg border-stone-300 text-sm focus:border-fern focus:ring-fern"
                  disabled={loadingProfile}
                  onChange={(event) => updateProfileField("workforceEmail", event.target.value)}
                  placeholder={WORKFORCE_EMAIL_PLACEHOLDER}
                  type="email"
                  value={profile.workforceEmail}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-stone-700">Discord ID</span>
                <input
                  className="mt-1 h-10 w-full rounded-lg border-stone-300 text-sm focus:border-fern focus:ring-fern"
                  disabled={loadingProfile}
                  onChange={(event) => updateProfileField("discordId", event.target.value)}
                  type="text"
                  value={profile.discordId}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-stone-700">Hubstaff email</span>
                <input
                  className="mt-1 h-10 w-full rounded-lg border-stone-300 text-sm focus:border-fern focus:ring-fern"
                  disabled={loadingProfile}
                  onChange={(event) => updateProfileField("hubstaffEmail", event.target.value)}
                  type="email"
                  value={profile.hubstaffEmail}
                />
              </label>

              <button
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-ink px-3 text-sm font-medium text-white transition hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-fern focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-400"
                disabled={savingProfile || loadingProfile}
                type="submit"
              >
                {savingProfile ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Save aria-hidden="true" className="h-4 w-4" />}
                Save profile
              </button>
            </form>
          </section>

          <section className="h-fit rounded-lg border border-stone-200 bg-white shadow-panel">
            <div className="flex items-center gap-2 border-b border-stone-200 px-5 py-4">
              <History aria-hidden="true" className="h-4 w-4 text-saffron" />
              <h2 className="text-lg font-semibold text-ink">My history</h2>
            </div>
            <div className="max-h-[calc(100vh-25rem)] space-y-3 overflow-auto px-4 py-4">
            {loadingHistory ? (
              <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                Loading history
              </div>
            ) : null}

            {!loadingHistory && entries.length === 0 ? (
              <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-4 text-sm leading-6 text-stone-600">
                No submissions yet.
              </div>
            ) : null}

            {entries.map((entry) => (
              <article
                className={`rounded-lg border p-4 ${
                  editingId === entry.id ? "border-fern bg-emerald-50" : "border-stone-200 bg-white"
                }`}
                key={entry.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-ink">{entry.liveCompareProblemId}</h3>
                    <p className="mt-1 text-xs leading-5 text-stone-600">{formatDateRange(entry.startAt, entry.endAt)}</p>
                  </div>
                  <button
                    aria-label={`Edit ${entry.liveCompareProblemId}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-700 transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-fern focus:ring-offset-2"
                    onClick={() => editEntry(entry)}
                    title="Edit entry"
                    type="button"
                  >
                    <SquarePen aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-stone-700">{entry.summary}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-600">
                  <span className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-900">
                    {entry.primaryProgrammingLanguage}
                  </span>
                  {entry.secondaryProgrammingLanguages ? (
                    <span className="rounded-lg bg-stone-100 px-2 py-1">{entry.secondaryProgrammingLanguages}</span>
                  ) : null}
                  <span className="rounded-lg bg-stone-100 px-2 py-1">{entry.turns.length} turns</span>
                  <span className="rounded-lg bg-stone-100 px-2 py-1">
                    {formatHours(entry.reportedHours)} hours{entry.totalHoursOverride !== null ? " (override)" : ""}
                  </span>
                  {entry.tokenUsage !== null ? (
                    <span className="rounded-lg bg-stone-100 px-2 py-1">{entry.tokenUsage.toLocaleString()} tokens</span>
                  ) : null}
                  {entry.blockedOnTaigaBug ? <span className="rounded-lg bg-amber-100 px-2 py-1 text-amber-900">Taiga blocked</span> : null}
                </div>
              </article>
            ))}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
