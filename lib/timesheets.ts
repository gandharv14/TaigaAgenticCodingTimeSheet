import { isDebugAuthBypassEnabled } from "@/lib/auth0";
import { userOwnsEntry } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { TaskType } from "@/lib/task-types";
import type { AdminTimesheetRecord, TimesheetInput, TimesheetRecord } from "@/lib/types";
import { calculateWorkSessionHours, deriveSessionBounds, reportedHours } from "@/lib/work-sessions";

type EntryRow = {
  id: string;
  auth0_user_id?: string;
  auth0_email: string | null;
  workforce_email: string;
  primary_programming_language?: string | null;
  secondary_programming_languages?: string | null;
  live_compare_problem_id: string;
  task_url: string;
  start_at: string;
  end_at: string;
  total_hours_override?: number | string | null;
  summary: string;
  comments: string | null;
  token_usage: number | null;
  blocked_on_taiga_bug: boolean;
  created_at: string;
  updated_at: string;
  timesheet_turns?: TurnRow[];
  timesheet_work_sessions?: WorkSessionRow[];
};

type TurnRow = {
  turn_number: number;
  task_type: TaskType;
};

type WorkSessionRow = {
  session_number: number;
  start_at: string;
  end_at: string;
};

type OwnershipRow = {
  id: string;
  auth0_user_id: string;
};

type DebugRecord = TimesheetRecord & {
  auth0UserId: string;
};

const debugRecords: DebugRecord[] = [];
const ADMIN_PAGE_SIZE = 1000;
const USER_SELECT =
  "id, auth0_email, workforce_email, primary_programming_language, secondary_programming_languages, live_compare_problem_id, task_url, start_at, end_at, total_hours_override, summary, comments, token_usage, blocked_on_taiga_bug, created_at, updated_at, timesheet_turns(turn_number, task_type), timesheet_work_sessions(session_number, start_at, end_at)";
const ADMIN_SELECT =
  "id, auth0_user_id, auth0_email, workforce_email, primary_programming_language, secondary_programming_languages, live_compare_problem_id, task_url, start_at, end_at, total_hours_override, summary, comments, token_usage, blocked_on_taiga_bug, created_at, updated_at, timesheet_turns(turn_number, task_type), timesheet_work_sessions(session_number, start_at, end_at)";

function nullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function workSessionsFromRow(row: EntryRow) {
  const sessions = [...(row.timesheet_work_sessions ?? [])]
    .sort((a, b) => a.session_number - b.session_number)
    .map((session) => ({
      sessionNumber: session.session_number,
      startAt: session.start_at,
      endAt: session.end_at
    }));

  if (sessions.length > 0) {
    return sessions;
  }

  return [
    {
      sessionNumber: 1,
      startAt: row.start_at,
      endAt: row.end_at
    }
  ];
}

function normalizedInputSessions(input: TimesheetInput) {
  return input.workSessions.map((session) => ({
    sessionNumber: session.sessionNumber,
    startAt: new Date(session.startAt).toISOString(),
    endAt: new Date(session.endAt).toISOString()
  }));
}

