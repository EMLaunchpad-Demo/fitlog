import { addDays, dateKey, parseDateKey } from './format';
import { sumMacros } from './nutrition';
import type { BodyWeight, FoodEntry, Phase, PhaseType } from './types';

export const PHASE_LABEL: Record<PhaseType, string> = {
  cut: 'Cut',
  onderhoud: 'Onderhoud',
  bulk: 'Bulk',
};

/** Sensible default rate of weight change per phase, in % of body weight per week. */
export const DEFAULT_RATE: Record<PhaseType, number> = { cut: -0.5, onderhoud: 0, bulk: 0.25 };

/** Faster than this is too fast for a lean lifter who wants to keep muscle (%/week). */
export const MAX_LOSS_PCT = 1;
/**
 * Energy in a kilo of body-weight change. The classic 7700 kcal/kg fits people
 * with a lot of fat mass and overestimates the deficit a lean person needs per
 * kilo (Hall 2008), which is one reason corrections here are capped at 200 kcal.
 */
export const KCAL_PER_KG = 7700;

const daysBetween = (a: string, b: string) =>
  Math.round((parseDateKey(b).getTime() - parseDateKey(a).getTime()) / 86400000);

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export interface Trend {
  /** kg per week, from a straight line through the weigh-ins */
  kgPerWeek: number;
  /** Trend weight today (end of the line) */
  currentKg: number;
  weighIns: number;
  spanDays: number;
}

/**
 * Trend of the body weight over the last `days` days: least-squares line
 * through the weigh-ins. Needs at least 5 weigh-ins spread over 10 days,
 * because day-to-day weight swings 1–2 kg with water and food.
 */
export function weightTrend(
  weights: BodyWeight[],
  days = 21,
  today = dateKey(),
  notBefore?: string,
): Trend | null {
  let from = addDays(today, -(days - 1));
  if (notBefore && notBefore > from) from = notBefore;
  const pts = weights
    .filter((w) => w.date >= from && w.date <= today)
    .map((w) => ({ x: daysBetween(from, w.date), y: w.kg }));
  if (pts.length < 5) return null;
  const span = pts[pts.length - 1].x - pts[0].x;
  if (span < 10) return null;
  const mx = avg(pts.map((p) => p.x));
  const my = avg(pts.map((p) => p.y));
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  if (sxx === 0) return null;
  const slope = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / sxx;
  const lastX = daysBetween(from, today);
  return {
    kgPerWeek: slope * 7,
    currentKg: my + slope * (lastX - mx),
    weighIns: pts.length,
    spanDays: span,
  };
}

export type PhaseStatus = 'op-koers' | 'te-snel' | 'te-traag' | 'veel-te-snel' | 'te-weinig-data';

export interface PhaseProgress {
  dayNo: number;
  totalDays: number | null;
  daysLeft: number | null;
  ended: boolean;
  /** Average of the weigh-ins in the first week of the phase */
  startKg: number | null;
  currentKg: number | null;
  changeKg: number | null;
  trend: Trend | null;
  /** Actual change in % of body weight per week */
  ratePct: number | null;
  targetKgPerWeek: number | null;
  status: PhaseStatus;
  /** Suggested change to the daily kcal goal (0 when on track or unknown) */
  kcalAdjust: number;
}

