import { describe, expect, it } from "vitest";

import { summarizeAdminAnalytics } from "@/lib/admin-analytics";
import type { TaskType } from "@/lib/task-types";
import type { AdminTimesheetRecord } from "@/lib/types";

function record(
  id: string,
  turns: TaskType[],
  overrides: Partial<Pick<AdminTimesheetRecord, "createdAt" | "endAt" | "reportedHours" | "startAt" | "tokenUsage">> = {}
): AdminTimesheetRecord {
  const startAt = overrides.startAt ?? "2026-06-16T16:00:00.000Z";
  const endAt = overrides.endAt ?? "2026-06-16T17:00:00.000Z";

  return {
    id,
    auth0UserId: `auth0|${id}`,
    auth0Email: `${id}@labelbox.com`,
    workforceEmail: `${id}@alignerrworkforce.com`,
    primaryProgrammingLanguage: "TypeScript",
    secondaryProgrammingLanguages: null,
    liveCompareProblemId: `LC-${id.toUpperCase()}`,
    taskUrl: `https://taiga.example/tasks/${id}`,
    startAt,
    endAt,
    workSessions: [
      {
        sessionNumber: 1,
        startAt,
        endAt
      }
    ],
    calculatedHours: overrides.reportedHours ?? 1,
    totalHoursOverride: null,
    reportedHours: overrides.reportedHours ?? 1,
    summary: "Fixture record",
    comments: null,
    tokenUsage: overrides.tokenUsage ?? null,
    blockedOnTaigaBug: false,
    turns: turns.map((taskType, index) => ({
      turnNumber: index + 1,
      taskType
    })),
    createdAt: overrides.createdAt ?? "2026-06-16T18:00:00.000Z",
    updatedAt: "2026-06-16T18:00:00.000Z"
  };
}

