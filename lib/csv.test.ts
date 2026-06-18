import { describe, expect, it } from "vitest";

import { timesheetsToCsv } from "@/lib/csv";
import type { AdminTimesheetRecord } from "@/lib/types";

const record: AdminTimesheetRecord = {
  id: "entry-1",
  auth0UserId: "auth0|admin",
  auth0Email: "gmahajan@labelbox.com",
  workforceEmail: "kx9m12@alignerrworkforce.com",
  primaryProgrammingLanguage: "TypeScript",
  secondaryProgrammingLanguages: "Python, SQL",
  liveCompareProblemId: "LC-CSV-001",
  taskUrl: "https://taiga.example/tasks/LC-CSV-001",
  startAt: "2026-06-16T16:00:00.000Z",
  endAt: "2026-06-16T19:30:00.000Z",
  workSessions: [
    {
      sessionNumber: 1,
      startAt: "2026-06-16T16:00:00.000Z",
      endAt: "2026-06-16T17:00:00.000Z"
    },
    {
      sessionNumber: 2,
      startAt: "2026-06-16T19:00:00.000Z",
      endAt: "2026-06-16T19:30:00.000Z"
    }
  ],
  calculatedHours: 1.5,
  totalHoursOverride: 1.75,
  reportedHours: 1.75,
  summary: 'Reviewed "quoted" output',
  comments: "Includes commas, quotes, and newlines\nfor export coverage.",
  tokenUsage: 1234,
  blockedOnTaigaBug: false,
  turns: [
    { turnNumber: 1, taskType: "Debugging" },
    { turnNumber: 2, taskType: "Code review" },
    { turnNumber: 3, taskType: "Testing" },
    { turnNumber: 4, taskType: "Communication" },
    { turnNumber: 5, taskType: "Root Cause Analysis" }
  ],
  createdAt: "2026-06-16T18:00:00.000Z",
  updatedAt: "2026-06-16T18:30:00.000Z"
};

describe("timesheetsToCsv", () => {
  it("exports one row with all timesheet fields and escaped values", () => {
    const csv = timesheetsToCsv([record]);

    expect(csv).toContain('"auth0_user_id"');
    expect(csv).toContain('"auth0|admin"');
    expect(csv).toContain('"gmahajan@labelbox.com"');
    expect(csv).toContain('"kx9m12@alignerrworkforce.com"');
    expect(csv).toContain('"primary_programming_language"');
    expect(csv).toContain('"secondary_programming_languages"');
    expect(csv).toContain('"session_count"');
    expect(csv).toContain('"calculated_hours"');
    expect(csv).toContain('"total_hours_override"');
    expect(csv).toContain('"reported_hours"');
    expect(csv).toContain('"TypeScript"');
    expect(csv).toContain('"Python, SQL"');
    expect(csv).toContain('"2"');
    expect(csv).toContain('"1.5"');
    expect(csv).toContain('"1.75"');
    expect(csv).toContain('"Reviewed ""quoted"" output"');
    expect(csv).toContain('"1: Debugging; 2: Code review; 3: Testing; 4: Communication; 5: Root Cause Analysis"');
    expect(csv.split("\n")).toHaveLength(3);
  });
});
