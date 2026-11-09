import type { BodyComposition } from '@/lib/types';

export type BodyMetric = keyof BodyComposition;

/**
 * Body composition values a smart scale (such as one used with the Fitdays app)
 * can report. `min`/`max` are plausibility limits for input validation.
 */
export const BODY_METRICS: {
  key: BodyMetric;
  /** snake_case name used in the coach's tool */
  tool: string;
  label: string;
  unit: string;
  decimals: number;
  min: number;
  max: number;
  /** Lower is better (for colouring changes) */
  lowerIsBetter?: boolean;
}[] = [
  {
    key: 'fatPct',
    tool: 'fat_pct',
    label: 'Vetpercentage',
    unit: '%',
    decimals: 1,
    min: 2,
    max: 70,
    lowerIsBetter: true,
  },
  {
    key: 'muscleKg',
    tool: 'muscle_kg',
    label: 'Spiermassa',
    unit: 'kg',
    decimals: 1,
    min: 10,
    max: 150,
  },
  {
    key: 'skeletalMusclePct',
    tool: 'skeletal_muscle_pct',
    label: 'Skeletspieren',
    unit: '%',
    decimals: 1,
    min: 10,
    max: 80,
  },
  {
    key: 'waterPct',
    tool: 'water_pct',
    label: 'Lichaamswater',
    unit: '%',
    decimals: 1,
    min: 20,
    max: 80,
  },
  {
    key: 'visceralFat',
    tool: 'visceral_fat',
    label: 'Visceraal vet',
    unit: '',
    decimals: 1,
    min: 0,
    max: 60,
    lowerIsBetter: true,
  },
  {
    key: 'subcutaneousFatPct',
    tool: 'subcutaneous_fat_pct',
    label: 'Onderhuids vet',
    unit: '%',
    decimals: 1,
    min: 1,
    max: 70,
    lowerIsBetter: true,
  },
  { key: 'boneKg', tool: 'bone_kg', label: 'Botmassa', unit: 'kg', decimals: 1, min: 0.5, max: 10 },
  {
    key: 'proteinPct',
    tool: 'protein_pct',
    label: 'Eiwit',
    unit: '%',
    decimals: 1,
    min: 5,
    max: 40,
  },
  {
    key: 'bmrKcal',
    tool: 'bmr_kcal',
    label: 'BMR',
    unit: 'kcal',
    decimals: 0,
    min: 500,
    max: 5000,
  },
  {
    key: 'metabolicAge',
    tool: 'metabolic_age',
    label: 'Metabole leeftijd',
    unit: 'jaar',
    decimals: 0,
    min: 10,
    max: 100,
  },
  {
    key: 'bmi',
    tool: 'bmi',
    label: 'BMI',
    unit: '',
    decimals: 1,
    min: 10,
    max: 70,
    lowerIsBetter: true,
  },
];

/** Fat mass and lean mass in kg, derived from weight and fat percentage. */
export function fatAndLeanKg(kg: number, composition?: BodyComposition) {
  if (composition?.fatPct == null) return null;
  const fatKg = (kg * composition.fatPct) / 100;
  return { fatKg, leanKg: kg - fatKg };
}

export function hasComposition(c?: BodyComposition): c is BodyComposition {
  return !!c && Object.values(c).some((v) => typeof v === 'number');
}
