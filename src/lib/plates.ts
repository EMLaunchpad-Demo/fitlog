import type { Exercise } from './types';

/** Plates per side in a typical gym, heaviest first (kg). */
export const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

const BARBELL_IDS = new Set([
  'bench-press',
  'deadlift',
  'barbell-row',
  'overhead-press',
  'barbell-curl',
  'close-grip-bench',
  'squat',
  'front-squat',
  'romanian-deadlift',
  'hip-thrust',
]);

/** Exercises loaded with plates on a barbell (built-in ones, or custom ones named that way). */
export function isBarbell(ex: Pick<Exercise, 'id' | 'name' | 'kind'>): boolean {
  if (ex.kind !== 'weight') return false;
  return BARBELL_IDS.has(ex.id) || /barbell|stang|halterstang/i.test(ex.name);
}

/** Which plates go on each side for a total weight; `rest` is what cannot be made (kg in total). */
export function platesPerSide(
  total: number,
  barKg = 20,
): { plates: number[]; rest: number } | null {
  if (!Number.isFinite(total) || total < barKg) return null;
  let side = (total - barKg) / 2;
  const plates: number[] = [];
  for (const plate of PLATES) {
    while (side >= plate - 1e-9) {
      plates.push(plate);
      side -= plate;
    }
  }
  return { plates, rest: Math.round(side * 2 * 100) / 100 };
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/**
 * A common warm-up ramp towards the first working set: the empty bar, then
 * about 50 %, 70 % and 85 % with fewer reps each time. This is gym practice,
 * not a researched protocol: the aim is to rehearse the movement without
 * tiring yourself before the sets that count.
 */
export function warmupSets(workKg: number, barKg = 20): { kg: number; reps: number }[] {
  if (!Number.isFinite(workKg) || workKg <= barKg) return [];
  const steps: { pct: number; reps: number }[] =
    workKg < barKg * 2
      ? [{ pct: 0.7, reps: 5 }]
      : [
          { pct: 0.5, reps: 5 },
          { pct: 0.7, reps: 3 },
          { pct: 0.85, reps: 1 },
        ];
  const out = [{ kg: barKg, reps: 10 }];
  for (const s of steps) {
    const kg = Math.max(barKg, roundTo(workKg * s.pct, 2.5));
    if (kg > out[out.length - 1].kg && kg < workKg) out.push({ kg, reps: s.reps });
  }
  return out;
}
