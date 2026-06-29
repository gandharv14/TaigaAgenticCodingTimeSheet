import type { TaskType } from "@/lib/task-types";

export type TimesheetTurnInput = {
  turnNumber: number;
  taskType: TaskType;
};

export type TimesheetWorkSessionInput = {
  sessionNumber: number;
  startAt: string;
  endAt: string;
};

export type TimesheetProblemInput = {
  primaryProgrammingLanguage: string;
  secondaryProgrammingLanguages: string | null;
  liveCompareProblemId: string;
  taskUrl: string;
  summary: string;
  comments: string | null;
  tokenUsage: number | null;
  blockedOnTaigaBug: boolean;
  turns: TimesheetTurnInput[];
};

export type TotalHoursMode = "calculated" | "override";

export type TimesheetInput = {
  clientSubmissionId: string | null;
  workforceEmail: string;
  workSessions: TimesheetWorkSessionInput[];
  totalHoursMode: TotalHoursMode;
  totalHoursOverride: number | null;
  problems: TimesheetProblemInput[];
};

export type TimesheetProblemRecord = TimesheetProblemInput & {
  id: string;
};

export type TimesheetRecord = Pick<TimesheetInput, "workforceEmail" | "workSessions" | "totalHoursOverride"> & {
  id: string;
  auth0Email: string | null;
  startAt: string;
  endAt: string;
  calculatedHours: number;
  reportedHours: number;
  problemCount: number;
  problems: TimesheetProblemRecord[];
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
