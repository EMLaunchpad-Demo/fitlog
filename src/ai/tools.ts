import type { BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { Href } from 'expo-router';

import { BUILT_IN_EXERCISES, MUSCLE_GROUPS } from '@/data/exercises';
import { BODY_METRICS, hasComposition } from '@/lib/body';
import {
  CARDIO_KINDS,
  INTENSITIES,
  cardioKcal,
  cardioKind,
  moderateEquivalent,
  weekCardio,
  weekSteps,
} from '@/lib/cardio';
import { addDays, dateKey, parseDateKey, relativeDay, uid } from '@/lib/format';
import { MEALS, mealLabel, sumMacros } from '@/lib/nutrition';
import { PHASE_LABEL, estimateEnergyUse, phaseProgress } from '@/lib/phase';
import {
  WEEKDAYS,
  dayPlan,
  deloadStatus,
  readiness,
  regularityLabel,
  sleepMinutes,
  sleepStats,
  targetSleepMinutes,
  weekKey,
} from '@/lib/recovery';
import { weekReport, weeklyMuscleSets } from '@/lib/report';
import { hoursLabel, minutesBetween, normalizeTime } from '@/lib/time';
import type {
  BodyComposition,
  CardioKind,
  ExerciseKind,
  Intensity,
  Meal,
  MuscleGroup,
  Phase,
  Plan,
  PlanDay,
  Workout,
  WorkoutExercise,
} from '@/lib/types';
import {
  doneSetCount,
  exerciseHistory,
  setLabel,
  startOfWeek,
  weekStreak,
  weeklyAverages,
  workoutVolume,
} from '@/lib/workout-stats';
import {
  type SettingsPatch,
  type Store,
  findExercise,
  nextPlanDay,
  useStore,
} from '@/store/store';

// ───────────────────────── schema helpers ─────────────────────────

type Schema = Record<string, unknown>;

const nullable = (schema: Schema): Schema => ({ anyOf: [schema, { type: 'null' }] });
const obj = (properties: Record<string, Schema>): Schema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const DATE: Schema = { type: 'string', description: 'Datum als YYYY-MM-DD' };
const OPT_DATE = nullable({ ...DATE, description: 'Datum als YYYY-MM-DD; null = vandaag' });
const KINDS: ExerciseKind[] = ['weight', 'bodyweight', 'time', 'cardio'];

/** Either an existing exercise id or a new custom exercise. */
const EXERCISE_REF = {
  exercise_id: nullable({
    type: 'string',
    description: 'Id uit de catalogus of van een eigen oefening (zie get_plans / get_workouts)',
  }),
  new_exercise: nullable(
    obj({
      name: { type: 'string' },
      muscle: { type: 'string', enum: MUSCLE_GROUPS },
      kind: { type: 'string', enum: KINDS },
    }),
  ),
};

const PLAN_DAYS: Schema = {
  type: 'array',
  items: obj({
    day_id: nullable({
      type: 'string',
      description:
        'Bestaande dag-id om te behouden (houdt de volgorde van "volgende training" intact); null voor een nieuwe dag',
    }),
    name: { type: 'string', description: 'Bijv. "Push" of "Dag A"' },
    exercises: {
      type: 'array',
      items: obj({
        ...EXERCISE_REF,
        sets: { type: 'integer' },
        target: {
          type: 'string',
          description: 'Reps-doel zoals "8-12", tijd zoals "45s" of cardio zoals "20 min"',
        },
        rest_sec: { type: 'integer' },
      }),
    },
  }),
};

const FOOD_ITEM = obj({
  name: { type: 'string', description: 'Korte Nederlandse naam, bijv. "Volkorenbrood"' },
  amount: { type: 'string', description: 'Hoeveelheid, bijv. "2 sneetjes" of "150 g"' },
  kcal: { type: 'number' },
  protein: { type: 'number', description: 'gram' },
  carbs: { type: 'number', description: 'gram' },
  fat: { type: 'number', description: 'gram' },
});

/**
 * `strict: true` makes the API guarantee schema-valid input, but all strict tools
 * in a request share a complexity budget (max 16 parameters with union types such
 * as nullable fields, max 24 optional parameters). The large editing tools are
 * therefore not strict; every tool's input is validated in this file anyway.
 */
const tool = (
  name: string,
  description: string,
  properties: Record<string, Schema>,
  strict = true,
): BetaTool => ({
  name,
  description,
  ...(strict ? { strict: true } : {}),
  input_schema: obj(properties) as BetaTool['input_schema'],
});

/**
 * Tool definitions. They must stay byte-identical for the lifetime of a
 * conversation (prompt cache + thinking blocks); coach.ts starts a fresh
 * conversation when this list changes in an app update.
 */
export const TOOLS: BetaTool[] = [
  // ── Lezen ──
  tool(
    'get_overview',
    'Snel overzicht: doelen, voeding en water van vandaag, lichaamsgewicht (weekgemiddelden van de laatste 8 weken en wegingen van de laatste 30 dagen), actief schema met de volgende trainingsdag, de laatste trainingen en de streak, plus vandaag: trainings- of rustdag, slaap van afgelopen nacht, check-in en herstelscore, stappen, cardio deze week, deload-status, de fase (cut/bulk) met het echte tempo, het geschatte verbruik, gewoontes en alle persoonlijke instellingen. Gebruik dit als eerste stap bij algemene vragen.',
    {},
  ),
  tool(
    'get_workouts',
    'Afgeronde trainingen van de afgelopen N dagen (met id), met per oefening alle sets.',
    { days: { type: 'integer', description: 'Aantal dagen terug, max 120' } },
  ),
  tool(
    'get_exercise_history',
    'Volledige geschiedenis van één oefening: per sessie de sets, het zwaarste gewicht en de geschatte 1RM. Geef een id of (een deel van) de naam.',
    { exercise: { type: 'string' } },
  ),
  tool(
    'get_nutrition',
    'Voedingslog per dag voor maximaal 31 dagen: alle items met id, maaltijd, hoeveelheid, kcal en macro’s, plus dagtotalen en water.',
    { start_date: DATE, end_date: DATE },
  ),
  tool(
    'get_plans',
    'Alle trainingsschema’s met id’s: per dag de dag-id en per oefening exercise_id, sets, doel en rusttijd. Haal dit op voordat je een schema wijzigt, activeert of verwijdert.',
    {},
  ),
  tool(
    'get_recovery',
    'Slaap, check-ins (energie, spierpijn, stress, humeur) met herstelscore, stappen en cardio per dag voor de afgelopen N dagen, plus slaapstatistieken, het slaapschema, vaste rustdagen, deload-status en gewoontes. Cardiosessies hebben een id.',
    { days: { type: 'integer', description: 'Aantal dagen terug, max 60' } },
  ),
  tool(
    'get_week_report',
    'Weekrapport (maandag t/m zondag): trainingen, sets per spiergroep, gemiddelde kcal en eiwit met het aantal dagen op doel, slaap, stappen, cardio, gewicht en energie. Geeft ook de week ervoor ter vergelijking.',
    { weeks_back: { type: 'integer', description: '0 = deze week, 1 = vorige week, max 12' } },
  ),

  // ── Voeding ──
  tool(
    'log_food',
    'Voegt eten of drinken toe aan het voedingslog. Gebruik realistische schattingen voor Nederlandse porties. Eén item per product.',
    {
      date: OPT_DATE,
      meal: { type: 'string', enum: MEALS.map((m) => m.key) },
      items: { type: 'array', items: FOOD_ITEM },
    },
  ),
  tool(
    'update_food_entry',
    'Past één gelogd voedingsitem aan (id uit get_nutrition). Velden die null zijn blijven ongewijzigd.',
    {
      id: { type: 'string' },
      date: nullable(DATE),
      meal: nullable({ type: 'string', enum: MEALS.map((m) => m.key) }),
      name: nullable({ type: 'string' }),
      amount: nullable({ type: 'string' }),
      kcal: nullable({ type: 'number' }),
      protein: nullable({ type: 'number' }),
      carbs: nullable({ type: 'number' }),
      fat: nullable({ type: 'number' }),
    },
    false,
  ),
  tool('delete_food_entries', 'Verwijdert voedingsitems (id’s uit get_nutrition).', {
    ids: { type: 'array', items: { type: 'string' } },
  }),
  tool('set_water', 'Zet het aantal glazen water (250 ml) voor een dag.', {
    date: OPT_DATE,
    glasses: { type: 'integer' },
  }),
  tool(
    'set_nutrition_goals',
    'Past de dagelijkse doelen aan. Alleen als de gebruiker daarom vraagt of ermee instemt.',
    {
      kcal: { type: 'integer' },
      protein: { type: 'integer', description: 'gram' },
      carbs: { type: 'integer', description: 'gram' },
      fat: { type: 'integer', description: 'gram' },
      water_glasses: nullable({ type: 'integer', description: 'null = ongewijzigd' }),
    },
  ),

  // ── Gewicht ──
  {
    name: 'log_body_weight',
    description:
      'Slaat een weging op, eventueel met lichaamssamenstelling van een slimme weegschaal (bijv. een Fitdays-screenshot). Vervangt een weging op dezelfde datum. Geef alleen de waarden mee die je echt ziet; laat de rest weg.',
    input_schema: {
      type: 'object',
      properties: {
        kg: { type: 'number' },
        date: OPT_DATE,
        ...Object.fromEntries(
          BODY_METRICS.map((m) => [
            m.tool,
            { type: 'number', description: m.unit ? `${m.label} (${m.unit})` : m.label },
          ]),
        ),
      },
      required: ['kg', 'date'],
      additionalProperties: false,
    },
  },
  tool('delete_body_weight', 'Verwijdert de weging van een datum.', { date: DATE }),

  // ── Schema's ──
  tool(
    'create_training_plan',
    'Maakt een nieuw trainingsschema. Gebruik id’s uit de catalogus; alleen voor oefeningen die er echt niet in staan geef je new_exercise op (exercise_id = null). day_id is hier altijd null.',
    {
      name: { type: 'string' },
      description: { type: 'string', description: 'Eén zin: frequentie en focus' },
      make_active: { type: 'boolean', description: 'Direct als actief schema instellen' },
      days: PLAN_DAYS,
    },
    false,
  ),
  tool(
    'update_training_plan',
    'Vervangt de inhoud van een bestaand schema (id uit get_plans). Geef het VOLLEDIGE schema mee, ook de dagen en oefeningen die niet veranderen, en behoud de bestaande day_id’s.',
    {
      plan_id: { type: 'string' },
      name: { type: 'string' },
      description: { type: 'string' },
      days: PLAN_DAYS,
    },
    false,
  ),
  tool('set_active_plan', 'Maakt een schema actief (null = geen actief schema).', {
    plan_id: nullable({ type: 'string' }),
  }),
  tool('delete_training_plan', 'Verwijdert een schema. De trainingsgeschiedenis blijft bewaard.', {
    plan_id: { type: 'string' },
  }),

  // ── Trainingen ──
  tool(
    'log_workout',
    'Legt een afgeronde training achteraf vast, bijv. "gisteren 5 km gelopen". duration is in seconden voor tijd-oefeningen en in minuten voor cardio.',
    {
      date: DATE,
      name: { type: 'string' },
      duration_min: nullable({ type: 'integer', description: 'Totale duur in minuten' }),
      exercises: {
        type: 'array',
        items: obj({
          ...EXERCISE_REF,
          sets: {
            type: 'array',
            items: obj({
              weight_kg: nullable({ type: 'number' }),
              reps: nullable({ type: 'integer' }),
              duration: nullable({ type: 'number' }),
              distance_km: nullable({ type: 'number' }),
            }),
          },
        }),
      },
    },
    false,
  ),
  tool('delete_workout', 'Verwijdert een afgeronde training (id uit get_workouts).', {
    workout_id: { type: 'string' },
  }),

  // ── Slaap, cardio, herstel ──
  tool(
    'log_sleep',
    'Slaat een nacht op (vervangt de nacht van dezelfde datum). date is de datum van het OPSTAAN. Tijden als "HH:MM" (24 uur). asleep_min alleen als een tracker de echte slaaptijd toont; anders telt de tijd tussen bed en wake.',
    {
      date: OPT_DATE,
      bed: { type: 'string', description: 'Tijd van inslapen / licht uit, bijv. "22:15"' },
      wake: { type: 'string', description: 'Tijd van wakker worden, bijv. "06:45"' },
      asleep_min: nullable({ type: 'integer', description: 'Gemeten slaaptijd in minuten' }),
      quality: nullable({ type: 'integer', description: '1 (slecht) t/m 5 (top)' }),
      note: nullable({ type: 'string' }),
    },
    false,
  ),
  tool('delete_sleep', 'Verwijdert de nacht van een datum (datum van opstaan).', { date: DATE }, false),
  tool(
    'log_cardio',
    'Legt een cardiosessie vast (wandelen, lopen, fietsen, sport, fysiek werk enz.). intensity: licht = zingen lukt nog, matig = zone 2 (praten lukt, zingen niet), zwaar = maar een paar woorden per adem. kcal alleen als een horloge of app het toont.',
    {
      date: OPT_DATE,
      kind: { type: 'string', enum: CARDIO_KINDS.map((k) => k.key) },
      minutes: { type: 'integer' },
      intensity: { type: 'string', enum: INTENSITIES.map((i) => i.key) },
      distance_km: nullable({ type: 'number' }),
      avg_hr: nullable({ type: 'integer' }),
      kcal: nullable({ type: 'integer' }),
      note: nullable({ type: 'string' }),
    },
    false,
  ),
  tool('delete_cardio', 'Verwijdert een cardiosessie (id uit get_recovery).', {
    cardio_id: { type: 'string' },
  }, false),
  tool('set_steps', 'Zet het aantal stappen van een dag (0 wist de dag).', {
    date: OPT_DATE,
    steps: { type: 'integer' },
  }),
  tool(
    'log_check_in',
    'Slaat de dagelijkse check-in op (vervangt die van dezelfde datum). Alle scores 1 t/m 5, hoger is altijd beter: energy 5 = vol energie, soreness 5 = geen spierpijn, stress 5 = ontspannen, mood 5 = top.',
    {
      date: OPT_DATE,
      energy: { type: 'integer' },
      soreness: { type: 'integer' },
      stress: { type: 'integer' },
      mood: { type: 'integer' },
      note: nullable({ type: 'string' }),
    },
  ),
  tool(
    'update_settings',
    'Past persoonlijke instellingen aan. Geef alleen de velden mee die moeten veranderen. rest_days is de volledige lijst vaste rustdagen. screens_off "" verwijdert de schermen-uit-tijd. deload_this_week zet de deloadweek aan of uit.',
    {
      bedtime: { type: 'string', description: 'Licht uit, "HH:MM"' },
      wake_time: { type: 'string', description: 'Opstaan, "HH:MM"' },
      screens_off: { type: 'string', description: 'Schermen uit, "HH:MM", of "" voor geen' },
      step_goal: { type: 'integer', description: 'Stappen per dag' },
      cardio_goal_min: {
        type: 'integer',
        description: 'Cardiominuten per week (matig; zwaar telt dubbel)',
      },
      rest_days: { type: 'array', items: { type: 'string', enum: WEEKDAYS } },
      deload_every_weeks: { type: 'integer', description: '0 = geen herinnering' },
      deload_this_week: { type: 'boolean' },
      sex: { type: 'string', enum: ['man', 'vrouw'] },
      birth_year: { type: 'integer' },
      height_cm: { type: 'integer' },
    },
    false,
  ),
  tool(
    'set_phase',
    'Stelt de voedingsfase in: cut, onderhoud of bulk, met start, optioneel einde en het doeltempo in % lichaamsgewicht per week (positief getal; de app maakt het negatief bij een cut). type "geen" verwijdert de fase.',
    {
      type: { type: 'string', enum: ['cut', 'onderhoud', 'bulk', 'geen'] },
      start: nullable(DATE),
      end: nullable(DATE),
      rate_pct: nullable({ type: 'number', description: 'Bijv. 0.5; null = standaard voor de fase' }),
    },
    false,
  ),
  tool(
    'set_habits',
    'Vervangt de lijst dagelijkse gewoontes (max 12). Geef de VOLLEDIGE lijst namen; bestaande namen houden hun afvinkgeschiedenis.',
    { habits: { type: 'array', items: { type: 'string' } } },
    false,
  ),
  tool(
    'check_habit',
    'Vinkt een gewoonte af of weer uit voor een dag. Geef (een deel van) de naam.',
    { habit: { type: 'string' }, done: { type: 'boolean' }, date: OPT_DATE },
    false,
  ),

  // ── Profiel ──
  tool(
    'update_profile',
    'Werkt het "Over mij"-profiel bij. Alleen als de gebruiker vraagt iets te onthouden of zijn profiel aan te passen. Geef de volledige nieuwe tekst en behoud wat niet verandert. Geldt vanaf het volgende gesprek.',
    {
      name: nullable({ type: 'string', description: 'null = ongewijzigd' }),
      about: { type: 'string' },
    },
  ),
];

/** Same tools without `strict`, used if the API rejects the strict schemas as too complex. */
export const TOOLS_NON_STRICT: BetaTool[] = TOOLS.map(({ strict: _strict, ...t }) => t);

// ───────────────────────── results ─────────────────────────

/** What a tool did, for the chat UI. */
export interface ToolAction {
  label: string;
  ok: boolean;
  /** Where the user can see the result */
  link?: Href;
}

/** App data a tool may change; used to undo a coach action. */
export type DataKey =
  | 'plans'
  | 'activePlanId'
  | 'customExercises'
  | 'foodLog'
  | 'water'
  | 'goals'
  | 'bodyWeights'
  | 'workouts'
  | 'profile'
  | 'sleepLog'
  | 'cardioLog'
  | 'steps'
  | 'checkIns'
  | 'habits'
  | 'habitLog'
  | 'settings';
export type DataSnapshot = Partial<Pick<Store, DataKey>>;

export interface UndoRecord {
  keys: DataKey[];
  before: DataSnapshot;
  after: DataSnapshot;
}

export interface ToolOutcome {
  /** JSON (or error text) returned to the model */
  content: string;
  isError: boolean;
  action: ToolAction;
  undo?: UndoRecord;
}

const WRITES: Record<string, DataKey[]> = {
  log_food: ['foodLog'],
  update_food_entry: ['foodLog'],
  delete_food_entries: ['foodLog'],
  set_water: ['water'],
  set_nutrition_goals: ['goals'],
  log_body_weight: ['bodyWeights'],
  delete_body_weight: ['bodyWeights'],
  create_training_plan: ['plans', 'activePlanId', 'customExercises'],
  update_training_plan: ['plans', 'customExercises'],
  set_active_plan: ['activePlanId'],
  delete_training_plan: ['plans', 'activePlanId'],
  log_workout: ['workouts', 'customExercises'],
  delete_workout: ['workouts'],
  update_profile: ['profile'],
  log_sleep: ['sleepLog'],
  delete_sleep: ['sleepLog'],
  log_cardio: ['cardioLog'],
  delete_cardio: ['cardioLog'],
  set_steps: ['steps'],
  log_check_in: ['checkIns'],
  update_settings: ['settings'],
  set_phase: ['settings'],
  set_habits: ['habits'],
  check_habit: ['habitLog'],
};
export const WRITE_TOOLS = new Set(Object.keys(WRITES));

function snapshot(keys: DataKey[]): DataSnapshot {
  const s = useStore.getState();
  return Object.fromEntries(keys.map((k) => [k, s[k]])) as DataSnapshot;
}

class ToolInputError extends Error {}

// ───────────────────────── input helpers ─────────────────────────

type Input = Record<string, unknown>;

function str(input: Input, key: string): string {
  const v = input[key];
  if (typeof v !== 'string' || !v.trim()) throw new ToolInputError(`"${key}" moet tekst zijn.`);
  return v.trim();
}
function num(input: Input, key: string, min: number, max: number): number {
  const v = input[key];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
    throw new ToolInputError(`"${key}" moet een getal tussen ${min} en ${max} zijn.`);
  return v;
}
function optNum(input: Input, key: string, min: number, max: number): number | null {
  return input[key] == null ? null : num(input, key, min, max);
}
function date(input: Input, key: string, required = false): string {
  const v = input[key];
  if (v == null && !required) return dateKey();
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v))
    throw new ToolInputError(`"${key}" moet YYYY-MM-DD zijn.`);
  return v;
}
function meal(v: unknown): Meal {
  if (!MEALS.some((m) => m.key === v)) throw new ToolInputError('Onbekende maaltijd.');
  return v as Meal;
}
const r1 = (n: number) => Math.round(n * 10) / 10;
/** "gisteren", "vandaag" or "za 7 nov" for action labels. */
const day = (d: string) =>
  relativeDay(d).replace(/^(Vandaag|Gisteren|Morgen)$/, (w) => w.toLowerCase());
