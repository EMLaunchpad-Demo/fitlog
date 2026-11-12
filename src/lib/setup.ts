import { isTime } from '@/lib/time';
import type { Goals, Phase, Plan, Settings } from '@/lib/types';
import { type SettingsPatch, useStore } from '@/store/store';

/**
 * A "persoonlijke setup" is a small JSON document with someone's own targets:
 * profile, nutrition goals, sleep schedule, rest days, phase, habits and
 * optionally training plans. Loading one only changes what it contains; logged
 * data (trainingen, voeding, wegingen, nachten) is never touched.
 *
 * It exists so personal numbers can be set in one go without living in the
 * app's source code.
 */
export interface SetupFile {
  app: 'fitlog-setup';
  version: 1;
  profile?: { name?: string; about?: string };
  goals?: Partial<Goals>;
  settings?: SettingsPatch;
  habits?: string[];
  plans?: Plan[];
  activePlanId?: string;
}

export type ParsedSetup =
  | { ok: true; setup: SetupFile; summary: string[] }
  | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function cleanGoals(raw: unknown): Partial<Goals> | undefined {
  if (!isObj(raw)) return undefined;
  const out: Partial<Goals> = {};
  if (isNum(raw.kcal, 1000, 6000)) out.kcal = Math.round(raw.kcal);
  if (isNum(raw.protein, 20, 400)) out.protein = Math.round(raw.protein);
  if (isNum(raw.carbs, 0, 800)) out.carbs = Math.round(raw.carbs);
  if (isNum(raw.fat, 20, 300)) out.fat = Math.round(raw.fat);
  if (isNum(raw.waterGlasses, 1, 30)) out.waterGlasses = Math.round(raw.waterGlasses);
  return Object.keys(out).length ? out : undefined;
}

function cleanPhase(raw: unknown): Phase | null | undefined {
  if (raw === null) return null;
  if (!isObj(raw)) return undefined;
  const type = raw.type;
  if (type !== 'cut' && type !== 'onderhoud' && type !== 'bulk') return undefined;
  if (!isDate(raw.start) || !isNum(raw.ratePct, -2, 2)) return undefined;
  return {
    type,
    start: raw.start,
    ...(isDate(raw.end) && raw.end > raw.start ? { end: raw.end } : {}),
    ratePct: raw.ratePct,
  };
}

function cleanSettings(raw: unknown): SettingsPatch | undefined {
  if (!isObj(raw)) return undefined;
  const out: SettingsPatch = {};
  if (raw.sex === 'man' || raw.sex === 'vrouw') out.sex = raw.sex;
  if (isNum(raw.birthYear, 1920, 2020)) out.birthYear = Math.round(raw.birthYear);
  if (isNum(raw.heightCm, 100, 250)) out.heightCm = Math.round(raw.heightCm);
  if (isNum(raw.stepGoal, 1000, 50000)) out.stepGoal = Math.round(raw.stepGoal);
  if (isNum(raw.cardioGoalMin, 0, 2000)) out.cardioGoalMin = Math.round(raw.cardioGoalMin);
  if (isNum(raw.deloadEveryWeeks, 0, 26)) out.deloadEveryWeeks = Math.round(raw.deloadEveryWeeks);
  if (isNum(raw.barKg, 5, 30)) out.barKg = raw.barKg;
  if (typeof raw.briefing === 'boolean') out.briefing = raw.briefing;
  if (Array.isArray(raw.restDays))
    out.restDays = [...new Set(raw.restDays.filter((d): d is number => isNum(d, 0, 6)))].sort();
  if (isObj(raw.sleep)) {
    const sleep: Partial<Settings['sleep']> = {};
    if (isTime(raw.sleep.bedtime)) sleep.bedtime = raw.sleep.bedtime;
    if (isTime(raw.sleep.wake)) sleep.wake = raw.sleep.wake;
    if (isTime(raw.sleep.screensOff) || raw.sleep.screensOff === null)
      sleep.screensOff = raw.sleep.screensOff;
    if (Object.keys(sleep).length) out.sleep = sleep;
  }
  const phase = cleanPhase(raw.phase);
  if (phase !== undefined) out.phase = phase;
  return Object.keys(out).length ? out : undefined;
}

function cleanPlans(raw: unknown): Plan[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const plans = raw.filter(
    (p): p is Plan =>
      isObj(p) &&
      typeof p.id === 'string' &&
      typeof p.name === 'string' &&
      Array.isArray(p.days) &&
      p.days.every(
        (d) =>
          isObj(d) &&
          typeof d.id === 'string' &&
          typeof d.name === 'string' &&
          Array.isArray(d.exercises) &&
          d.exercises.every(
            (e) =>
              isObj(e) &&
              typeof e.id === 'string' &&
              typeof e.exerciseId === 'string' &&
              isNum(e.sets, 1, 10) &&
              typeof e.target === 'string' &&
              isNum(e.restSec, 15, 600),
          ),
      ),
  );
  return plans.length ? plans.map((p) => ({ ...p, description: p.description ?? '' })) : undefined;
}

