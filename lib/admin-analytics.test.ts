import { describe, expect, it } from "vitest";

import { summarizeAdminAnalytics } from "@/lib/admin-analytics";
import type { TaskType } from "@/lib/task-types";
import type { AdminTimesheetRecord } from "@/lib/types";

function record(
  id: string,
  turns: TaskType[],
  overrides: Partial<Pick<AdminTimesheetRecord, "reportedHours" | "tokenUsage">> = {}
): AdminTimesheetRecord {
  return {
    id,
    auth0UserId: `auth0|${id}`,
    auth0Email: `${id}@labelbox.com`,
    workforceEmail: `${id}@alignerrworkforce.com`,
    primaryProgrammingLanguage: "TypeScript",
    secondaryProgrammingLanguages: null,
    liveCompareProblemId: `LC-${id.toUpperCase()}`,
    taskUrl: `https://taiga.example/tasks/${id}`,
    startAt: "2026-06-16T16:00:00.000Z",
    endAt: "2026-06-16T17:00:00.000Z",
    workSessions: [
      {
        sessionNumber: 1,
        startAt: "2026-06-16T16:00:00.000Z",
        endAt: "2026-06-16T17:00:00.000Z"
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
    createdAt: "2026-06-16T18:00:00.000Z",
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

  it("computes token statistics, outliers, histogram bins, and scatter data", () => {
    const analytics = summarizeAdminAnalytics([
      record("one", ["Debugging"], { tokenUsage: 100, reportedHours: 1 }),
      record("two", ["Debugging"], { tokenUsage: 200, reportedHours: 2 }),
      record("three", ["Debugging"], { tokenUsage: 300, reportedHours: 3 }),
      record("four", ["Debugging"], { tokenUsage: 400, reportedHours: 4 }),
      record("five", ["Debugging"], { tokenUsage: 10_000, reportedHours: 5 }),
      record("blank", ["Testing"], { tokenUsage: null, reportedHours: 6 })
    ]);

    expect(analytics.tokenUsage.reportedRows).toBe(5);
    expect(analytics.tokenUsage.blankRows).toBe(1);
    expect(analytics.tokenUsage.min).toBe(100);
    expect(analytics.tokenUsage.max).toBe(10_000);
    expect(analytics.tokenUsage.mean).toBe(2_200);
    expect(analytics.tokenUsage.median).toBe(300);
    expect(analytics.tokenUsage.q1).toBe(200);
    expect(analytics.tokenUsage.q3).toBe(400);
    expect(analytics.tokenUsage.iqr).toBe(200);
    expect(analytics.tokenUsage.highOutlierCutoff).toBe(700);
    expect(analytics.tokenUsage.outlierCount).toBe(1);
    expect(analytics.tokenUsage.histogramBins[0]).toMatchObject({
      label: "0-0.5M",
      count: 5,
      isOutlierBucket: true
    });
    expect(analytics.tokenUsage.turnsScatter.points).toHaveLength(5);
    expect(analytics.tokenUsage.turnsScatter.points.find((point) => point.label === "LC-FIVE")).toMatchObject({
      tokenUsage: 10_000,
      isOutlier: true
    });
    expect(analytics.tokenUsage.hoursScatter.correlation).toBeGreaterThan(0);
  });

  it("handles empty data without NaN values", () => {
    const analytics = summarizeAdminAnalytics([]);

    expect(analytics.taskCount).toBe(0);
    expect(analytics.totalTurns).toBe(0);
    expect(analytics.averageHandlingHours).toBe(0);
    expect(analytics.categoryRows.every((row) => row.count === 0 && row.share === 0 && row.averagePerTask === 0)).toBe(
      true
    );
    expect(analytics.tokenUsage.reportedRows).toBe(0);
    expect(analytics.tokenUsage.blankRows).toBe(0);
    expect(analytics.tokenUsage.mean).toBeNull();
    expect(analytics.tokenUsage.turnsScatter.correlation).toBeNull();
  });
});
