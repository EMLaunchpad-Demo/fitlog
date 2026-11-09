export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const DAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const DAYS_SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const MONTHS = [
  'januari',
  'februari',
  'maart',
  'april',
  'mei',
  'juni',
  'juli',
  'augustus',
  'september',
  'oktober',
  'november',
  'december',
];

/** Local calendar date as YYYY-MM-DD. */
export function dateKey(d: Date | number = new Date()): string {
  const date = typeof d === 'number' ? new Date(d) : d;
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, days: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

export function dayShort(d: Date): string {
  return DAYS_SHORT[d.getDay()];
}

export function monthName(m: number): string {
  return MONTHS[m];
}

/** "maandag 8 november" */
export function longDate(d: Date | number): string {
  const date = typeof d === 'number' ? new Date(d) : d;
  return `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** "8 nov" (adds the year when it is not this year) */
export function shortDate(d: Date | number): string {
  const date = typeof d === 'number' ? new Date(d) : d;
  const base = `${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)}`;
  return date.getFullYear() === new Date().getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

/** "Vandaag", "Gisteren", "Morgen" or "ma 8 nov" for a date key. */
export function relativeDay(key: string): string {
  const today = dateKey();
  if (key === today) return 'Vandaag';
  if (key === addDays(today, -1)) return 'Gisteren';
  if (key === addDays(today, 1)) return 'Morgen';
  const d = parseDateKey(key);
  return `${DAYS_SHORT[d.getDay()]} ${shortDate(d)}`;
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 6) return 'Goedenacht';
  if (h < 12) return 'Goedemorgen';
  if (h < 18) return 'Goedemiddag';
  return 'Goedenavond';
}

/** Dutch number formatting: 62.5 -> "62,5", 1250 -> "1.250" */
export function num(n: number, maxDecimals = 1): string {
  const factor = 10 ** maxDecimals;
  const rounded = Math.round(n * factor) / factor;
  const [int, dec] = Math.abs(rounded).toString().split('.');
  const withDots = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${rounded < 0 ? '-' : ''}${withDots}${dec ? ',' + dec : ''}`;
}

/** Parses "62,5" or "62.5" to 62.5; returns null for empty/invalid input. */
export function parseNum(text: string): number | null {
  const cleaned = text.replace(',', '.').trim();
  if (cleaned === '' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** 3725 sec -> "1:02:05", 125 -> "2:05" */
export function clock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Milliseconds -> "52 min" or "1 u 05 min" */
export function durationLabel(ms: number): string {
  const totalMin = Math.max(1, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} u ${String(m).padStart(2, '0')} min` : `${m} min`;
}
