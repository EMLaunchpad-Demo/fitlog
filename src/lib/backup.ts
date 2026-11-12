import { Platform, Share } from 'react-native';

import { dateKey } from '@/lib/format';
import { type Store, completeSettings, useStore } from '@/store/store';

/** Everything the user logged or configured. The API key is never included. */
const DATA_KEYS = [
  'customExercises',
  'plans',
  'activePlanId',
  'workouts',
  'activeWorkout',
  'defaultRestSec',
  'foodLog',
  'customFoods',
  'water',
  'goals',
  'bodyWeights',
  'profile',
  'sleepLog',
  'cardioLog',
  'steps',
  'checkIns',
  'habits',
  'habitLog',
  'settings',
  'measures',
  'coachPlan',
  'planHistory',
  'savedMeals',
  'weekMenu',
] as const satisfies readonly (keyof Store)[];

type DataKey = (typeof DATA_KEYS)[number];
const ARRAY_KEYS: DataKey[] = [
  'customExercises',
  'plans',
  'workouts',
  'foodLog',
  'customFoods',
  'bodyWeights',
  'sleepLog',
  'cardioLog',
  'checkIns',
  'habits',
  'measures',
  'planHistory',
  'savedMeals',
];

export function makeBackup(): string {
  const s = useStore.getState();
  const data = Object.fromEntries(DATA_KEYS.map((k) => [k, s[k]]));
  return JSON.stringify({ app: 'fitlog', version: 1, exportedAt: new Date().toISOString(), data });
}

/** Web: share sheet (iPhone: "Bewaar in Bestanden") or download. Native: share sheet. */
export async function exportBackup(): Promise<void> {
  const json = makeBackup();
  const filename = `fitlog-backup-${dateKey()}.json`;
  if (Platform.OS !== 'web') {
    await Share.share({ title: filename, message: json });
    return;
  }
  const file = new File([json], filename, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // user closed the sheet
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Web only: lets the user pick a backup file and returns its text (null if cancelled). */
export function pickBackupFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.text().then(resolve, () => resolve(null));
    };
    input.click();
  });
}

export function summarizeBackup(
  json: string,
): { ok: true; summary: string } | { ok: false; error: string } {
  const parsed = parseBackup(json);
  if (!parsed.ok) return parsed;
  const d = parsed.data;
  return {
    ok: true,
    summary: `${d.workouts?.length ?? 0} trainingen, ${d.foodLog?.length ?? 0} voedingsitems, ${d.bodyWeights?.length ?? 0} wegingen en ${d.plans?.length ?? 0} schema's (gemaakt op ${parsed.exportedAt.slice(0, 10)})`,
  };
}

/** Replaces all app data with the backup's contents. */
export function restoreBackup(json: string): { ok: true } | { ok: false; error: string } {
  const parsed = parseBackup(json);
  if (!parsed.ok) return parsed;
  // Backups from before a feature existed lack its data: start those empty.
  useStore.setState({
    sleepLog: [],
    cardioLog: [],
    steps: {},
    checkIns: [],
    habits: [],
    habitLog: {},
    measures: [],
    coachPlan: null,
    planHistory: [],
    savedMeals: [],
    weekMenu: null,
    ...parsed.data,
    settings: completeSettings(parsed.data.settings),
  });
  return { ok: true };
}

function parseBackup(
  json: string,
):
  | { ok: true; data: Partial<Pick<Store, DataKey>>; exportedAt: string }
  | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'Dit is geen geldig back-upbestand.' };
  }
  const obj = raw as { app?: unknown; data?: Record<string, unknown>; exportedAt?: unknown };
  if (!obj || obj.app !== 'fitlog' || !obj.data || typeof obj.data !== 'object')
    return { ok: false, error: 'Dit is geen Fitlog-back-up.' };
  for (const k of ARRAY_KEYS) {
    if (k in obj.data && !Array.isArray(obj.data[k]))
      return { ok: false, error: `De back-up is beschadigd (${k}).` };
  }
  const data = Object.fromEntries(
    DATA_KEYS.filter((k) => k in obj.data!).map((k) => [k, obj.data![k]]),
  ) as Partial<Pick<Store, DataKey>>;
  return { ok: true, data, exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : '' };
}
