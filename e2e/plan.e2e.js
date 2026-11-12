// E2E: the coach analyses the body and makes the plan; measurements, saved meals,
// week menu, barcode scanner (typed and through a fake camera), plates and warm-up,
// plateau detection and the daily briefing. Against a simulated Anthropic API.
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { checkToolLimits } = require('./api-limits');
const { ean13, writeBarcodeVideo } = require('./barcode-video');

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
const BARCODE = ean13('541234567890');

let n = 0;
const reply = (content, stop_reason = 'end_turn', model = 'claude-opus-5-5') => ({
  id: `msg_${++n}`, type: 'message', role: 'assistant', model, content, stop_reason,
  stop_sequence: null, stop_details: null,
  usage: { input_tokens: 100, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 3000 },
});
const calls = (list) =>
  reply(
    [
      { type: 'thinking', thinking: '', signature: `sig_${n}` },
      ...list.map(([name, input], i) => ({ type: 'tool_use', id: `toolu_${name}_${n}_${i}`, name, input })),
    ],
    'tool_use',
  );
const say = (t) => reply([{ type: 'text', text: t }]);
const item = (name, amount, kcal, protein, carbs, fat) => ({ name, amount, kcal, protein, carbs, fat });

const toolResults = {};
const briefingRequests = [];

function respond(body) {
  // The daily briefing: cheapest model, no tools.
  if (body.model === 'claude-haiku-5-5' && !body.tools) {
    briefingRequests.push(body);
    return reply([{ type: 'text', text: 'Trainingsdag vandaag: je sliep nog niets gelogd, dus log je nacht even.' }], 'end_turn', 'claude-haiku-5-5');
  }
  const msgs = body.messages;
  const last = msgs[msgs.length - 1];
  const results = typeof last.content === 'string' ? [] : last.content.filter((b) => b.type === 'tool_result');
  const userText = (m) =>
    typeof m.content === 'string' ? m.content : m.content.filter((b) => b.type === 'text' && !b.text.startsWith('<context>')).map((b) => b.text).join(' ');
  const intent = userText([...msgs].reverse().find((m) => m.role === 'user' && userText(m).trim())).toLowerCase();
  const uses = results.length ? msgs[msgs.length - 2].content.filter((b) => b.type === 'tool_use') : [];
  for (const use of uses) {
    const result = results.find((r) => r.tool_use_id === use.id);
    if (result.is_error) return say(`Geweigerd: ${result.content}`);
    toolResults[use.name] = JSON.parse(result.content);
  }

  if (intent.includes('analyseer mijn lichaam')) {
    if (!uses.length) return calls([['get_body_analysis', {}]]);
    if (uses[0].name === 'get_body_analysis')
      return calls([
        ['set_phase', { type: 'onderhoud', start: today(), end: null, rate_pct: null }],
        ['set_nutrition_goals', { kcal: 2900, protein: 150, carbs: 380, fat: 80, water_glasses: null }],
        ['save_plan', {
          summary: 'Je bent slank met een gezonde taille, dus een cut levert je weinig op. Je bankdrukken staat al vier trainingen stil. Ik zet je op onderhoud met 2900 kcal.',
          focus: ['Eet elke dag 2900 kcal en 150 g eiwit', 'Log je slaap, die ontbreekt nog', 'Bankdrukken: zak naar 55 kg en bouw opnieuw op'],
          review_in_days: 14,
        }],
      ]);
    return say('Plan staat klaar: onderhoud op 2900 kcal.');
  }
  if (intent.includes('weekmenu')) {
    if (!uses.length)
      return calls([['save_week_menu', {
        title: 'Weekmenu onderhoud',
        days: [
          { label: 'Trainingsdag', meals: [
            { meal: 'ontbijt', name: 'Havermout met kwark', items: [item('Havermout', '80 g', 300, 10, 50, 6), item('Magere kwark', '250 g', 150, 25, 10, 1)] },
            { meal: 'diner', name: 'Kip met rijst', items: [item('Kipfilet', '200 g', 220, 46, 0, 4), item('Witte rijst', '300 g', 390, 8, 86, 1)] },
          ] },
          { label: 'Rustdag', meals: [{ meal: 'lunch', name: 'Broodjes met ei', items: [item('Volkorenbrood', '4 sneetjes', 320, 14, 56, 4)] }] },
        ],
        shopping_list: ['Havermout 1 kg', 'Magere kwark 2 kg', 'Rijst 1 kg'],
      }]]);
    return say('Je weekmenu staat klaar.');
  }
  if (intent.includes('snel droog')) {
    if (!uses.length) return calls([['set_phase', { type: 'cut', start: today(), end: null, rate_pct: 0.8 }]]);
    return say('Ingesteld.');
  }
  if (intent.includes('taille')) {
    if (!uses.length) return calls([['log_measurements', { date: null, waist_cm: 81.5, arm_cm: 36 }], ['save_meal', { name: 'Shake na training', portions: 1, items: [item('Eiwitshake', '1 portie', 160, 30, 6, 2), item('Banaan', '1 stuk', 105, 1, 27, 0)] }]]);
    if (uses[0].name === 'log_measurements') return calls([['log_saved_meal', { saved_meal: 'shake', portions: 1, date: null, meal: 'snack' }]]);
    return say('Gelogd.');
  }
  return say('Prima!');
}

