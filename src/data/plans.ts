import type { Plan, PlanExercise } from '@/lib/types';

const pe = (
  id: string,
  exerciseId: string,
  sets: number,
  target: string,
  restSec = 90,
): PlanExercise => ({ id, exerciseId, sets, target, restSec });

/** Starter plans that are copied into the store on first launch (fully editable). */
export const PRESET_PLANS: Plan[] = [
  {
    id: 'preset-ppl-ul',
    name: 'PPL + Upper/Lower',
    description:
      '5× per week: Push, Pull, Legs, Upper, Lower. Dubbele progressie: haal je bij alle sets de bovenkant van de range met 1-2 reps over, verhoog dan het gewicht.',
    days: [
      {
        id: 'pplul-push',
        name: 'Push',
        exercises: [
          pe('pplul-push-1', 'bench-press', 3, '6-10', 150),
          pe('pplul-push-2', 'db-shoulder-press', 3, '8-12', 120),
          pe('pplul-push-3', 'incline-db-press', 3, '8-12', 90),
          pe('pplul-push-4', 'lateral-raise', 3, '12-20', 60),
          pe('pplul-push-5', 'triceps-pushdown', 3, '10-15', 60),
        ],
      },
      {
        id: 'pplul-pull',
        name: 'Pull',
        exercises: [
          pe('pplul-pull-1', 'pull-up', 3, '6-10', 150),
          pe('pplul-pull-2', 'barbell-row', 3, '6-10', 120),
          pe('pplul-pull-3', 'seated-row', 3, '10-12', 90),
          pe('pplul-pull-4', 'face-pull', 3, '12-20', 60),
          pe('pplul-pull-5', 'db-curl', 3, '8-12', 60),
        ],
      },
      {
        id: 'pplul-legs',
        name: 'Legs',
        exercises: [
          pe('pplul-legs-1', 'squat', 3, '5-8', 180),
          pe('pplul-legs-2', 'romanian-deadlift', 3, '6-10', 150),
          pe('pplul-legs-3', 'leg-press', 3, '10-15', 120),
          pe('pplul-legs-4', 'leg-curl', 3, '10-15', 60),
          pe('pplul-legs-5', 'calf-raise', 4, '10-15', 60),
        ],
      },
      {
        id: 'pplul-upper',
        name: 'Upper',
        exercises: [
          pe('pplul-upper-1', 'incline-db-press', 3, '6-10', 120),
          pe('pplul-upper-2', 'lat-pulldown', 3, '8-12', 120),
          pe('pplul-upper-3', 'chest-dip', 3, '8-12', 90),
          pe('pplul-upper-4', 'db-row', 3, '8-12', 90),
          pe('pplul-upper-5', 'lateral-raise', 3, '12-20', 60),
          pe('pplul-upper-6', 'hammer-curl', 2, '10-15', 60),
        ],
      },
      {
        id: 'pplul-lower',
        name: 'Lower',
        exercises: [
          pe('pplul-lower-1', 'deadlift', 3, '4-6', 180),
          pe('pplul-lower-2', 'bulgarian-split-squat', 3, '8-12', 120),
          pe('pplul-lower-3', 'hip-thrust', 3, '8-12', 90),
          pe('pplul-lower-4', 'leg-extension', 3, '12-15', 60),
          pe('pplul-lower-5', 'calf-raise', 3, '10-15', 60),
          pe('pplul-lower-6', 'hanging-leg-raise', 3, '10-15', 60),
        ],
      },
    ],
  },
  {
    id: 'preset-fullbody',
    name: 'Full body',
    description: '3× per week, wissel dag A en B af. Ideaal om mee te beginnen.',
    days: [
      {
        id: 'fb-a',
        name: 'Dag A',
        exercises: [
          pe('fb-a-1', 'squat', 3, '5-8', 150),
          pe('fb-a-2', 'bench-press', 3, '6-10', 120),
          pe('fb-a-3', 'barbell-row', 3, '8-10', 120),
          pe('fb-a-4', 'db-shoulder-press', 2, '10-12', 90),
          pe('fb-a-5', 'plank', 3, '45s', 60),
        ],
      },
      {
        id: 'fb-b',
        name: 'Dag B',
        exercises: [
          pe('fb-b-1', 'deadlift', 3, '5', 180),
          pe('fb-b-2', 'incline-db-press', 3, '8-12', 90),
          pe('fb-b-3', 'lat-pulldown', 3, '10-12', 90),
          pe('fb-b-4', 'lunge', 3, '10', 90),
          pe('fb-b-5', 'hanging-leg-raise', 3, '10-15', 60),
        ],
      },
    ],
  },
  {
    id: 'preset-ppl',
    name: 'Push / Pull / Legs',
    description: '3 of 6× per week. Duwen, trekken en benen op aparte dagen.',
    days: [
      {
        id: 'ppl-push',
        name: 'Push',
        exercises: [
          pe('ppl-push-1', 'bench-press', 4, '6-8', 150),
          pe('ppl-push-2', 'overhead-press', 3, '8-10', 120),
          pe('ppl-push-3', 'incline-db-press', 3, '10-12', 90),
          pe('ppl-push-4', 'lateral-raise', 3, '12-15', 60),
          pe('ppl-push-5', 'triceps-pushdown', 3, '10-12', 60),
        ],
      },
      {
        id: 'ppl-pull',
        name: 'Pull',
        exercises: [
          pe('ppl-pull-1', 'deadlift', 3, '5', 180),
          pe('ppl-pull-2', 'pull-up', 3, '6-10', 120),
          pe('ppl-pull-3', 'seated-row', 3, '10-12', 90),
          pe('ppl-pull-4', 'face-pull', 3, '15', 60),
          pe('ppl-pull-5', 'db-curl', 3, '10-12', 60),
        ],
      },
      {
        id: 'ppl-legs',
        name: 'Legs',
        exercises: [
          pe('ppl-legs-1', 'squat', 4, '6-8', 150),
          pe('ppl-legs-2', 'romanian-deadlift', 3, '8-10', 120),
          pe('ppl-legs-3', 'leg-press', 3, '10-12', 90),
          pe('ppl-legs-4', 'leg-curl', 3, '12', 60),
          pe('ppl-legs-5', 'calf-raise', 4, '12-15', 60),
        ],
      },
    ],
  },
  {
    id: 'preset-upper-lower',
    name: 'Upper / Lower',
    description: '4× per week: twee keer bovenlichaam, twee keer onderlichaam.',
    days: [
      {
        id: 'ul-upper',
        name: 'Upper',
        exercises: [
          pe('ul-upper-1', 'bench-press', 4, '6-8', 150),
          pe('ul-upper-2', 'barbell-row', 4, '6-8', 120),
          pe('ul-upper-3', 'db-shoulder-press', 3, '10', 90),
          pe('ul-upper-4', 'lat-pulldown', 3, '10-12', 90),
          pe('ul-upper-5', 'hammer-curl', 2, '12', 60),
          pe('ul-upper-6', 'overhead-triceps', 2, '12', 60),
        ],
      },
      {
        id: 'ul-lower',
        name: 'Lower',
        exercises: [
          pe('ul-lower-1', 'squat', 4, '6-8', 150),
          pe('ul-lower-2', 'romanian-deadlift', 3, '8-10', 120),
          pe('ul-lower-3', 'bulgarian-split-squat', 3, '10', 90),
          pe('ul-lower-4', 'leg-extension', 3, '12', 60),
          pe('ul-lower-5', 'calf-raise', 3, '15', 60),
          pe('ul-lower-6', 'plank', 3, '45s', 60),
        ],
      },
    ],
  },
];
