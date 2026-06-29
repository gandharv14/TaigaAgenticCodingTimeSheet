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
    "start_at",
    "end_at",
    "session_count",
    "session_ranges",
    "calculated_hours",
    "total_hours_override",
    "reported_hours",
    "problem_count",
    "problem_ids",
    "task_urls",
    "primary_programming_languages",
    "secondary_programming_languages",
    "summaries",
    "comments",
    "token_usages",
    "blocked_on_taiga_bug_problem_ids",
    "total_turn_count",
    "turn_task_types_by_problem",
    "created_at",
    "updated_at"
  ];

  const rows = entries.map((entry) => [
    entry.id,
    entry.auth0UserId,
    entry.auth0Email,
    entry.workforceEmail,
    entry.startAt,
    entry.endAt,
    entry.workSessions.length,
    entry.workSessions.map((session) => `${session.sessionNumber}: ${session.startAt} to ${session.endAt}`).join("; "),
    entry.calculatedHours,
    entry.totalHoursOverride,
    entry.reportedHours,
    entry.problemCount,
    entry.problems.map((problem) => problem.liveCompareProblemId).join("; "),
    entry.problems.map((problem) => `${problem.liveCompareProblemId}: ${problem.taskUrl}`).join("; "),
    entry.problems.map((problem) => `${problem.liveCompareProblemId}: ${problem.primaryProgrammingLanguage}`).join("; "),
    entry.problems
      .map((problem) => `${problem.liveCompareProblemId}: ${problem.secondaryProgrammingLanguages ?? ""}`)
      .join("; "),
    entry.problems.map((problem) => `${problem.liveCompareProblemId}: ${problem.summary}`).join("; "),
    entry.problems.map((problem) => `${problem.liveCompareProblemId}: ${problem.comments ?? ""}`).join("; "),
    entry.problems.map((problem) => `${problem.liveCompareProblemId}: ${problem.tokenUsage ?? ""}`).join("; "),
    entry.problems
      .filter((problem) => problem.blockedOnTaigaBug)
      .map((problem) => problem.liveCompareProblemId)
      .join("; "),
    entry.problems.reduce((sum, problem) => sum + problem.turns.length, 0),
    entry.problems
      .map((problem) => `${problem.liveCompareProblemId}: ${problem.turns.map((turn) => `${turn.turnNumber}: ${turn.taskType}`).join(" | ")}`)
      .join("; "),
    entry.createdAt,
    entry.updatedAt
  ]);

  return [headers, ...rows].map((row) => row.map(csvValue).join(",")).join("\n");
}