export function phaseProgress(
  phase: Phase,
  weights: BodyWeight[],
  today = dateKey(),
): PhaseProgress {
  const dayNo = Math.max(1, daysBetween(phase.start, today) + 1);
  const totalDays = phase.end ? daysBetween(phase.start, phase.end) + 1 : null;
  const daysLeft = phase.end ? daysBetween(today, phase.end) : null;

  const firstWeek = weights.filter(
    (w) => w.date >= phase.start && w.date < addDays(phase.start, 7),
  );
  const before = [...weights].reverse().find((w) => w.date < phase.start);
  const startKg = firstWeek.length ? avg(firstWeek.map((w) => w.kg)) : (before?.kg ?? null);

  const trend = weightTrend(weights, 21, today, phase.start);
  const lastWeek = weights.filter((w) => w.date > addDays(today, -7) && w.date <= today);
  const currentKg =
    trend?.currentKg ?? (lastWeek.length ? avg(lastWeek.map((w) => w.kg)) : null);

  const ratePct = trend && currentKg ? (trend.kgPerWeek / currentKg) * 100 : null;
  const targetKgPerWeek = currentKg != null ? (phase.ratePct / 100) * currentKg : null;

  let status: PhaseStatus = 'te-weinig-data';
  let kcalAdjust = 0;
  if (trend && ratePct != null && targetKgPerWeek != null) {
    const diffPct = ratePct - phase.ratePct; // negative = losing faster than planned
    if (ratePct < -MAX_LOSS_PCT) status = 'veel-te-snel';
    else if (Math.abs(diffPct) <= 0.2) status = 'op-koers';
    else if (phase.type === 'bulk') status = diffPct > 0 ? 'te-snel' : 'te-traag';
    else status = diffPct < 0 ? 'te-snel' : 'te-traag';

    if (status !== 'op-koers') {
      // Close the gap between the actual and the planned rate; small steps only.
      const raw = ((targetKgPerWeek - trend.kgPerWeek) * KCAL_PER_KG) / 7;
      kcalAdjust = Math.max(-200, Math.min(200, Math.round(raw / 50) * 50));
    }
  }

  return {
    dayNo,
    totalDays,
    daysLeft,
    ended: daysLeft != null && daysLeft < 0,
    startKg,
    currentKg,
    changeKg: startKg != null && currentKg != null ? currentKg - startKg : null,
    trend,
    ratePct,
    targetKgPerWeek,
    status,
    kcalAdjust,
  };
}

export function phaseStatusText(p: PhaseProgress, phase: Phase): string {
  switch (p.status) {
    case 'te-weinig-data':
      return 'Nog te weinig wegingen voor een trend: weeg je minstens 5 keer verspreid over 10 dagen.';
    case 'op-koers':
      return 'Je zit op koers. Niets veranderen.';
    case 'veel-te-snel':
      return `Je verliest meer dan ${MAX_LOSS_PCT}% per week. Dat kost spiermassa en energie: eet ongeveer ${Math.abs(p.kcalAdjust)} kcal per dag meer.`;
    case 'te-snel':
      return phase.type === 'bulk'
        ? `Je komt sneller aan dan gepland: eet ongeveer ${Math.abs(p.kcalAdjust)} kcal per dag minder.`
        : `Je gewicht daalt sneller dan gepland: eet ongeveer ${Math.abs(p.kcalAdjust)} kcal per dag meer.`;
    case 'te-traag':
      return phase.type === 'bulk'
        ? `Je komt trager aan dan gepland: eet ongeveer ${Math.abs(p.kcalAdjust)} kcal per dag meer.`
        : phase.type === 'cut'
          ? `Je gewicht daalt trager dan gepland. Klopt je log? Dan kan er ongeveer ${Math.abs(p.kcalAdjust)} kcal per dag af.`
          : `Je gewicht loopt op: eet ongeveer ${Math.abs(p.kcalAdjust)} kcal per dag minder.`;
  }
}

export interface EnergyEstimate {
  /** Estimated daily energy use */
  tdee: number;
  avgIntake: number;
  loggedDays: number;
  kgPerWeek: number;
}

/**
 * Daily energy use estimated from what was eaten and how the weight moved:
 * intake − (weight change × 7700 kcal/kg). Only as good as the food log, so it
 * needs at least 10 logged days in the window and a weight trend.
 */
export function estimateEnergyUse(
  foodLog: FoodEntry[],
  weights: BodyWeight[],
  days = 21,
  today = dateKey(),
): EnergyEstimate | null {
  const trend = weightTrend(weights, days, today);
  if (!trend) return null;
  const from = addDays(today, -(days - 1));
  const perDay = new Map<string, FoodEntry[]>();
  for (const e of foodLog) {
    // Today is still being logged, so it would drag the average down.
    if (e.date < from || e.date >= today) continue;
    perDay.set(e.date, [...(perDay.get(e.date) ?? []), e]);
  }
  const totals = [...perDay.values()].map((entries) => sumMacros(entries).kcal);
  // Days with only a snack logged are not full days.
  const full = totals.filter((kcal) => kcal >= 1000);
  if (full.length < 10) return null;
  const avgIntake = avg(full);
  const tdee = avgIntake - (trend.kgPerWeek * KCAL_PER_KG) / 7;
  return {
    tdee: Math.round(tdee / 10) * 10,
    avgIntake: Math.round(avgIntake),
    loggedDays: full.length,
    kgPerWeek: trend.kgPerWeek,
  };
}
