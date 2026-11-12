import { weekCardio, weekSteps } from './cardio';
import { addDays, dateKey } from './format';
import { sumMacros } from './nutrition';
import { estimateEnergyUse, phaseProgress, weightTrend } from './phase';
import {
  ageFromBirthYear,
  readiness,
  regularityLabel,
  sleepStats,
  targetSleepMinutes,
  weekKey,
} from './recovery';
import { weeklyMuscleSets } from './report';
import type {
  BodyMeasure,
  BodyWeight,
  CardioSession,
  CheckIn,
  CoachPlan,
  Exercise,
  FoodEntry,
  Goals,
  MuscleGroup,
  Plan,
  Settings,
  SleepEntry,
  Workout,
} from './types';
import {
  type ExerciseSession,
  exerciseHistory,
  sessionMetric,
  setLabel,
  weeklyAverages,
} from './workout-stats';

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// ───────────────────────── Plateaus ─────────────────────────

export interface Plateau {
  exerciseId: string;
  name: string;
  /** Sessions in a row that did not beat the best before them */
  stalled: number;
  /** The sets of the last session, e.g. "60 kg × 8, 60 kg × 7" */
  lastSets: string;
  lastDate: string;
}

/** How many of the latest sessions failed to beat the best of the sessions before them. */
export function stalledSessions(sessions: ExerciseSession[], kind: Exercise['kind']): number {
  if (sessions.length < 4) return 0;
  const metrics = sessions.map((s) => sessionMetric(s, kind));
  let stalled = 0;
  for (let i = metrics.length - 1; i >= 1; i--) {
    const bestBefore = Math.max(...metrics.slice(0, i));
    // Epley moves about 3 % per rep, so half a percent is "no change".
    if (metrics[i] > bestBefore * 1.005) break;
    stalled++;
  }
  return stalled;
}

/**
 * Exercises that have not progressed for three or more sessions in a row.
 * Only looks at the last twelve weeks and at exercises trained in the last
 * three, so an exercise that was dropped does not keep showing up.
 */
export function findPlateaus(
  workouts: Workout[],
  getExercise: (id: string) => Exercise | undefined,
  now = Date.now(),
): Plateau[] {
  const since = now - 84 * 86400000;
  const recent = workouts.filter((w) => w.startedAt >= since);
  const ids = new Set(recent.flatMap((w) => w.exercises.map((we) => we.exerciseId)));
  const out: Plateau[] = [];
  for (const id of ids) {
    const ex = getExercise(id);
    if (!ex || (ex.kind !== 'weight' && ex.kind !== 'bodyweight')) continue;
    const sessions = exerciseHistory(recent, id);
    const last = sessions[sessions.length - 1];
    if (!last || last.date < now - 21 * 86400000) continue;
    const stalled = stalledSessions(sessions, ex.kind);
    if (stalled < 3) continue;
    out.push({
      exerciseId: id,
      name: ex.name,
      stalled,
      lastSets: last.sets.map((s) => setLabel(s, ex.kind)).join(', '),
      lastDate: dateKey(last.date),
    });
  }
  return out.sort((a, b) => b.stalled - a.stalled);
}

/** What to try when an exercise is stuck; a cut changes what "stuck" means. */
export function plateauAdvice(cutting: boolean): string {
  return cutting
    ? 'In een cut is je kracht vasthouden al winst. Blijft hij zakken, eet dan iets meer rond je training of doe een set minder.'
    : 'Zak 5-10% in gewicht en bouw opnieuw op, kies een andere rep-range, of wissel tijdelijk naar een variant van de oefening. Check ook je slaap en of je genoeg eet.';
}

// ───────────────────────── Body analysis ─────────────────────────

export interface AnalysisInput {
  settings: Settings;
  goals: Goals;
  bodyWeights: BodyWeight[];
  measures: BodyMeasure[];
  workouts: Workout[];
  plans: Plan[];
  activePlanId: string | null;
  foodLog: FoodEntry[];
  sleepLog: SleepEntry[];
  checkIns: CheckIn[];
  steps: Record<string, number>;
  cardioLog: CardioSession[];
  coachPlan: CoachPlan | null;
}

