import { TASK_TYPES, type TaskType } from "@/lib/task-types";
import type { AdminTimesheetRecord } from "@/lib/types";

export const IDEAL_CATEGORY_SHARE = {
  Debugging: 15,
  "Root Cause Analysis": 10,
  "System-Level Investigation": 10,
  "Code writing": 15,
  "Code review": 10,
  "Exploration & learning": 5,
  "Maintenance & ops tooling": 10,
  "Planning & requirements": 5,
  Design: 5,
  Testing: 5,
  "Deployment & infra": 5,
  Communication: 5
} satisfies Record<TaskType, number>;

export const TOKEN_USAGE_BINS = [
  { label: "0-0.5M", lower: 0, upper: 500_000 },
  { label: "0.5-0.75M", lower: 500_000, upper: 750_000 },
  { label: "0.75-1M", lower: 750_000, upper: 1_000_000 },
  { label: "1-1.25M", lower: 1_000_000, upper: 1_250_000 },
  { label: "1.25-1.5M", lower: 1_250_000, upper: 1_500_000 },
  { label: "1.5-1.75M", lower: 1_500_000, upper: 1_750_000 },
  { label: "1.75-2M", lower: 1_750_000, upper: 2_000_000 },
  { label: "2-2.5M", lower: 2_000_000, upper: 2_500_000 },
  { label: "2.5-3M", lower: 2_500_000, upper: 3_000_000 },
  { label: "3-3.2M", lower: 3_000_000, upper: 3_200_000 },
  { label: "3.2-5M", lower: 3_200_000, upper: 5_000_000 },
  { label: "5-10M", lower: 5_000_000, upper: 10_000_000 },
  { label: "10-20M", lower: 10_000_000, upper: 20_000_000 },
  { label: "20M-70M", lower: 20_000_000, upper: null }
] as const;

export type CategoryAnalyticsRow = {
  category: TaskType;
  count: number;
  share: number;
  averagePerTask: number;
  idealShare: number;
  deltaShare: number;
};

export type TokenHistogramBin = {
  label: string;
  lower: number;
  upper: number | null;
  count: number;
  isOutlierBucket: boolean;
};

export type TokenScatterPoint = {
  id: string;
  label: string;
  x: number;
  tokenUsage: number;
  logTokenUsage: number;
  isOutlier: boolean;
};

export type TokenScatterAnalytics = {
  xLabel: string;
  points: TokenScatterPoint[];
  correlation: number | null;
  xMin: number;
  xMax: number;
};

export type TokenUsageAnalytics = {
  reportedRows: number;
  blankRows: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
  q1: number | null;
  q3: number | null;
  iqr: number | null;
  highOutlierCutoff: number | null;
  outlierCount: number;
  histogramBins: TokenHistogramBin[];
  turnsScatter: TokenScatterAnalytics;
  hoursScatter: TokenScatterAnalytics;
};

export type OutlierFilterAnalytics = {
  totalRows: number;
  includedRows: number;
  excludedRows: number;
  excludedForHours: number;
  excludedForTokens: number;
  reportedHoursMin: number;
  reportedHoursMax: number | null;
  tokenUsageMax: number | null;
};

export type AdminAnalytics = {
  taskCount: number;
  totalTurns: number;
  averageHandlingHours: number;
  outlierFilter: OutlierFilterAnalytics;
  categoryRows: CategoryAnalyticsRow[];
  categoryRowsByCount: CategoryAnalyticsRow[];
  tokenUsage: TokenUsageAnalytics;
};

type FilteredEntries = {
  includedEntries: AdminTimesheetRecord[];
  metadata: OutlierFilterAnalytics;
};

