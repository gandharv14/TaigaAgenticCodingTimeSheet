import { describe, expect, it } from "vitest";

import { validateTimesheetInput, validateUserProfileInput } from "@/lib/validation";

const validPayload = {
  workforceEmail: "kx9m12@alignerrworkforce.com",
  primaryProgrammingLanguage: "TypeScript",
  secondaryProgrammingLanguages: "Python, SQL",
  liveCompareProblemId: "LC-123",
  taskUrl: "https://example.com/tasks/LC-123",
  workSessions: [
    {
      sessionNumber: 1,
      startAt: "2026-06-15T09:00",
      endAt: "2026-06-15T10:00"
    }
  ],
  totalHoursOverride: null,
  summary: "Investigated the task and implemented the requested fix.",
  comments: null,
  tokenUsage: 1200,
  blockedOnTaigaBug: false,
  turns: Array.from({ length: 5 }, (_, index) => ({
    turnNumber: index + 1,
    taskType: "Debugging"
  }))
};

describe("timesheet validation", () => {
  it("accepts a valid payload", () => {
    expect(validateTimesheetInput(validPayload).success).toBe(true);
  });

  it("requires at least five turns", () => {
    const result = validateTimesheetInput({
      ...validPayload,
      turns: validPayload.turns.slice(0, 4)
    });

    expect(result.success).toBe(false);
  });

  it("rejects summaries over 100 words", () => {
    const result = validateTimesheetInput({
      ...validPayload,
      summary: Array.from({ length: 101 }, () => "word").join(" ")
    });

    expect(result.success).toBe(false);
  });

  it("requires end time to be after start time", () => {
    const result = validateTimesheetInput({
      ...validPayload,
      workSessions: [
        {
          sessionNumber: 1,
          startAt: "2026-06-15T09:00",
          endAt: "2026-06-15T08:59"
        }
      ]
    });

    expect(result.success).toBe(false);
  });

  it("rejects overlapping work sessions", () => {
    const result = validateTimesheetInput({
      ...validPayload,
      workSessions: [
        {
          sessionNumber: 1,
          startAt: "2026-06-15T09:00",
          endAt: "2026-06-15T10:00"
        },
        {
          sessionNumber: 2,
          startAt: "2026-06-15T09:30",
          endAt: "2026-06-15T11:00"
        }
      ]
    });

    expect(result.success).toBe(false);
  });

  it("accepts a nonnegative hours override", () => {
    const result = validateTimesheetInput({
      ...validPayload,
      totalHoursOverride: 1.5
    });

    expect(result.success).toBe(true);
  });

  it("rejects negative hours overrides", () => {
    const result = validateTimesheetInput({
      ...validPayload,
      totalHoursOverride: -1
    });

    expect(result.success).toBe(false);
  });

  it("requires token usage", () => {
    const result = validateTimesheetInput({
      ...validPayload,
      tokenUsage: null
    });

    expect(result.success).toBe(false);
  });

  it("rejects task types outside the allowed set", () => {
    const result = validateTimesheetInput({
      ...validPayload,
      turns: [
        { turnNumber: 1, taskType: "Something else" },
        ...validPayload.turns.slice(1)
      ]
    });

    expect(result.success).toBe(false);
  });

  it("requires the Google Workforce email domain", () => {
    const result = validateTimesheetInput({
      ...validPayload,
      workforceEmail: "worker@example.com"
    });

    expect(result.success).toBe(false);
  });

  it("requires a primary programming language", () => {
    const result = validateTimesheetInput({
      ...validPayload,
      primaryProgrammingLanguage: ""
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-sequential turn numbers", () => {
    const result = validateTimesheetInput({
      ...validPayload,
      turns: validPayload.turns.map((turn, index) => ({
        ...turn,
        turnNumber: index === 2 ? 9 : turn.turnNumber
      }))
    });

    expect(result.success).toBe(false);
  });
});

describe("profile validation", () => {
  it("accepts valid editable profile info", () => {
    expect(
      validateUserProfileInput({
        name: "Test User",
        workforceEmail: "kx9m12@alignerrworkforce.com",
        discordId: "test_user",
        hubstaffEmail: "test.user@example.com"
      }).success
    ).toBe(true);
  });

  it("allows empty optional profile fields", () => {
    expect(
      validateUserProfileInput({
        name: "Test User",
        workforceEmail: null,
        discordId: null,
        hubstaffEmail: null
      }).success
    ).toBe(true);
  });

  it("rejects invalid profile emails", () => {
    expect(
      validateUserProfileInput({
        name: "Test User",
        workforceEmail: "test@example.com",
        discordId: null,
        hubstaffEmail: "not-an-email"
      }).success
    ).toBe(false);
  });
});
