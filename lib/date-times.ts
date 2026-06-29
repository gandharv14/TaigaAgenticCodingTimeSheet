const EXPLICIT_TIME_ZONE_PATTERN = /(?:z|[+-]\d{2}:?\d{2})$/i;
const DATE_TIME_LOCAL_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

export function hasExplicitTimeZone(value: string) {
  return EXPLICIT_TIME_ZONE_PATTERN.test(value.trim());
}

export function isValidDateTime(value: string) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime());
}

export function normalizeDateTimeToIso(value: string) {
  return new Date(value).toISOString();
}

export function dateTimeLocalToIso(value: string) {
  if (hasExplicitTimeZone(value)) {
    return normalizeDateTimeToIso(value);
  }

  const match = DATE_TIME_LOCAL_PATTERN.exec(value.trim());

  if (!match) {
    return normalizeDateTimeToIso(value);
  }

  const [, year, month, day, hour, minute, second = "0", millisecond = "0"] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(millisecond.padEnd(3, "0"))
  ).toISOString();
}
