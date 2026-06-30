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
  Trash2,
  UserRound
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { dateTimeLocalToIso } from "@/lib/date-times";
import { TASK_TYPES, type TaskType } from "@/lib/task-types";
import type { TimesheetInput, TimesheetRecord, UserProfileRecord } from "@/lib/types";
import { countWords } from "@/lib/validation";
import { calculateWorkSessionHours } from "@/lib/work-sessions";

type FormWorkSession = {
  startAt: string;
  endAt: string;
};

type FormProblem = {
  primaryProgrammingLanguage: string;
  secondaryProgrammingLanguages: string;
  liveCompareProblemId: string;
  taskUrl: string;
  summary: string;
  comments: string;
  tokenUsage: string;
  blockedOnTaigaBug: boolean;
  turns: TaskType[];
};

type FormState = {
  clientSubmissionId: string;
  workforceEmail: string;
  workSessions: FormWorkSession[];
  totalHours: string;
  usesHoursOverride: boolean;
  problems: FormProblem[];
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
const DRAFT_STORAGE_VERSION = 1;
const DRAFT_STORAGE_PREFIX = "taiga-timesheet-draft";

function newClientSubmissionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const randomHex = () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");
  return `${randomHex()}${randomHex()}-${randomHex()}-4${randomHex().slice(1)}-8${randomHex().slice(1)}-${randomHex()}${randomHex()}${randomHex()}`;
}

function emptyProblem(): FormProblem {
  return {
    primaryProgrammingLanguage: "",
    secondaryProgrammingLanguages: "",
    liveCompareProblemId: "",
    taskUrl: "",
    summary: "",
    comments: "",
    tokenUsage: "",
    blockedOnTaigaBug: false,
    turns: Array.from({ length: MIN_TURNS }, () => DEFAULT_TASK_TYPE)
  };
}

