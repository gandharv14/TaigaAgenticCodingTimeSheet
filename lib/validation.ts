import { z } from "zod";

import { TASK_TYPES } from "@/lib/task-types";
import type { TimesheetInput } from "@/lib/types";

const MAX_SUMMARY_WORDS = 100;
const MIN_TURNS = 5;

export function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function isValidDateTime(value: string) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime());
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
    liveCompareProblemId: z.string().trim().min(1, "Live Compare problem ID is required."),
    taskUrl: z.string().trim().url("Enter a valid task URL."),
    startAt: z.string().trim().refine(isValidDateTime, "Enter a valid start date and time."),
    endAt: z.string().trim().refine(isValidDateTime, "Enter a valid end date and time."),
    summary: z
      .string()
      .trim()
      .min(1, "Task description is required.")
      .refine(
        (value) => countWords(value) <= MAX_SUMMARY_WORDS,
        "Task description must be 100 words or less."
      ),
    comments: nullableTrimmedString,
    tokenUsage: z.number().int().nonnegative().nullable(),
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
  .superRefine((value, context) => {
    const start = new Date(value.startAt);
    const end = new Date(value.endAt);

    if (Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && end <= start) {
      context.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "End time must be after start time."
      });
    }

    value.turns.forEach((turn, index) => {
      if (turn.turnNumber !== index + 1) {
        context.addIssue({
          code: "custom",
          path: ["turns", index, "turnNumber"],
          message: "Turn numbers must be sequential."
        });
      }
    });
  });

export function validateTimesheetInput(input: unknown) {
  return timesheetInputSchema.safeParse(input) as
    | { success: true; data: TimesheetInput }
    | { success: false; error: z.ZodError };
}

export function validationMessages(error: z.ZodError) {
  return error.issues.map((issue) => issue.message);
}
