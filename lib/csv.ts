import type { AdminTimesheetRecord } from "@/lib/types";

function csvValue(value: string | number | boolean | null | undefined) {
  const normalized = value === null || value === undefined ? "" : String(value);
  return `"${normalized.replaceAll('"', '""')}"`;
}

export function timesheetsToCsv(entries: AdminTimesheetRecord[]) {
  const headers = [
    "id",
    "auth0_user_id",
    "auth0_email",
    "workforce_email",
    "primary_programming_language",
    "secondary_programming_languages",
    "live_compare_problem_id",
    "task_url",
    "start_at",
    "end_at",
    "summary",
    "comments",
    "token_usage",
    "blocked_on_taiga_bug",
    "turn_count",
    "turn_task_types",
    "created_at",
    "updated_at"
  ];

  const rows = entries.map((entry) => [
    entry.id,
    entry.auth0UserId,
    entry.auth0Email,
    entry.workforceEmail,
    entry.primaryProgrammingLanguage,
    entry.secondaryProgrammingLanguages,
    entry.liveCompareProblemId,
    entry.taskUrl,
    entry.startAt,
    entry.endAt,
    entry.summary,
    entry.comments,
    entry.tokenUsage,
    entry.blockedOnTaigaBug,
    entry.turns.length,
    entry.turns.map((turn) => `${turn.turnNumber}: ${turn.taskType}`).join("; "),
    entry.createdAt,
    entry.updatedAt
  ]);

  return [headers, ...rows].map((row) => row.map(csvValue).join(",")).join("\n");
}
