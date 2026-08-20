import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  addMonthsIso,
  dayOfWeekForIso,
  dayNumber,
  formatDateRangeLabel,
  formatMinutes,
  formatMonthLabel,
  minutesToTimeInputValue,
  monthGridDates,
  parseTimeInputToMinutes,
  startOfMonthIso,
  startOfWeekIso,
  toIsoDate,
} from "./time";

describe("formatMinutes", () => {
  it("formats midnight as 12:00 AM", () => {
    expect(formatMinutes(0)).toBe("12:00 AM");
  });

  it("formats noon as 12:00 PM", () => {
    expect(formatMinutes(12 * 60)).toBe("12:00 PM");
  });

  it("formats an afternoon time", () => {
    expect(formatMinutes(14 * 60 + 5)).toBe("2:05 PM");
  });

  it("wraps a value past midnight instead of showing 25:xx", () => {
    expect(formatMinutes(25 * 60)).toBe("1:00 AM");
  });
});

describe("time input round-trip", () => {
  it("parses and reformats consistently", () => {
    expect(parseTimeInputToMinutes("09:30")).toBe(9 * 60 + 30);
    expect(minutesToTimeInputValue(9 * 60 + 30)).toBe("09:30");
  });
});

describe("ISO date helpers", () => {
  it("round-trips toIsoDate for a local date", () => {
    expect(toIsoDate(new Date(2026, 7, 24))).toBe("2026-08-24"); // August = month 7
  });

  it("maps an ISO date to the correct day of week", () => {
    expect(dayOfWeekForIso("2026-08-24")).toBe("monday");
  });

  it("adds days across a month boundary", () => {
    expect(addDaysIso("2026-08-31", 1)).toBe("2026-09-01");
  });

  it("subtracts days across a year boundary", () => {
    expect(addDaysIso("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("addMonthsIso", () => {
  it("adds months across a year boundary", () => {
    expect(addMonthsIso("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("subtracts months", () => {
    expect(addMonthsIso("2026-03-10", -1)).toBe("2026-02-10");
  });
});

describe("startOfWeekIso", () => {
  it("returns the same date when it's already Monday", () => {
    expect(startOfWeekIso("2026-08-24")).toBe("2026-08-24"); // a Monday
  });

  it("finds the preceding Monday for a mid-week date", () => {
    expect(startOfWeekIso("2026-08-27")).toBe("2026-08-24"); // Thursday -> Monday
  });

  it("finds the preceding Monday for a Sunday (wraps back 6 days, not forward)", () => {
    expect(startOfWeekIso("2026-08-30")).toBe("2026-08-24"); // Sunday
  });
});

describe("startOfMonthIso", () => {
  it("returns the 1st of the month", () => {
    expect(startOfMonthIso("2026-08-24")).toBe("2026-08-01");
  });
});

describe("monthGridDates", () => {
  it("returns a 42-date Monday-first grid containing the whole month", () => {
    const dates = monthGridDates("2026-08-24");
    expect(dates).toHaveLength(42);
    expect(dates).toContain("2026-08-01");
    expect(dates).toContain("2026-08-31");
    // Grid starts on a Monday and therefore includes some trailing days
    // from the surrounding months.
    expect(dayOfWeekForIso(dates[0]!)).toBe("monday");
  });
});

describe("dayNumber / formatMonthLabel / formatDateRangeLabel", () => {
  it("extracts the day-of-month number", () => {
    expect(dayNumber("2026-08-24")).toBe(24);
  });

  it("formats a month label", () => {
    expect(formatMonthLabel("2026-08-24")).toBe("August 2026");
  });

  it("formats a same-month range compactly", () => {
    expect(formatDateRangeLabel("2026-08-19", "2026-08-21")).toBe("Aug 19 – 21");
  });

  it("formats a cross-month range with both months named", () => {
    expect(formatDateRangeLabel("2026-08-30", "2026-09-02")).toBe("Aug 30 – Sep 2");
  });
});