const dayTotals = (d: string) => {
  const t = sumMacros(useStore.getState().foodLog.filter((e) => e.date === d));
  return { kcal: Math.round(t.kcal), protein: r1(t.protein), carbs: r1(t.carbs), fat: r1(t.fat) };
};
const exerciseName = (id: string) =>
  findExercise(id, useStore.getState().customExercises)?.name ?? id;

/** Resolves exercise_id / new_exercise to an exercise id, creating custom exercises when needed. */
function resolveExercise(ref: Input, created: string[]): string {
  const id = typeof ref.exercise_id === 'string' ? ref.exercise_id : null;
  if (id && findExercise(id, useStore.getState().customExercises)) return id;
  if (ref.new_exercise && typeof ref.new_exercise === 'object') {
    const ne = ref.new_exercise as Input;
    const muscle = ne.muscle as MuscleGroup;
    const kind = ne.kind as ExerciseKind;
    if (!MUSCLE_GROUPS.includes(muscle) || !KINDS.includes(kind))
      throw new ToolInputError('Ongeldige spiergroep of soort bij new_exercise.');
    const name = str(ne, 'name');
    const all = [...BUILT_IN_EXERCISES, ...useStore.getState().customExercises];
    const existing = all.find((e) => e.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    created.push(name);
    return useStore.getState().addCustomExercise({ name, muscle, kind });
  }
  throw new ToolInputError(
    `Onbekende oefening-id "${id}". Gebruik een id uit de catalogus of new_exercise.`,
  );
}

function parseDays(raw: unknown, created: string[], keepIds: Set<string>): PlanDay[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > 7)
    throw new ToolInputError('Een schema heeft 1 tot 7 dagen.');
  return raw.map((rawDay) => {
    const d = rawDay as Input;
    const exercises = Array.isArray(d.exercises) ? (d.exercises as Input[]) : [];
    if (!exercises.length)
      throw new ToolInputError(`Dag "${String(d.name)}" heeft geen oefeningen.`);
    const dayId = typeof d.day_id === 'string' && keepIds.has(d.day_id) ? d.day_id : uid();
    keepIds.delete(dayId); // each existing id only once
    return {
      id: dayId,
      name: str(d, 'name'),
      exercises: exercises.map((pe) => ({
        id: uid(),
        exerciseId: resolveExercise(pe, created),
        sets: Math.round(num(pe, 'sets', 1, 10)),
        target: str(pe, 'target'),
        restSec: Math.round(num(pe, 'rest_sec', 15, 600)),
      })),
    };
  });
}

