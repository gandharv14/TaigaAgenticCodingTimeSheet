import { isDebugAuthBypassEnabled } from "@/lib/auth0";
import { userOwnsEntry } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { TaskType } from "@/lib/task-types";
import type { TimesheetInput, TimesheetRecord } from "@/lib/types";

type EntryRow = {
  id: string;
  auth0_email: string | null;
  workforce_email: string;
  live_compare_problem_id: string;
  task_url: string;
  start_at: string;
  end_at: string;
  summary: string;
  comments: string | null;
  token_usage: number | null;
  blocked_on_taiga_bug: boolean;
  created_at: string;
  updated_at: string;
  timesheet_turns?: TurnRow[];
};

type TurnRow = {
  turn_number: number;
  task_type: TaskType;
};

type OwnershipRow = {
  id: string;
  auth0_user_id: string;
};

type DebugRecord = TimesheetRecord & {
  auth0UserId: string;
};

const debugRecords: DebugRecord[] = [];

function toPublicDebugRecord(record: DebugRecord): TimesheetRecord {
  return {
    id: record.id,
    auth0Email: record.auth0Email,
    workforceEmail: record.workforceEmail,
    liveCompareProblemId: record.liveCompareProblemId,
    taskUrl: record.taskUrl,
    startAt: record.startAt,
    endAt: record.endAt,
    summary: record.summary,
    comments: record.comments,
    tokenUsage: record.tokenUsage,
    blockedOnTaigaBug: record.blockedOnTaigaBug,
    turns: record.turns,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function toRecord(row: EntryRow): TimesheetRecord {
  return {
    id: row.id,
    auth0Email: row.auth0_email,
    workforceEmail: row.workforce_email,
    liveCompareProblemId: row.live_compare_problem_id,
    taskUrl: row.task_url,
    startAt: row.start_at,
    endAt: row.end_at,
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

function entryPayload(input: TimesheetInput, auth0UserId: string, auth0Email: string | null) {
  return {
    auth0_user_id: auth0UserId,
    auth0_email: auth0Email,
    workforce_email: input.workforceEmail,
    live_compare_problem_id: input.liveCompareProblemId,
    task_url: input.taskUrl,
    start_at: new Date(input.startAt).toISOString(),
    end_at: new Date(input.endAt).toISOString(),
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
    .select(
      "id, auth0_email, workforce_email, live_compare_problem_id, task_url, start_at, end_at, summary, comments, token_usage, blocked_on_taiga_bug, created_at, updated_at, timesheet_turns(turn_number, task_type)"
    )
    .eq("auth0_user_id", auth0UserId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data as EntryRow[]).map(toRecord);
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
    .select(
      "id, auth0_email, workforce_email, live_compare_problem_id, task_url, start_at, end_at, summary, comments, token_usage, blocked_on_taiga_bug, created_at, updated_at, timesheet_turns(turn_number, task_type)"
    )
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
    const record: DebugRecord = {
      id: crypto.randomUUID(),
      auth0UserId,
      auth0Email,
      workforceEmail: input.workforceEmail,
      liveCompareProblemId: input.liveCompareProblemId,
      taskUrl: input.taskUrl,
      startAt: new Date(input.startAt).toISOString(),
      endAt: new Date(input.endAt).toISOString(),
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
    const updated: DebugRecord = {
      ...existing,
      auth0Email,
      workforceEmail: input.workforceEmail,
      liveCompareProblemId: input.liveCompareProblemId,
      taskUrl: input.taskUrl,
      startAt: new Date(input.startAt).toISOString(),
      endAt: new Date(input.endAt).toISOString(),
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

  return getTimesheetForUser(id, auth0UserId);
}
