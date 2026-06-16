import type { TaskType } from "@/lib/task-types";

export type TimesheetTurnInput = {
  turnNumber: number;
  taskType: TaskType;
};

export type TimesheetInput = {
  workforceEmail: string;
  primaryProgrammingLanguage: string;
  secondaryProgrammingLanguages: string | null;
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

export type AdminTimesheetRecord = TimesheetRecord & {
  auth0UserId: string;
};

export type UserProfileInput = {
  name: string;
  workforceEmail: string | null;
  discordId: string | null;
  hubstaffEmail: string | null;
};

export type UserProfileRecord = UserProfileInput & {
  auth0Email: string | null;
  createdAt: string;
  updatedAt: string;
};