function round(value: number, digits: number) {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function percentile(sortedValues: number[], percentileValue: number) {
  if (sortedValues.length === 0) {
    return null;
  }

  const index = (sortedValues.length - 1) * percentileValue;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  const lowerValue = sortedValues[lowerIndex];
  const upperValue = sortedValues[upperIndex];

  if (lowerValue === undefined || upperValue === undefined) {
    return null;
  }

  if (lowerIndex === upperIndex) {
    return lowerValue;
  }

  return lowerValue + (upperValue - lowerValue) * (index - lowerIndex);
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function finiteValues(values: number[]) {
  return values.filter((value) => Number.isFinite(value));
}

function highOutlierCutoff(values: number[], multiplier: number) {
  const sortedValues = [...finiteValues(values)].sort((a, b) => a - b);
  const q1 = percentile(sortedValues, 0.25);
  const q3 = percentile(sortedValues, 0.75);

  if (q1 === null || q3 === null) {
    return null;
  }

  return q3 + multiplier * (q3 - q1);
}

function pearsonCorrelation(xValues: number[], yValues: number[]) {
  if (xValues.length !== yValues.length || xValues.length < 2) {
    return null;
  }

  const xAverage = average(xValues);
  const yAverage = average(yValues);

  if (xAverage === null || yAverage === null) {
    return null;
  }

  let covariance = 0;
  let xVariance = 0;
  let yVariance = 0;

  for (let index = 0; index < xValues.length; index += 1) {
    const xDelta = xValues[index] - xAverage;
    const yDelta = yValues[index] - yAverage;
    covariance += xDelta * yDelta;
    xVariance += xDelta ** 2;
    yVariance += yDelta ** 2;
  }

  if (xVariance === 0 || yVariance === 0) {
    return null;
  }

  return covariance / Math.sqrt(xVariance * yVariance);
}

function tokenValues(entries: AdminTimesheetRecord[]) {
  return entries
    .map((entry) => entry.tokenUsage)
    .filter((tokenUsage): tokenUsage is number => tokenUsage !== null && Number.isFinite(tokenUsage));
}

function buildHistogramBins(values: number[], highOutlierCutoff: number | null): TokenHistogramBin[] {
  return TOKEN_USAGE_BINS.map((bin) => {
    const binValues = values.filter((value) => value >= bin.lower && (bin.upper === null || value < bin.upper));

    return {
      ...bin,
      count: binValues.length,
      isOutlierBucket: highOutlierCutoff !== null && binValues.some((value) => value > highOutlierCutoff)
    };
  });
}

function buildScatter(
  entries: AdminTimesheetRecord[],
  highOutlierCutoff: number | null,
  xLabel: string,
  xValue: (entry: AdminTimesheetRecord) => number
): TokenScatterAnalytics {
  const points = entries.flatMap((entry) => {
    if (entry.tokenUsage === null || entry.tokenUsage <= 0 || !Number.isFinite(entry.tokenUsage)) {
      return [];
    }

    const x = xValue(entry);

    if (!Number.isFinite(x)) {
      return [];
    }

    return [
      {
        id: entry.id,
        label: entry.liveCompareProblemId,
        x,
        tokenUsage: entry.tokenUsage,
        logTokenUsage: Math.log10(entry.tokenUsage),
        isOutlier: highOutlierCutoff !== null && entry.tokenUsage > highOutlierCutoff
      }
    ];
  });
  const xValues = points.map((point) => point.x);
  const yValues = points.map((point) => point.logTokenUsage);
  const xMax = Math.max(0, ...xValues);

  return {
    xLabel,
    points,
    correlation: pearsonCorrelation(xValues, yValues),
    xMin: 0,
    xMax
  };
}

function summarizeTokenUsage(entries: AdminTimesheetRecord[]): TokenUsageAnalytics {
  const values = tokenValues(entries);
  const sortedValues = [...values].sort((a, b) => a - b);
  const q1 = percentile(sortedValues, 0.25);
  const median = percentile(sortedValues, 0.5);
  const q3 = percentile(sortedValues, 0.75);
  const iqr = q1 !== null && q3 !== null ? q3 - q1 : null;
  const highOutlierCutoff = q3 !== null && iqr !== null ? q3 + 1.5 * iqr : null;
  const outlierCount = highOutlierCutoff === null ? 0 : values.filter((value) => value > highOutlierCutoff).length;

  return {
    reportedRows: values.length,
    blankRows: entries.length - values.length,
    min: sortedValues[0] ?? null,
    max: sortedValues[sortedValues.length - 1] ?? null,
    mean: average(values),
    median,
    q1,
    q3,
    iqr,
    highOutlierCutoff,
    outlierCount,
    histogramBins: buildHistogramBins(values, highOutlierCutoff),
    turnsScatter: buildScatter(entries, highOutlierCutoff, "Turn count per timesheet", (entry) => entry.turns.length),
    hoursScatter: buildScatter(entries, highOutlierCutoff, "Reported hours per problem", (entry) => entry.reportedHours)
  };
}

function filterOutlierEntries(entries: AdminTimesheetRecord[]): FilteredEntries {
  const reportedHoursValues = finiteValues(entries.map((entry) => entry.reportedHours).filter((value) => value > 0));
  const tokenUsageValues = tokenValues(entries);
  const reportedHoursMax = Math.max(24, highOutlierCutoff(reportedHoursValues, 3) ?? 24);
  const tokenUsageMax = highOutlierCutoff(tokenUsageValues, 3);
  let excludedForHours = 0;
  let excludedForTokens = 0;
  const includedEntries = entries.filter((entry) => {
    const isHoursOutlier = !Number.isFinite(entry.reportedHours) || entry.reportedHours <= 0 || entry.reportedHours > reportedHoursMax;
    const isTokenOutlier = entry.tokenUsage !== null && Number.isFinite(entry.tokenUsage) && tokenUsageMax !== null && entry.tokenUsage > tokenUsageMax;

    if (isHoursOutlier) {
      excludedForHours += 1;
    }

    if (isTokenOutlier) {
      excludedForTokens += 1;
    }

    return !isHoursOutlier && !isTokenOutlier;
  });

  return {
    includedEntries,
    metadata: {
      totalRows: entries.length,
      includedRows: includedEntries.length,
      excludedRows: entries.length - includedEntries.length,
      excludedForHours,
      excludedForTokens,
      reportedHoursMin: 0,
      reportedHoursMax,
      tokenUsageMax
    }
  };
}

export function summarizeAdminAnalytics(entries: AdminTimesheetRecord[]): AdminAnalytics {
  const { includedEntries, metadata } = filterOutlierEntries(entries);
  const counts = new Map<TaskType, number>(TASK_TYPES.map((taskType) => [taskType, 0]));
  const averageHandlingHours = round(average(includedEntries.map((entry) => entry.reportedHours)) ?? 0, 2);

  for (const entry of includedEntries) {
    for (const turn of entry.turns) {
      counts.set(turn.taskType, (counts.get(turn.taskType) ?? 0) + 1);
    }
  }

  const totalTurns = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const categoryRows = TASK_TYPES.map((category) => {
    const count = counts.get(category) ?? 0;
    const share = totalTurns === 0 ? 0 : round((count / totalTurns) * 100, 1);
    const averagePerTask = includedEntries.length === 0 ? 0 : round(count / includedEntries.length, 2);
    const idealShare = IDEAL_CATEGORY_SHARE[category];

    return {
      category,
      count,
      share,
      averagePerTask,
      idealShare,
      deltaShare: round(share - idealShare, 1)
    };
  });

  return {
    taskCount: includedEntries.length,
    totalTurns,
    averageHandlingHours,
    outlierFilter: metadata,
    categoryRows,
    categoryRowsByCount: [...categoryRows].sort((a, b) => b.count - a.count || TASK_TYPES.indexOf(a.category) - TASK_TYPES.indexOf(b.category)),
    tokenUsage: summarizeTokenUsage(includedEntries)
  };
}