function toPublicDebugRecord(record: DebugRecord): TimesheetRecord {
  return {
    id: record.id,
    auth0Email: record.auth0Email,
    workforceEmail: record.workforceEmail,
    primaryProgrammingLanguage: record.primaryProgrammingLanguage,
    secondaryProgrammingLanguages: record.secondaryProgrammingLanguages,
    liveCompareProblemId: record.liveCompareProblemId,
    taskUrl: record.taskUrl,
    workSessions: record.workSessions,
    totalHoursOverride: record.totalHoursOverride,
    startAt: record.startAt,
    endAt: record.endAt,
    calculatedHours: record.calculatedHours,
    reportedHours: record.reportedHours,
    summary: record.summary,
    comments: record.comments,
    tokenUsage: record.tokenUsage,
    blockedOnTaigaBug: record.blockedOnTaigaBug,
    turns: record.turns,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function toPublicAdminDebugRecord(record: DebugRecord): AdminTimesheetRecord {
  return {
    ...toPublicDebugRecord(record),
    auth0UserId: record.auth0UserId
  };
}

function toRecord(row: EntryRow): TimesheetRecord {
  const workSessions = workSessionsFromRow(row);
  const calculatedHours = calculateWorkSessionHours(workSessions);
  const totalHoursOverride = nullableNumber(row.total_hours_override);

  return {
    id: row.id,
    auth0Email: row.auth0_email,
    workforceEmail: row.workforce_email,
    primaryProgrammingLanguage: row.primary_programming_language ?? "Not specified",
    secondaryProgrammingLanguages: row.secondary_programming_languages ?? null,
    liveCompareProblemId: row.live_compare_problem_id,
    taskUrl: row.task_url,
    workSessions,
    totalHoursOverride,
    startAt: row.start_at,
    endAt: row.end_at,
    calculatedHours,
    reportedHours: reportedHours(calculatedHours, totalHoursOverride),
    summary: row.summary,
    comments: row.comments,
    tokenUsage: row.token_usage,
    blockedOnTaigaBug: row.blocked_on_taiga_bug,
    turns: [...(row.timesheet_turns ?? [])]
      .sort((a, b) => a.turn_number - b.turn_number)
      .map((turn) => ({
        turnNumber: turn.turn_number,
        taskType: turn.task_type
      })),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toAdminRecord(row: EntryRow): AdminTimesheetRecord {
  return {
    ...toRecord(row),
    auth0UserId: row.auth0_user_id ?? ""
  };
}

function entryPayload(input: TimesheetInput, auth0UserId: string, auth0Email: string | null) {
  const workSessions = normalizedInputSessions(input);
  const { startAt, endAt } = deriveSessionBounds(workSessions);

  return {
    auth0_user_id: auth0UserId,
    auth0_email: auth0Email,
    workforce_email: input.workforceEmail,
    primary_programming_language: input.primaryProgrammingLanguage,
    secondary_programming_languages: input.secondaryProgrammingLanguages,
    live_compare_problem_id: input.liveCompareProblemId,
    task_url: input.taskUrl,
    start_at: startAt,
    end_at: endAt,
    total_hours_override: input.totalHoursOverride,
    summary: input.summary,
    comments: input.comments,
    token_usage: input.tokenUsage,
    blocked_on_taiga_bug: input.blockedOnTaigaBug
  };
}

export async function listTimesheetsForUser(auth0UserId: string) {
  if (isDebugAuthBypassEnabled()) {
    return debugRecords
      .filter((record) => record.auth0UserId === auth0UserId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map(toPublicDebugRecord);
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("timesheet_entries")
    .select(USER_SELECT)
    .eq("auth0_user_id", auth0UserId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data as EntryRow[]).map(toRecord);
}

export async function listAllTimesheets() {
  if (isDebugAuthBypassEnabled()) {
    return [...debugRecords]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map(toPublicAdminDebugRecord);
  }

  const supabase = getSupabaseAdmin();
  const rows: EntryRow[] = [];

  for (let from = 0; ; from += ADMIN_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("timesheet_entries")
      .select(ADMIN_SELECT)
      .order("created_at", { ascending: false })
      .range(from, from + ADMIN_PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const page = (data as EntryRow[]) ?? [];
    rows.push(...page);

    if (page.length < ADMIN_PAGE_SIZE) {
      break;
    }
  }

  return rows.map(toAdminRecord);
}

export function clearDebugTimesheets() {
  if (!isDebugAuthBypassEnabled()) {
    return 0;
  }

  const count = debugRecords.length;
  debugRecords.length = 0;
  return count;
}

export async function getTimesheetForUser(id: string, auth0UserId: string) {
  if (isDebugAuthBypassEnabled()) {
    const record = debugRecords.find((entry) => entry.id === id && entry.auth0UserId === auth0UserId);

    if (!record) {
      throw new Error("Timesheet not found.");
    }

    return toPublicDebugRecord(record);
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("timesheet_entries")
    .select(USER_SELECT)
    .eq("id", id)
    .eq("auth0_user_id", auth0UserId)
    .single();

  if (error) {
    throw error;
  }

  return toRecord(data as EntryRow);
}

export async function createTimesheet(input: TimesheetInput, auth0UserId: string, auth0Email: string | null) {
  if (isDebugAuthBypassEnabled()) {
    const now = new Date().toISOString();
    const workSessions = normalizedInputSessions(input);
    const { startAt, endAt } = deriveSessionBounds(workSessions);
    const calculatedHours = calculateWorkSessionHours(workSessions);
    const record: DebugRecord = {
      id: crypto.randomUUID(),
      auth0UserId,
      auth0Email,
      workforceEmail: input.workforceEmail,
      primaryProgrammingLanguage: input.primaryProgrammingLanguage,
      secondaryProgrammingLanguages: input.secondaryProgrammingLanguages,
      liveCompareProblemId: input.liveCompareProblemId,
      taskUrl: input.taskUrl,
      workSessions,
      totalHoursOverride: input.totalHoursOverride,
      startAt,
      endAt,
      calculatedHours,
      reportedHours: reportedHours(calculatedHours, input.totalHoursOverride),
      summary: input.summary,
      comments: input.comments,
      tokenUsage: input.tokenUsage,
      blockedOnTaigaBug: input.blockedOnTaigaBug,
      turns: input.turns,
      createdAt: now,
      updatedAt: now
    };

    debugRecords.unshift(record);
    return toPublicDebugRecord(record);
  }

  const supabase = getSupabaseAdmin();

  const { data: entry, error: entryError } = await supabase
    .from("timesheet_entries")
    .insert(entryPayload(input, auth0UserId, auth0Email))
    .select("id")
    .single();

  if (entryError) {
    throw entryError;
  }

  const turns = input.turns.map((turn) => ({
    entry_id: entry.id,
    turn_number: turn.turnNumber,
    task_type: turn.taskType
  }));

  const { error: turnsError } = await supabase.from("timesheet_turns").insert(turns);

  if (turnsError) {
    await supabase.from("timesheet_entries").delete().eq("id", entry.id).eq("auth0_user_id", auth0UserId);
    throw turnsError;
  }

  const workSessions = input.workSessions.map((session) => ({
    entry_id: entry.id,
    session_number: session.sessionNumber,
    start_at: new Date(session.startAt).toISOString(),
    end_at: new Date(session.endAt).toISOString()
  }));

  const { error: workSessionsError } = await supabase.from("timesheet_work_sessions").insert(workSessions);

  if (workSessionsError) {
    await supabase.from("timesheet_entries").delete().eq("id", entry.id).eq("auth0_user_id", auth0UserId);
    throw workSessionsError;
  }

  return getTimesheetForUser(entry.id, auth0UserId);
}

export async function updateTimesheet(
  id: string,
  input: TimesheetInput,
  auth0UserId: string,
  auth0Email: string | null
) {
  if (isDebugAuthBypassEnabled()) {
    const index = debugRecords.findIndex((record) => record.id === id);

    if (index === -1 || !userOwnsEntry(auth0UserId, debugRecords[index].auth0UserId)) {
      return null;
    }

    const existing = debugRecords[index];
    const workSessions = normalizedInputSessions(input);
    const { startAt, endAt } = deriveSessionBounds(workSessions);
    const calculatedHours = calculateWorkSessionHours(workSessions);
    const updated: DebugRecord = {
      ...existing,
      auth0Email,
      workforceEmail: input.workforceEmail,
      primaryProgrammingLanguage: input.primaryProgrammingLanguage,
      secondaryProgrammingLanguages: input.secondaryProgrammingLanguages,
      liveCompareProblemId: input.liveCompareProblemId,
      taskUrl: input.taskUrl,
      workSessions,
      totalHoursOverride: input.totalHoursOverride,
      startAt,
      endAt,
      calculatedHours,
      reportedHours: reportedHours(calculatedHours, input.totalHoursOverride),
      summary: input.summary,
      comments: input.comments,
      tokenUsage: input.tokenUsage,
      blockedOnTaigaBug: input.blockedOnTaigaBug,
      turns: input.turns,
      updatedAt: new Date().toISOString()
    };

    debugRecords[index] = updated;
    return toPublicDebugRecord(updated);
  }

  const supabase = getSupabaseAdmin();

  const { data: existing, error: existingError } = await supabase
    .from("timesheet_entries")
    .select("id, auth0_user_id")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (!userOwnsEntry(auth0UserId, (existing as OwnershipRow | null)?.auth0_user_id)) {
    return null;
  }

  const { error: entryError } = await supabase
    .from("timesheet_entries")
    .update(entryPayload(input, auth0UserId, auth0Email))
    .eq("id", id)
    .eq("auth0_user_id", auth0UserId);

  if (entryError) {
    throw entryError;
  }

  const { error: deleteError } = await supabase.from("timesheet_turns").delete().eq("entry_id", id);

  if (deleteError) {
    throw deleteError;
  }

  const turns = input.turns.map((turn) => ({
    entry_id: id,
    turn_number: turn.turnNumber,
    task_type: turn.taskType
  }));

  const { error: turnsError } = await supabase.from("timesheet_turns").insert(turns);

  if (turnsError) {
    throw turnsError;
  }

  const { error: deleteSessionsError } = await supabase.from("timesheet_work_sessions").delete().eq("entry_id", id);

  if (deleteSessionsError) {
    throw deleteSessionsError;
  }

  const workSessions = input.workSessions.map((session) => ({
    entry_id: id,
    session_number: session.sessionNumber,
    start_at: new Date(session.startAt).toISOString(),
    end_at: new Date(session.endAt).toISOString()
  }));

  const { error: workSessionsError } = await supabase.from("timesheet_work_sessions").insert(workSessions);

  if (workSessionsError) {
    throw workSessionsError;
  }

  return getTimesheetForUser(id, auth0UserId);
}
