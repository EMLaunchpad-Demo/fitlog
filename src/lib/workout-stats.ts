import type { Exercise, Workout, WorkoutSet } from '@/lib/types';

import { num } from './format';

/** Epley estimate of a one-rep max. Only meaningful for 1-12 reps. */
export function estimate1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + Math.min(reps, 12) / 30);
}

export function setVolume(s: WorkoutSet): number {
  return s.done && s.weight && s.reps ? s.weight * s.reps : 0;
}

export function workoutVolume(w: Workout): number {
  return w.exercises.reduce(
    (sum, we) => sum + we.sets.reduce((acc, s) => acc + setVolume(s), 0),
    0,
  );
}

export function doneSetCount(w: Workout): number {
  return w.exercises.reduce((sum, we) => sum + we.sets.filter((s) => s.done).length, 0);
}

/** Short label for a set, e.g. "60 kg × 8", "45 s", "5 km · 28 min". */
export function setLabel(
  s: Pick<WorkoutSet, 'weight' | 'reps' | 'duration' | 'distance'>,
  kind: Exercise['kind'],
): string {
  switch (kind) {
    case 'weight':
      return `${num(s.weight ?? 0)} kg × ${s.reps ?? 0}`;
    case 'bodyweight':
      return s.weight ? `+${num(s.weight)} kg × ${s.reps ?? 0}` : `${s.reps ?? 0} reps`;
    case 'time':
      return `${s.duration ?? 0} s`;
    case 'cardio': {
      const parts: string[] = [];
      if (s.distance) parts.push(`${num(s.distance, 2)} km`);
      if (s.duration) parts.push(`${num(s.duration)} min`);
      return parts.join(' · ') || '–';
    }
  }
}

/** The completed sets of the last workout that contained this exercise. */
export function previousSets(
  workouts: Workout[],
  exerciseId: string,
  excludeWorkoutId?: string,
): WorkoutSet[] {
  for (const w of workouts) {
    if (w.id === excludeWorkoutId) continue;
    const we = w.exercises.find((x) => x.exerciseId === exerciseId);
    const done = we?.sets.filter((s) => s.done) ?? [];
    if (done.length) return done;
  }
  return [];
}

export interface ExerciseSession {
  workoutId: string;
  date: number;
  sets: WorkoutSet[];
  best1RM: number;
  maxWeight: number;
  volume: number;
  maxReps: number;
  maxDuration: number;
  maxDistance: number;
}

/** All sessions of an exercise, oldest first. */
export function exerciseHistory(workouts: Workout[], exerciseId: string): ExerciseSession[] {
  const sessions: ExerciseSession[] = [];
  for (const w of workouts) {
    const sets = w.exercises
      .filter((x) => x.exerciseId === exerciseId)
      .flatMap((x) => x.sets.filter((s) => s.done));
    if (!sets.length) continue;
    sessions.push({
      workoutId: w.id,
      date: w.startedAt,
      sets,
      best1RM: Math.max(0, ...sets.map((s) => estimate1RM(s.weight ?? 0, s.reps ?? 0))),
      maxWeight: Math.max(0, ...sets.map((s) => s.weight ?? 0)),
      volume: sets.reduce((a, s) => a + setVolume(s), 0),
      maxReps: Math.max(0, ...sets.map((s) => s.reps ?? 0)),
      maxDuration: Math.max(0, ...sets.map((s) => s.duration ?? 0)),
      maxDistance: Math.max(0, ...sets.map((s) => s.distance ?? 0)),
    });
  }
  return sessions.sort((a, b) => a.date - b.date);
}

/** The main progress metric for an exercise kind. */
export function sessionMetric(s: ExerciseSession, kind: Exercise['kind']): number {
  switch (kind) {
    case 'weight':
      return s.best1RM;
    case 'bodyweight':
      return s.maxReps;
    case 'time':
      return s.maxDuration;
    case 'cardio':
      return s.maxDistance || s.maxDuration;
  }
}

export function metricLabel(kind: Exercise['kind']): string {
  switch (kind) {
    case 'weight':
      return 'Geschatte 1RM (kg)';
    case 'bodyweight':
      return 'Meeste reps';
    case 'time':
      return 'Langste tijd (s)';
    case 'cardio':
      return 'Afstand (km)';
  }
}

/**
 * Exercises in `workout` where a new best was set compared with every earlier
 * workout in `history`.
 */
export function personalRecords(
  workout: Workout,
  history: Workout[],
  getExercise: (id: string) => Exercise | undefined,
): string[] {
  const earlier = history.filter((w) => w.id !== workout.id && w.startedAt < workout.startedAt);
  const records: string[] = [];
  for (const we of workout.exercises) {
    const ex = getExercise(we.exerciseId);
    if (!ex) continue;
    const current = exerciseHistory([workout], ex.id)[0];
    if (!current) continue;
    const past = exerciseHistory(earlier, ex.id);
    if (!past.length) continue;
    const best = Math.max(...past.map((p) => sessionMetric(p, ex.kind)));
    if (sessionMetric(current, ex.kind) > best) records.push(ex.id);
  }
  return records;
}

/** Average body weight per week (Monday start), oldest first. */
export function weeklyAverages(
  entries: { date: string; kg: number }[],
): { weekStart: string; avg: number; count: number }[] {
  const weeks = new Map<string, number[]>();
  for (const e of entries) {
    const [y, m, d] = e.date.split('-').map(Number);
    const monday = startOfWeek(new Date(y, m - 1, d));
    const key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    weeks.set(key, [...(weeks.get(key) ?? []), e.kg]);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, kgs]) => ({
      weekStart,
      avg: Math.round((kgs.reduce((a, b) => a + b, 0) / kgs.length) * 100) / 100,
      count: kgs.length,
    }));
}

/** Monday 00:00 of the week containing `d`. */
export function startOfWeek(d = new Date()): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (date.getDay() + 6) % 7; // 0 = Monday
  date.setDate(date.getDate() - day);
  return date;
}

/** Number of consecutive weeks (up to and including this week) with ≥1 workout. */
export function weekStreak(workouts: Workout[]): number {
  if (!workouts.length) return 0;
  const weeks = new Set(workouts.map((w) => startOfWeek(new Date(w.startedAt)).getTime()));
  const cursor = startOfWeek();
  // A week without training yet doesn't break the streak until it's over.
  if (!weeks.has(cursor.getTime())) cursor.setDate(cursor.getDate() - 7);
  let streak = 0;
  while (weeks.has(cursor.getTime())) {
    streak++;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}

/** Lower bound of a target like "8-12" -> 8, "45s" -> 45, "5" -> 5. */
export function targetNumber(target?: string): number | null {
  if (!target) return null;
  const m = target.match(/\d+/);
  return m ? Number(m[0]) : null;
}
