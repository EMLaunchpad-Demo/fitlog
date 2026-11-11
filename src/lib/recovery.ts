import { addDays, dateKey, parseDateKey } from './format';
import { eveningMinutes, formatTime, minutesBetween, parseTime } from './time';
import type { CheckIn, Plan, Settings, SleepEntry, Workout } from './types';
import { startOfWeek } from './workout-stats';

// ───────────────────────── Sleep ─────────────────────────

/** Minutes slept: the tracker's value when there is one, otherwise time in bed. */
export function sleepMinutes(e: Pick<SleepEntry, 'bed' | 'wake' | 'asleepMin'>): number {
  return e.asleepMin ?? minutesBetween(e.bed, e.wake);
}

export function targetSleepMinutes(sleep: Settings['sleep']): number {
  return minutesBetween(sleep.bedtime, sleep.wake);
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const stdDev = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

export interface SleepStats {
  nights: number;
  avgMin: number;
  avgBed: string;
  avgWake: string;
  /** Spread (standard deviation, minutes) of bed and wake times: lower = more regular. */
  bedSpreadMin: number;
  wakeSpreadMin: number;
  /** Minutes short of the target, summed over the logged nights (never negative per night). */
  debtMin: number;
}

/** Stats over the nights logged in the last `days` days (including today). */
export function sleepStats(
  entries: SleepEntry[],
  targetMin: number,
  days = 7,
  today = dateKey(),
): SleepStats | null {
  const from = addDays(today, -(days - 1));
  const recent = entries.filter((e) => e.date >= from && e.date <= today);
  if (!recent.length) return null;
  const beds = recent.map((e) => eveningMinutes(e.bed));
  const wakes = recent.map((e) => parseTime(e.wake) ?? 0);
  return {
    nights: recent.length,
    avgMin: Math.round(mean(recent.map(sleepMinutes))),
    avgBed: formatTime(mean(beds)),
    avgWake: formatTime(mean(wakes)),
    bedSpreadMin: Math.round(stdDev(beds)),
    wakeSpreadMin: Math.round(stdDev(wakes)),
    debtMin: Math.round(
      recent.reduce((sum, e) => sum + Math.max(0, targetMin - sleepMinutes(e)), 0),
    ),
  };
}

/** How regular the bed and wake times are. Needs at least three nights. */
export function regularityLabel(stats: SleepStats): string | null {
  if (stats.nights < 3) return null;
  const spread = Math.max(stats.bedSpreadMin, stats.wakeSpreadMin);
  if (spread <= 30) return 'Heel regelmatig';
  if (spread <= 60) return 'Redelijk regelmatig';
  return 'Onregelmatig';
}

/** Minutes from now until a clock time today/tonight; negative once it has passed (up to 6 h). */
export function minutesUntil(time: string, now = new Date()): number {
  const target = parseTime(time) ?? 0;
  const current = now.getHours() * 60 + now.getMinutes();
  let diff = target - current;
  if (diff < -6 * 60) diff += 1440; // e.g. bedtime 00:30 seen at 21:00
  if (diff > 18 * 60) diff -= 1440; // e.g. bedtime 22:15 seen at 00:30
  return diff;
}

// ───────────────────────── Readiness ─────────────────────────

export type ReadinessLevel = 'goed' | 'redelijk' | 'laag';

export interface Readiness {
  /** 0–100 */
  score: number;
  level: ReadinessLevel;
  /** 0–100 each; missing when not logged */
  sleepScore: number | null;
  wellnessScore: number | null;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Simple readiness estimate from the morning check-in and last night's sleep.
 * It is a self-report summary, not a measurement: subjective wellness tracks
 * training load at least as well as most objective markers, but the weights
 * here (60 % check-in, 40 % sleep) are a practical choice.
 */
export function readiness(
  checkIn: CheckIn | undefined,
  sleep: SleepEntry | undefined,
  targetMin: number,
): Readiness | null {
  let sleepPart: number | null = null;
  if (sleep && targetMin > 0) {
    // 100 % at the target, 0 % at 60 % of the target or less.
    const duration = clamp01((sleepMinutes(sleep) / targetMin - 0.6) / 0.4);
    sleepPart =
      sleep.quality != null ? duration * 0.7 + ((sleep.quality - 1) / 4) * 0.3 : duration;
  }
  const wellnessPart = checkIn
    ? mean([checkIn.energy, checkIn.soreness, checkIn.stress, checkIn.mood].map((v) => (v - 1) / 4))
    : null;
  if (sleepPart == null && wellnessPart == null) return null;
  const value =
    sleepPart != null && wellnessPart != null
      ? sleepPart * 0.4 + wellnessPart * 0.6
      : (sleepPart ?? wellnessPart)!;
  const score = Math.round(value * 100);
  return {
    score,
    level: score >= 70 ? 'goed' : score >= 45 ? 'redelijk' : 'laag',
    sleepScore: sleepPart == null ? null : Math.round(sleepPart * 100),
    wellnessScore: wellnessPart == null ? null : Math.round(wellnessPart * 100),
  };
}

export const READINESS_LABEL: Record<ReadinessLevel, string> = {
  goed: 'Goed hersteld',
  redelijk: 'Redelijk hersteld',
  laag: 'Weinig hersteld',
};

export function readinessAdvice(level: ReadinessLevel, restDay: boolean): string {
  if (restDay) {
    return level === 'laag'
      ? 'Rustdag, en die heb je nodig: wandel wat, eet op je doel en ga op tijd slapen.'
      : 'Rustdag: een wandeling of rustige cardio helpt je herstel, zwaar trainen niet.';
  }
  switch (level) {
    case 'goed':
      return 'Train zoals gepland en probeer ergens een rep of wat gewicht bij te doen.';
    case 'redelijk':
      return 'Train zoals gepland, maar hou 2 reps in reserve en jaag vandaag geen records na.';
    case 'laag':
      return 'Hou het licht: doe de helft van je sets of schuif de training een dag op. Blijft dit meerdere dagen zo, neem dan een deloadweek.';
  }
}

// ───────────────────────── Rest days and deload ─────────────────────────

/** 0 = maandag … 6 = zondag */
export function weekdayIndex(d: Date = new Date()): number {
  return (d.getDay() + 6) % 7;
}

export const WEEKDAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

export type DayPlan =
  | { kind: 'done' }
  | { kind: 'rest'; reason: 'vast' | 'week-compleet' }
  | { kind: 'train' };

/** What today is: already trained, a rest day, or a training day. */
export function dayPlan(
  settings: Pick<Settings, 'restDays'>,
  workouts: Workout[],
  plan: Plan | undefined,
  now = new Date(),
): DayPlan {
  const today = dateKey(now);
  if (workouts.some((w) => dateKey(w.startedAt) === today)) return { kind: 'done' };
  if (settings.restDays.includes(weekdayIndex(now))) return { kind: 'rest', reason: 'vast' };
  if (plan && plan.days.length) {
    const monday = startOfWeek(now).getTime();
    const thisWeek = workouts.filter((w) => w.startedAt >= monday && w.planId === plan.id).length;
    if (thisWeek >= plan.days.length) return { kind: 'rest', reason: 'week-compleet' };
  }
  return { kind: 'train' };
}

export interface DeloadStatus {
  /** This week is a deload week. */
  active: boolean;
  /** Training weeks since the last deload (or since the first workout). */
  weeksSince: number;
  due: boolean;
}

export function deloadStatus(
  settings: Pick<Settings, 'deloadEveryWeeks' | 'lastDeloadWeek'>,
  workouts: Workout[],
  now = new Date(),
): DeloadStatus {
  const thisWeek = dateKey(startOfWeek(now));
  const active = settings.lastDeloadWeek === thisWeek;
  const after = settings.lastDeloadWeek ?? '';
  const weeks = new Set(
    workouts
      .map((w) => dateKey(startOfWeek(new Date(w.startedAt))))
      .filter((week) => week > after && week <= thisWeek),
  );
  const weeksSince = active ? 0 : weeks.size;
  return {
    active,
    weeksSince,
    due: !active && settings.deloadEveryWeeks > 0 && weeksSince >= settings.deloadEveryWeeks,
  };
}

/** Sets to do in a deload week: roughly half, never fewer than one. */
export function deloadSets(sets: number): number {
  return Math.max(1, Math.ceil(sets / 2));
}

/** Age in years from a birth year (the birthday itself is unknown, so ±1). */
export function ageFromBirthYear(birthYear: number | null, now = new Date()): number | null {
  if (!birthYear) return null;
  const age = now.getFullYear() - birthYear;
  return age >= 5 && age <= 110 ? age : null;
}

/** Monday key of the week `weeksBack` weeks ago. */
export function weekKey(weeksBack = 0, now = new Date()): string {
  return addDays(dateKey(startOfWeek(now)), -7 * weeksBack);
}

export function isInWeek(date: string, weekStart: string): boolean {
  return date >= weekStart && date < addDays(weekStart, 7);
}

export function weekdayOfKey(date: string): number {
  return weekdayIndex(parseDateKey(date));
}