function findPlan(id: unknown): Plan {
  const plan = useStore.getState().plans.find((p) => p.id === id);
  if (!plan)
    throw new ToolInputError(`Schema "${String(id)}" bestaat niet. Haal de id’s op met get_plans.`);
  return plan;
}

// ───────────────────────── read executors ─────────────────────────

function getOverview() {
  const s = useStore.getState();
  const today = dateKey();
  const plan = s.plans.find((p) => p.id === s.activePlanId);
  const monthAgo = addDays(today, -30);
  return {
    today,
    goals: s.goals,
    nutrition_today: { ...dayTotals(today), water_glasses: s.water[today] ?? 0 },
    body_weight_weekly_avg: weeklyAverages(s.bodyWeights, (b) => b.kg)
      .slice(-8)
      .map((w) => ({ week_of: w.weekStart, avg_kg: w.avg, weigh_ins: w.count })),
    body_weight_last_30_days: s.bodyWeights
      .filter((b) => b.date >= monthAgo)
      .map((b) => ({ date: b.date, kg: b.kg, fat_pct: b.composition?.fatPct ?? null })),
    ...bodyCompositionOverview(s.bodyWeights),
    active_plan: plan
      ? {
          id: plan.id,
          name: plan.name,
          days: plan.days.map((d) => d.name),
          next_day: nextPlanDay(plan, s.workouts)?.name ?? null,
        }
      : null,
    workouts_this_week: s.workouts.filter((w) => w.startedAt >= startOfWeek().getTime()).length,
    week_streak: weekStreak(s.workouts),
    total_workouts: s.workouts.length,
    recent_workouts: s.workouts.slice(0, 5).map((w) => ({
      id: w.id,
      date: dateKey(w.startedAt),
      name: w.name,
      sets: doneSetCount(w),
      volume_kg: Math.round(workoutVolume(w)),
    })),
    workout_in_progress: s.activeWorkout ? s.activeWorkout.name : null,
    ...recoveryOverview(),
  };
}

