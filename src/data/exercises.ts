import type { Exercise, MuscleGroup } from '@/lib/types';

export const MUSCLE_GROUPS: MuscleGroup[] = [
  'Borst',
  'Rug',
  'Schouders',
  'Biceps',
  'Triceps',
  'Benen',
  'Billen',
  'Buik',
  'Cardio',
];

const e = (id: string, name: string, muscle: MuscleGroup, kind: Exercise['kind'] = 'weight') => ({
  id,
  name,
  muscle,
  kind,
});

export const BUILT_IN_EXERCISES: Exercise[] = [
  // Borst
  e('bench-press', 'Bankdrukken (barbell)', 'Borst'),
  e('incline-db-press', 'Schuin bankdrukken (halters)', 'Borst'),
  e('db-bench-press', 'Bankdrukken (halters)', 'Borst'),
  e('db-fly', 'Flyes (halters)', 'Borst'),
  e('cable-crossover', 'Cable crossover', 'Borst'),
  e('chest-press', 'Chest press (machine)', 'Borst'),
  e('push-up', 'Opdrukken', 'Borst', 'bodyweight'),
  e('chest-dip', 'Dips', 'Borst', 'bodyweight'),

  // Rug
  e('deadlift', 'Deadlift', 'Rug'),
  e('barbell-row', 'Voorovergebogen roeien', 'Rug'),
  e('db-row', 'Eenarmig roeien (halter)', 'Rug'),
  e('lat-pulldown', 'Lat pulldown', 'Rug'),
  e('seated-row', 'Zittend roeien (kabel)', 'Rug'),
  e('pull-up', 'Optrekken', 'Rug', 'bodyweight'),
  e('face-pull', 'Face pull', 'Rug'),
  e('back-extension', 'Rugstrekken', 'Rug', 'bodyweight'),

  // Schouders
  e('overhead-press', 'Schouderdrukken (barbell)', 'Schouders'),
  e('db-shoulder-press', 'Schouderdrukken (halters)', 'Schouders'),
  e('lateral-raise', 'Zijwaarts heffen', 'Schouders'),
  e('reverse-fly', 'Reverse flyes', 'Schouders'),
  e('arnold-press', 'Arnold press', 'Schouders'),

  // Biceps
  e('barbell-curl', 'Biceps curl (barbell)', 'Biceps'),
  e('db-curl', 'Biceps curl (halters)', 'Biceps'),
  e('hammer-curl', 'Hammer curl', 'Biceps'),
  e('preacher-curl', 'Preacher curl', 'Biceps'),

  // Triceps
  e('triceps-pushdown', 'Triceps pushdown (kabel)', 'Triceps'),
  e('overhead-triceps', 'Triceps extensie boven hoofd', 'Triceps'),
  e('skull-crusher', 'Skull crushers', 'Triceps'),
  e('close-grip-bench', 'Smal bankdrukken', 'Triceps'),
  e('bench-dip', 'Bankdips', 'Triceps', 'bodyweight'),

  // Benen
  e('squat', 'Squat (barbell)', 'Benen'),
  e('front-squat', 'Front squat', 'Benen'),
  e('goblet-squat', 'Goblet squat', 'Benen'),
  e('leg-press', 'Beenpers', 'Benen'),
  e('lunge', 'Uitvalspassen', 'Benen'),
  e('bulgarian-split-squat', 'Bulgaarse split squat', 'Benen'),
  e('leg-extension', 'Leg extension', 'Benen'),
  e('leg-curl', 'Leg curl', 'Benen'),
  e('romanian-deadlift', 'Roemeense deadlift', 'Benen'),
  e('calf-raise', 'Kuitheffen', 'Benen'),

  // Billen
  e('hip-thrust', 'Hip thrust', 'Billen'),
  e('glute-bridge', 'Glute bridge', 'Billen', 'bodyweight'),
  e('cable-kickback', 'Kickback (kabel)', 'Billen'),
  e('hip-abduction', 'Abductie (machine)', 'Billen'),

  // Buik
  e('plank', 'Plank', 'Buik', 'time'),
  e('side-plank', 'Zijplank', 'Buik', 'time'),
  e('crunch', 'Crunches', 'Buik', 'bodyweight'),
  e('hanging-leg-raise', 'Hangend benen heffen', 'Buik', 'bodyweight'),
  e('cable-crunch', 'Cable crunch', 'Buik'),
  e('russian-twist', 'Russian twist', 'Buik', 'bodyweight'),
  e('ab-wheel', 'Ab wheel', 'Buik', 'bodyweight'),

  // Cardio
  e('run', 'Hardlopen', 'Cardio', 'cardio'),
  e('bike', 'Fietsen', 'Cardio', 'cardio'),
  e('rower', 'Roeitrainer', 'Cardio', 'cardio'),
  e('elliptical', 'Crosstrainer', 'Cardio', 'cardio'),
  e('walk', 'Wandelen', 'Cardio', 'cardio'),
  e('jump-rope', 'Touwtje springen', 'Cardio', 'time'),
];
