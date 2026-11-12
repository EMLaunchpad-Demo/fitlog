import { weekCardio, weekSteps } from './cardio';
import { addDays } from './format';
import { sumMacros } from './nutrition';
import { sleepMinutes } from './recovery';
import type {
  BodyWeight,
  CardioSession,
  CheckIn,
  Exercise,
  FoodEntry,
  Goals,
  MuscleGroup,
  SleepEntry,
  Workout,
} from './types';
import { doneSetCount, workoutVolume } from './workout-stats';

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const inWeek = (date: string, weekStart: string) =>
  date >= weekStart && date < addDays(weekStart, 7);

/**
 * Hard sets per muscle group in a week. Each set counts for the main muscle of
 * the exercise only, so muscles that mostly work along (biceps in rows, triceps
 * in presses) get more work than this shows.
 */
export function weeklyMuscleSets(
  workouts: Workout[],
  weekStart: string,
  getExercise: (id: string) => Exercise | undefined,
): { muscle: MuscleGroup; sets: number }[] {
  const start = new Date(`${weekStart}T00:00:00`).getTime();
  const end = new Date(`${addDays(weekStart, 7)}T00:00:00`).getTime();
  const counts = new Map<MuscleGroup, number>();
  for (const w of workouts) {
    if (w.startedAt < start || w.startedAt >= end) continue;
    for (const we of w.exercises) {
      const ex = getExercise(we.exerciseId);
      if (!ex || ex.muscle === 'Cardio' || ex.kind === 'cardio') continue;
      const done = we.sets.filter((s) => s.done).length;
      counts.set(ex.muscle, (counts.get(ex.muscle) ?? 0) + done);
    }
  }
  return [...counts.entries()]
    .map(([muscle, sets]) => ({ muscle, sets }))
    .sort((a, b) => b.sets - a.sets);
}

export interface WeekReport {
  weekStart: string;
  workouts: number;
  sets: number;
  volumeKg: number;
  /** Days with at least 1000 kcal logged */
  foodDays: number;
  avgKcal: number | null;
  avgProtein: number | null;
  /** Days within ±10 % of the kcal goal / with at least 90 % of the protein goal */
  kcalOnTarget: number;
  proteinOnTarget: number;
  sleepNights: number;
  avgSleepMin: number | null;
  stepDays: number;
  avgSteps: number | null;
  cardioMin: number;
  cardioModerateEq: number;
  cardioSessions: number;
  avgWeight: number | null;
  weighIns: number;
  checkIns: number;
  avgEnergy: number | null;
}

export function weekReport(
  weekStart: string,
  data: {
    workouts: Workout[];
    foodLog: FoodEntry[];
    goals: Goals;
    sleepLog: SleepEntry[];
    steps: Record<string, number>;
    cardioLog: CardioSession[];
    bodyWeights: BodyWeight[];
    checkIns: CheckIn[];
  },
): WeekReport {
  const start = new Date(`${weekStart}T00:00:00`).getTime();
  const end = new Date(`${addDays(weekStart, 7)}T00:00:00`).getTime();
  const workouts = data.workouts.filter((w) => w.startedAt >= start && w.startedAt < end);

  const perDay = new Map<string, FoodEntry[]>();
  for (const e of data.foodLog) {
    if (!inWeek(e.date, weekStart)) continue;
    perDay.set(e.date, [...(perDay.get(e.date) ?? []), e]);
  }
  const days = [...perDay.values()].map(sumMacros).filter((t) => t.kcal >= 1000);

  const nights = data.sleepLog.filter((s) => inWeek(s.date, weekStart));
  const steps = weekSteps(data.steps, weekStart);
  const cardio = weekCardio(data.cardioLog, weekStart);
  const weights = data.bodyWeights.filter((b) => inWeek(b.date, weekStart));
  const checkIns = data.checkIns.filter((c) => inWeek(c.date, weekStart));

  const round = (n: number | null, d = 0) =>
    n == null ? null : Math.round(n * 10 ** d) / 10 ** d;

  return {
    weekStart,
    workouts: workouts.length,
    sets: workouts.reduce((n, w) => n + doneSetCount(w), 0),
    volumeKg: Math.round(workouts.reduce((n, w) => n + workoutVolume(w), 0)),
    foodDays: days.length,
    avgKcal: round(avg(days.map((d) => d.kcal))),
    avgProtein: round(avg(days.map((d) => d.protein))),
    kcalOnTarget: days.filter((d) => Math.abs(d.kcal - data.goals.kcal) <= data.goals.kcal * 0.1)
      .length,
    proteinOnTarget: days.filter((d) => d.protein >= data.goals.protein * 0.9).length,
    sleepNights: nights.length,
    avgSleepMin: round(avg(nights.map(sleepMinutes))),
    stepDays: steps.days,
    avgSteps: steps.days ? steps.avg : null,
    cardioMin: cardio.minutes,
    cardioModerateEq: cardio.moderateEq,
    cardioSessions: cardio.sessions,
    avgWeight: round(avg(weights.map((b) => b.kg)), 2),
    weighIns: weights.length,
    checkIns: checkIns.length,
    avgEnergy: round(avg(checkIns.map((c) => c.energy)), 1),
  };
}
