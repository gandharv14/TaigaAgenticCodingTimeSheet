import { isDebugAuthBypassEnabled } from "@/lib/auth0";
import { normalizeDateTimeToIso } from "@/lib/date-times";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { TaskType } from "@/lib/task-types";
import type {
  AdminTimesheetRecord,
  TimesheetInput,
  TimesheetProblemInput,
  TimesheetProblemRecord,
  TimesheetRecord
} from "@/lib/types";
import { calculateWorkSessionHours, deriveSessionBounds, reportedHours } from "@/lib/work-sessions";

type BatchRow = {
  id: string;
  auth0_user_id?: string;
  auth0_email: string | null;
  client_submission_id?: string | null;
  workforce_email: string;
  start_at: string;
  end_at: string;
  total_hours_override?: number | string | null;
  created_at: string;
  updated_at: string;
  timesheet_batch_work_sessions?: WorkSessionRow[];
  timesheet_entries?: EntryRow[];
};

type EntryRow = {
  id: string;
  primary_programming_language?: string | null;
  secondary_programming_languages?: string | null;
  live_compare_problem_id: string;
  task_url: string;
  summary: string;
  comments: string | null;
  token_usage: number | null;
  blocked_on_taiga_bug: boolean;
  timesheet_turns?: TurnRow[];
};

type LegacyEntryRow = EntryRow & {
  auth0_user_id?: string;
  auth0_email: string | null;
  workforce_email: string;
  start_at: string;
  end_at: string;
  total_hours_override?: number | string | null;
  created_at: string;
  updated_at: string;
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

type DebugRecord = TimesheetRecord & {
  auth0UserId: string;
  clientSubmissionId: string | null;
};

type CreatedBatchRow = {
  id: string;
  auth0_email: string | null;
  workforce_email: string;
  start_at: string;
  end_at: string;
  total_hours_override?: number | string | null;
  created_at: string;
  updated_at: string;
};

const debugRecords: DebugRecord[] = [];
const ADMIN_PAGE_SIZE = 1000;
const USER_SELECT =
  "id, auth0_email, client_submission_id, workforce_email, start_at, end_at, total_hours_override, created_at, updated_at, timesheet_batch_work_sessions(session_number, start_at, end_at), timesheet_entries(id, primary_programming_language, secondary_programming_languages, live_compare_problem_id, task_url, summary, comments, token_usage, blocked_on_taiga_bug, timesheet_turns(turn_number, task_type))";
const ADMIN_SELECT =
  "id, auth0_user_id, auth0_email, client_submission_id, workforce_email, start_at, end_at, total_hours_override, created_at, updated_at, timesheet_batch_work_sessions(session_number, start_at, end_at), timesheet_entries(id, primary_programming_language, secondary_programming_languages, live_compare_problem_id, task_url, summary, comments, token_usage, blocked_on_taiga_bug, timesheet_turns(turn_number, task_type))";
const USER_LEGACY_SELECT =
  "id, auth0_email, workforce_email, primary_programming_language, secondary_programming_languages, live_compare_problem_id, task_url, start_at, end_at, total_hours_override, summary, comments, token_usage, blocked_on_taiga_bug, created_at, updated_at, timesheet_turns(turn_number, task_type), timesheet_work_sessions(session_number, start_at, end_at)";
const ADMIN_LEGACY_SELECT =
  "id, auth0_user_id, auth0_email, workforce_email, primary_programming_language, secondary_programming_languages, live_compare_problem_id, task_url, start_at, end_at, total_hours_override, summary, comments, token_usage, blocked_on_taiga_bug, created_at, updated_at, timesheet_turns(turn_number, task_type), timesheet_work_sessions(session_number, start_at, end_at)";

export class TimesheetSchemaError extends Error {
  constructor() {
    super("Timesheet database schema is out of date.");
    this.name = "TimesheetSchemaError";
  }
}

function nullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isMissingMultiProblemSchemaError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const { code, message } = error as { code?: unknown; message?: unknown };
  const normalizedCode = typeof code === "string" ? code : "";
  const normalizedMessage = typeof message === "string" ? message.toLowerCase() : "";

  return (
    ["42P01", "42703", "PGRST200", "PGRST204", "PGRST205"].includes(normalizedCode) ||
    normalizedMessage.includes("timesheet_work_batches") ||
    normalizedMessage.includes("timesheet_batch_work_sessions") ||
    normalizedMessage.includes("work_batch_id") ||
    normalizedMessage.includes("client_submission_id") ||
    normalizedMessage.includes("schema cache") ||
    normalizedMessage.includes("relationship")
  );
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    (error as { code: string }).code === "23505"
  );
}

