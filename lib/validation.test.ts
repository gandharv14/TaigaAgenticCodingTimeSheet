import { describe, expect, it } from "vitest";

import { validateTimesheetInput } from "@/lib/validation";

const validPayload = {
  workforceEmail: "kx9m12@alignerrworkforce.com",
  liveCompareProblemId: "LC-123",
  taskUrl: "https://example.com/tasks/LC-123",
  startAt: "2026-06-15T09:00",
  endAt: "2026-06-15T10:00",
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
      endAt: "2026-06-15T08:59"
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
