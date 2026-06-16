export const TASK_TYPES = [
  "Debugging",
  "Root Cause Analysis",
  "System-Level Investigation",
  "Code writing",
  "Code review",
  "Exploration & learning",
  "Maintenance & ops tooling",
  "Planning & requirements",
  "Design",
  "Testing",
  "Deployment & infra",
  "Communication"
] as const;

export type TaskType = (typeof TASK_TYPES)[number];
