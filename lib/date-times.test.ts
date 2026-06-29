import { describe, expect, it } from "vitest";

import { dateTimeLocalToIso, hasExplicitTimeZone, normalizeDateTimeToIso } from "@/lib/date-times";

describe("date time helpers", () => {
  it("detects datetimes with explicit timezones", () => {
    expect(hasExplicitTimeZone("2026-06-29T17:14:00.000Z")).toBe(true);
    expect(hasExplicitTimeZone("2026-06-29T17:14+01:00")).toBe(true);
    expect(hasExplicitTimeZone("2026-06-29T17:14")).toBe(false);
  });

  it("normalizes explicit timezone datetimes to UTC ISO strings", () => {
    expect(normalizeDateTimeToIso("2026-06-29T17:14+01:00")).toBe("2026-06-29T16:14:00.000Z");
    expect(normalizeDateTimeToIso("2026-06-29T17:14:00.000Z")).toBe("2026-06-29T17:14:00.000Z");
  });

  it("converts datetime-local values using the current local timezone", () => {
    const localDate = new Date(2026, 5, 29, 17, 14);

    expect(dateTimeLocalToIso("2026-06-29T17:14")).toBe(localDate.toISOString());
  });
});
