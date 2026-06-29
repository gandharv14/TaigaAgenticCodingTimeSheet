import { afterEach, describe, expect, it } from "vitest";

import { clearDebugTimesheets, createTimesheet, listTimesheetsForUser } from "@/lib/timesheets";
import type { TimesheetInput } from "@/lib/types";

const payload: TimesheetInput = {
  clientSubmissionId: "3c4f1b0f-2214-46e4-bbeb-2f54fc744bdf",
  workforceEmail: "kx9m12@alignerrworkforce.com",
  workSessions: [
    {
      sessionNumber: 1,
      startAt: "2026-06-15T09:00:00.000Z",
      endAt: "2026-06-15T10:00:00.000Z"
    }
  ],
  totalHoursMode: "calculated",
  totalHoursOverride: null,
  problems: [
    {
      primaryProgrammingLanguage: "TypeScript",
      secondaryProgrammingLanguages: "SQL",
      liveCompareProblemId: "LC-IDEMPOTENT",
      taskUrl: "https://example.com/tasks/LC-IDEMPOTENT",
      summary: "Validate idempotent timesheet creation.",
      comments: null,
      tokenUsage: 1200,
      blockedOnTaigaBug: false,
      turns: Array.from({ length: 5 }, (_, index) => ({
        turnNumber: index + 1,
        taskType: "Testing"
      }))
    }
  ]
};

function enableDebugBypass() {
  process.env.AUTH_DEBUG_BYPASS = "true";
  delete process.env.VERCEL;
}

afterEach(() => {
  clearDebugTimesheets();
  delete process.env.AUTH_DEBUG_BYPASS;
  delete process.env.VERCEL;
});

describe("timesheet persistence", () => {
  it("returns the existing record when a client submission is retried", async () => {
    enableDebugBypass();

    const first = await createTimesheet(payload, "auth0|user", "user@example.com");
    const second = await createTimesheet(
      {
        ...payload,
        problems: [
          {
            ...payload.problems[0],
            summary: "This retry payload should not replace the existing timesheet."
          }
        ]
      },
      "auth0|user",
      "user@example.com"
    );
    const entries = await listTimesheetsForUser("auth0|user");

    expect(second.id).toBe(first.id);
    expect(second.problems[0].summary).toBe("Validate idempotent timesheet creation.");
    expect(entries).toHaveLength(1);
  });
});