/** Today's rest, sleep, movement and phase status, for get_overview. */
function recoveryOverview() {
  const s = useStore.getState();
  const today = dateKey();
  const plan = s.plans.find((p) => p.id === s.activePlanId);
  const targetMin = targetSleepMinutes(s.settings.sleep);
  const lastNight = s.sleepLog.find((e) => e.date === today);
  const checkIn = s.checkIns.find((c) => c.date === today);
  const ready = readiness(checkIn, lastNight, targetMin);
  const day = dayPlan(s.settings, s.workouts, plan);
  const deload = deloadStatus(s.settings, s.workouts);
  const week = weekKey(0);
  const cardio = weekCardio(s.cardioLog, week);
  const stats = sleepStats(s.sleepLog, targetMin, 7);
  const phase = s.settings.phase;
  const progress = phase ? phaseProgress(phase, s.bodyWeights) : null;
  const energy = estimateEnergyUse(s.foodLog, s.bodyWeights);
  return {
    day_plan:
      day.kind === 'done'
        ? 'training gedaan'
        : day.kind === 'rest'
          ? `rustdag (${day.reason === 'vast' ? 'vaste rustdag' : 'weekdoel gehaald'})`
          : 'trainingsdag',
    settings: settingsView(),
    sleep_last_night: lastNight ? sleepView(lastNight) : null,
    sleep_7_days: stats
      ? {
          nights: stats.nights,
          avg_min: stats.avgMin,
          avg_bed: stats.avgBed,
          avg_wake: stats.avgWake,
          regularity: regularityLabel(stats),
          debt_min: stats.debtMin,
        }
      : null,
    check_in_today: checkIn ?? null,
    readiness_today: ready ? { score: ready.score, level: ready.level } : null,
    steps_today: s.steps[today] ?? null,
    cardio_this_week: {
      sessions: cardio.sessions,
      minutes: cardio.minutes,
      moderate_equivalent_min: cardio.moderateEq,
    },
    deload: {
      active_this_week: deload.active,
      training_weeks_since: deload.weeksSince,
      due: deload.due,
    },
    phase: phase
      ? {
          ...phase,
          day: progress!.dayNo,
          total_days: progress!.totalDays,
          days_left: progress!.daysLeft,
          start_kg: progress!.startKg != null ? r1(progress!.startKg) : null,
          trend_kg: progress!.currentKg != null ? r1(progress!.currentKg) : null,
          actual_rate_pct_per_week:
            progress!.ratePct != null ? Math.round(progress!.ratePct * 100) / 100 : null,
          status: progress!.status,
          suggested_kcal_change: progress!.kcalAdjust,
        }
      : null,
    estimated_energy_use: energy
      ? { kcal_per_day: energy.tdee, avg_intake: energy.avgIntake, logged_days: energy.loggedDays }
      : null,
    habits_today: s.habits.map((h) => ({
      name: h.name,
      done: (s.habitLog[today] ?? []).includes(h.id),
    })),
  };
}

function settingsView() {
  const st = useStore.getState().settings;
  return {
    sex: st.sex,
    birth_year: st.birthYear,
    height_cm: st.heightCm,
    bedtime: st.sleep.bedtime,
    wake_time: st.sleep.wake,
    screens_off: st.sleep.screensOff,
    sleep_target_min: targetSleepMinutes(st.sleep),
    step_goal: st.stepGoal,
    cardio_goal_min_per_week: st.cardioGoalMin,
    rest_days: st.restDays.map((d) => WEEKDAYS[d]),
    deload_every_weeks: st.deloadEveryWeeks,
  };
}

function sleepView(e: Store['sleepLog'][number]) {
  return {
    date: e.date,
    bed: e.bed,
    wake: e.wake,
    minutes: sleepMinutes(e),
    measured: e.asleepMin != null,
    quality: e.quality ?? null,
    note: e.note ?? null,
  };
}

function getRecovery(input: Input) {
  const days = Math.round(num(input, 'days', 1, 60));
  const s = useStore.getState();
  const today = dateKey();
  const from = addDays(today, -(days - 1));
  const targetMin = targetSleepMinutes(s.settings.sleep);
  const weightKg = s.bodyWeights[s.bodyWeights.length - 1]?.kg ?? null;
  const perDay: Record<string, unknown> = {};
  for (let d = from; d <= today; d = addDays(d, 1)) {
    const sleep = s.sleepLog.find((e) => e.date === d);
    const checkIn = s.checkIns.find((c) => c.date === d);
    const cardio = s.cardioLog.filter((c) => c.date === d);
    const steps = s.steps[d];
    if (!sleep && !checkIn && !cardio.length && steps == null) continue;
    const ready = readiness(checkIn, sleep, targetMin);
    perDay[d] = {
      ...(sleep ? { sleep: sleepView(sleep) } : {}),
      ...(checkIn ? { check_in: checkIn } : {}),
      ...(ready ? { readiness: ready.score } : {}),
      ...(steps != null ? { steps } : {}),
      ...(cardio.length
        ? {
            cardio: cardio.map((c) => ({
              id: c.id,
              kind: c.kind,
              minutes: c.minutes,
              intensity: c.intensity,
              distance_km: c.distanceKm ?? null,
              avg_hr: c.avgHr ?? null,
              kcal: cardioKcal(c, weightKg),
              note: c.note ?? null,
            })),
          }
        : {}),
    };
  }
  const stats = sleepStats(s.sleepLog, targetMin, Math.min(days, 14));
  const deload = deloadStatus(s.settings, s.workouts);
  return {
    settings: settingsView(),
    days: perDay,
    sleep_stats: stats
      ? {
          nights: stats.nights,
          avg_min: stats.avgMin,
          avg_bed: stats.avgBed,
          avg_wake: stats.avgWake,
          bed_spread_min: stats.bedSpreadMin,
          wake_spread_min: stats.wakeSpreadMin,
          regularity: regularityLabel(stats),
          debt_min: stats.debtMin,
        }
      : null,
    steps_this_week: weekSteps(s.steps, weekKey(0)),
    cardio_this_week: weekCardio(s.cardioLog, weekKey(0)),
    deload: {
      active_this_week: deload.active,
      training_weeks_since: deload.weeksSince,
      due: deload.due,
    },
    habits: s.habits.map((h) => ({
      name: h.name,
      done_today: (s.habitLog[today] ?? []).includes(h.id),
      done_last_7_days: Array.from({ length: 7 }, (_, i) => addDays(today, -i)).filter((d) =>
        (s.habitLog[d] ?? []).includes(h.id),
      ).length,
    })),
  };
}

