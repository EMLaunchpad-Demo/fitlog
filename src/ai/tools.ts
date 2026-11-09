import type { BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { Href } from 'expo-router';

import { BUILT_IN_EXERCISES, MUSCLE_GROUPS } from '@/data/exercises';
import { BODY_METRICS, hasComposition } from '@/lib/body';
import { addDays, dateKey, parseDateKey, relativeDay, uid } from '@/lib/format';
import { MEALS, mealLabel, sumMacros } from '@/lib/nutrition';
import type {
  BodyComposition,
  ExerciseKind,
  Meal,
  MuscleGroup,
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
import { type Store, findExercise, nextPlanDay, useStore } from '@/store/store';

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
    'Snel overzicht: doelen, voeding en water van vandaag, lichaamsgewicht (weekgemiddelden van de laatste 8 weken en wegingen van de laatste 30 dagen), actief schema met de volgende trainingsdag, de laatste trainingen en de streak. Gebruik dit als eerste stap bij algemene vragen.',
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
  | 'profile';
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

// ───────────────────────── dispatcher ─────────────────────────

const READERS: Record<string, (input: Input) => unknown> = {
  get_overview: getOverview,
  get_workouts: getWorkouts,
  get_exercise_history: getExerciseHistory,
  get_nutrition: getNutrition,
  get_plans: getPlans,
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
};

const READ_LABELS: Record<string, string> = {
  get_overview: 'Overzicht bekeken',
  get_workouts: 'Trainingen bekeken',
  get_exercise_history: 'Oefening-historie bekeken',
  get_nutrition: 'Voedingslog bekeken',
  get_plans: 'Schema’s bekeken',
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
