import { TuakaInputError } from "./errors.js";

/**
 * Calendar arithmetic on plain year/month/day integers.
 * No Date object, no time zone: the same input gives the same dates everywhere.
 */
export interface Ymd {
  y: number;
  m: number;
  d: number;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  const days = [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[m - 1] ?? 0;
}

export function parseIsoDate(value: string, field = "startDate"): Ymd {
  const match = ISO.exec(value);
  if (!match) {
    throw new TuakaInputError("invalid_date", `${field} must be YYYY-MM-DD, got "${value}".`, field);
  }
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) {
    throw new TuakaInputError("invalid_date", `${field} "${value}" is not a real date.`, field);
  }
  return { y, m, d };
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

export function formatIsoDate({ y, m, d }: Ymd): string {
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

/** `start` plus `k` months, keeping the day of month and clamping to the month's last day (31 Jan + 1 → 28/29 Feb). */
export function addMonths(start: Ymd, k: number): Ymd {
  const index = start.m - 1 + k;
  const yearOffset = (index - (index % 12)) / 12;
  const y = start.y + yearOffset;
  const m = (index % 12) + 1;
  const last = daysInMonth(y, m);
  const d = start.d > last ? last : start.d;
  return { y, m, d };
}
