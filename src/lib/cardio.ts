import type { IconName } from '@/components/icon';

import { addDays } from './format';
import type { CardioKind, CardioSession, Intensity } from './types';

/**
 * Cardio types with a typical MET value at moderate effort
 * (Compendium of Physical Activities). kcal = MET × kg × hours.
 */
export const CARDIO_KINDS: { key: CardioKind; label: string; met: number; icon: IconName }[] = [
  { key: 'wandelen', label: 'Wandelen', met: 3.8, icon: 'walk' },
  { key: 'lopen', label: 'Lopen', met: 9, icon: 'run' },
  { key: 'fietsen', label: 'Fietsen', met: 6.8, icon: 'bike' },
  { key: 'zwemmen', label: 'Zwemmen', met: 6, icon: 'water' },
  { key: 'roeien', label: 'Roeien', met: 7, icon: 'run' },
  { key: 'crosstrainer', label: 'Crosstrainer', met: 5, icon: 'run' },
  { key: 'sport', label: 'Sport', met: 7, icon: 'trophy' },
  { key: 'hiit', label: 'HIIT', met: 8, icon: 'bolt' },
  { key: 'werk', label: 'Fysiek werk', met: 4, icon: 'walk' },
  { key: 'anders', label: 'Anders', met: 5, icon: 'heart' },
];

export const INTENSITIES: { key: Intensity; label: string; hint: string; factor: number }[] = [
  { key: 'licht', label: 'Licht', hint: 'zingen lukt nog', factor: 0.8 },
  { key: 'matig', label: 'Matig', hint: 'zone 2: praten lukt, zingen niet', factor: 1 },
  { key: 'zwaar', label: 'Zwaar', hint: 'maar een paar woorden per adem', factor: 1.3 },
];

export function cardioKind(kind: CardioKind) {
  return CARDIO_KINDS.find((k) => k.key === kind) ?? CARDIO_KINDS[CARDIO_KINDS.length - 1];
}

/** Energy for a session: the logged value, otherwise MET × weight × time. */
export function cardioKcal(
  s: Pick<CardioSession, 'kind' | 'minutes' | 'intensity' | 'kcal'>,
  weightKg: number | null,
): number | null {
  if (s.kcal != null) return s.kcal;
  if (!weightKg) return null;
  const factor = INTENSITIES.find((i) => i.key === s.intensity)?.factor ?? 1;
  return Math.round(cardioKind(s.kind).met * factor * weightKg * (s.minutes / 60));
}

/**
 * Minutes that count towards the weekly goal, the way activity guidelines add
 * them up: moderate minutes once, vigorous minutes twice. Light activity is
 * good for step count and recovery but does not count here.
 */
export function moderateEquivalent(s: Pick<CardioSession, 'minutes' | 'intensity'>): number {
  return s.intensity === 'zwaar' ? s.minutes * 2 : s.intensity === 'matig' ? s.minutes : 0;
}

export interface WeekCardio {
  sessions: number;
  minutes: number;
  moderateEq: number;
  distanceKm: number;
}

export function weekCardio(log: CardioSession[], weekStart: string): WeekCardio {
  const end = addDays(weekStart, 7);
  const week = log.filter((s) => s.date >= weekStart && s.date < end);
  return {
    sessions: week.length,
    minutes: week.reduce((n, s) => n + s.minutes, 0),
    moderateEq: week.reduce((n, s) => n + moderateEquivalent(s), 0),
    distanceKm: Math.round(week.reduce((n, s) => n + (s.distanceKm ?? 0), 0) * 10) / 10,
  };
}

/** Pace for sessions with a distance: "5:36 /km" for lopen/wandelen, "24,5 km/u" otherwise. */
export function paceLabel(s: Pick<CardioSession, 'kind' | 'minutes' | 'distanceKm'>): string | null {
  if (!s.distanceKm || s.distanceKm <= 0 || s.minutes <= 0) return null;
  if (s.kind === 'lopen' || s.kind === 'wandelen') {
    const perKm = s.minutes / s.distanceKm;
    const min = Math.floor(perKm);
    const sec = Math.round((perKm - min) * 60);
    return sec === 60 ? `${min + 1}:00 /km` : `${min}:${String(sec).padStart(2, '0')} /km`;
  }
  const kmh = Math.round((s.distanceKm / (s.minutes / 60)) * 10) / 10;
  return `${String(kmh).replace('.', ',')} km/u`;
}

/**
 * Estimated max heart rate (Tanaka 2001: 208 − 0.7 × age) and the band for
 * moderate effort, about 64–76 % of it. The formula misses a person's real
 * maximum by about 11 beats on average (Shookster 2020), so this is a
 * direction and the talk test stays the better guide.
 */
export function heartRateZones(age: number): { max: number; zone2: [number, number] } {
  const max = Math.round(208 - 0.7 * age);
  return { max, zone2: [Math.round(max * 0.64), Math.round(max * 0.76)] };
}

/** Average steps over the days that have a step count in the given week. */
export function weekSteps(
  steps: Record<string, number>,
  weekStart: string,
): { avg: number; days: number; total: number } {
  const values: number[] = [];
  for (let i = 0; i < 7; i++) {
    const v = steps[addDays(weekStart, i)];
    if (v != null && v > 0) values.push(v);
  }
  const total = values.reduce((a, b) => a + b, 0);
  return { avg: values.length ? Math.round(total / values.length) : 0, days: values.length, total };
}