describe("summarizeAdminAnalytics", () => {
  it("computes turn category counts, shares, averages, and ideal deltas", () => {
    const analytics = summarizeAdminAnalytics([
      record("one", ["Debugging", "Debugging", "Code writing", "Testing", "Root Cause Analysis"], {
        reportedHours: 1.25,
        tokenUsage: 100
      }),
      record("two", ["Code writing", "Code writing", "Testing", "Communication", "Maintenance & ops tooling"], {
        reportedHours: 2
      })
    ]);

    expect(analytics.taskCount).toBe(2);
    expect(analytics.totalTurns).toBe(10);
    expect(analytics.averageHandlingHours).toBe(1.63);
    expect(analytics.categoryRowsByCount[0]).toMatchObject({
      category: "Code writing",
      count: 3,
      share: 30,
      averagePerTask: 1.5,
      deltaShare: 15
    });
    expect(analytics.categoryRows.find((row) => row.category === "Debugging")).toMatchObject({
      count: 2,
      share: 20,
      averagePerTask: 1,
      idealShare: 15,
      deltaShare: 5
    });
    expect(analytics.categoryRows.find((row) => row.category === "Deployment & infra")).toMatchObject({
      count: 0,
      share: 0,
      averagePerTask: 0,
      deltaShare: -5
    });
  });

  it("filters obvious hour and token outlier rows before computing dashboard metrics", () => {
    const analytics = summarizeAdminAnalytics([
      record("one", ["Debugging"], { tokenUsage: 100, reportedHours: 1 }),
      record("two", ["Debugging"], { tokenUsage: 200, reportedHours: 2 }),
      record("three", ["Debugging"], { tokenUsage: 300, reportedHours: 3 }),
      record("four", ["Debugging"], { tokenUsage: 400, reportedHours: 4 }),
      record("five", ["Debugging"], { tokenUsage: 10_000, reportedHours: 5 }),
      record("blank", ["Testing"], { tokenUsage: null, reportedHours: 6 }),
      record("long", ["Communication"], { tokenUsage: 500, reportedHours: 100 })
    ]);

    expect(analytics.outlierFilter).toMatchObject({
      totalRows: 7,
      includedRows: 5,
      excludedRows: 2,
      excludedForHours: 1,
      excludedForTokens: 1,
      reportedHoursMin: 0,
      reportedHoursMax: 24
    });
    expect(analytics.outlierFilter.tokenUsageMax).toBe(1225);
    expect(analytics.taskCount).toBe(5);
    expect(analytics.averageHandlingHours).toBe(3.2);
    expect(analytics.categoryRows.find((row) => row.category === "Debugging")).toMatchObject({
      count: 4,
      averagePerTask: 0.8
    });
    expect(analytics.categoryRows.find((row) => row.category === "Testing")).toMatchObject({
      count: 1,
      averagePerTask: 0.2
    });
    expect(analytics.categoryRows.find((row) => row.category === "Communication")).toMatchObject({
      count: 0,
      averagePerTask: 0
    });
    expect(analytics.tokenUsage.reportedRows).toBe(4);
    expect(analytics.tokenUsage.blankRows).toBe(1);
    expect(analytics.tokenUsage.min).toBe(100);
    expect(analytics.tokenUsage.max).toBe(400);
    expect(analytics.tokenUsage.mean).toBe(250);
    expect(analytics.tokenUsage.median).toBe(250);
    expect(analytics.tokenUsage.q1).toBe(175);
    expect(analytics.tokenUsage.q3).toBe(325);
    expect(analytics.tokenUsage.iqr).toBe(150);
    expect(analytics.tokenUsage.highOutlierCutoff).toBe(550);
    expect(analytics.tokenUsage.outlierCount).toBe(0);
    expect(analytics.tokenUsage.histogramBins[0]).toMatchObject({
      label: "0-0.5M",
      count: 4,
      isOutlierBucket: false
    });
    expect(analytics.tokenUsage.turnsScatter.points).toHaveLength(4);
    expect(analytics.tokenUsage.turnsScatter.points.some((point) => point.label === "LC-FIVE")).toBe(false);
    expect(analytics.tokenUsage.turnsScatter.points.some((point) => point.label === "LC-LONG")).toBe(false);
    expect(analytics.tokenUsage.hoursScatter.correlation).toBeGreaterThan(0);
  });

  it("builds a five-week moving throughput window with zero-filled gaps", () => {
    const analytics = summarizeAdminAnalytics([
      record("week-one", ["Debugging"], { endAt: "2026-05-04T12:00:00.000Z" }),
      record("week-two-a", ["Debugging"], { endAt: "2026-05-11T12:00:00.000Z" }),
      record("week-two-b", ["Testing"], { endAt: "2026-05-12T12:00:00.000Z" }),
      record("week-four", ["Code writing"], { endAt: "2026-05-25T12:00:00.000Z" }),
      record("week-five-a", ["Code writing"], { endAt: "2026-06-01T12:00:00.000Z" }),
      record("week-five-b", ["Code writing"], { endAt: "2026-06-02T12:00:00.000Z" }),
      record("week-five-c", ["Code writing"], { endAt: "2026-06-03T12:00:00.000Z" }),
      record("week-six-a", ["Communication"], { endAt: "2026-06-08T12:00:00.000Z" }),
      record("week-six-b", ["Communication"], { endAt: "2026-06-09T12:00:00.000Z" })
    ]);

    expect(analytics.weeklyThroughput).toMatchObject({
      target: 500,
      windowSize: 5,
      totalWeeks: 6,
      firstWeekStart: "2026-05-04T00:00:00.000Z",
      lastWeekStart: "2026-06-08T00:00:00.000Z"
    });
    expect(analytics.weeklyThroughput.bins).toHaveLength(5);
    expect(analytics.weeklyThroughput.bins.map((bin) => bin.weekStart)).toEqual([
      "2026-05-11T00:00:00.000Z",
      "2026-05-18T00:00:00.000Z",
      "2026-05-25T00:00:00.000Z",
      "2026-06-01T00:00:00.000Z",
      "2026-06-08T00:00:00.000Z"
    ]);
    expect(analytics.weeklyThroughput.bins.map((bin) => bin.count)).toEqual([2, 0, 1, 3, 2]);
  });

  it("handles empty data without NaN values", () => {
    const analytics = summarizeAdminAnalytics([]);

    expect(analytics.taskCount).toBe(0);
    expect(analytics.totalTurns).toBe(0);
    expect(analytics.averageHandlingHours).toBe(0);
    expect(analytics.outlierFilter).toMatchObject({
      totalRows: 0,
      includedRows: 0,
      excludedRows: 0,
      excludedForHours: 0,
      excludedForTokens: 0,
      reportedHoursMin: 0,
      reportedHoursMax: 24,
      tokenUsageMax: null
    });
    expect(analytics.categoryRows.every((row) => row.count === 0 && row.share === 0 && row.averagePerTask === 0)).toBe(
      true
    );
    expect(analytics.tokenUsage.reportedRows).toBe(0);
    expect(analytics.tokenUsage.blankRows).toBe(0);
    expect(analytics.tokenUsage.mean).toBeNull();
    expect(analytics.tokenUsage.turnsScatter.correlation).toBeNull();
    expect(analytics.weeklyThroughput.bins).toEqual([]);
  });
});