function getWeekReport(input: Input) {
  const back = Math.round(num(input, 'weeks_back', 0, 12));
  const s = useStore.getState();
  const getExercise = (id: string) => findExercise(id, s.customExercises);
  const build = (weeksBack: number) => {
    const weekStart = weekKey(weeksBack);
    return {
      ...weekReport(weekStart, s),
      sets_per_muscle: weeklyMuscleSets(s.workouts, weekStart, getExercise),
    };
  };
  return {
    goals: s.goals,
    sleep_target_min: targetSleepMinutes(s.settings.sleep),
    step_goal: s.settings.stepGoal,
    cardio_goal_min: s.settings.cardioGoalMin,
    week: build(back),
    week_before: build(back + 1),
  };
}

/** Latest scale reading and weekly trends of fat % and muscle mass (only when available). */
function bodyCompositionOverview(entries: Store['bodyWeights']) {
  const latest = [...entries].reverse().find((b) => hasComposition(b.composition));
  if (!latest) return {};
  const weekly = (value: (b: Store['bodyWeights'][number]) => number | undefined) =>
    weeklyAverages(entries, value)
      .slice(-8)
      .map((w) => ({ week_of: w.weekStart, avg: w.avg, n: w.count }));
  return {
    latest_body_composition: {
      date: latest.date,
      kg: latest.kg,
      ...snakeComposition(latest.composition),
    },
    fat_pct_weekly_avg: weekly((b) => b.composition?.fatPct),
    muscle_kg_weekly_avg: weekly((b) => b.composition?.muscleKg),
  };
}

function getWorkouts(input: Input) {
  const days = Math.round(num(input, 'days', 1, 120));
  const s = useStore.getState();
  const since = parseDateKey(addDays(dateKey(), -days)).getTime();
  const list = s.workouts.filter((w) => w.startedAt >= since);
  return {
    count: list.length,
    workouts: list.map((w) => ({
      id: w.id,
      date: dateKey(w.startedAt),
      name: w.name,
      minutes: Math.round(((w.finishedAt ?? w.startedAt) - w.startedAt) / 60000),
      exercises: w.exercises.map((we) => {
        const ex = findExercise(we.exerciseId, s.customExercises);
        return {
          exercise_id: we.exerciseId,
          name: ex?.name ?? we.exerciseId,
          sets: we.sets.filter((x) => x.done).map((x) => (ex ? setLabel(x, ex.kind) : '')),
        };
      }),
    })),
  };
}

function getExerciseHistory(input: Input) {
  const query = str(input, 'exercise').toLowerCase();
  const s = useStore.getState();
  const all = [...BUILT_IN_EXERCISES, ...s.customExercises];
  const ex =
    all.find((e) => e.id === query) ??
    all.find((e) => e.name.toLowerCase() === query) ??
    all.find((e) => e.name.toLowerCase().includes(query));
  if (!ex) throw new ToolInputError(`Geen oefening gevonden voor "${query}".`);
  return {
    exercise: { id: ex.id, name: ex.name, muscle: ex.muscle, kind: ex.kind },
    sessions: exerciseHistory(s.workouts, ex.id).map((h) => ({
      date: dateKey(h.date),
      sets: h.sets.map((x) => setLabel(x, ex.kind)),
      ...(ex.kind === 'weight' ? { max_kg: h.maxWeight, est_1rm_kg: r1(h.best1RM) } : {}),
    })),
  };
}

function getNutrition(input: Input) {
  const start = date(input, 'start_date', true);
  const end = date(input, 'end_date', true);
  if (end < start) throw new ToolInputError('end_date ligt voor start_date.');
  if (addDays(start, 31) < end) throw new ToolInputError('Maximaal 31 dagen per keer.');
  const s = useStore.getState();
  const days: Record<string, unknown> = {};
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const entries = s.foodLog.filter((e) => e.date === d);
    if (!entries.length && !s.water[d]) continue;
    days[d] = {
      totals: dayTotals(d),
      water_glasses: s.water[d] ?? 0,
      items: entries.map((e) => ({
        id: e.id,
        meal: e.meal,
        name: e.name,
        amount: e.amountLabel,
        kcal: Math.round(e.kcal),
        protein: r1(e.protein),
        carbs: r1(e.carbs),
        fat: r1(e.fat),
      })),
    };
  }
  return { goals: s.goals, days };
}

function getPlans() {
  const s = useStore.getState();
  return {
    active_plan_id: s.activePlanId,
    plans: s.plans.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      active: p.id === s.activePlanId,
      days: p.days.map((d) => ({
        day_id: d.id,
        name: d.name,
        exercises: d.exercises.map((pe) => ({
          exercise_id: pe.exerciseId,
          name: exerciseName(pe.exerciseId),
          sets: pe.sets,
          target: pe.target,
          rest_sec: pe.restSec,
        })),
      })),
    })),
  };
}

// ───────────────────────── write executors ─────────────────────────

type Write = { result: unknown; action: Omit<ToolAction, 'ok'> };

function logFood(input: Input): Write {
  const d = date(input, 'date');
  const m = meal(input.meal);
  const items = input.items;
  if (!Array.isArray(items) || !items.length) throw new ToolInputError('Geen items opgegeven.');
  const parsed = items.map((raw) => {
    const it = raw as Input;
    return {
      name: str(it, 'name'),
      amount: str(it, 'amount'),
      kcal: Math.round(num(it, 'kcal', 0, 5000)),
      protein: r1(num(it, 'protein', 0, 500)),
      carbs: r1(num(it, 'carbs', 0, 1000)),
      fat: r1(num(it, 'fat', 0, 500)),
    };
  });
  const { addFoodEntry } = useStore.getState();
  for (const it of parsed) {
    addFoodEntry({
      date: d,
      meal: m,
      name: it.name,
      amountLabel: it.amount,
      kcal: it.kcal,
      protein: it.protein,
      carbs: it.carbs,
      fat: it.fat,
    });
  }
  const kcal = parsed.reduce((n, i) => n + i.kcal, 0);
  return {
    result: {
      logged: parsed.length,
      date: d,
      meal: m,
      day_totals: dayTotals(d),
      goals: useStore.getState().goals,
    },
    action: {
      label: `${parsed.map((i) => i.name).join(', ')} → ${mealLabel(m)}${d === dateKey() ? '' : ` (${day(d)})`} · ${kcal} kcal`,
      link: '/food',
    },
  };
}

function updateFoodEntry(input: Input): Write {
  const id = str(input, 'id');
  const entry = useStore.getState().foodLog.find((e) => e.id === id);
  if (!entry)
    throw new ToolInputError(
      `Voedingsitem "${id}" bestaat niet. Haal de id’s op met get_nutrition.`,
    );
  const patch: Parameters<Store['updateFoodEntry']>[1] = {};
  if (input.date != null) patch.date = date(input, 'date', true);
  if (input.meal != null) patch.meal = meal(input.meal);
  if (input.name != null) patch.name = str(input, 'name');
  if (input.amount != null) patch.amountLabel = str(input, 'amount');
  const k = optNum(input, 'kcal', 0, 5000);
  if (k != null) patch.kcal = Math.round(k);
  const p = optNum(input, 'protein', 0, 500);
  if (p != null) patch.protein = r1(p);
  const c = optNum(input, 'carbs', 0, 1000);
  if (c != null) patch.carbs = r1(c);
  const f = optNum(input, 'fat', 0, 500);
  if (f != null) patch.fat = r1(f);
  if (!Object.keys(patch).length) throw new ToolInputError('Niets om aan te passen.');
  useStore.getState().updateFoodEntry(id, patch);
  const d = patch.date ?? entry.date;
  return {
    result: { updated: true, day_totals: dayTotals(d) },
    action: { label: `${patch.name ?? entry.name} aangepast`, link: '/food' },
  };
}

function deleteFoodEntries(input: Input): Write {
  const ids = Array.isArray(input.ids)
    ? input.ids.filter((x): x is string => typeof x === 'string')
    : [];
  const log = useStore.getState().foodLog;
  const found = log.filter((e) => ids.includes(e.id));
  if (!found.length)
    throw new ToolInputError('Geen van deze id’s bestaat. Haal ze op met get_nutrition.');
  const set = new Set(found.map((e) => e.id));
  useStore.setState({ foodLog: log.filter((e) => !set.has(e.id)) });
  return {
    result: { deleted: found.length, not_found: ids.filter((i) => !set.has(i)) },
    action: { label: `Verwijderd: ${found.map((e) => e.name).join(', ')}`, link: '/food' },
  };
}

