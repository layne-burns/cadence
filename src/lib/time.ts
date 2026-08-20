/**
 * Presentation-layer time helpers: formatting and Date/ISO-string
 * conversions for the UI. Deliberately separate from `engine/` — the
 * engine works purely in minutes-since-midnight and knows nothing about
 * wall-clock `Date`s, locale formatting, or `<input type="time">`
 * strings. This file is where those two worlds meet.
 */

import type { DayOfWeek } from "../types/schedule";

const DAY_NAMES: readonly DayOfWeek[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** 570 -> "9:30 AM". Wraps values outside 0..1439 (relevant once nudges —
 * see useSchedule's session-local extend/skip — can push a time past
 * midnight) rather than producing "25:xx". */
export function formatMinutes(totalMinutes: number): string {
  const hours24 = (((Math.floor(totalMinutes / 60) % 24) + 24) % 24);
  const minutes = ((totalMinutes % 60) + 60) % 60;
  const period = hours24 < 12 ? "AM" : "PM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
}

/** "HH:MM" (the value a native `<input type="time">` gives you) -> minutes
 * since midnight. */
export function parseTimeInputToMinutes(value: string): number {
  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

export function minutesToTimeInputValue(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Local-calendar-day ISO date ("2026-08-24"), not UTC — so "today" lines
 * up with the user's wall clock regardless of timezone offset. */
export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

export function dayOfWeekForIso(iso: string): DayOfWeek {
  // DAY_NAMES is a fixed 7-entry array indexed by Date#getDay()'s 0-6
  // range, so this index is always in bounds.
  return DAY_NAMES[parseIsoDate(iso).getDay()] as DayOfWeek;
}

export function addDaysIso(iso: string, delta: number): string {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + delta);
  return toIsoDate(date);
}

export function formatDateLabel(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}