async function assertTimesheetWriteSchema() {
  const supabase = getSupabaseAdmin();
  const checks = [
    supabase.from("timesheet_work_batches").select("id, client_submission_id").limit(0),
    supabase.from("timesheet_batch_work_sessions").select("id, batch_id").limit(0),
    supabase.from("timesheet_entries").select("id, work_batch_id").limit(0)
  ];

  for (const check of checks) {
    const { error } = await check;

    if (!error) {
      continue;
    }

    if (isMissingMultiProblemSchemaError(error)) {
      throw new TimesheetSchemaError();
    }

    throw error;
  }
}

function normalizedInputSessions(input: TimesheetInput) {
  return input.workSessions.map((session) => ({
    sessionNumber: session.sessionNumber,
    startAt: normalizeDateTimeToIso(session.startAt),
    endAt: normalizeDateTimeToIso(session.endAt)
  }));
}

function workSessionsFromRow(row: BatchRow) {
  const sessions = [...(row.timesheet_batch_work_sessions ?? [])]
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

function workSessionsFromLegacyRow(row: LegacyEntryRow) {
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

function problemsFromRow(row: BatchRow): TimesheetProblemRecord[] {
  return [...(row.timesheet_entries ?? [])]
    .sort((a, b) => a.live_compare_problem_id.localeCompare(b.live_compare_problem_id))
    .map((entry) => ({
      id: entry.id,
      primaryProgrammingLanguage: entry.primary_programming_language ?? "Not specified",
      secondaryProgrammingLanguages: entry.secondary_programming_languages ?? null,
      liveCompareProblemId: entry.live_compare_problem_id,
      taskUrl: entry.task_url,
      summary: entry.summary,
      comments: entry.comments,
      tokenUsage: entry.token_usage,
      blockedOnTaigaBug: entry.blocked_on_taiga_bug,
      turns: [...(entry.timesheet_turns ?? [])]
        .sort((a, b) => a.turn_number - b.turn_number)
        .map((turn) => ({
          turnNumber: turn.turn_number,
          taskType: turn.task_type
        }))
    }));
}

function problemFromLegacyRow(row: LegacyEntryRow): TimesheetProblemRecord {
  return {
    id: row.id,
    primaryProgrammingLanguage: row.primary_programming_language ?? "Not specified",
    secondaryProgrammingLanguages: row.secondary_programming_languages ?? null,
    liveCompareProblemId: row.live_compare_problem_id,
    taskUrl: row.task_url,
    summary: row.summary,
    comments: row.comments,
    tokenUsage: row.token_usage,
    blockedOnTaigaBug: row.blocked_on_taiga_bug,
    turns: [...(row.timesheet_turns ?? [])]
      .sort((a, b) => a.turn_number - b.turn_number)
      .map((turn) => ({
        turnNumber: turn.turn_number,
        taskType: turn.task_type
      }))
  };
}

function toPublicDebugRecord(record: DebugRecord): TimesheetRecord {
  return {
    id: record.id,
    auth0Email: record.auth0Email,
    workforceEmail: record.workforceEmail,
    workSessions: record.workSessions,
    totalHoursOverride: record.totalHoursOverride,
    startAt: record.startAt,
    endAt: record.endAt,
    calculatedHours: record.calculatedHours,
    reportedHours: record.reportedHours,
    problemCount: record.problemCount,
    problems: record.problems,
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

function toRecord(row: BatchRow): TimesheetRecord {
  const workSessions = workSessionsFromRow(row);
  const calculatedHours = calculateWorkSessionHours(workSessions);
  const totalHoursOverride = nullableNumber(row.total_hours_override);
  const problems = problemsFromRow(row);

  return {
    id: row.id,
    auth0Email: row.auth0_email,
    workforceEmail: row.workforce_email,
    workSessions,
    totalHoursOverride,
    startAt: row.start_at,
    endAt: row.end_at,
    calculatedHours,
    reportedHours: reportedHours(calculatedHours, totalHoursOverride),
    problemCount: problems.length,
    problems,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toAdminRecord(row: BatchRow): AdminTimesheetRecord {
  return {
    ...toRecord(row),
    auth0UserId: row.auth0_user_id ?? ""
  };
}

function toLegacyRecord(row: LegacyEntryRow): TimesheetRecord {
  const workSessions = workSessionsFromLegacyRow(row);
  const calculatedHours = calculateWorkSessionHours(workSessions);
  const totalHoursOverride = nullableNumber(row.total_hours_override);

  return {
    id: row.id,
    auth0Email: row.auth0_email,
    workforceEmail: row.workforce_email,
    workSessions,
    totalHoursOverride,
    startAt: row.start_at,
    endAt: row.end_at,
    calculatedHours,
    reportedHours: reportedHours(calculatedHours, totalHoursOverride),
    problemCount: 1,
    problems: [problemFromLegacyRow(row)],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toLegacyAdminRecord(row: LegacyEntryRow): AdminTimesheetRecord {
  return {
    ...toLegacyRecord(row),
    auth0UserId: row.auth0_user_id ?? ""
  };
}

function batchPayload(input: TimesheetInput, auth0UserId: string, auth0Email: string | null) {
  const workSessions = normalizedInputSessions(input);
  const { startAt, endAt } = deriveSessionBounds(workSessions);

  return {
    auth0_user_id: auth0UserId,
    auth0_email: auth0Email,
    client_submission_id: input.clientSubmissionId,
    workforce_email: input.workforceEmail,
    start_at: startAt,
    end_at: endAt,
    total_hours_override: input.totalHoursOverride
  };
}

function entryPayload(
  problem: TimesheetProblemInput,
  batchId: string,
  input: TimesheetInput,
  auth0UserId: string,
  auth0Email: string | null
) {
  const workSessions = normalizedInputSessions(input);
  const { startAt, endAt } = deriveSessionBounds(workSessions);

  return {
    work_batch_id: batchId,
    auth0_user_id: auth0UserId,
    auth0_email: auth0Email,
    workforce_email: input.workforceEmail,
    primary_programming_language: problem.primaryProgrammingLanguage,
    secondary_programming_languages: problem.secondaryProgrammingLanguages,
    live_compare_problem_id: problem.liveCompareProblemId,
    task_url: problem.taskUrl,
    start_at: startAt,
    end_at: endAt,
    total_hours_override: input.totalHoursOverride,
    summary: problem.summary,
    comments: problem.comments,
    token_usage: problem.tokenUsage,
    blocked_on_taiga_bug: problem.blockedOnTaigaBug
  };
}

async function insertBatchChildren(
  batchId: string,
  input: TimesheetInput,
  auth0UserId: string,
  auth0Email: string | null
) {
  const supabase = getSupabaseAdmin();
  const workSessions = normalizedInputSessions(input).map((session) => ({
    batch_id: batchId,
    session_number: session.sessionNumber,
    start_at: session.startAt,
    end_at: session.endAt
  }));

  const { error: workSessionsError } = await supabase.from("timesheet_batch_work_sessions").insert(workSessions);

  if (workSessionsError) {
    throw workSessionsError;
  }

  const insertedProblems: TimesheetProblemRecord[] = [];

  for (const problem of input.problems) {
    const { data: insertedEntry, error: entryError } = await supabase
      .from("timesheet_entries")
      .insert(entryPayload(problem, batchId, input, auth0UserId, auth0Email))
      .select("id")
      .single();

    if (entryError) {
      throw entryError;
    }

    const turns = problem.turns.map((turn) => ({
      entry_id: insertedEntry.id,
      turn_number: turn.turnNumber,
      task_type: turn.taskType
    }));

    const { error: turnsError } = await supabase.from("timesheet_turns").insert(turns);

    if (turnsError) {
      throw turnsError;
    }

    insertedProblems.push({
      id: insertedEntry.id,
      ...problem
    });
  }

  return insertedProblems;
}

function createdRecordFromInput(
  batch: CreatedBatchRow,
  input: TimesheetInput,
  auth0Email: string | null,
  problems: TimesheetProblemRecord[]
): TimesheetRecord {
  const workSessions = normalizedInputSessions(input);
  const calculatedHours = calculateWorkSessionHours(workSessions);
  const totalHoursOverride = nullableNumber(batch.total_hours_override);

  return {
    id: batch.id,
    auth0Email,
    workforceEmail: batch.workforce_email,
    workSessions,
    totalHoursOverride,
    startAt: batch.start_at,
    endAt: batch.end_at,
    calculatedHours,
    reportedHours: reportedHours(calculatedHours, totalHoursOverride),
    problemCount: problems.length,
    problems,
    createdAt: batch.created_at,
    updatedAt: batch.updated_at
  };
}

function createDebugRecord(input: TimesheetInput, auth0UserId: string, auth0Email: string | null, existing?: DebugRecord) {
  const now = new Date().toISOString();
  const workSessions = normalizedInputSessions(input);
  const { startAt, endAt } = deriveSessionBounds(workSessions);
  const calculatedHours = calculateWorkSessionHours(workSessions);

  return {
    id: existing?.id ?? crypto.randomUUID(),
    auth0UserId,
    auth0Email,
    clientSubmissionId: input.clientSubmissionId,
    workforceEmail: input.workforceEmail,
    workSessions,
    totalHoursOverride: input.totalHoursOverride,
    startAt,
    endAt,
    calculatedHours,
    reportedHours: reportedHours(calculatedHours, input.totalHoursOverride),
    problemCount: input.problems.length,
    problems: input.problems.map((problem, index) => ({
      id: existing?.problems[index]?.id ?? crypto.randomUUID(),
      ...problem
    })),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
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
    .from("timesheet_work_batches")
    .select(USER_SELECT)
    .eq("auth0_user_id", auth0UserId)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingMultiProblemSchemaError(error)) {
      const { data: legacyData, error: legacyError } = await supabase
        .from("timesheet_entries")
        .select(USER_LEGACY_SELECT)
        .eq("auth0_user_id", auth0UserId)
        .order("created_at", { ascending: false });

      if (legacyError) {
        throw legacyError;
      }

      return (legacyData as LegacyEntryRow[]).map(toLegacyRecord);
    }

    throw error;
  }

  return (data as BatchRow[]).map(toRecord);
}

export async function listAllTimesheets() {
  if (isDebugAuthBypassEnabled()) {
    return [...debugRecords]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map(toPublicAdminDebugRecord);
  }

  const supabase = getSupabaseAdmin();
  const rows: BatchRow[] = [];

  for (let from = 0; ; from += ADMIN_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("timesheet_work_batches")
      .select(ADMIN_SELECT)
      .order("created_at", { ascending: false })
      .range(from, from + ADMIN_PAGE_SIZE - 1);

    if (error) {
      if (isMissingMultiProblemSchemaError(error)) {
        const legacyRows: LegacyEntryRow[] = [];

        for (let legacyFrom = 0; ; legacyFrom += ADMIN_PAGE_SIZE) {
          const { data: legacyData, error: legacyError } = await supabase
            .from("timesheet_entries")
            .select(ADMIN_LEGACY_SELECT)
            .order("created_at", { ascending: false })
            .range(legacyFrom, legacyFrom + ADMIN_PAGE_SIZE - 1);

          if (legacyError) {
            throw legacyError;
          }

          const legacyPage = (legacyData as LegacyEntryRow[]) ?? [];
          legacyRows.push(...legacyPage);

          if (legacyPage.length < ADMIN_PAGE_SIZE) {
            break;
          }
        }

        return legacyRows.map(toLegacyAdminRecord);
      }

      throw error;
    }

    const page = (data as BatchRow[]) ?? [];
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
    .from("timesheet_work_batches")
    .select(USER_SELECT)
    .eq("id", id)
    .eq("auth0_user_id", auth0UserId)
    .single();

  if (error) {
    throw error;
  }

  return toRecord(data as BatchRow);
}

async function getTimesheetByClientSubmissionId(clientSubmissionId: string, auth0UserId: string) {
  if (isDebugAuthBypassEnabled()) {
    const record = debugRecords.find(
      (entry) => entry.clientSubmissionId === clientSubmissionId && entry.auth0UserId === auth0UserId
    );

    if (!record) {
      throw new Error("Timesheet not found.");
    }

    return toPublicDebugRecord(record);
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("timesheet_work_batches")
    .select(USER_SELECT)
    .eq("auth0_user_id", auth0UserId)
    .eq("client_submission_id", clientSubmissionId)
    .single();

  if (error) {
    throw error;
  }

  return toRecord(data as BatchRow);
}

export async function createTimesheet(input: TimesheetInput, auth0UserId: string, auth0Email: string | null) {
  if (isDebugAuthBypassEnabled()) {
    if (input.clientSubmissionId) {
      const existing = debugRecords.find(
        (record) => record.auth0UserId === auth0UserId && record.clientSubmissionId === input.clientSubmissionId
      );

      if (existing) {
        return toPublicDebugRecord(existing);
      }
    }

    const record = createDebugRecord(input, auth0UserId, auth0Email);
    debugRecords.unshift(record);
    return toPublicDebugRecord(record);
  }

  await assertTimesheetWriteSchema();

  const supabase = getSupabaseAdmin();

  const { data: batch, error: batchError } = await supabase
    .from("timesheet_work_batches")
    .insert(batchPayload(input, auth0UserId, auth0Email))
    .select("id, auth0_email, workforce_email, start_at, end_at, total_hours_override, created_at, updated_at")
    .single();

  if (batchError) {
    if (input.clientSubmissionId && isUniqueViolation(batchError)) {
      return getTimesheetByClientSubmissionId(input.clientSubmissionId, auth0UserId);
    }

    throw batchError;
  }

  let problems: TimesheetProblemRecord[];

  try {
    problems = await insertBatchChildren(batch.id, input, auth0UserId, auth0Email);
  } catch (error) {
    await supabase.from("timesheet_work_batches").delete().eq("id", batch.id).eq("auth0_user_id", auth0UserId);
    throw error;
  }

  return createdRecordFromInput(batch as CreatedBatchRow, input, auth0Email, problems);
}