function setWater(input: Input): Write {
  const d = date(input, 'date');
  const glasses = Math.round(num(input, 'glasses', 0, 40));
  useStore.getState().setWater(d, glasses);
  return {
    result: { date: d, glasses },
    action: {
      label: `Water: ${glasses} ${glasses === 1 ? 'glas' : 'glazen'}${d === dateKey() ? '' : ` (${day(d)})`}`,
      link: '/food',
    },
  };
}

function setGoals(input: Input): Write {
  const goals = {
    kcal: Math.round(num(input, 'kcal', 1000, 6000)),
    protein: Math.round(num(input, 'protein', 20, 400)),
    carbs: Math.round(num(input, 'carbs', 0, 800)),
    fat: Math.round(num(input, 'fat', 20, 300)),
  };
  const water = optNum(input, 'water_glasses', 1, 30);
  useStore
    .getState()
    .setGoals(water != null ? { ...goals, waterGlasses: Math.round(water) } : goals);
  return {
    result: { saved: true, goals: useStore.getState().goals },
    action: {
      label: `Doelen: ${goals.kcal} kcal · E ${goals.protein} · K ${goals.carbs} · V ${goals.fat}`,
      link: '/goals',
    },
  };
}

function logBodyWeight(input: Input): Write {
  const kg = r1(num(input, 'kg', 20, 400));
  const d = date(input, 'date');
  const composition: BodyComposition = {};
  for (const m of BODY_METRICS) {
    if (input[m.tool] == null) continue;
    const factor = 10 ** m.decimals;
    composition[m.key] = Math.round(num(input, m.tool, m.min, m.max) * factor) / factor;
  }
  const store = useStore.getState();
  const previous = [...store.bodyWeights].reverse().find((b) => b.date < d);
  store.logBodyWeight(kg, d, hasComposition(composition) ? composition : undefined);

  const parts = [`${fmt(kg)} kg`];
  if (composition.fatPct != null) parts.push(`${fmt(composition.fatPct)}% vet`);
  if (composition.muscleKg != null) parts.push(`${fmt(composition.muscleKg)} kg spieren`);
  const extra =
    Object.keys(composition).length -
    (composition.fatPct != null ? 1 : 0) -
    (composition.muscleKg != null ? 1 : 0);
  if (extra > 0) parts.push(`+${extra} ${extra === 1 ? 'waarde' : 'waarden'}`);
  return {
    result: {
      saved: true,
      date: d,
      kg,
      composition: snakeComposition(composition),
      previous: previous
        ? {
            date: previous.date,
            kg: previous.kg,
            composition: snakeComposition(previous.composition),
          }
        : null,
    },
    action: {
      label: `Weging ${parts.join(' · ')}${d === dateKey() ? '' : ` (${day(d)})`}`,
      link: '/weight',
    },
  };
}

const fmt = (n: number) => String(n).replace('.', ',');

/** Composition with the tool's snake_case names, for results sent to the coach. */
function snakeComposition(c?: BodyComposition) {
  if (!c) return null;
  const out: Record<string, number> = {};
  for (const m of BODY_METRICS) if (c[m.key] != null) out[m.tool] = c[m.key]!;
  return Object.keys(out).length ? out : null;
}

function deleteBodyWeight(input: Input): Write {
  const d = date(input, 'date', true);
  const entry = useStore.getState().bodyWeights.find((b) => b.date === d);
  if (!entry) throw new ToolInputError(`Geen weging op ${d}.`);
  useStore.getState().removeBodyWeight(entry.id);
  return {
    result: { deleted: true, date: d },
    action: { label: `Weging van ${day(d)} verwijderd`, link: '/weight' },
  };
}

function createPlan(input: Input): Write {
  const created: string[] = [];
  const plan: Plan = {
    id: uid(),
    name: str(input, 'name'),
    description: typeof input.description === 'string' ? input.description : '',
    days: parseDays(input.days, created, new Set()),
  };
  const store = useStore.getState();
  store.savePlan(plan);
  if (input.make_active === true) store.setActivePlan(plan.id);
  return {
    result: {
      created: true,
      plan_id: plan.id,
      active: input.make_active === true,
      new_custom_exercises: created,
    },
    action: {
      label: `Schema "${plan.name}" aangemaakt (${plan.days.length} ${plan.days.length === 1 ? 'dag' : 'dagen'})${input.make_active === true ? ' · actief' : ''}`,
      link: `/plan/${plan.id}`,
    },
  };
}

function updatePlan(input: Input): Write {
  const existing = findPlan(input.plan_id);
  const created: string[] = [];
  const plan: Plan = {
    ...existing,
    name: str(input, 'name'),
    description: typeof input.description === 'string' ? input.description : existing.description,
    days: parseDays(input.days, created, new Set(existing.days.map((d) => d.id))),
  };
  useStore.getState().savePlan(plan);
  return {
    result: {
      updated: true,
      plan_id: plan.id,
      days: plan.days.map((d) => d.name),
      new_custom_exercises: created,
    },
    action: { label: `Schema "${plan.name}" aangepast`, link: `/plan/${plan.id}` },
  };
}

function setActivePlan(input: Input): Write {
  if (input.plan_id == null) {
    useStore.getState().setActivePlan(null);
    return {
      result: { active_plan_id: null },
      action: { label: 'Geen actief schema meer', link: '/plans' },
    };
  }
  const plan = findPlan(input.plan_id);
  useStore.getState().setActivePlan(plan.id);
  const next = nextPlanDay(plan, useStore.getState().workouts);
  return {
    result: { active_plan_id: plan.id, next_day: next?.name ?? null },
    action: { label: `"${plan.name}" is nu je actieve schema`, link: `/plan/${plan.id}` },
  };
}

function deletePlan(input: Input): Write {
  const plan = findPlan(input.plan_id);
  useStore.getState().deletePlan(plan.id);
  return {
    result: { deleted: true },
    action: { label: `Schema "${plan.name}" verwijderd`, link: '/plans' },
  };
}

function logWorkout(input: Input): Write {
  const d = date(input, 'date', true);
  const name = str(input, 'name');
  const exercisesRaw = Array.isArray(input.exercises) ? (input.exercises as Input[]) : [];
  if (!exercisesRaw.length) throw new ToolInputError('Geen oefeningen opgegeven.');
  const created: string[] = [];
  const exercises: WorkoutExercise[] = exercisesRaw.map((we) => {
    const sets = Array.isArray(we.sets) ? (we.sets as Input[]) : [];
    if (!sets.length) throw new ToolInputError('Elke oefening heeft minstens één set nodig.');
    return {
      id: uid(),
      exerciseId: resolveExercise(we, created),
      sets: sets.map((s) => ({
        id: uid(),
        weight: optNum(s, 'weight_kg', 0, 500),
        reps: optNum(s, 'reps', 0, 1000),
        duration: optNum(s, 'duration', 0, 100000),
        distance: optNum(s, 'distance_km', 0, 500),
        done: true,
      })),
    };
  });
  const minutes = optNum(input, 'duration_min', 1, 600) ?? 60;
  // Logged workouts start at 12:00 local time on the given day.
  const start = parseDateKey(d);
  start.setHours(12, 0, 0, 0);
  const workout: Workout = {
    id: uid(),
    name,
    startedAt: start.getTime(),
    finishedAt: start.getTime() + minutes * 60000,
    exercises,
  };
  useStore.getState().addWorkout(workout);
  return {
    result: { logged: true, workout_id: workout.id, new_custom_exercises: created },
    action: { label: `Training "${name}" vastgelegd (${day(d)})`, link: `/history/${workout.id}` },
  };
}

function deleteWorkout(input: Input): Write {
  const id = str(input, 'workout_id');
  const workout = useStore.getState().workouts.find((w) => w.id === id);
  if (!workout)
    throw new ToolInputError(`Training "${id}" bestaat niet. Haal de id’s op met get_workouts.`);
  useStore.getState().deleteWorkout(id);
  return {
    result: { deleted: true },
    action: {
      label: `Training "${workout.name}" (${day(dateKey(workout.startedAt))}) verwijderd`,
      link: '/train',
    },
  };
}

