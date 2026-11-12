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

/** Body composition from a smart scale. Every value is optional: scales measure different things. */
export interface BodyComposition {
  bmi?: number;
  fatPct?: number;
  subcutaneousFatPct?: number;
  visceralFat?: number;
  muscleKg?: number;
  skeletalMusclePct?: number;
  waterPct?: number;
  boneKg?: number;
  proteinPct?: number;
  bmrKcal?: number;
  metabolicAge?: number;
}

export interface BodyWeight {
  id: string;
  date: string;
  kg: number;
  composition?: BodyComposition;
}

// ───────────────────────── Sleep, cardio, recovery ─────────────────────────

/** One night, stored under the date you woke up. Times are "HH:MM" (24 h). */
export interface SleepEntry {
  id: string;
  date: string;
  bed: string;
  wake: string;
  /** Minutes actually asleep (from a tracker); time in bed is used when missing. */
  asleepMin?: number;
  /** 1 (slecht) – 5 (top) */
  quality?: number;
  note?: string;
}

export type CardioKind =
  | 'wandelen'
  | 'lopen'
  | 'fietsen'
  | 'zwemmen'
  | 'roeien'
  | 'crosstrainer'
  | 'sport'
  | 'hiit'
  | 'werk'
  | 'anders';

/** licht = makkelijk praten, matig = zone 2 (praten lukt nog), zwaar = hijgen. */
export type Intensity = 'licht' | 'matig' | 'zwaar';

export interface CardioSession {
  id: string;
  date: string;
  kind: CardioKind;
  minutes: number;
  intensity: Intensity;
  distanceKm?: number;
  avgHr?: number;
  /** Own value from a watch; otherwise estimated from MET × body weight. */
  kcal?: number;
  note?: string;
  createdAt: number;
}

/** Morning check-in. Every score is 1 (slecht) – 5 (top); higher is always better. */
export interface CheckIn {
  date: string;
  energy: number;
  /** 5 = geen spierpijn */
  soreness: number;
  /** 5 = ontspannen */
  stress: number;
  mood: number;
  note?: string;
}

export interface Habit {
  id: string;
  name: string;
}

export type PhaseType = 'cut' | 'onderhoud' | 'bulk';

/** A diet phase with a target rate of weight change. */
export interface Phase {
  type: PhaseType;
  start: string;
  end?: string;
  /** Target change in % of body weight per week (negative = afvallen). */
  ratePct: number;
}

/** Personal targets and preferences; everything here can be changed in Instellingen or by the coach. */
export interface Settings {
  sex: 'man' | 'vrouw';
  birthYear: number | null;
  heightCm: number | null;
  sleep: {
    /** Screens off; null = geen herinnering */
    screensOff: string | null;
    bedtime: string;
    wake: string;
  };
  stepGoal: number;
  /** Minutes per week, moderate-equivalent (zware minuten tellen dubbel). */
  cardioGoalMin: number;
  /** Fixed rest days, 0 = maandag … 6 = zondag. */
  restDays: number[];
  /** Suggest a deload after this many training weeks; 0 = nooit. */
  deloadEveryWeeks: number;
  /** Monday (YYYY-MM-DD) of the most recent deload week. */
  lastDeloadWeek: string | null;
  phase: Phase | null;
}
