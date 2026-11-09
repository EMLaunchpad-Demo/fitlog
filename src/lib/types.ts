export type MuscleGroup =
  | 'Borst'
  | 'Rug'
  | 'Schouders'
  | 'Biceps'
  | 'Triceps'
  | 'Benen'
  | 'Billen'
  | 'Buik'
  | 'Cardio';

/**
 * How a set of this exercise is logged:
 * - weight: kg × reps
 * - bodyweight: optional extra kg × reps
 * - time: seconds held (plank, touwtje springen)
 * - cardio: distance in km and duration in minutes
 */
export type ExerciseKind = 'weight' | 'bodyweight' | 'time' | 'cardio';

export interface Exercise {
  id: string;
  name: string;
  muscle: MuscleGroup;
  kind: ExerciseKind;
  custom?: boolean;
}

export interface WorkoutSet {
  id: string;
  weight: number | null;
  reps: number | null;
  /** seconds for 'time', minutes for 'cardio' */
  duration: number | null;
  distance: number | null;
  done: boolean;
}

export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  sets: WorkoutSet[];
  /** Target from the plan, e.g. "8-12" or "45s" */
  target?: string;
  restSec?: number;
}

export interface Workout {
  id: string;
  name: string;
  startedAt: number;
  finishedAt?: number;
  exercises: WorkoutExercise[];
  planId?: string;
  dayId?: string;
}

export interface PlanExercise {
  id: string;
  exerciseId: string;
  sets: number;
  target: string;
  restSec: number;
}

export interface PlanDay {
  id: string;
  name: string;
  exercises: PlanExercise[];
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  days: PlanDay[];
}

export type Meal = 'ontbijt' | 'lunch' | 'diner' | 'snack';

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Food extends Macros {
  id: string;
  name: string;
  /** '100g': macros are per 100 g. 'portie': macros are per portion. */
  basis: '100g' | 'portie';
  /** Handy unit for 100g-foods, e.g. 1 snee = 35 g */
  unit?: { label: string; grams: number };
  category?: string;
  custom?: boolean;
}

export interface FoodEntry extends Macros {
  id: string;
  date: string;
  meal: Meal;
  name: string;
  foodId?: string;
  /** What was eaten, e.g. "150 g" or "2 snee" */
  amountLabel: string;
  /** Raw amount + unit so the same amount can be re-used */
  amount?: number;
  amountUnit?: 'g' | 'unit' | 'portie';
  createdAt: number;
}

export interface Goals extends Macros {
  waterGlasses: number;
}

/** What the user tells the coach about themselves. */
export interface Profile {
  name: string;
  about: string;
}

export interface BodyWeight {
  id: string;
  date: string;
  kg: number;
}