function updateProfile(input: Input): Write {
  const current = useStore.getState().profile;
  const about = typeof input.about === 'string' ? input.about.trim() : '';
  if (!about) throw new ToolInputError('"about" mag niet leeg zijn.');
  if (about.length > 4000) throw new ToolInputError('Het profiel is te lang (max 4000 tekens).');
  const name =
    typeof input.name === 'string' && input.name.trim() ? input.name.trim() : current.name;
  useStore.getState().setProfile({ name, about });
  return {
    result: { saved: true, applies_from: 'volgende gesprek' },
    action: {
      label: 'Profiel bijgewerkt (geldt vanaf het volgende gesprek)',
      link: '/coach-settings',
    },
  };
}

// ───────────────────────── sleep, cardio, recovery ─────────────────────────

function time(input: Input, key: string): string {
  const v = input[key];
  const t = typeof v === 'string' ? normalizeTime(v) : null;
  if (!t) throw new ToolInputError(`"${key}" moet een tijd zijn zoals "22:15".`);
  return t;
}
const optStr = (input: Input, key: string) =>
  typeof input[key] === 'string' && (input[key] as string).trim()
    ? (input[key] as string).trim().slice(0, 200)
    : null;
const suffix = (d: string) => (d === dateKey() ? '' : ` (${day(d)})`);

function logSleep(input: Input): Write {
  const d = date(input, 'date');
  const bed = time(input, 'bed');
  const wake = time(input, 'wake');
  const inBed = minutesBetween(bed, wake);
  if (inBed < 60 || inBed > 16 * 60)
    throw new ToolInputError('Tussen bed en wake moet 1 tot 16 uur zitten.');
  const asleep = optNum(input, 'asleep_min', 30, inBed);
  const quality = optNum(input, 'quality', 1, 5);
  const note = optStr(input, 'note');
  useStore.getState().logSleep({
    date: d,
    bed,
    wake,
    ...(asleep != null ? { asleepMin: Math.round(asleep) } : {}),
    ...(quality != null ? { quality: Math.round(quality) } : {}),
    ...(note ? { note } : {}),
  });
  const s = useStore.getState();
  const targetMin = targetSleepMinutes(s.settings.sleep);
  const minutes = asleep != null ? Math.round(asleep) : inBed;
  const stats = sleepStats(s.sleepLog, targetMin, 7);
  return {
    result: {
      saved: true,
      date: d,
      minutes,
      target_min: targetMin,
      avg_min_7_days: stats?.avgMin ?? null,
    },
    action: {
      label: `Slaap ${hoursLabel(minutes)} · ${bed}–${wake}${suffix(d)}`,
      link: '/sleep',
    },
  };
}

function deleteSleep(input: Input): Write {
  const d = date(input, 'date', true);
  if (!useStore.getState().sleepLog.some((e) => e.date === d))
    throw new ToolInputError(`Geen nacht gelogd op ${d}.`);
  useStore.getState().removeSleep(d);
  return { result: { deleted: d }, action: { label: `Nacht van ${day(d)} verwijderd`, link: '/sleep' } };
}

function logCardio(input: Input): Write {
  const d = date(input, 'date');
  const kind = input.kind as CardioKind;
  if (!CARDIO_KINDS.some((k) => k.key === kind)) throw new ToolInputError('Onbekende cardiosoort.');
  const intensity = input.intensity as Intensity;
  if (!INTENSITIES.some((i) => i.key === intensity))
    throw new ToolInputError('intensity moet licht, matig of zwaar zijn.');
  const minutes = Math.round(num(input, 'minutes', 1, 600));
  const distance = optNum(input, 'distance_km', 0.05, 500);
  const avgHr = optNum(input, 'avg_hr', 40, 230);
  const kcal = optNum(input, 'kcal', 1, 10000);
  const note = optStr(input, 'note');
  const id = useStore.getState().addCardio({
    date: d,
    kind,
    minutes,
    intensity,
    ...(distance != null ? { distanceKm: Math.round(distance * 100) / 100 } : {}),
    ...(avgHr != null ? { avgHr: Math.round(avgHr) } : {}),
    ...(kcal != null ? { kcal: Math.round(kcal) } : {}),
    ...(note ? { note } : {}),
  });
  const s = useStore.getState();
  const week = weekCardio(s.cardioLog, weekKey(0));
  return {
    result: {
      saved: true,
      cardio_id: id,
      counts_towards_goal_min: moderateEquivalent({ minutes, intensity }),
      week_moderate_equivalent_min: week.moderateEq,
      week_goal_min: s.settings.cardioGoalMin,
    },
    action: {
      label: `${cardioKind(kind).label} ${minutes} min · ${intensity}${distance != null ? ` · ${fmt(Math.round(distance * 100) / 100)} km` : ''}${suffix(d)}`,
      link: '/cardio',
    },
  };
}

function deleteCardio(input: Input): Write {
  const session = useStore.getState().cardioLog.find((c) => c.id === input.cardio_id);
  if (!session)
    throw new ToolInputError('Cardiosessie niet gevonden. Haal de id’s op met get_recovery.');
  useStore.getState().removeCardio(session.id);
  return {
    result: { deleted: session.id },
    action: {
      label: `${cardioKind(session.kind).label} van ${day(session.date)} verwijderd`,
      link: '/cardio',
    },
  };
}

function setStepsTool(input: Input): Write {
  const d = date(input, 'date');
  const steps = Math.round(num(input, 'steps', 0, 150000));
  useStore.getState().setSteps(d, steps);
  const s = useStore.getState();
  return {
    result: { date: d, steps, goal: s.settings.stepGoal, week: weekSteps(s.steps, weekKey(0)) },
    action: {
      label: `Stappen: ${steps.toLocaleString('nl-NL')}${suffix(d)}`,
      link: '/cardio',
    },
  };
}

function logCheckIn(input: Input): Write {
  const d = date(input, 'date');
  const score = (key: string) => Math.round(num(input, key, 1, 5));
  const note = optStr(input, 'note');
  const checkIn = {
    date: d,
    energy: score('energy'),
    soreness: score('soreness'),
    stress: score('stress'),
    mood: score('mood'),
    ...(note ? { note } : {}),
  };
  useStore.getState().saveCheckIn(checkIn);
  const s = useStore.getState();
  const ready = readiness(
    checkIn,
    s.sleepLog.find((e) => e.date === d),
    targetSleepMinutes(s.settings.sleep),
  );
  return {
    result: { saved: true, date: d, readiness: ready ? ready.score : null, level: ready?.level },
    action: {
      label: `Check-in${ready ? `: herstel ${ready.score}/100` : ''}${suffix(d)}`,
      link: '/recovery',
    },
  };
}