(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text()));
  page.on('dialog', (d) => d.accept());
  const mockApis = async (target) => {
    await target.route('https://api.anthropic.com/**', async (route) => {
      const body = JSON.parse(route.request().postData());
      if (body.tools) checkToolLimits(body.tools);
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(respond(body)) });
    });
    await target.route('https://world.openfoodfacts.org/**', async (route) => {
      const code = route.request().url().match(/product\/(\d+)/)[1];
      const body =
        code === BARCODE
          ? { status: 1, code, product: { product_name: 'Griekse yoghurt', brands: 'Testmerk,Ander', serving_quantity: '150', nutriments: { 'energy-kcal_100g': 97, proteins_100g: 9, carbohydrates_100g: 3.5, fat_100g: 5 } } }
          : { status: 0, code, status_verbose: 'product not found' };
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    });
  };
  await mockApis(page);

  const v = (loc) => loc.filter({ visible: true }).first();
  const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('fitlog-store')).state);
  const shot = async (name) => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, `plan-${name}.png`) });
  };
  const flat = async () => (await page.innerText('body')).replace(/\n/g, ' ');

  // ── Seed: three weeks of weigh-ins with scale data, a stuck bench press, a squat ──
  await page.goto(BASE);
  await v(page.getByText('Volgende training')).waitFor({ timeout: 60000 });
  await page.evaluate(({ days, yesterday }) => {
    const set = (weight, reps) => ({ id: 's' + Math.random(), weight, reps, duration: null, distance: null, done: true });
    const at = (daysBack) => Date.now() - daysBack * 86400000;
    const bench = (daysBack) => ({
      id: 'b' + daysBack, name: 'Push', startedAt: at(daysBack), finishedAt: at(daysBack) + 3600000,
      exercises: [{ id: 'we' + daysBack, exerciseId: 'bench-press', target: '6-10', restSec: 150, sets: [set(60, 8), set(60, 7), set(60, 7)] }],
    });
    const state = {
      settings: { sex: 'man', birthYear: new Date().getFullYear() - 24, heightCm: 180 },
      bodyWeights: days.map((d, i) => ({ id: 'w' + i, date: d, kg: 75, ...(i === days.length - 1 ? { composition: { fatPct: 15, muscleKg: 60 } } : {}) })),
      workouts: [
        { id: 'sq', name: 'Legs', startedAt: at(3), finishedAt: at(3) + 3600000, exercises: [{ id: 'wesq', exerciseId: 'squat', target: '5-8', restSec: 180, sets: [set(100, 5), set(100, 5)] }] },
        bench(1), bench(8), bench(15), bench(22),
      ].sort((a, b) => b.startedAt - a.startedAt),
      foodLog: [{ id: 'y1', date: yesterday, meal: 'diner', name: 'Spaghetti bolognese', amountLabel: '1 bord', kcal: 700, protein: 35, carbs: 80, fat: 22, createdAt: 1 }],
    };
    localStorage.setItem('fitlog-store', JSON.stringify({ state, version: 1 }));
    localStorage.setItem('anthropic-api-key', 'fake-test-key-for-e2e');
  }, { days: Array.from({ length: 21 }, (_, i) => daysAgo(20 - i)), yesterday: daysAgo(1) });

  // ── 1. Measurements ──
  await page.goto(BASE + '/body');
  await v(page.getByLabel('Taille')).fill('82');
  await v(page.getByText('Maten opslaan')).click();
  let s = await store();
  assert.deepStrictEqual({ date: s.measures[0].date, waist: s.measures[0].waist }, { date: today(), waist: 82 }, 'waist saved');
  await page.goto(BASE + '/body');
  await v(page.getByText('0,46 × je lengte')).waitFor();
  console.log('measurements ok');

  // ── 2. The coach analyses the body and makes the plan ──
  await page.goto(BASE + '/progress');
  await v(page.getByText('Stagnatie')).waitFor();
  assert.ok((await flat()).includes('Bankdrukken (barbell)'), 'plateau listed on Voortgang');
  await shot('01-voortgang-zonder-plan');
  await v(page.getByText('Analyseer mijn lichaam')).click();
  await v(page.getByText('Plan staat klaar: onderhoud op 2900 kcal.')).waitFor({ timeout: 30000 });
  await shot('02-coach-plan');
  const a = toolResults.get_body_analysis;
  assert.strictEqual(a.person.age, 24);
  assert.strictEqual(a.person.under_18, false);
  assert.strictEqual(a.weight.bmi, 23.1, 'BMI 75 / 1.8²');
  assert.strictEqual(a.weight.trend_kg_per_week, 0, 'flat trend');
  assert.strictEqual(a.body_composition.lean_mass_kg, 63.8, 'lean mass from scale fat %');
  assert.strictEqual(a.body_composition.ffmi, 19.7, 'FFMI');
  assert.strictEqual(a.measurements.waist_to_height, 0.46);
  const bench = a.strength.find((x) => x.exercise === 'Bankdrukken (barbell)');
  assert.strictEqual(bench.best_est_1rm_kg, 76, 'Epley 60 x 8');
  assert.strictEqual(bench.ratio_to_body_weight, 1.01);
  assert.strictEqual(bench.sessions_without_progress, 3);
  assert.strictEqual(a.training.plateaus[0].exercise, 'Bankdrukken (barbell)');
  assert.ok(a.training.sets_per_muscle_per_week.some((m) => m.muscle === 'Borst'), 'volume per muscle');
  assert.ok(a.data_gaps.some((g) => g.includes('slaap')), 'missing sleep is reported');
  assert.ok(a.data_gaps.some((g) => g.includes('eetdagen')), 'thin food log is reported');
  s = await store();
  assert.strictEqual(s.settings.phase.type, 'onderhoud', 'coach set the phase');
  assert.strictEqual(s.goals.kcal, 2900, 'coach set the goals');
  assert.strictEqual(s.coachPlan.focus.length, 3, 'plan saved');
  assert.strictEqual(s.coachPlan.date, today());
  assert.strictEqual(s.coachPlan.reviewDate, daysAgo(-14), 'review in 14 days');
  await page.goto(BASE + '/progress');
  await v(page.getByText('Bankdrukken: zak naar 55 kg en bouw opnieuw op')).waitFor();
  assert.ok((await flat()).includes('Nieuwe analyse over 14 dagen'), 'review date shown');
  await shot('03-mijn-plan');
  await page.goto(BASE);
  await v(page.getByText('Focus van je plan')).waitFor();
  await v(page.getByText('Eet elke dag 2900 kcal en 150 g eiwit')).waitFor();
  console.log('body analysis + plan ok');

  // A plan that is due asks for a review.
  await page.evaluate((date) => {
    const raw = JSON.parse(localStorage.getItem('fitlog-store'));
    raw.state.coachPlan.reviewDate = date;
    localStorage.setItem('fitlog-store', JSON.stringify(raw));
  }, daysAgo(1));
  await page.goto(BASE + '/progress');
  await v(page.getByText(/Tijd voor een nieuwe analyse/)).waitFor();
  console.log('plan review due ok');

  // ── 3. Coach: measurements and saved meals ──
  await page.goto(BASE + '/coach');
  await v(page.getByLabel('Bericht aan de coach')).fill('Mijn taille is 81,5 en bewaar mijn shake');
  await v(page.getByLabel('Versturen')).click();
  await v(page.getByText('Gelogd.')).waitFor({ timeout: 30000 });
  s = await store();
  assert.deepStrictEqual({ waist: s.measures[0].waist, arm: s.measures[0].arm }, { waist: 81.5, arm: 36 }, 'coach merged the measurements');
  assert.strictEqual(s.savedMeals[0].name, 'Shake na training');
  assert.strictEqual(s.foodLog.filter((e) => e.date === today() && e.meal === 'snack').length, 2, 'saved meal logged by the coach');
  console.log('coach measurements + saved meal ok');

  // ── 4. Saved meals in the app ──
  await page.goto(BASE + '/food-add?meal=ontbijt');
  await v(page.getByPlaceholder('Zoek product, bijv. kwark')).fill('kwark');
  await v(page.getByText('Magere kwark', { exact: true })).click();
  await v(page.getByText('Voeg toe aan Ontbijt')).click();
  await v(page.getByText('Maaltijden', { exact: true })).click();
  await v(page.getByLabel('Naam')).fill('Mijn ontbijt');
  await v(page.getByText('Bewaar als maaltijd')).click();
  await v(page.getByText('Mijn ontbijt', { exact: true })).waitFor();
  await page.goto(BASE + '/food-add?meal=lunch&tab=meals');
  await v(page.getByText('Mijn ontbijt', { exact: true })).click();
  await v(page.getByLabel('Porties')).fill('2');
  await v(page.getByText('Voeg toe aan Lunch')).click();
  s = await store();
  const lunch = s.foodLog.filter((e) => e.date === today() && e.meal === 'lunch');
  const breakfast = s.foodLog.find((e) => e.date === today() && e.meal === 'ontbijt');
  assert.strictEqual(lunch.length, 1);
  assert.strictEqual(lunch[0].kcal, breakfast.kcal * 2, 'two portions');
  assert.ok(lunch[0].amountLabel.startsWith('2× '), `amount label: ${lunch[0].amountLabel}`);
  // Same as yesterday
  await page.goto(BASE + '/food-add?meal=diner&tab=meals');
  await v(page.getByText('Zelfde als gisteren')).click();
  s = await store();
  assert.strictEqual(s.foodLog.find((e) => e.date === today() && e.meal === 'diner').name, 'Spaghetti bolognese');
  await shot('04-maaltijden');
  console.log('saved meals + same as yesterday ok');

  // ── 5. Week menu ──
  await page.goto(BASE + '/menu');
  await v(page.getByText('Maak mijn weekmenu')).click();
  await v(page.getByText('Je weekmenu staat klaar.')).waitFor({ timeout: 30000 });
  await page.goto(BASE + '/menu');
  await v(page.getByText('Weekmenu onderhoud')).waitFor();
  assert.ok((await flat()).includes('1.060 kcal'), 'day total of the first day');
  const before = (await store()).foodLog.length;
  await page.getByText('Log', { exact: true }).filter({ visible: true }).nth(1).click();
  await v(page.getByLabel('Magere kwark 2 kg')).click();
  s = await store();
  assert.strictEqual(s.foodLog.length, before + 2, 'menu meal logged (2 items)');
  assert.strictEqual(s.foodLog[s.foodLog.length - 1].name, 'Witte rijst');
  assert.strictEqual(s.weekMenu.shopping[1].done, true, 'shopping item ticked');
  await v(page.getByText('Rustdag', { exact: true })).click();
  await v(page.getByText('Broodjes met ei')).waitFor();
  await shot('05-weekmenu');
  console.log('week menu ok');

  // ── 6. Barcode by typing ──
  await page.goto(BASE + '/scan?meal=snack');
  const wrong = BARCODE.slice(0, 12) + ((Number(BARCODE[12]) + 1) % 10);
  await v(page.getByLabel('Barcode')).fill(wrong);
  await v(page.getByText(/Deze code klopt niet/)).waitFor();
  await v(page.getByLabel('Barcode')).fill(ean13('871234500001'));
  await v(page.getByText('Zoek', { exact: true })).click();
  await v(page.getByText(/niet gevonden/)).waitFor();
  await v(page.getByText('Opnieuw scannen')).click();
  await v(page.getByLabel('Barcode')).fill(BARCODE);
  await v(page.getByText('Zoek', { exact: true })).click();
  await v(page.getByText('Griekse yoghurt')).waitFor();
  assert.strictEqual(await v(page.getByLabel('Hoeveelheid (gram of ml)')).inputValue(), '150', 'serving size prefilled');
  await v(page.getByLabel('Hoeveelheid (gram of ml)')).fill('250');
  await shot('06-barcode');
  await v(page.getByText('Voeg toe aan Snacks')).click();
  await page.waitForTimeout(400);
  s = await store();
  const yoghurt = s.foodLog.find((e) => e.name === 'Testmerk · Griekse yoghurt');
  assert.deepStrictEqual({ kcal: yoghurt.kcal, protein: yoghurt.protein, amount: yoghurt.amountLabel }, { kcal: 243, protein: 22.5, amount: '250 g' });
  assert.ok(s.customFoods.some((f) => f.name === 'Testmerk · Griekse yoghurt' && f.unit.grams === 150), 'product kept for search');
  console.log('barcode lookup ok');

  // ── 7. Plates and warm-up ──
  await page.goto(BASE + '/train');
  await v(page.getByText('Legs', { exact: true })).click();
  await v(page.getByText('100 kg: 25 + 15 per kant')).click();
  await v(page.getByText(/Opwarmen: 20 kg × 10 → 50 kg × 5 → 70 kg × 3 → 85 kg × 1/)).waitFor();
  await shot('07-schijven');
  await v(page.getByText('Training annuleren')).click();
  console.log('plates + warm-up ok');

  // ── 8. Daily briefing (off by default) ──
  await page.goto(BASE);
  await v(page.getByText('Focus van je plan')).waitFor();
  await page.waitForTimeout(800);
  assert.strictEqual(briefingRequests.length, 0, 'no briefing request while it is off');
  await page.goto(BASE + '/coach-settings');
  await v(page.getByText('Aan', { exact: true })).click();
  await page.goto(BASE);
  await v(page.getByText(/Trainingsdag vandaag: je sliep nog niets gelogd/)).waitFor({ timeout: 15000 });
  await page.reload();
  await v(page.getByText(/Trainingsdag vandaag: je sliep nog niets gelogd/)).waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  assert.strictEqual(briefingRequests.length, 1, 'one briefing per day');
  const br = briefingRequests[0];
  assert.strictEqual(br.fallbacks, undefined, 'no fallbacks parameter for Haiku');
  assert.strictEqual(br.output_config.effort, 'low');
  assert.strictEqual(br.thinking, undefined, 'thinking left at the model default');
  const snapshot = JSON.parse(br.messages[0].content.split('\n\n')[1]);
  assert.strictEqual(snapshot.plan.focus.length, 3, 'briefing knows the plan');
  assert.ok(snapshot.day_plan, 'briefing knows the day plan');
  await shot('08-briefing');
  console.log('daily briefing ok');

  // ── 9. Under 18: the coach cannot start a fast cut ──
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('fitlog-store'));
    raw.state.settings.birthYear = new Date().getFullYear() - 16;
    localStorage.setItem('fitlog-store', JSON.stringify(raw));
  });
  await page.goto(BASE + '/coach');
  await v(page.getByLabel('Bericht aan de coach')).fill('Ik wil snel droog worden');
  await v(page.getByLabel('Versturen')).click();
  await v(page.getByText(/Geweigerd: Fout: De gebruiker is jonger dan 18/)).waitFor({ timeout: 15000 });
  s = await store();
  assert.strictEqual(s.settings.phase.type, 'onderhoud', 'phase unchanged');
  console.log('under-18 guard ok');
  await ctx.close();

  // ── 10. Barcode through the camera (fake camera showing an EAN-13) ──
  const video = path.join(os.tmpdir(), `fitlog-barcode-${process.pid}.y4m`);
  writeBarcodeVideo(video, BARCODE);
  const camBrowser = await chromium.launch({
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${video}`],
  });
  const camCtx = await camBrowser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
  const cam = await camCtx.newPage();
  cam.on('pageerror', (e) => errors.push(e.message));
  await mockApis(cam);
  await cam.goto(BASE + '/scan?meal=lunch');
  await cam.getByText('Griekse yoghurt').filter({ visible: true }).first().waitFor({ timeout: 30000 });
  await cam.waitForTimeout(300);
  await cam.screenshot({ path: path.join(OUT, 'plan-09-camera.png') });
  console.log('barcode through the camera ok');
  await camBrowser.close();
  require('fs').rmSync(video, { force: true });

  const real = [...new Set(errors)].filter((e) => !/status of 4\d\d/.test(e));
  console.log('errors:', real.length ? real.slice(0, 10) : 'none');
  await browser.close();
  if (real.length) process.exit(1);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
