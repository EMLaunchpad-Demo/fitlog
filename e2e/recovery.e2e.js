// E2E: sleep, check-in, cardio, steps, rest days, deload, phase, personal setup and
// the coach tools for all of it, against a simulated Anthropic API.
const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');
const { checkToolLimits } = require('./api-limits');

const BASE = 'http://localhost:8081';
const OUT = path.join(__dirname, 'screenshots');
const pad = (x) => String(x).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return key(d);
};
const today = () => key(new Date());
const WEEKDAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const todayIndex = (new Date().getDay() + 6) % 7;

let n = 0;
const reply = (content, stop_reason = 'end_turn') => ({
  id: `msg_${++n}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason,
  stop_sequence: null, stop_details: null,
  usage: { input_tokens: 100, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 3000 },
});
const call = (name, input) =>
  reply([{ type: 'thinking', thinking: '', signature: `sig_${n}` }, { type: 'tool_use', id: `toolu_${name}_${n}`, name, input }], 'tool_use');
const say = (t) => reply([{ type: 'text', text: t }]);

/** What the simulated coach does for "stel alles in": all writes in parallel, then it reads back. */
const WRITES = [
  ['set_nutrition_goals', { kcal: 2500, protein: 150, carbs: 320, fat: 70, water_glasses: null }],
  ['update_settings', { bedtime: '22:30', wake_time: '06:30', screens_off: '22:00', step_goal: 9000, cardio_goal_min: 120, rest_days: ['do', 'zo'], deload_every_weeks: 8, height_cm: 178, birth_year: 1999 }],
  ['set_phase', { type: 'cut', start: daysAgo(10), end: null, rate_pct: 0.5 }],
  ['set_habits', { habits: ['Schermen uit op tijd', 'Mobiliteit'] }],
  ['check_habit', { habit: 'mobiliteit', done: true, date: null }],
  ['log_sleep', { date: null, bed: '23:05', wake: '06:50', asleep_min: 430, quality: 4, note: null }],
  ['log_cardio', { date: null, kind: 'fietsen', minutes: 40, intensity: 'matig', distance_km: 14.5, avg_hr: 131, kcal: null, note: null }],
  ['set_steps', { date: null, steps: 11250 }],
  ['log_check_in', { date: null, energy: 4, soreness: 3, stress: 4, mood: 5, note: 'Goede dag' }],
];
const READS = [
  ['get_recovery', { days: 7 }],
  ['get_week_report', { weeks_back: 0 }],
  ['get_overview', {}],
];
const calls = (list) =>
  reply(
    [
      { type: 'thinking', thinking: '', signature: `sig_${n}` },
      ...list.map(([name, input], i) => ({ type: 'tool_use', id: `toolu_${name}_${n}_${i}`, name, input })),
    ],
    'tool_use',
  );
const toolResults = {};

function respond(body) {
  const msgs = body.messages;
  const last = msgs[msgs.length - 1];
  const results = typeof last.content === 'string' ? [] : last.content.filter((b) => b.type === 'tool_result');
  const userText = (m) =>
    typeof m.content === 'string' ? m.content : m.content.filter((b) => b.type === 'text' && !b.text.startsWith('<context>')).map((b) => b.text).join(' ');
  const intent = userText([...msgs].reverse().find((m) => m.role === 'user' && userText(m).trim())).toLowerCase();

  if (intent.includes('te snel afvallen')) {
    if (!results.length) return call('set_phase', { type: 'cut', start: today(), end: null, rate_pct: 1.5 });
    return say(results[0].is_error ? `Geweigerd: ${results[0].content}` : 'Ingesteld.');
  }
  if (!intent.includes('stel alles in')) return say('Prima!');

  if (!results.length) return calls(WRITES);
  // Every tool_use must get its own result, in one user message.
  const uses = msgs[msgs.length - 2].content.filter((b) => b.type === 'tool_use');
  assert.strictEqual(results.length, uses.length, 'one tool_result per tool_use, in a single message');
  for (const use of uses) {
    const result = results.find((r) => r.tool_use_id === use.id);
    if (result.is_error) return say(`Fout van ${use.name}: ${result.content}`);
    toolResults[use.name] = JSON.parse(result.content);
  }
  if (uses[0].name === WRITES[0][0]) return calls(READS);
  return say('Alles staat ingesteld.');
}

(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text()));
  page.on('dialog', (d) => d.accept());
  await page.route('https://api.anthropic.com/**', async (route) => {
    const body = JSON.parse(route.request().postData());
    checkToolLimits(body.tools);
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(respond(body)) });
  });

  const v = (loc) => loc.filter({ visible: true }).first();
  const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('fitlog-store')).state);
  const shot = async (name) => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, `recovery-${name}.png`) });
  };
  const bodyText = () => page.innerText('body');

  await page.goto(BASE);
  await v(page.getByText('Volgende training')).waitFor({ timeout: 60000 });

  // ── 1. Sleep ──
  await page.goto(BASE + '/sleep');
  const bed = v(page.getByLabel('In slaap rond', { exact: true }));
  await bed.fill('2230'); // digits only: becomes 22:30
  await bed.blur();
  const wake = v(page.getByLabel('Wakker om', { exact: true }));
  await wake.fill('7.00');
  await wake.blur();
  await v(page.getByText('8 u 30')).waitFor();
  await v(page.getByLabel('Hoe heb je geslapen? 4')).click();
  await v(page.getByText('Nacht opslaan')).click();
  let s = await store();
  assert.deepStrictEqual(
    { bed: s.sleepLog[0].bed, wake: s.sleepLog[0].wake, quality: s.sleepLog[0].quality, date: s.sleepLog[0].date },
    { bed: '22:30', wake: '07:00', quality: 4, date: today() },
    'night saved',
  );
  console.log('sleep log ok');

  // ── 2. Check-in -> readiness ──
  await page.goto(BASE + '/checkin');
  for (const label of ['Energie 4', 'Spieren 3', 'Stress 5', 'Humeur 4']) await v(page.getByLabel(label)).click();
  await v(page.getByText('Check-in opslaan')).click();
  await page.goto(BASE + '/recovery');
  await v(page.getByText('Herstel vandaag')).waitFor();
  s = await store();
  assert.deepStrictEqual(s.checkIns[0], { date: today(), energy: 4, soreness: 3, stress: 5, mood: 4 }, 'check-in saved');
  // Sleep: on target (8 u 30 vs 8 u) with quality 4/5 -> 0.7 + 0.3 * 0.75 = 92.5.
  // Check-in: (4, 3, 5, 4) -> 75. Readiness = 0.4 * 92.5 + 0.6 * 75 = 82.
  let text = await bodyText();
  assert.ok(/82\s*van 100/.test(text.replace(/\n/g, ' ')), 'readiness score 82 shown');
  assert.ok(text.includes('Goed hersteld'), 'readiness label');
  await shot('01-herstel');
  console.log('check-in + readiness ok');

  // ── 3. Cardio and steps ──
  await page.goto(BASE + '/cardio');
  await v(page.getByText('Lopen', { exact: true })).click();
  await v(page.getByText('Zwaar', { exact: true })).click();
  await v(page.getByLabel('Minuten')).fill('20');
  await v(page.getByLabel('Afstand (km)')).fill('4');
  await v(page.getByText('Cardio opslaan')).click();
  await v(page.getByText('5:00 /km')).waitFor();
  await v(page.getByLabel('Stappen vandaag')).fill('9000');
  await v(page.getByText('Bewaar', { exact: true })).click();
  s = await store();
  assert.strictEqual(s.cardioLog.length, 1, 'cardio saved');
  assert.strictEqual(s.cardioLog[0].kind, 'lopen');
  assert.strictEqual(s.steps[today()], 9000, 'steps saved');
  text = await bodyText();
  // 20 heavy minutes count double towards the weekly goal.
  assert.ok(/Cardio\s*40\s*min/.test(text.replace(/\n/g, ' ')), 'vigorous minutes count twice');
  await shot('02-cardio');
  await page.goto(BASE);
  await v(page.getByText('9.000')).waitFor();
  console.log('cardio + steps ok');

  // ── 4. Rest day ──
  await page.goto(BASE + '/recovery');
  await v(page.getByLabel(`${WEEKDAYS[todayIndex]}: trainingsdag`)).click();
  await v(page.getByText('Vandaag: rustdag')).waitFor();
  await page.goto(BASE);
  await v(page.getByText('Rustdag', { exact: true })).waitFor();
  assert.ok(!(await bodyText()).includes('Start Push'), 'no training button on a rest day');
  await shot('03-rustdag');
  await page.goto(BASE + '/recovery');
  await v(page.getByLabel(`${WEEKDAYS[todayIndex]}: rustdag`)).click();
  await v(page.getByText('Vandaag: trainingsdag')).waitFor();
  console.log('rest day ok');

  // ── 5. Double progression hint + deload halves the sets ──
  await page.evaluate((yesterday) => {
    const raw = JSON.parse(localStorage.getItem('fitlog-store'));
    const set = (reps) => ({ id: 's' + Math.random(), weight: 60, reps, duration: null, distance: null, done: true });
    raw.state.workouts = [
      {
        id: 'seed-1', name: 'PPL + Upper/Lower · Lower', startedAt: yesterday, finishedAt: yesterday + 3600000,
        planId: 'preset-ppl-ul', dayId: 'pplul-lower',
        exercises: [{ id: 'we1', exerciseId: 'bench-press', target: '6-10', restSec: 150, sets: [set(10), set(10), set(10)] }],
      },
    ];
    localStorage.setItem('fitlog-store', JSON.stringify(raw));
  }, Date.now() - 86400000);
  await page.goto(BASE);
  await v(page.getByText('Start Push')).click();
  await v(page.getByText('Alle sets op 10 reps: ga naar 62,5 kg en begin weer vanaf 6 reps.')).waitFor();
  assert.strictEqual(await page.getByLabel(/^Set \d afvinken$/).filter({ visible: true }).count() >= 15, true, 'full sets outside a deload');
  const fullSets = await page.getByLabel(/^Set \d afvinken$/).filter({ visible: true }).count();
  await shot('04-progressie');
  await v(page.getByText('Training annuleren')).click();
  await page.goto(BASE + '/recovery');
  await v(page.getByText('Start deloadweek')).click();
  await v(page.getByText('Deloadweek stoppen')).waitFor();
  await page.goto(BASE + '/train');
  await v(page.getByText('Push · volgende')).click();
  await v(page.getByText(/Deloadweek: minder sets/)).waitFor();
  const deloadSets = await page.getByLabel(/^Set \d afvinken$/).filter({ visible: true }).count();
  assert.ok(deloadSets < fullSets && deloadSets >= fullSets / 2, `deload has fewer sets (${deloadSets} < ${fullSets})`);
  await v(page.getByText('Training annuleren')).click();
  await page.goto(BASE + '/recovery');
  await v(page.getByText('Deloadweek stoppen')).click();
  await v(page.getByText('Start deloadweek')).waitFor();
  console.log(`progression hint ok; deload ${fullSets} -> ${deloadSets} sets`);

  // ── 6. Phase with a weight trend ──
  await page.evaluate((days) => {
    const raw = JSON.parse(localStorage.getItem('fitlog-store'));
    // 0.07 kg per day down = about -0.49 kg per week
    raw.state.bodyWeights = days.map((d, i) => ({ id: 'w' + i, date: d, kg: Math.round((75 - i * 0.07) * 100) / 100 }));
    localStorage.setItem('fitlog-store', JSON.stringify(raw));
  }, Array.from({ length: 15 }, (_, i) => daysAgo(14 - i)));
  await page.goto(BASE + '/phase');
  const start = v(page.getByLabel('Start', { exact: true }));
  const [y, m, d] = daysAgo(14).split('-');
  await start.fill(`${d}-${m}-${y}`);
  await start.blur();
  await v(page.getByText('Fase opslaan')).click();
  await page.goto(BASE + '/progress');
  await v(page.getByText('Weekrapport')).waitFor();
  s = await store();
  assert.deepStrictEqual(s.settings.phase, { type: 'cut', start: daysAgo(14), ratePct: -0.5 }, 'phase saved');
  text = (await bodyText()).replace(/\n/g, ' ');
  assert.ok(/dag 15/.test(text), 'phase day shown');
  // -0.49 kg per week on about 74 kg = -0.66 % per week: faster than the planned -0.5 % (within the 0.2 band)
  assert.ok(/Je zit op koers/.test(text), 'trend compared with the plan');
  await shot('05-voortgang');
  console.log('phase + trend ok');

  // ── 7. Personal setup ──
  await page.goto(BASE + '/setup');
  await v(page.getByLabel('Setup-code')).fill('geen json');
  await v(page.getByText(/geen geldige setup-code/)).waitFor();
  const setup = {
    app: 'fitlog-setup', version: 1,
    profile: { name: 'Sam', about: 'Testprofiel.' },
    goals: { kcal: 2400, protein: 160, carbs: 280, fat: 70 },
    settings: {
      heightCm: 175, birthYear: 2001, stepGoal: 8500, restDays: [2, 6],
      sleep: { screensOff: '22:00', bedtime: '22:30', wake: '06:30' },
      phase: { type: 'onderhoud', start: today(), ratePct: 0 },
    },
    habits: ['Schermen uit op tijd'],
  };
  await v(page.getByLabel('Setup-code')).fill(JSON.stringify(setup));
  await v(page.getByText('Dit wordt ingesteld')).waitFor();
  await shot('06-setup');
  await v(page.getByText('Setup toepassen')).click();
  await page.waitForTimeout(400);
  s = await store();
  assert.strictEqual(s.goals.kcal, 2400);
  assert.strictEqual(s.goals.waterGlasses, 8, 'unspecified goals kept');
  assert.deepStrictEqual(s.settings.sleep, { screensOff: '22:00', bedtime: '22:30', wake: '06:30' });
  assert.deepStrictEqual(s.settings.restDays, [2, 6]);
  assert.strictEqual(s.settings.phase.type, 'onderhoud');
  assert.strictEqual(s.settings.cardioGoalMin, 150, 'unspecified settings kept');
  assert.strictEqual(s.profile.name, 'Sam');
  assert.strictEqual(s.habits.length, 1);
  assert.strictEqual(s.sleepLog.length, 1, 'logs untouched by a setup');
  assert.strictEqual(s.bodyWeights.length, 15, 'weigh-ins untouched by a setup');
  console.log('personal setup ok');

  // ── 8. Coach: every new tool, with undo ──
  await page.evaluate(() => localStorage.setItem('anthropic-api-key', 'fake-test-key-for-e2e'));
  await page.goto(BASE + '/coach');
  await v(page.getByLabel('Bericht aan de coach')).fill('Stel alles in volgens mijn profiel');
  await v(page.getByLabel('Versturen')).click();
  await v(page.getByText('Alles staat ingesteld.')).waitFor({ timeout: 30000 });
  s = await store();
  assert.strictEqual(s.goals.kcal, 2500, 'coach set goals');
  assert.deepStrictEqual(s.settings.sleep, { screensOff: '22:00', bedtime: '22:30', wake: '06:30' });
  assert.deepStrictEqual(s.settings.restDays, [3, 6], 'rest days do + zo');
  assert.strictEqual(s.settings.stepGoal, 9000);
  assert.strictEqual(s.settings.cardioGoalMin, 120);
  assert.strictEqual(s.settings.deloadEveryWeeks, 8);
  assert.strictEqual(s.settings.heightCm, 178);
  assert.strictEqual(s.settings.birthYear, 1999);
  assert.deepStrictEqual(s.settings.phase, { type: 'cut', start: daysAgo(10), ratePct: -0.5 });
  assert.deepStrictEqual(s.habits.map((h) => h.name), ['Schermen uit op tijd', 'Mobiliteit']);
  const mob = s.habits.find((h) => h.name === 'Mobiliteit');
  assert.ok(s.habitLog[today()].includes(mob.id), 'habit checked');
  const night = s.sleepLog.find((e) => e.date === today());
  assert.deepStrictEqual({ bed: night.bed, wake: night.wake, asleepMin: night.asleepMin, quality: night.quality }, { bed: '23:05', wake: '06:50', asleepMin: 430, quality: 4 });
  assert.strictEqual(s.cardioLog.length, 2, 'coach logged cardio');
  assert.strictEqual(s.cardioLog[1].distanceKm, 14.5);
  assert.strictEqual(s.steps[today()], 11250);
  assert.strictEqual(s.checkIns.find((c) => c.date === today()).mood, 5);

  // What the coach read back
  const rec = toolResults.get_recovery;
  assert.strictEqual(rec.days[today()].sleep.minutes, 430, 'measured sleep time wins over time in bed');
  assert.strictEqual(rec.days[today()].steps, 11250);
  assert.strictEqual(rec.days[today()].cardio.length, 2);
  assert.ok(rec.days[today()].cardio.every((c) => c.id), 'cardio sessions have ids');
  assert.strictEqual(rec.cardio_this_week.moderateEq, 80, '20 zwaar x2 + 40 matig');
  assert.deepStrictEqual(rec.settings.rest_days, ['do', 'zo']);
  const week = toolResults.get_week_report.week;
  assert.strictEqual(week.cardioModerateEq, 80);
  assert.strictEqual(week.avgSteps, 11250);
  const ov = toolResults.get_overview;
  assert.strictEqual(ov.phase.type, 'cut');
  assert.strictEqual(ov.steps_today, 11250);
  assert.ok(ov.readiness_today.score > 0, 'overview has readiness');
  assert.ok(['trainingsdag', 'rustdag (vaste rustdag)', 'training gedaan'].includes(ov.day_plan), `day plan: ${ov.day_plan}`);
  await shot('07-coach');
  console.log('coach tools ok:', Object.keys(toolResults).join(', '));

  // Undo the cardio session from the chat.
  const undo = page.getByText('Ongedaan maken').filter({ visible: true });
  const actions = await undo.count();
  // update_settings and set_phase both changed the settings, so only the later one can be undone.
  assert.ok(actions >= 8, `the writes can be undone from the chat (${actions})`);
  await page.getByText(/Fietsen 40 min/).filter({ visible: true }).first().waitFor();
  s = await store();
  assert.strictEqual(s.cardioLog.length, 2);

  // The coach cannot set an unsafe cut rate.
  await v(page.getByLabel('Bericht aan de coach')).fill('Ik wil te snel afvallen');
  await v(page.getByLabel('Versturen')).click();
  await v(page.getByText(/Geweigerd: Fout: Meer dan 1% per week/)).waitFor({ timeout: 15000 });
  s = await store();
  assert.strictEqual(s.settings.phase.ratePct, -0.5, 'unsafe rate rejected, phase unchanged');
  console.log('unsafe cut rate rejected ok');

  // ── 9. Backup round trip keeps the new data ──
  const backup = await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('fitlog-store')).state;
    return ['sleepLog', 'cardioLog', 'steps', 'checkIns', 'habits', 'habitLog', 'settings'].every((k) => k in st);
  });
  assert.ok(backup, 'new data is persisted');

  const real = [...new Set(errors)].filter((e) => !/status of 4\d\d/.test(e));
  console.log('errors:', real.length ? real.slice(0, 10) : 'none');
  await browser.close();
  if (real.length) process.exit(1);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