function updateSettings(input: Input): Write {
  const patch: SettingsPatch = {};
  const sleep: NonNullable<SettingsPatch['sleep']> = {};
  const changed: string[] = [];
  if (input.bedtime != null) {
    sleep.bedtime = time(input, 'bedtime');
    changed.push(`licht uit ${sleep.bedtime}`);
  }
  if (input.wake_time != null) {
    sleep.wake = time(input, 'wake_time');
    changed.push(`opstaan ${sleep.wake}`);
  }
  if (typeof input.screens_off === 'string') {
    sleep.screensOff = input.screens_off.trim() ? time(input, 'screens_off') : null;
    changed.push(sleep.screensOff ? `schermen uit ${sleep.screensOff}` : 'geen schermtijd');
  }
  if (Object.keys(sleep).length) patch.sleep = sleep;
  if (input.step_goal != null) {
    patch.stepGoal = Math.round(num(input, 'step_goal', 1000, 50000));
    changed.push(`${patch.stepGoal} stappen`);
  }
  if (input.cardio_goal_min != null) {
    patch.cardioGoalMin = Math.round(num(input, 'cardio_goal_min', 0, 2000));
    changed.push(`${patch.cardioGoalMin} min cardio per week`);
  }
  if (input.rest_days != null) {
    if (!Array.isArray(input.rest_days) || input.rest_days.some((d) => !WEEKDAYS.includes(d)))
      throw new ToolInputError(`rest_days: gebruik ${WEEKDAYS.join(', ')}.`);
    if (input.rest_days.length > 6) throw new ToolInputError('Er moet minstens één trainingsdag overblijven.');
    patch.restDays = [...new Set(input.rest_days.map((d) => WEEKDAYS.indexOf(d as string)))].sort();
    changed.push(
      patch.restDays.length
        ? `rustdagen ${patch.restDays.map((d) => WEEKDAYS[d]).join(', ')}`
        : 'geen vaste rustdagen',
    );
  }
  if (input.deload_every_weeks != null) {
    patch.deloadEveryWeeks = Math.round(num(input, 'deload_every_weeks', 0, 26));
    changed.push(
      patch.deloadEveryWeeks ? `deload na ${patch.deloadEveryWeeks} weken` : 'geen deload-herinnering',
    );
  }
  if (input.sex != null) {
    if (input.sex !== 'man' && input.sex !== 'vrouw') throw new ToolInputError('sex: man of vrouw.');
    patch.sex = input.sex;
    changed.push(input.sex);
  }
  if (input.birth_year != null) {
    patch.birthYear = Math.round(num(input, 'birth_year', 1920, new Date().getFullYear() - 5));
    changed.push(`geboortejaar ${patch.birthYear}`);
  }
  if (input.height_cm != null) {
    patch.heightCm = Math.round(num(input, 'height_cm', 100, 250));
    changed.push(`${patch.heightCm} cm`);
  }
  const store = useStore.getState();
  if (Object.keys(patch).length) store.setSettings(patch);
  if (typeof input.deload_this_week === 'boolean') {
    store.setDeloadWeek(input.deload_this_week);
    changed.push(input.deload_this_week ? 'deloadweek gestart' : 'deloadweek gestopt');
  }
  if (!changed.length) throw new ToolInputError('Geen velden om te wijzigen.');
  return {
    result: { saved: true, settings: settingsView() },
    action: { label: `Instellingen: ${changed.join(' · ')}`, link: '/recovery' },
  };
}

function setPhase(input: Input): Write {
  const type = input.type;
  if (type === 'geen') {
    useStore.getState().setSettings({ phase: null });
    return { result: { saved: true, phase: null }, action: { label: 'Fase verwijderd', link: '/progress' } };
  }
  if (type !== 'cut' && type !== 'onderhoud' && type !== 'bulk')
    throw new ToolInputError('type: cut, onderhoud, bulk of geen.');
  const start = date(input, 'start');
  const end = input.end == null ? null : date(input, 'end', true);
  if (end && end <= start) throw new ToolInputError('end moet na start liggen.');
  const rate = optNum(input, 'rate_pct', 0, 2);
  const magnitude = type === 'onderhoud' ? 0 : (rate ?? (type === 'cut' ? 0.5 : 0.25));
  if (type === 'cut' && magnitude > 1)
    throw new ToolInputError('Meer dan 1% per week afvallen is te snel; kies 1 of lager.');
  const phase: Phase = {
    type,
    start,
    ...(end ? { end } : {}),
    ratePct: type === 'cut' ? -magnitude : magnitude,
  };
  useStore.getState().setSettings({ phase });
  return {
    result: { saved: true, phase },
    action: {
      label: `Fase: ${PHASE_LABEL[type]}${type === 'onderhoud' ? '' : ` ${fmt(magnitude)}% per week`}${end ? ` tot ${day(end)}` : ''}`,
      link: '/progress',
    },
  };
}

function setHabits(input: Input): Write {
  if (!Array.isArray(input.habits)) throw new ToolInputError('"habits" moet een lijst zijn.');
  const names = [
    ...new Set(
      input.habits
        .filter((h): h is string => typeof h === 'string' && !!h.trim())
        .map((h) => h.trim().slice(0, 60)),
    ),
  ];
  if (names.length > 12) throw new ToolInputError('Maximaal 12 gewoontes.');
  const current = useStore.getState().habits;
  // Keep the id of habits that stay, so their history survives.
  useStore.setState({
    habits: names.map(
      (name) =>
        current.find((h) => h.name.toLowerCase() === name.toLowerCase()) ?? { id: uid(), name },
    ),
  });
  return {
    result: { saved: true, habits: names },
    action: {
      label: names.length ? `Gewoontes: ${names.join(', ')}` : 'Gewoontes gewist',
      link: '/recovery',
    },
  };
}

function checkHabit(input: Input): Write {
  const query = str(input, 'habit').toLowerCase();
  const d = date(input, 'date');
  const s = useStore.getState();
  const habit =
    s.habits.find((h) => h.name.toLowerCase() === query) ??
    s.habits.find((h) => h.name.toLowerCase().includes(query));
  if (!habit)
    throw new ToolInputError(
      `Geen gewoonte "${query}". Bestaande: ${s.habits.map((h) => h.name).join(', ') || 'geen'}.`,
    );
  const want = input.done !== false;
  const isDone = (s.habitLog[d] ?? []).includes(habit.id);
  if (want !== isDone) s.toggleHabit(d, habit.id);
  return {
    result: { habit: habit.name, date: d, done: want },
    action: {
      label: `${habit.name}: ${want ? 'afgevinkt' : 'uitgevinkt'}${suffix(d)}`,
      link: '/recovery',
    },
  };
}

// ───────────────────────── dispatcher ─────────────────────────

const READERS: Record<string, (input: Input) => unknown> = {
  get_overview: getOverview,
  get_workouts: getWorkouts,
  get_exercise_history: getExerciseHistory,
  get_nutrition: getNutrition,
  get_plans: getPlans,
  get_recovery: getRecovery,
  get_week_report: getWeekReport,
};

const WRITERS: Record<string, (input: Input) => Write> = {
  log_food: logFood,
  update_food_entry: updateFoodEntry,
  delete_food_entries: deleteFoodEntries,
  set_water: setWater,
  set_nutrition_goals: setGoals,
  log_body_weight: logBodyWeight,
  delete_body_weight: deleteBodyWeight,
  create_training_plan: createPlan,
  update_training_plan: updatePlan,
  set_active_plan: setActivePlan,
  delete_training_plan: deletePlan,
  log_workout: logWorkout,
  delete_workout: deleteWorkout,
  update_profile: updateProfile,
  log_sleep: logSleep,
  delete_sleep: deleteSleep,
  log_cardio: logCardio,
  delete_cardio: deleteCardio,
  set_steps: setStepsTool,
  log_check_in: logCheckIn,
  update_settings: updateSettings,
  set_phase: setPhase,
  set_habits: setHabits,
  check_habit: checkHabit,
};

const READ_LABELS: Record<string, string> = {
  get_overview: 'Overzicht bekeken',
  get_workouts: 'Trainingen bekeken',
  get_exercise_history: 'Oefening-historie bekeken',
  get_nutrition: 'Voedingslog bekeken',
  get_plans: 'Schema’s bekeken',
  get_recovery: 'Slaap en herstel bekeken',
  get_week_report: 'Weekrapport bekeken',
};

export function runTool(name: string, rawInput: unknown): ToolOutcome {
  const input = (rawInput && typeof rawInput === 'object' ? rawInput : {}) as Input;
  const keys = WRITES[name];
  const before = keys ? snapshot(keys) : undefined;
  try {
    if (READERS[name]) {
      return {
        content: JSON.stringify(READERS[name](input)),
        isError: false,
        action: { ok: true, label: READ_LABELS[name] ?? name },
      };
    }
    const writer = WRITERS[name];
    if (!writer) throw new ToolInputError(`Onbekende tool "${name}".`);
    const { result, action } = writer(input);
    return {
      content: JSON.stringify(result),
      isError: false,
      action: { ...action, ok: true },
      undo: keys && before ? { keys, before, after: snapshot(keys) } : undefined,
    };
  } catch (e) {
    // Roll back anything a failed write changed halfway (e.g. a custom exercise).
    if (before) useStore.setState(before);
    const message = e instanceof Error ? e.message : String(e);
    return {
      content: `Fout: ${message}`,
      isError: true,
      action: { ok: false, label: `${READ_LABELS[name] ?? name} mislukt: ${message}` },
    };
  }
}
