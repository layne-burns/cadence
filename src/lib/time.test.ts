import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  dayOfWeekForIso,
  formatMinutes,
  minutesToTimeInputValue,
  parseTimeInputToMinutes,
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
