import type { TaskType } from "@/lib/task-types";

export type TimesheetTurnInput = {
  turnNumber: number;
  taskType: TaskType;
};

export type TimesheetInput = {
  workforceEmail: string;
  liveCompareProblemId: string;
  taskUrl: string;
  startAt: string;
  endAt: string;
  summary: string;
  comments: string | null;
  tokenUsage: number | null;
  blockedOnTaigaBug: boolean;
  turns: TimesheetTurnInput[];
};

export type TimesheetRecord = TimesheetInput & {
  id: string;
  auth0Email: string | null;
  createdAt: string;
  updatedAt: string;
};