/**
 * Everything the coach needs to judge someone's body and progress in one
 * object: size and composition, strength relative to body weight, training
 * volume per muscle, nutrition, recovery, and what data is missing.
 * Numbers only; the conclusions are the coach's.
 */
export function bodyAnalysis(
  s: AnalysisInput,
  getExercise: (id: string) => Exercise | undefined,
  today = dateKey(),
) {
  const now = new Date(`${today}T12:00:00`).getTime();
  const gaps: string[] = [];
  const age = ageFromBirthYear(s.settings.birthYear, new Date(now));
  const heightM = s.settings.heightCm ? s.settings.heightCm / 100 : null;
  if (age == null) gaps.push('geboortejaar onbekend (nodig voor leeftijd, slaapadvies en of een cut verantwoord is)');
  if (!heightM) gaps.push('lengte onbekend (geen BMI, FFMI of taille-lengteverhouding)');

  // ── Weight ──
  const lastWeek = s.bodyWeights.filter((b) => b.date > addDays(today, -7) && b.date <= today);
  const latest = s.bodyWeights[s.bodyWeights.length - 1];
  const weekAvg = avg(lastWeek.map((b) => b.kg));
  const kg = weekAvg ?? latest?.kg ?? null;
  const trend = weightTrend(s.bodyWeights, 21, today);
  if (!latest) gaps.push('geen wegingen');
  else if (latest.date < addDays(today, -14)) gaps.push(`laatste weging is van ${latest.date}`);
  else if (!trend) gaps.push('te weinig wegingen voor een trend (minstens 5 in 10 dagen)');

  // ── Composition (smart scale) ──
  const withFat = s.bodyWeights.filter((b) => b.composition?.fatPct != null);
  const comp = withFat[withFat.length - 1];
  const fatWeeks = weeklyAverages(s.bodyWeights, (b) => b.composition?.fatPct).slice(-6);
  const muscleWeeks = weeklyAverages(s.bodyWeights, (b) => b.composition?.muscleKg).slice(-6);
  const leanKg = comp ? comp.kg * (1 - comp.composition!.fatPct! / 100) : null;
  if (!comp) gaps.push('geen lichaamssamenstelling van een weegschaal (vetpercentage onbekend)');

  // ── Measurements ──
  const measure = s.measures[s.measures.length - 1];
  const earlier = [...s.measures].reverse().find((m) => measure && m.date <= addDays(measure.date, -21));
  if (!measure?.waist) gaps.push('geen taillemaat (in een cut of bulk betrouwbaarder dan het vetpercentage van een weegschaal)');

  // ── Strength ──
  const plan = s.plans.find((p) => p.id === s.activePlanId);
  const since8w = now - 56 * 86400000;
  const recent = s.workouts.filter((w) => w.startedAt >= since8w);
  const trained = new Map<string, number>();
  for (const w of recent)
    for (const we of w.exercises) trained.set(we.exerciseId, (trained.get(we.exerciseId) ?? 0) + 1);
  const strength = [...trained.entries()]
    .map(([id, count]) => ({ ex: getExercise(id), count }))
    .filter((x): x is { ex: Exercise; count: number } => !!x.ex && x.ex.kind === 'weight')
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(({ ex, count }) => {
      const sessions = exerciseHistory(recent, ex.id);
      const best = Math.max(...sessions.map((x) => x.best1RM));
      const firstHalf = sessions.slice(0, Math.max(1, Math.floor(sessions.length / 2)));
      const start = Math.max(...firstHalf.map((x) => x.best1RM));
      return {
        exercise: ex.name,
        muscle: ex.muscle,
        sessions_8_weeks: count,
        best_est_1rm_kg: round(best),
        ratio_to_body_weight: kg ? round(best / kg, 2) : null,
        change_pct_8_weeks: sessions.length >= 3 && start > 0 ? round(((best - start) / start) * 100) : null,
        sessions_without_progress: stalledSessions(exerciseHistory(s.workouts.filter((w) => w.startedAt >= now - 84 * 86400000), ex.id), ex.kind),
      };
    });
  if (!recent.length) gaps.push('geen trainingen in de laatste 8 weken');

  // ── Training volume: average of the last four finished weeks (this week when there is nothing else) ──
  const weeks = [1, 2, 3, 4].map((back) => weekKey(back, new Date(now)));
  const perWeek = weeks.map((w) => ({
    week_of: w,
    workouts: s.workouts.filter(
      (x) => dateKey(x.startedAt) >= w && dateKey(x.startedAt) < addDays(w, 7),
    ).length,
    sets: weeklyMuscleSets(s.workouts, w, getExercise),
  }));
  const activeWeeks = perWeek.filter((w) => w.workouts > 0);
  const muscles = new Map<MuscleGroup, number>();
  for (const w of activeWeeks)
    for (const m of w.sets) muscles.set(m.muscle, (muscles.get(m.muscle) ?? 0) + m.sets);
  const setsPerMuscle = [...muscles.entries()]
    .map(([muscle, total]) => ({ muscle, sets_per_week: round(total / activeWeeks.length) }))
    .sort((a, b) => b.sets_per_week - a.sets_per_week);
  const plannedPerWeek = plan
    ? Math.min(plan.days.length, 7 - s.settings.restDays.length || plan.days.length)
    : null;

  // ── Nutrition ──
  const perDay = new Map<string, FoodEntry[]>();
  for (const e of s.foodLog) {
    if (e.date < addDays(today, -14) || e.date >= today) continue;
    perDay.set(e.date, [...(perDay.get(e.date) ?? []), e]);
  }
  const fullDays = [...perDay.values()].map(sumMacros).filter((t) => t.kcal >= 1000);
  const intake = {
    kcal: avg(fullDays.map((d) => d.kcal)),
    protein: avg(fullDays.map((d) => d.protein)),
    fat: avg(fullDays.map((d) => d.fat)),
  };
  if (fullDays.length < 5) gaps.push(`maar ${fullDays.length} volledig gelogde eetdagen in 2 weken (verbruik en inname zijn dan een gok)`);
  const energy = estimateEnergyUse(s.foodLog, s.bodyWeights, 21, today);

  // ── Recovery ──
  const targetSleep = targetSleepMinutes(s.settings.sleep);
  const sleep = sleepStats(s.sleepLog, targetSleep, 14, today);
  if (!sleep) gaps.push('geen slaap gelogd');
  const scores: number[] = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(today, -i);
    const r = readiness(
      s.checkIns.find((c) => c.date === d),
      s.sleepLog.find((e) => e.date === d),
      targetSleep,
    );
    if (r) scores.push(r.score);
  }
  const stepWeeks = [0, 1].map((b) => weekSteps(s.steps, weekKey(b, new Date(now))));
  const stepDays = stepWeeks.reduce((n, w) => n + w.days, 0);
  const cardioWeeks = [1, 2, 3, 4].map((b) => weekCardio(s.cardioLog, weekKey(b, new Date(now))));

  const phase = s.settings.phase;
  const progress = phase ? phaseProgress(phase, s.bodyWeights, today) : null;

  return {
    today,
    person: {
      sex: s.settings.sex,
      age,
      under_18: age != null && age < 18,
      height_cm: s.settings.heightCm,
    },
    weight: {
      latest_kg: latest?.kg ?? null,
      latest_date: latest?.date ?? null,
      avg_last_7_days_kg: weekAvg != null ? round(weekAvg, 2) : null,
      trend_kg_per_week: trend ? round(trend.kgPerWeek, 2) : null,
      trend_pct_per_week: trend && kg ? round((trend.kgPerWeek / kg) * 100, 2) : null,
      weekly_avg: weeklyAverages(s.bodyWeights, (b) => b.kg)
        .slice(-8)
        .map((w) => ({ week_of: w.weekStart, kg: w.avg, weigh_ins: w.count })),
      bmi: kg && heightM ? round(kg / heightM ** 2) : null,
    },
    body_composition: comp
      ? {
          source: 'slimme weegschaal (bio-impedantie): goed voor de trend, het getal zelf kan meerdere procentpunten afwijken',
          date: comp.date,
          fat_pct: comp.composition!.fatPct,
          muscle_kg: comp.composition!.muscleKg ?? null,
          visceral_fat: comp.composition!.visceralFat ?? null,
          lean_mass_kg: leanKg != null ? round(leanKg) : null,
          ffmi: leanKg != null && heightM ? round(leanKg / heightM ** 2) : null,
          fat_pct_weekly_avg: fatWeeks.map((w) => ({ week_of: w.weekStart, pct: w.avg })),
          muscle_kg_weekly_avg: muscleWeeks.map((w) => ({ week_of: w.weekStart, kg: w.avg })),
        }
      : null,
    measurements: measure
      ? {
          date: measure.date,
          waist_cm: measure.waist ?? null,
          chest_cm: measure.chest ?? null,
          arm_cm: measure.arm ?? null,
          thigh_cm: measure.thigh ?? null,
          hips_cm: measure.hips ?? null,
          waist_to_height: measure.waist && s.settings.heightCm ? round(measure.waist / s.settings.heightCm, 2) : null,
          waist_change_cm: measure.waist && earlier?.waist ? round(measure.waist - earlier.waist) : null,
          compared_with: earlier?.date ?? null,
        }
      : null,
    strength,
    training: {
      active_plan: plan ? { name: plan.name, days: plan.days.map((d) => d.name) } : null,
      planned_per_week: plannedPerWeek,
      workouts_last_4_weeks: perWeek.map((w) => ({ week_of: w.week_of, workouts: w.workouts })),
      sets_per_muscle_per_week: setsPerMuscle,
      sets_note: 'gemiddelde van de weken met training; elke set telt alleen voor de hoofdspier, hulpspieren (biceps, triceps, billen) krijgen meer',
      plateaus: findPlateaus(s.workouts, getExercise, now).map((p) => ({
        exercise: p.name,
        sessions_without_progress: p.stalled,
        last_sets: p.lastSets,
      })),
    },
    nutrition: {
      goals: s.goals,
      logged_full_days_14d: fullDays.length,
      avg_kcal: intake.kcal != null ? Math.round(intake.kcal) : null,
      avg_protein_g: intake.protein != null ? Math.round(intake.protein) : null,
      protein_g_per_kg: intake.protein != null && kg ? round(intake.protein / kg) : null,
      goal_protein_g_per_kg: kg ? round(s.goals.protein / kg) : null,
      avg_fat_g_per_kg: intake.fat != null && kg ? round(intake.fat / kg) : null,
      estimated_energy_use_kcal: energy?.tdee ?? null,
    },
    recovery: {
      sleep_target_min: targetSleep,
      sleep_14_days: sleep
        ? { nights: sleep.nights, avg_min: sleep.avgMin, regularity: regularityLabel(sleep) }
        : null,
      readiness_avg_14_days: scores.length ? Math.round(avg(scores)!) : null,
      check_ins_14_days: s.checkIns.filter((c) => c.date > addDays(today, -14)).length,
      avg_steps: stepDays ? Math.round(stepWeeks.reduce((n, w) => n + w.total, 0) / stepDays) : null,
      step_goal: s.settings.stepGoal,
      cardio_min_per_week: round(avg(cardioWeeks.map((w) => w.moderateEq)) ?? 0, 0),
      cardio_goal_min: s.settings.cardioGoalMin,
    },
    phase: phase
      ? {
          ...phase,
          day: progress!.dayNo,
          days_left: progress!.daysLeft,
          ended: progress!.ended,
          actual_rate_pct_per_week: progress!.ratePct != null ? round(progress!.ratePct, 2) : null,
          status: progress!.status,
        }
      : null,
    current_plan: s.coachPlan
      ? { date: s.coachPlan.date, summary: s.coachPlan.summary, focus: s.coachPlan.focus, review_date: s.coachPlan.reviewDate }
      : null,
    data_gaps: gaps,
  };
}

/** Days until the coach's plan is due for a review; negative when it is overdue. */
export function daysUntilReview(plan: CoachPlan, today = dateKey()): number {
  return Math.round(
    (new Date(`${plan.reviewDate}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) /
      86400000,
  );
}
