import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { BUILT_IN_EXERCISES } from '@/data/exercises';
import { BUILT_IN_FOODS } from '@/data/foods';
import { PRESET_PLANS } from '@/data/plans';
import { dateKey, uid } from '@/lib/format';
import type {
  BodyComposition,
  BodyWeight,
  Exercise,
  Food,
  FoodEntry,
  Goals,
  Plan,
  PlanExercise,
  Profile,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '@/lib/types';
import { previousSets } from '@/lib/workout-stats';

export interface RestTimer {
  endsAt: number;
  duration: number;
}

interface State {
  customExercises: Exercise[];
  plans: Plan[];
  activePlanId: string | null;
  /** Finished workouts, newest first */
  workouts: Workout[];
  activeWorkout: Workout | null;
  rest: RestTimer | null;
  defaultRestSec: number;

  foodLog: FoodEntry[];
  customFoods: Food[];
  water: Record<string, number>;
  goals: Goals;
  bodyWeights: BodyWeight[];
  profile: Profile;
}

interface Actions {
  // Workouts
  startWorkout: (opts?: { planId?: string; dayId?: string; fromWorkoutId?: string }) => void;
  renameWorkout: (name: string) => void;
  addExercisesToWorkout: (exerciseIds: string[]) => void;
  removeWorkoutExercise: (workoutExerciseId: string) => void;
  addSet: (workoutExerciseId: string) => void;
  removeSet: (workoutExerciseId: string, setId: string) => void;
  updateSet: (workoutExerciseId: string, setId: string, patch: Partial<WorkoutSet>) => void;
  finishWorkout: () => string | null;
  discardWorkout: () => void;
  deleteWorkout: (id: string) => void;
  /** Adds a finished workout logged after the fact (kept newest first). */
  addWorkout: (workout: Workout) => void;
  startRest: (seconds: number) => void;
  adjustRest: (deltaSec: number) => void;
  clearRest: () => void;
  setDefaultRest: (seconds: number) => void;

  // Exercises
  addCustomExercise: (ex: Omit<Exercise, 'id' | 'custom'>) => string;

  // Plans
  createPlan: (name: string) => string;
  updatePlan: (id: string, patch: Partial<Pick<Plan, 'name' | 'description'>>) => void;
  deletePlan: (id: string) => void;
  /** Adds a plan, or replaces the plan with the same id. */
  savePlan: (plan: Plan) => void;
  setActivePlan: (id: string | null) => void;
  addPlanDay: (planId: string, name: string) => void;
  renamePlanDay: (planId: string, dayId: string, name: string) => void;
  removePlanDay: (planId: string, dayId: string) => void;
  addExercisesToPlanDay: (planId: string, dayId: string, exerciseIds: string[]) => void;
  updatePlanExercise: (
    planId: string,
    dayId: string,
    planExerciseId: string,
    patch: Partial<Omit<PlanExercise, 'id' | 'exerciseId'>>,
  ) => void;
  removePlanExercise: (planId: string, dayId: string, planExerciseId: string) => void;
  movePlanExercise: (planId: string, dayId: string, planExerciseId: string, dir: -1 | 1) => void;

  // Nutrition
  addFoodEntry: (entry: Omit<FoodEntry, 'id' | 'createdAt'>) => void;
  removeFoodEntry: (id: string) => void;
  updateFoodEntry: (id: string, patch: Partial<Omit<FoodEntry, 'id' | 'createdAt'>>) => void;
  addCustomFood: (food: Omit<Food, 'id' | 'custom'>) => string;
  setWater: (date: string, glasses: number) => void;
  setGoals: (goals: Partial<Goals>) => void;

  // Body weight
  /** Replaces the weigh-in of that date; keeps its body composition unless a new one is given. */
  logBodyWeight: (kg: number, date?: string, composition?: BodyComposition) => void;
  removeBodyWeight: (id: string) => void;

  // Profile
  setProfile: (profile: Profile) => void;
}

export type Store = State & Actions;

const emptySet = (): WorkoutSet => ({
  id: uid(),
  weight: null,
  reps: null,
  duration: null,
  distance: null,
  done: false,
});

function makeWorkoutExercise(
  exerciseId: string,
  history: Workout[],
  setCount?: number,
  extra?: Pick<WorkoutExercise, 'target' | 'restSec'>,
): WorkoutExercise {
  const prev = previousSets(history, exerciseId);
  const count = setCount ?? Math.max(prev.length, 3);
  return {
    id: uid(),
    exerciseId,
    sets: Array.from({ length: count }, emptySet),
    ...extra,
  };
}

function mapPlan(plans: Plan[], planId: string, fn: (p: Plan) => Plan): Plan[] {
  return plans.map((p) => (p.id === planId ? fn(p) : p));
}

function mapDay(
  plan: Plan,
  dayId: string,
  fn: (d: Plan['days'][number]) => Plan['days'][number],
): Plan {
  return { ...plan, days: plan.days.map((d) => (d.id === dayId ? fn(d) : d)) };
}

const initialState: State = {
  customExercises: [],
  plans: PRESET_PLANS,
  activePlanId: PRESET_PLANS[0].id,
  workouts: [],
  activeWorkout: null,
  rest: null,
  defaultRestSec: 90,
  foodLog: [],
  customFoods: [],
  water: {},
  goals: { kcal: 2200, protein: 140, carbs: 250, fat: 70, waterGlasses: 8 },
  bodyWeights: [],
  profile: { name: '', about: '' },
};

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ───────────────────────── Workouts ─────────────────────────
      startWorkout: (opts = {}) => {
        const { plans, workouts } = get();
        const now = Date.now();
        let workout: Workout = {
          id: uid(),
          name: 'Training',
          startedAt: now,
          exercises: [],
        };

        if (opts.planId && opts.dayId) {
          const plan = plans.find((p) => p.id === opts.planId);
          const day = plan?.days.find((d) => d.id === opts.dayId);
          if (plan && day) {
            workout = {
              ...workout,
              name: `${plan.name} · ${day.name}`,
              planId: plan.id,
              dayId: day.id,
              exercises: day.exercises.map((pe) =>
                makeWorkoutExercise(pe.exerciseId, workouts, pe.sets, {
                  target: pe.target,
                  restSec: pe.restSec,
                }),
              ),
            };
          }
        } else if (opts.fromWorkoutId) {
          const source = workouts.find((w) => w.id === opts.fromWorkoutId);
          if (source) {
            workout = {
              ...workout,
              name: source.name,
              planId: source.planId,
              dayId: source.dayId,
              exercises: source.exercises.map((we) =>
                makeWorkoutExercise(we.exerciseId, workouts, we.sets.length, {
                  target: we.target,
                  restSec: we.restSec,
                }),
              ),
            };
          }
        } else {
          const h = new Date(now).getHours();
          workout.name = h < 12 ? 'Ochtendtraining' : h < 18 ? 'Middagtraining' : 'Avondtraining';
        }

        set({ activeWorkout: workout, rest: null });
      },

      renameWorkout: (name) =>
        set((s) => (s.activeWorkout ? { activeWorkout: { ...s.activeWorkout, name } } : s)),

      addExercisesToWorkout: (exerciseIds) =>
        set((s) => {
          if (!s.activeWorkout) return s;
          const added = exerciseIds.map((id) => makeWorkoutExercise(id, s.workouts));
          return {
            activeWorkout: {
              ...s.activeWorkout,
              exercises: [...s.activeWorkout.exercises, ...added],
            },
          };
        }),

      removeWorkoutExercise: (weId) =>
        set((s) =>
          s.activeWorkout
            ? {
                activeWorkout: {
                  ...s.activeWorkout,
                  exercises: s.activeWorkout.exercises.filter((we) => we.id !== weId),
                },
              }
            : s,
        ),

      addSet: (weId) =>
        set((s) => {
          if (!s.activeWorkout) return s;
          return {
            activeWorkout: {
              ...s.activeWorkout,
              exercises: s.activeWorkout.exercises.map((we) => {
                if (we.id !== weId) return we;
                const last = we.sets[we.sets.length - 1];
                // Carry over the last values so adding a set is one tap.
                const next: WorkoutSet = last ? { ...last, id: uid(), done: false } : emptySet();
                return { ...we, sets: [...we.sets, next] };
              }),
            },
          };
        }),

      removeSet: (weId, setId) =>
        set((s) => {
          if (!s.activeWorkout) return s;
          return {
            activeWorkout: {
              ...s.activeWorkout,
              exercises: s.activeWorkout.exercises.map((we) =>
                we.id === weId ? { ...we, sets: we.sets.filter((x) => x.id !== setId) } : we,
              ),
            },
          };
        }),

      updateSet: (weId, setId, patch) =>
        set((s) => {
          if (!s.activeWorkout) return s;
          return {
            activeWorkout: {
              ...s.activeWorkout,
              exercises: s.activeWorkout.exercises.map((we) =>
                we.id === weId
                  ? { ...we, sets: we.sets.map((x) => (x.id === setId ? { ...x, ...patch } : x)) }
                  : we,
              ),
            },
          };
        }),

      finishWorkout: () => {
        const { activeWorkout } = get();
        if (!activeWorkout) return null;
        const exercises = activeWorkout.exercises
          .map((we) => ({ ...we, sets: we.sets.filter((x) => x.done) }))
          .filter((we) => we.sets.length > 0);
        if (!exercises.length) {
          set({ activeWorkout: null, rest: null });
          return null;
        }
        const finished: Workout = { ...activeWorkout, exercises, finishedAt: Date.now() };
        set((s) => ({
          workouts: [finished, ...s.workouts],
          activeWorkout: null,
          rest: null,
        }));
        return finished.id;
      },

      discardWorkout: () => set({ activeWorkout: null, rest: null }),

      deleteWorkout: (id) => set((s) => ({ workouts: s.workouts.filter((w) => w.id !== id) })),

      addWorkout: (workout) =>
        set((s) => ({
          workouts: [...s.workouts, workout].sort((a, b) => b.startedAt - a.startedAt),
        })),

      startRest: (seconds) =>
        set({ rest: { endsAt: Date.now() + seconds * 1000, duration: seconds } }),

      adjustRest: (delta) =>
        set((s) => {
          if (!s.rest) return s;
          const endsAt = Math.max(Date.now(), s.rest.endsAt + delta * 1000);
          return { rest: { endsAt, duration: Math.max(1, s.rest.duration + delta) } };
        }),

      clearRest: () => set({ rest: null }),

      setDefaultRest: (seconds) => set({ defaultRestSec: seconds }),

      // ───────────────────────── Exercises ─────────────────────────
      addCustomExercise: (ex) => {
        const id = `custom-${uid()}`;
        set((s) => ({ customExercises: [...s.customExercises, { ...ex, id, custom: true }] }));
        return id;
      },

      // ───────────────────────── Plans ─────────────────────────
      createPlan: (name) => {
        const id = uid();
        set((s) => ({
          plans: [
            ...s.plans,
            { id, name, description: '', days: [{ id: uid(), name: 'Dag 1', exercises: [] }] },
          ],
        }));
        return id;
      },

      updatePlan: (id, patch) =>
        set((s) => ({ plans: mapPlan(s.plans, id, (p) => ({ ...p, ...patch })) })),

      savePlan: (plan) =>
        set((s) => ({
          plans: s.plans.some((p) => p.id === plan.id)
            ? s.plans.map((p) => (p.id === plan.id ? plan : p))
            : [...s.plans, plan],
        })),

      deletePlan: (id) =>
        set((s) => ({
          plans: s.plans.filter((p) => p.id !== id),
          activePlanId: s.activePlanId === id ? null : s.activePlanId,
        })),

      setActivePlan: (id) => set({ activePlanId: id }),

      addPlanDay: (planId, name) =>
        set((s) => ({
          plans: mapPlan(s.plans, planId, (p) => ({
            ...p,
            days: [...p.days, { id: uid(), name, exercises: [] }],
          })),
        })),

      renamePlanDay: (planId, dayId, name) =>
        set((s) => ({
          plans: mapPlan(s.plans, planId, (p) => mapDay(p, dayId, (d) => ({ ...d, name }))),
        })),

      removePlanDay: (planId, dayId) =>
        set((s) => ({
          plans: mapPlan(s.plans, planId, (p) => ({
            ...p,
            days: p.days.filter((d) => d.id !== dayId),
          })),
        })),

      addExercisesToPlanDay: (planId, dayId, exerciseIds) =>
        set((s) => ({
          plans: mapPlan(s.plans, planId, (p) =>
            mapDay(p, dayId, (d) => ({
              ...d,
              exercises: [
                ...d.exercises,
                ...exerciseIds.map((exerciseId) => {
                  const kind = [...BUILT_IN_EXERCISES, ...s.customExercises].find(
                    (e) => e.id === exerciseId,
                  )?.kind;
                  return {
                    id: uid(),
                    exerciseId,
                    sets: 3,
                    target: kind === 'time' ? '45s' : kind === 'cardio' ? '20 min' : '8-12',
                    restSec: s.defaultRestSec,
                  };
                }),
              ],
            })),
          ),
        })),

      updatePlanExercise: (planId, dayId, peId, patch) =>
        set((s) => ({
          plans: mapPlan(s.plans, planId, (p) =>
            mapDay(p, dayId, (d) => ({
              ...d,
              exercises: d.exercises.map((x) => (x.id === peId ? { ...x, ...patch } : x)),
            })),
          ),
        })),

      removePlanExercise: (planId, dayId, peId) =>
        set((s) => ({
          plans: mapPlan(s.plans, planId, (p) =>
            mapDay(p, dayId, (d) => ({
              ...d,
              exercises: d.exercises.filter((x) => x.id !== peId),
            })),
          ),
        })),

      movePlanExercise: (planId, dayId, peId, dir) =>
        set((s) => ({
          plans: mapPlan(s.plans, planId, (p) =>
            mapDay(p, dayId, (d) => {
              const i = d.exercises.findIndex((x) => x.id === peId);
              const j = i + dir;
              if (i < 0 || j < 0 || j >= d.exercises.length) return d;
              const next = [...d.exercises];
              [next[i], next[j]] = [next[j], next[i]];
              return { ...d, exercises: next };
            }),
          ),
        })),

      // ───────────────────────── Nutrition ─────────────────────────
      addFoodEntry: (entry) =>
        set((s) => ({
          foodLog: [...s.foodLog, { ...entry, id: uid(), createdAt: Date.now() }],
        })),

      removeFoodEntry: (id) => set((s) => ({ foodLog: s.foodLog.filter((e) => e.id !== id) })),

      updateFoodEntry: (id, patch) =>
        set((s) => ({ foodLog: s.foodLog.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),

      addCustomFood: (food) => {
        const id = `custom-${uid()}`;
        set((s) => ({ customFoods: [...s.customFoods, { ...food, id, custom: true }] }));
        return id;
      },

      setWater: (date, glasses) =>
        set((s) => ({ water: { ...s.water, [date]: Math.max(0, glasses) } })),

      setGoals: (goals) => set((s) => ({ goals: { ...s.goals, ...goals } })),

      // ───────────────────────── Body weight ─────────────────────────
      logBodyWeight: (kg, date = dateKey(), composition) =>
        set((s) => {
          const existing = s.bodyWeights.find((b) => b.date === date);
          const kept = composition ?? existing?.composition;
          return {
            bodyWeights: [
              ...s.bodyWeights.filter((b) => b.date !== date),
              { id: uid(), date, kg, ...(kept ? { composition: kept } : {}) },
            ].sort((a, b) => a.date.localeCompare(b.date)),
          };
        }),

      setProfile: (profile) => set({ profile }),

      removeBodyWeight: (id) =>
        set((s) => ({ bodyWeights: s.bodyWeights.filter((b) => b.id !== id) })),
    }),
    {
      name: 'fitlog-store',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

// ───────────────────────── Lookups ─────────────────────────

const builtInExerciseMap = new Map(BUILT_IN_EXERCISES.map((e) => [e.id, e]));
const builtInFoodMap = new Map(BUILT_IN_FOODS.map((f) => [f.id, f]));

export function findExercise(id: string, custom: Exercise[]): Exercise | undefined {
  return builtInExerciseMap.get(id) ?? custom.find((e) => e.id === id);
}

export function useExerciseLookup() {
  const custom = useStore((s) => s.customExercises);
  return (id: string) => findExercise(id, custom);
}

export function findFood(id: string, custom: Food[]): Food | undefined {
  return builtInFoodMap.get(id) ?? custom.find((f) => f.id === id);
}

/** Next day to train in the active plan, based on the last workout from that plan. */
export function nextPlanDay(plan: Plan | undefined, workouts: Workout[]) {
  if (!plan || !plan.days.length) return undefined;
  const last = workouts.find((w) => w.planId === plan.id && w.dayId);
  if (!last) return plan.days[0];
  const i = plan.days.findIndex((d) => d.id === last.dayId);
  return plan.days[(i + 1) % plan.days.length];
}