function emptyForm(clientSubmissionId?: string): FormState {
  return {
    clientSubmissionId: clientSubmissionId ?? newClientSubmissionId(),
    workforceEmail: "",
    workSessions: [{ startAt: "", endAt: "" }],
    totalHours: "",
    usesHoursOverride: false,
    problems: [emptyProblem()]
  };
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

function formatProblemLabel(problem: Pick<FormProblem, "liveCompareProblemId">, index: number) {
  return problem.liveCompareProblemId.trim() || `Problem ${index + 1}`;
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
    clientSubmissionId: form.clientSubmissionId,
    workforceEmail: form.workforceEmail,
    workSessions: form.workSessions.map((session, index) => ({
      sessionNumber: index + 1,
      startAt: dateTimeLocalToIso(session.startAt),
      endAt: dateTimeLocalToIso(session.endAt)
    })),
    totalHoursMode: form.usesHoursOverride ? "override" : "calculated",
    totalHoursOverride: form.usesHoursOverride ? parseOptionalHours(form.totalHours) : null,
    problems: form.problems.map((problem) => ({
      primaryProgrammingLanguage: problem.primaryProgrammingLanguage,
      secondaryProgrammingLanguages:
        problem.secondaryProgrammingLanguages.trim().length > 0 ? problem.secondaryProgrammingLanguages : null,
      liveCompareProblemId: problem.liveCompareProblemId,
      taskUrl: problem.taskUrl,
      summary: problem.summary,
      comments: problem.comments.trim().length > 0 ? problem.comments : null,
      tokenUsage: Number(problem.tokenUsage),
      blockedOnTaigaBug: problem.blockedOnTaigaBug,
      turns: problem.turns.map((taskType, index) => ({
        turnNumber: index + 1,
        taskType
      }))
    }))
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeDraftForm(value: unknown): FormState | null {
  const candidate = isRecord(value) && isRecord(value.form) ? value.form : value;

  if (!isRecord(candidate)) {
    return null;
  }

  const workSessions = Array.isArray(candidate.workSessions)
    ? candidate.workSessions
        .filter(isRecord)
        .map((session) => ({
          startAt: normalizeString(session.startAt),
          endAt: normalizeString(session.endAt)
        }))
    : [];

  const problems = Array.isArray(candidate.problems)
    ? candidate.problems.filter(isRecord).map((problem) => {
        const turns = Array.isArray(problem.turns)
          ? problem.turns
              .filter((turn): turn is TaskType => typeof turn === "string" && TASK_TYPES.includes(turn as TaskType))
          : [];

        return {
          primaryProgrammingLanguage: normalizeString(problem.primaryProgrammingLanguage),
          secondaryProgrammingLanguages: normalizeString(problem.secondaryProgrammingLanguages),
          liveCompareProblemId: normalizeString(problem.liveCompareProblemId),
          taskUrl: normalizeString(problem.taskUrl),
          summary: normalizeString(problem.summary),
          comments: normalizeString(problem.comments),
          tokenUsage: normalizeString(problem.tokenUsage),
          blockedOnTaigaBug: typeof problem.blockedOnTaigaBug === "boolean" ? problem.blockedOnTaigaBug : false,
          turns: turns.length > 0 ? turns : Array.from({ length: MIN_TURNS }, () => DEFAULT_TASK_TYPE)
        };
      })
    : [];

  return {
    clientSubmissionId:
      typeof candidate.clientSubmissionId === "string" && candidate.clientSubmissionId.trim().length > 0
        ? candidate.clientSubmissionId
        : newClientSubmissionId(),
    workforceEmail: normalizeString(candidate.workforceEmail),
    workSessions: workSessions.length > 0 ? workSessions : [{ startAt: "", endAt: "" }],
    totalHours: normalizeString(candidate.totalHours),
    usesHoursOverride: typeof candidate.usesHoursOverride === "boolean" ? candidate.usesHoursOverride : false,
    problems: problems.length > 0 ? problems : [emptyProblem()]
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

function problemIds(record: TimesheetRecord) {
  return record.problems.map((problem) => problem.liveCompareProblemId).join(", ");
}

function totalTurns(record: TimesheetRecord) {
  return record.problems.reduce((sum, problem) => sum + problem.turns.length, 0);
}

function totalTokens(record: TimesheetRecord) {
  return record.problems.reduce((sum, problem) => sum + (problem.tokenUsage ?? 0), 0);
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
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitAcknowledged, setSubmitAcknowledged] = useState(false);
  const [submitMayHaveSucceeded, setSubmitMayHaveSucceeded] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [profileNotice, setProfileNotice] = useState<Notice | null>(null);
  const draftStorageKey = useMemo(
    () => `${DRAFT_STORAGE_PREFIX}:${loginEmail || "anonymous"}`,
    [loginEmail]
  );

  const problemWordCounts = useMemo(() => form.problems.map((problem) => countWords(problem.summary)), [form.problems]);
  const overSummaryLimit = problemWordCounts.some((words) => words > 100);
  const calculatedHours = useMemo(
    () => calculateWorkSessionHours(workSessionsForCalculation(form.workSessions)),
    [form.workSessions]
  );
  const totalHoursInput = form.usesHoursOverride ? form.totalHours : hoursInputValue(calculatedHours);
  const submittedHours = form.usesHoursOverride ? parseOptionalHours(form.totalHours) : calculatedHours;
  const hoursOverrideError =
    form.usesHoursOverride && parseOptionalHours(form.totalHours) === null
      ? "Enter a total hours override or clear the override."
      : null;

  useEffect(() => {
    try {
      const savedDraft = window.localStorage.getItem(draftStorageKey);

      if (!savedDraft) {
        return;
      }

      const restoredForm = normalizeDraftForm(JSON.parse(savedDraft));

      if (!restoredForm) {
        window.localStorage.removeItem(draftStorageKey);
        return;
      }

      const restoreTimeout = window.setTimeout(() => {
        setForm(restoredForm);
        setNotice({
          tone: "success",
          message: "Saved progress restored from this browser."
        });
      }, 0);

      return () => {
        window.clearTimeout(restoreTimeout);
      };
    } catch {
      window.localStorage.removeItem(draftStorageKey);
    }
  }, [draftStorageKey]);

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

  function updateProblem<K extends keyof FormProblem>(problemIndex: number, key: K, value: FormProblem[K]) {
    setForm((current) => ({
      ...current,
      problems: current.problems.map((problem, index) => (index === problemIndex ? { ...problem, [key]: value } : problem))
    }));
  }

  function addProblem() {
    setForm((current) => ({
      ...current,
      problems: [...current.problems, emptyProblem()]
    }));
  }

  function removeProblem(index: number) {
    setForm((current) => {
      if (current.problems.length <= 1) {
        return current;
      }

      return {
        ...current,
        problems: current.problems.filter((_, problemIndex) => problemIndex !== index)
      };
    });
  }

  function setTurnCount(problemIndex: number, nextCount: number) {
    const count = Math.max(MIN_TURNS, nextCount);
    setForm((current) => ({
      ...current,
      problems: current.problems.map((problem, index) => {
        if (index !== problemIndex || count === problem.turns.length) {
          return problem;
        }

        const turns =
          count > problem.turns.length
            ? [...problem.turns, ...Array.from({ length: count - problem.turns.length }, () => DEFAULT_TASK_TYPE)]
            : problem.turns.slice(0, count);

        return {
          ...problem,
          turns
        };
      })
    }));
  }

  function setTurnType(problemIndex: number, turnIndex: number, taskType: TaskType) {
    setForm((current) => ({
      ...current,
      problems: current.problems.map((problem, index) =>
        index === problemIndex
          ? {
              ...problem,
              turns: problem.turns.map((turn, currentTurnIndex) => (currentTurnIndex === turnIndex ? taskType : turn))
            }
          : problem
      )
    }));
  }

  function updateProfileField<K extends keyof ProfileState>(key: K, value: ProfileState[K]) {
    setProfile((current) => ({
      ...current,
      [key]: value
    }));
  }

  function clearSavedDraft() {
    try {
      window.localStorage.removeItem(draftStorageKey);
    } catch {
      // localStorage can be unavailable in private browsing or locked-down environments.
    }
  }

  function saveDraft() {
    try {
      window.localStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          version: DRAFT_STORAGE_VERSION,
          savedAt: new Date().toISOString(),
          form
        })
      );
      setNotice({
        tone: "success",
        message: "Progress saved to this browser."
      });
    } catch {
      setNotice({
        tone: "error",
        message: "Unable to save progress in this browser."
      });
    }
  }

  function resetForm() {
    clearSavedDraft();
    setForm((current) => ({
      ...emptyForm(submitMayHaveSucceeded ? current.clientSubmissionId : undefined),
      workforceEmail: profile.workforceEmail
    }));
    setNotice({
      tone: submitMayHaveSucceeded ? "error" : "success",
      message: submitMayHaveSucceeded
        ? "Form reset, but this submission ID was kept because the previous submit may have succeeded. Re-enter the same work and submit again to avoid duplicates."
        : "Form reset."
    });
    setSubmitConfirmOpen(false);
    setSubmitAcknowledged(false);
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

    if (hoursOverrideError) {
      setNotice({
        tone: "error",
        message: hoursOverrideError
      });
      return;
    }

    setSubmitAcknowledged(false);
    setSubmitConfirmOpen(true);
  }

  async function confirmSubmit() {
    if (!submitAcknowledged) {
      return;
    }

    if (hoursOverrideError) {
      setNotice({
        tone: "error",
        message: hoursOverrideError
      });
      setSubmitConfirmOpen(false);
      return;
    }

    setSaving(true);
    setNotice(null);
    setSubmitConfirmOpen(false);

    let receivedResponse = false;
    let failureMayHaveSucceeded = false;

    try {
      const response = await fetch("/api/timesheets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(toPayload(form))
      });
      receivedResponse = true;
      const data = (await response.json()) as { entry?: TimesheetRecord; error?: string; issues?: string[] };

      if (!response.ok || !data.entry) {
        failureMayHaveSucceeded = response.status >= 500;
        throw new Error(data.issues?.join(" ") || data.error || "Unable to save timesheet.");
      }

      setEntries((current) => {
        const withoutCurrent = current.filter((entry) => entry.id !== data.entry?.id);
        return [data.entry as TimesheetRecord, ...withoutCurrent];
      });
      setNotice({
        tone: "success",
        message: "Timesheet submitted."
      });
      setSubmitMayHaveSucceeded(false);
      clearSavedDraft();
      setForm({
        ...emptyForm(),
        workforceEmail: profile.workforceEmail
      });
    } catch (error) {
      failureMayHaveSucceeded ||= !receivedResponse;
      setSubmitMayHaveSucceeded((current) => current || failureMayHaveSucceeded);
      const message = error instanceof Error ? error.message : "Unable to save timesheet.";
      setNotice({
        tone: "error",
        message: failureMayHaveSucceeded
          ? `${message} The request may still have reached the server; retry submit with this same form before starting a new timesheet.`
          : message
      });
    } finally {
      setSaving(false);
    }
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
                <h2 className="text-lg font-semibold text-ink">New work session</h2>
                <p className="text-sm text-stone-600">
                  Log the hours once, then add every Live Compare problem you worked on during that time.
                </p>
              </div>
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

            <section className="rounded-lg border border-stone-200 bg-stone-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-ink">Work sessions</h3>
                  <p className="text-sm text-stone-600">
                    Add one row for each active work period. These hours are paid once, even when multiple problems are logged below.
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
                    aria-describedby={hoursOverrideError ? "total-hours-error" : undefined}
                    aria-invalid={Boolean(hoursOverrideError)}
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
                  {hoursOverrideError ? (
                    <span className="mt-1 block text-xs font-medium text-red-700" id="total-hours-error">
                      {hoursOverrideError}
                    </span>
                  ) : null}
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

            <section className="space-y-4">
              <div className="flex flex-col gap-3 rounded-lg border border-stone-200 bg-stone-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-ink">Problems worked in this session</h3>
                  <p className="text-sm text-stone-600">
                    Add every problem you touched. The same session hours apply to the whole group and are not split.
                  </p>
                </div>
                <button
                  className="inline-flex h-10 w-fit items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-fern focus:ring-offset-2"
                  onClick={addProblem}
                  type="button"
                >
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  Add another problem
                </button>
              </div>

              {form.problems.map((problem, problemIndex) => {
                const summaryWords = problemWordCounts[problemIndex] ?? 0;
                const problemLabel = formatProblemLabel(problem, problemIndex);

                return (
                  <article className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm" key={problemIndex}>
                    <div className="flex flex-col gap-3 border-b border-stone-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-base font-semibold text-ink">{problemLabel}</h4>
                        <p className="text-sm text-stone-600">Problem {problemIndex + 1} details and turn categories.</p>
                      </div>
                      <button
                        className="inline-flex h-9 w-fit items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-300"
                        disabled={form.problems.length <= 1}
                        onClick={() => removeProblem(problemIndex)}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                        Remove problem
                      </button>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="text-sm font-medium text-stone-700">Live Compare problem ID</span>
                        <input
                          aria-label={`Problem ${problemIndex + 1} Live Compare problem ID`}
                          className="mt-1 h-11 w-full rounded-lg border-stone-300 text-sm focus:border-fern focus:ring-fern"
                          onChange={(event) => updateProblem(problemIndex, "liveCompareProblemId", event.target.value)}
                          required
                          type="text"
                          value={problem.liveCompareProblemId}
                        />
                      </label>

                      <label className="block">
                        <span className="text-sm font-medium text-stone-700">Primary programming language</span>
                        <input
                          aria-label={`Problem ${problemIndex + 1} Primary programming language`}
                          className="mt-1 h-11 w-full rounded-lg border-stone-300 text-sm focus:border-fern focus:ring-fern"
                          onChange={(event) => updateProblem(problemIndex, "primaryProgrammingLanguage", event.target.value)}
                          placeholder="TypeScript"
                          required
                          type="text"
                          value={problem.primaryProgrammingLanguage}
                        />
                      </label>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="text-sm font-medium text-stone-700">Secondary programming languages</span>
                        <input
                          aria-label={`Problem ${problemIndex + 1} Secondary programming languages`}
                          className="mt-1 h-11 w-full rounded-lg border-stone-300 text-sm focus:border-fern focus:ring-fern"
                          onChange={(event) => updateProblem(problemIndex, "secondaryProgrammingLanguages", event.target.value)}
                          placeholder="Python, SQL"
                          type="text"
                          value={problem.secondaryProgrammingLanguages}
                        />
                      </label>

                      <label className="block">
                        <span className="text-sm font-medium text-stone-700">Task URL</span>
                        <input
                          aria-label={`Problem ${problemIndex + 1} Task URL`}
                          className="mt-1 h-11 w-full rounded-lg border-stone-300 text-sm focus:border-fern focus:ring-fern"
                          onChange={(event) => updateProblem(problemIndex, "taskUrl", event.target.value)}
                          placeholder="https://"
                          required
                          type="url"
                          value={problem.taskUrl}
                        />
                      </label>
                    </div>

                    <section className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h5 className="text-sm font-semibold text-ink">Turns</h5>
                          <p className="text-sm text-stone-600">Minimum 5 turns. Assign a task type to every turn.</p>
                        </div>
                        <div className="flex h-10 w-fit items-center overflow-hidden rounded-lg border border-stone-300 bg-white">
                          <button
                            aria-label={`Decrease turns for problem ${problemIndex + 1}`}
                            className="flex h-10 w-10 items-center justify-center text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-300"
                            disabled={problem.turns.length <= MIN_TURNS}
                            onClick={() => setTurnCount(problemIndex, problem.turns.length - 1)}
                            title="Decrease turns"
                            type="button"
                          >
                            <Minus aria-hidden="true" className="h-4 w-4" />
                          </button>
                          <input
                            aria-label={`Number of turns for problem ${problemIndex + 1}`}
                            className="h-10 w-16 border-x border-y-0 border-stone-300 p-0 text-center text-sm font-semibold focus:ring-0"
                            min={MIN_TURNS}
                            onChange={(event) => setTurnCount(problemIndex, Number(event.target.value))}
                            type="number"
                            value={problem.turns.length}
                          />
                          <button
                            aria-label={`Increase turns for problem ${problemIndex + 1}`}
                            className="flex h-10 w-10 items-center justify-center text-stone-700 transition hover:bg-stone-100"
                            onClick={() => setTurnCount(problemIndex, problem.turns.length + 1)}
                            title="Increase turns"
                            type="button"
                          >
                            <Plus aria-hidden="true" className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {problem.turns.map((turn, turnIndex) => (
                          <label className="block rounded-lg border border-stone-200 bg-white p-3" key={`${turnIndex}-${turn}`}>
                            <span className="text-xs font-semibold uppercase tracking-normal text-stone-500">
                              Turn {turnIndex + 1}
                            </span>
                            <select
                              aria-label={`Problem ${problemIndex + 1} turn ${turnIndex + 1} task type`}
                              className="mt-2 h-10 w-full rounded-lg border-stone-300 text-sm focus:border-fern focus:ring-fern"
                              onChange={(event) => setTurnType(problemIndex, turnIndex, event.target.value as TaskType)}
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

                    <label className="mt-4 block">
                      <span className="flex items-center justify-between gap-3 text-sm font-medium text-stone-700">
                        <span>In 100 words or less describe this problem work</span>
                        <span className={summaryWords > 100 ? "text-red-700" : "text-stone-500"}>{summaryWords}/100</span>
                      </span>
                      <textarea
                        aria-label={`Problem ${problemIndex + 1} task description`}
                        className="mt-1 min-h-28 w-full rounded-lg border-stone-300 text-sm focus:border-fern focus:ring-fern"
                        onChange={(event) => updateProblem(problemIndex, "summary", event.target.value)}
                        required
                        value={problem.summary}
                      />
                    </label>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="text-sm font-medium text-stone-700">Token usage</span>
                        <input
                          aria-label={`Problem ${problemIndex + 1} Token usage`}
                          className="mt-1 h-11 w-full rounded-lg border-stone-300 text-sm focus:border-fern focus:ring-fern"
                          min={0}
                          onChange={(event) => updateProblem(problemIndex, "tokenUsage", event.target.value)}
                          required
                          type="number"
                          value={problem.tokenUsage}
                        />
                      </label>

                      <label className="flex h-full min-h-16 items-center gap-3 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3">
                        <input
                          aria-label={`Problem ${problemIndex + 1} blocked on Taiga bug`}
                          checked={problem.blockedOnTaigaBug}
                          className="rounded border-stone-300 text-fern focus:ring-fern"
                          onChange={(event) => updateProblem(problemIndex, "blockedOnTaigaBug", event.target.checked)}
                          type="checkbox"
                        />
                        <span className="text-sm font-medium text-stone-700">
                          Were you blocked on this problem because of a Taiga error or bug?
                        </span>
                      </label>
                    </div>

                    <label className="mt-4 block">
                      <span className="text-sm font-medium text-stone-700">Any comments</span>
                      <textarea
                        aria-label={`Problem ${problemIndex + 1} comments`}
                        className="mt-1 min-h-24 w-full rounded-lg border-stone-300 text-sm focus:border-fern focus:ring-fern"
                        onChange={(event) => updateProblem(problemIndex, "comments", event.target.value)}
                        value={problem.comments}
                      />
                    </label>
                  </article>
                );
              })}
            </section>

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
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-fern bg-white px-4 text-sm font-medium text-fern transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-fern focus:ring-offset-2"
                onClick={saveDraft}
                type="button"
              >
                <Save aria-hidden="true" className="h-4 w-4" />
                Save
              </button>
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-fern px-4 text-sm font-medium text-white transition hover:bg-[#285f51] focus:outline-none focus:ring-2 focus:ring-fern focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-400"
                disabled={saving || overSummaryLimit || Boolean(hoursOverrideError)}
                type="submit"
              >
                {saving ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                )}
                Submit timesheet
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
                {savingProfile ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <Save aria-hidden="true" className="h-4 w-4" />
                )}
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
                  className="rounded-lg border border-stone-200 bg-white p-4"
                  key={entry.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-ink">{problemIds(entry) || "Work session"}</h3>
                      <p className="mt-1 text-xs leading-5 text-stone-600">{formatDateRange(entry.startAt, entry.endAt)}</p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-stone-100 px-2 py-1 text-xs font-medium text-stone-700">
                      Submitted
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-stone-700">
                    {entry.problems.map((problem) => problem.summary).join(" ")}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-600">
                    <span className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-900">
                      {entry.problemCount} {entry.problemCount === 1 ? "problem" : "problems"}
                    </span>
                    <span className="rounded-lg bg-stone-100 px-2 py-1">{totalTurns(entry)} turns</span>
                    <span className="rounded-lg bg-stone-100 px-2 py-1">
                      {formatHours(entry.reportedHours)} hours{entry.totalHoursOverride !== null ? " (override)" : ""}
                    </span>
                    <span className="rounded-lg bg-stone-100 px-2 py-1">{totalTokens(entry).toLocaleString()} tokens</span>
                    {entry.problems.some((problem) => problem.blockedOnTaigaBug) ? (
                      <span className="rounded-lg bg-amber-100 px-2 py-1 text-amber-900">Taiga blocked</span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>
      {submitConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 px-4 py-6">
          <section
            aria-labelledby="submit-confirm-title"
            aria-modal="true"
            className="w-full max-w-lg rounded-xl border border-stone-200 bg-white p-5 shadow-panel"
            role="dialog"
          >
            <h2 className="text-lg font-semibold text-ink" id="submit-confirm-title">
              Submit and lock this timesheet?
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-700">
              Once this timesheet is submitted, this record can no longer be edited. Please review the reported hours,
              problems, turns, and comments before continuing.
            </p>
            <label className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <input
                checked={submitAcknowledged}
                className="mt-1 rounded border-stone-300 text-fern focus:ring-fern"
                onChange={(event) => setSubmitAcknowledged(event.target.checked)}
                type="checkbox"
              />
              <span className="text-sm leading-6 text-amber-950">
                I acknowledge this timesheet will be locked after submission and guarantee that all hours reported here
                are correct.
              </span>
            </label>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="inline-flex h-10 items-center justify-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-fern focus:ring-offset-2"
                onClick={() => setSubmitConfirmOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-fern px-4 text-sm font-medium text-white transition hover:bg-[#285f51] focus:outline-none focus:ring-2 focus:ring-fern focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-400"
                disabled={!submitAcknowledged || saving}
                onClick={confirmSubmit}
                type="button"
              >
                Submit and lock timesheet
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
