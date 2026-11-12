import type { Food, FoodEntry, Macros, Meal } from '@/lib/types';

export const MEALS: { key: Meal; label: string }[] = [
  { key: 'ontbijt', label: 'Ontbijt' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'diner', label: 'Diner' },
  { key: 'snack', label: 'Snacks' },
];

export function mealLabel(meal: Meal): string {
  return MEALS.find((m) => m.key === meal)?.label ?? meal;
}

/** Suggest a meal based on the time of day. */
export function mealForNow(d = new Date()): Meal {
  const h = d.getHours();
  if (h < 10.5) return 'ontbijt';
  if (h < 14) return 'lunch';
  if (h >= 17 && h < 21) return 'diner';
  return 'snack';
}

export function sumMacros(entries: Macros[]): Macros {
  return entries.reduce(
    (acc, e) => ({
      kcal: acc.kcal + e.kcal,
      protein: acc.protein + e.protein,
      carbs: acc.carbs + e.carbs,
      fat: acc.fat + e.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

/** Macros for an amount of a food. `unit` = grams, a named unit (e.g. snee) or portions. */
export function macrosFor(food: Food, amount: number, unit: 'g' | 'unit' | 'portie'): Macros {
  let factor: number;
  if (food.basis === 'portie') factor = amount;
  else if (unit === 'unit' && food.unit) factor = (amount * food.unit.grams) / 100;
  else factor = amount / 100;
  return {
    kcal: Math.round(food.kcal * factor),
    protein: Math.round(food.protein * factor * 10) / 10,
    carbs: Math.round(food.carbs * factor * 10) / 10,
    fat: Math.round(food.fat * factor * 10) / 10,
  };
}

export function amountLabel(food: Food, amount: number, unit: 'g' | 'unit' | 'portie'): string {
  const n = String(amount).replace('.', ',');
  if (food.basis === 'portie') return `${n} ${amount === 1 ? 'portie' : 'porties'}`;
  if (unit === 'unit' && food.unit) return `${n} ${food.unit.label}`;
  return `${n} g`;
}

export type Sex = 'man' | 'vrouw';
export type Activity = 'zittend' | 'licht' | 'gemiddeld' | 'actief' | 'zeer-actief';
export type GoalType = 'afvallen' | 'onderhouden' | 'aankomen';

export const ACTIVITY: { key: Activity; label: string; factor: number }[] = [
  { key: 'zittend', label: 'Zittend', factor: 1.2 },
  { key: 'licht', label: 'Licht (1-2×)', factor: 1.375 },
  { key: 'gemiddeld', label: 'Gemiddeld (3-4×)', factor: 1.55 },
  { key: 'actief', label: 'Actief (5-6×)', factor: 1.725 },
  { key: 'zeer-actief', label: 'Zeer actief', factor: 1.9 },
];

/**
 * Mifflin-St Jeor BMR × activity factor, adjusted for the goal.
 * Protein 1.8 g/kg (2.0 when cutting), fat 25 % of energy, rest carbs.
 */
export function calculateGoals(input: {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
  goal: GoalType;
}): Macros {
  const { sex, age, heightCm, weightKg, activity, goal } = input;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'man' ? 5 : -161);
  const factor = ACTIVITY.find((a) => a.key === activity)?.factor ?? 1.55;
  // A slow cut (about 15 % under maintenance) keeps strength and muscle better than a steep one.
  const adjust = goal === 'afvallen' ? 0.85 : goal === 'aankomen' ? 1.1 : 1;
  const kcal = Math.round((bmr * factor * adjust) / 10) * 10;
  const protein = Math.round(weightKg * (goal === 'afvallen' ? 2 : 1.8));
  const fat = Math.round((kcal * 0.25) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carbs, fat };
}

/** Unique foods from the log, most recently used first, with the last used amount. */
export function recentFoods(log: FoodEntry[], limit = 12) {
  const seen = new Set<string>();
  const out: FoodEntry[] = [];
  const sorted = [...log].sort((a, b) => b.createdAt - a.createdAt);
  for (const e of sorted) {
    const key = e.foodId ?? `quick:${e.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}