export function parseSetup(text: string): ParsedSetup {
  let raw: unknown;
  try {
    raw = JSON.parse(text.trim());
  } catch {
    return { ok: false, error: 'Dit is geen geldige setup-code. Kopieer de hele code, van { tot }.' };
  }
  if (!isObj(raw) || raw.app !== 'fitlog-setup')
    return {
      ok: false,
      error: isObj(raw) && raw.app === 'fitlog'
        ? 'Dit is een back-up, geen setup. Zet een back-up terug via Instellingen > Gegevens.'
        : 'Dit is geen Fitlog-setup.',
    };

  const setup: SetupFile = { app: 'fitlog-setup', version: 1 };
  const summary: string[] = [];

  if (isObj(raw.profile)) {
    const name = typeof raw.profile.name === 'string' ? raw.profile.name.trim() : '';
    const about = typeof raw.profile.about === 'string' ? raw.profile.about.trim() : '';
    if (name || about) {
      setup.profile = { ...(name ? { name } : {}), ...(about ? { about } : {}) };
      summary.push('Profiel voor de coach');
    }
  }
  const goals = cleanGoals(raw.goals);
  if (goals) {
    setup.goals = goals;
    summary.push(
      `Voedingsdoelen${goals.kcal ? `: ${goals.kcal} kcal` : ''}${goals.protein ? `, ${goals.protein} g eiwit` : ''}`,
    );
  }
  const settings = cleanSettings(raw.settings);
  if (settings) {
    setup.settings = settings;
    if (settings.sleep?.bedtime || settings.sleep?.wake)
      summary.push(
        `Slaapschema: ${settings.sleep.bedtime ?? '…'} – ${settings.sleep.wake ?? '…'}${settings.sleep.screensOff ? `, schermen uit ${settings.sleep.screensOff}` : ''}`,
      );
    if (settings.phase)
      summary.push(
        `Fase: ${settings.phase.type} vanaf ${settings.phase.start}${settings.phase.end ? ` tot ${settings.phase.end}` : ''}`,
      );
    if (settings.restDays) summary.push(`${settings.restDays.length} vaste rustdagen`);
    if (settings.stepGoal || settings.cardioGoalMin)
      summary.push(
        `Beweegdoelen${settings.stepGoal ? `: ${settings.stepGoal} stappen` : ''}${settings.cardioGoalMin ? `, ${settings.cardioGoalMin} min cardio per week` : ''}`,
      );
    if (settings.heightCm || settings.birthYear) summary.push('Lengte en geboortejaar');
    if (settings.phase === null) summary.push('Geen fase (je coach kiest die bij zijn analyse)');
    if (settings.briefing != null)
      summary.push(`Ochtendbriefing ${settings.briefing ? 'aan' : 'uit'}`);
  }
  if (Array.isArray(raw.habits)) {
    const habits = raw.habits
      .filter((h): h is string => typeof h === 'string' && !!h.trim())
      .map((h) => h.trim())
      .slice(0, 12);
    if (habits.length) {
      setup.habits = habits;
      summary.push(`${habits.length} gewoontes`);
    }
  }
  const plans = cleanPlans(raw.plans);
  if (plans) {
    setup.plans = plans;
    summary.push(`${plans.length === 1 ? 'Schema' : 'Schema’s'}: ${plans.map((p) => p.name).join(', ')}`);
    if (typeof raw.activePlanId === 'string' && plans.some((p) => p.id === raw.activePlanId))
      setup.activePlanId = raw.activePlanId;
  }

  if (!summary.length) return { ok: false, error: 'Deze setup bevat niets om in te stellen.' };
  return { ok: true, setup, summary };
}

/** Applies a parsed setup. Only settings change; logs stay as they are. */
export function applySetup(setup: SetupFile): void {
  const s = useStore.getState();
  if (setup.profile)
    s.setProfile({
      name: setup.profile.name ?? s.profile.name,
      about: setup.profile.about ?? s.profile.about,
    });
  if (setup.goals) s.setGoals(setup.goals);
  if (setup.settings) s.setSettings(setup.settings);
  for (const name of setup.habits ?? []) s.addHabit(name);
  for (const plan of setup.plans ?? []) s.savePlan(plan);
  if (setup.activePlanId) s.setActivePlan(setup.activePlanId);
}
