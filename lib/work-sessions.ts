import type { TimesheetWorkSessionInput } from "@/lib/types";

const HOUR_IN_MS = 60 * 60 * 1000;

export function roundHours(value: number) {
  return Number(value.toFixed(4));
}

export function calculateWorkSessionHours(sessions: TimesheetWorkSessionInput[]) {
  const totalMs = sessions.reduce((total, session) => {
    const start = new Date(session.startAt);
    const end = new Date(session.endAt);

    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      return total;
    }

    return total + end.getTime() - start.getTime();
  }, 0);

  return roundHours(totalMs / HOUR_IN_MS);
}

export function deriveSessionBounds(sessions: TimesheetWorkSessionInput[]) {
  const ranges = sessions.map((session) => ({
    start: new Date(session.startAt),
    end: new Date(session.endAt)
  }));

  if (ranges.length === 0) {
    throw new Error("At least one work session is required.");
  }

  return {
    startAt: new Date(Math.min(...ranges.map(({ start }) => start.getTime()))).toISOString(),
    endAt: new Date(Math.max(...ranges.map(({ end }) => end.getTime()))).toISOString()
  };
}

export function reportedHours(calculatedHours: number, totalHoursOverride: number | null) {
  return totalHoursOverride ?? calculatedHours;
}
