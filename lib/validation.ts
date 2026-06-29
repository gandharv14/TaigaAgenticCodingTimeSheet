import { z } from "zod";

import { hasExplicitTimeZone, isValidDateTime } from "@/lib/date-times";
import { TASK_TYPES } from "@/lib/task-types";
import type { TimesheetInput, UserProfileInput } from "@/lib/types";

const MAX_SUMMARY_WORDS = 100;
const MIN_TURNS = 5;

export function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

const nullableTrimmedString = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  },
  z.string().nullable()
);

const optionalWorkforceEmail = nullableTrimmedString.refine(
  (value) => value === null || value.toLowerCase().endsWith("@alignerrworkforce.com"),
  "Google Workforce email must use @alignerrworkforce.com."
);

export const timesheetInputSchema = z
  .object({
    workforceEmail: z
      .string()
      .trim()
      .email("Enter a valid Google Workforce email.")
      .refine(
        (value) => value.toLowerCase().endsWith("@alignerrworkforce.com"),
        "Google Workforce email must use @alignerrworkforce.com."
      ),
    workSessions: z
      .array(
        z.object({
          sessionNumber: z.number().int().positive(),
          startAt: z
            .string()
            .trim()
            .refine(isValidDateTime, "Enter a valid session start date and time.")
            .refine(hasExplicitTimeZone, "Session start date and time must include a timezone."),
          endAt: z
            .string()
            .trim()
            .refine(isValidDateTime, "Enter a valid session end date and time.")
            .refine(hasExplicitTimeZone, "Session end date and time must include a timezone.")
        })
      )
      .min(1, "At least one work session is required."),
    totalHoursOverride: z.number().finite().nonnegative().nullable(),
    problems: z
      .array(
        z.object({
          primaryProgrammingLanguage: z
            .string()
            .trim()
            .min(1, "Primary programming language is required.")
            .max(80, "Primary programming language must be 80 characters or less."),
          secondaryProgrammingLanguages: nullableTrimmedString.refine(
            (value) => value === null || value.length <= 240,
            "Secondary programming languages must be 240 characters or less."
          ),
          liveCompareProblemId: z.string().trim().min(1, "Live Compare problem ID is required."),
          taskUrl: z.string().trim().url("Enter a valid task URL."),
          summary: z
            .string()
            .trim()
            .min(1, "Task description is required.")
            .refine(
              (value) => countWords(value) <= MAX_SUMMARY_WORDS,
              "Task description must be 100 words or less."
            ),
          comments: nullableTrimmedString,
          tokenUsage: z.number({ error: "Token usage is required." }).int().nonnegative("Token usage must be zero or greater."),
          blockedOnTaigaBug: z.boolean(),
          turns: z
            .array(
              z.object({
                turnNumber: z.number().int().positive(),
                taskType: z.enum(TASK_TYPES)
              })
            )
            .min(MIN_TURNS, "At least 5 turns are required.")
        })
      )
      .min(1, "At least one problem is required.")
  })
  .superRefine((value, context) => {
    validateWorkSessions(value.workSessions, context);

    value.problems.forEach((problem, problemIndex) => {
      problem.turns.forEach((turn, turnIndex) => {
        if (turn.turnNumber !== turnIndex + 1) {
          context.addIssue({
            code: "custom",
            path: ["problems", problemIndex, "turns", turnIndex, "turnNumber"],
            message: "Turn numbers must be sequential."
          });
        }
      });
    });
  });

const legacyTimesheetInputSchema = z
  .object({
    workforceEmail: z.string(),
    primaryProgrammingLanguage: z.string(),
    secondaryProgrammingLanguages: nullableTrimmedString,
    liveCompareProblemId: z.string(),
    taskUrl: z.string(),
    workSessions: z.array(
      z.object({
        sessionNumber: z.number().int().positive(),
        startAt: z.string(),
        endAt: z.string()
      })
    ),
    totalHoursOverride: z.number().finite().nonnegative().nullable(),
    summary: z
      .string(),
    comments: nullableTrimmedString,
    tokenUsage: z.number().int().nonnegative().nullable(),
    blockedOnTaigaBug: z.boolean(),
    turns: z.array(
      z.object({
        turnNumber: z.number().int().positive(),
        taskType: z.enum(TASK_TYPES)
      })
    )
  })
  .transform((value) => ({
    workforceEmail: value.workforceEmail,
    workSessions: value.workSessions,
    totalHoursOverride: value.totalHoursOverride,
    problems: [
      {
        primaryProgrammingLanguage: value.primaryProgrammingLanguage,
        secondaryProgrammingLanguages: value.secondaryProgrammingLanguages,
        liveCompareProblemId: value.liveCompareProblemId,
        taskUrl: value.taskUrl,
        summary: value.summary,
        comments: value.comments,
        tokenUsage: value.tokenUsage,
        blockedOnTaigaBug: value.blockedOnTaigaBug,
        turns: value.turns
      }
    ]
  }));

function validateWorkSessions(
  workSessions: TimesheetInput["workSessions"],
  context: z.RefinementCtx
) {
  const sessionRanges = workSessions
    .map((session, index) => ({
      index,
      start: new Date(session.startAt),
      end: new Date(session.endAt)
    }))
    .filter(({ start, end }) => Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()));

  sessionRanges.forEach(({ index, start, end }) => {
    if (end <= start) {
      context.addIssue({
        code: "custom",
        path: ["workSessions", index, "endAt"],
        message: "Session end time must be after start time."
      });
    }
  });

  [...sessionRanges]
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .forEach((range, sortedIndex, sortedRanges) => {
      const previous = sortedRanges[sortedIndex - 1];

      if (previous && range.start < previous.end) {
        context.addIssue({
          code: "custom",
          path: ["workSessions", range.index, "startAt"],
          message: "Work sessions cannot overlap."
        });
      }
    });

  workSessions.forEach((session, index) => {
    if (session.sessionNumber !== index + 1) {
      context.addIssue({
        code: "custom",
        path: ["workSessions", index, "sessionNumber"],
        message: "Session numbers must be sequential."
      });
    }
  });
}

export function validateTimesheetInput(input: unknown) {
  if (isLegacyTimesheetInput(input)) {
    const legacyParsed = legacyTimesheetInputSchema.safeParse(input);

    if (!legacyParsed.success) {
      return legacyParsed as { success: false; error: z.ZodError };
    }

    return timesheetInputSchema.safeParse(legacyParsed.data) as
      | { success: true; data: TimesheetInput }
      | { success: false; error: z.ZodError };
  }

  return timesheetInputSchema.safeParse(input) as
    | { success: true; data: TimesheetInput }
    | { success: false; error: z.ZodError };
}

function isLegacyTimesheetInput(input: unknown) {
  return (
    typeof input === "object" &&
    input !== null &&
    !("problems" in input) &&
    "liveCompareProblemId" in input
  );
}

export const userProfileInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120, "Name must be 120 characters or less."),
  workforceEmail: optionalWorkforceEmail,
  discordId: nullableTrimmedString.refine(
    (value) => value === null || value.length <= 120,
    "Discord ID must be 120 characters or less."
  ),
  hubstaffEmail: nullableTrimmedString.refine(
    (value) => value === null || z.string().email().safeParse(value).success,
    "Enter a valid Hubstaff email."
  )
});

export function validateUserProfileInput(input: unknown) {
  return userProfileInputSchema.safeParse(input) as
    | { success: true; data: UserProfileInput }
    | { success: false; error: z.ZodError };
}

export function validationMessages(error: z.ZodError) {
  return error.issues.map((issue) => issue.message);
}
