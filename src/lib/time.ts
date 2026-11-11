/** Helpers for clock times ("HH:MM") and durations in minutes. */

/** Parses "22:15", "2215", "22.15", "22u15" or "7" to minutes since midnight; null when invalid. */
export function parseTime(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  let h: number;
  let m: number;
  const sep = t.match(/^(\d{1,2})\s*[:.hu]\s*(\d{0,2})$/);
  if (sep) {
    h = Number(sep[1]);
    m = sep[2] ? Number(sep[2]) : 0;
  } else if (/^\d{3,4}$/.test(t)) {
    h = Number(t.slice(0, -2));
    m = Number(t.slice(-2));
  } else if (/^\d{1,2}$/.test(t)) {
    h = Number(t);
    m = 0;
  } else return null;
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** Minutes since midnight -> "HH:MM" (wraps around midnight). */
export function formatTime(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Normalises user input to "HH:MM"; null when it is not a time. */
export function normalizeTime(text: string): string | null {
  const m = parseTime(text);
  return m == null ? null : formatTime(m);
}

export function isTime(v: unknown): v is string {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

/** Minutes from `from` to `to` going forward on the clock (22:15 -> 06:45 = 510). */
export function minutesBetween(from: string, to: string): number {
  const a = parseTime(from) ?? 0;
  const b = parseTime(to) ?? 0;
  return (b - a + 1440) % 1440;
}

/** 465 -> "7 u 45", 480 -> "8 u", 45 -> "45 min" */
export function hoursLabel(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} u` : `${h} u ${String(m).padStart(2, '0')}`;
}

/**
 * Clock time as a position on a line that does not break at midnight:
 * evening times stay below 24 h, times after midnight continue past it.
 * Used to average and compare bedtimes.
 */
export function eveningMinutes(time: string): number {
  const m = parseTime(time) ?? 0;
  return m < 12 * 60 ? m + 1440 : m;
}
