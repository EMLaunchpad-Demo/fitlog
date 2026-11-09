// E2E: the coach changes everything in the app (edit/delete/undo), against a simulated Anthropic API.
const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');
const { checkToolLimits, checkFallback } = require('./api-limits');
let rejectStrictOnce = false;

const BASE = 'http://localhost:8081';
const KEY = 'fake-test-key-for-e2e';
const OUT = path.join(__dirname, 'screenshots');
const requests = [];
let n = 0;

function checkStrictSchema(schema, where) {
  if (schema.anyOf) return schema.anyOf.forEach((s) => checkStrictSchema(s, where));
  if (schema.type === 'object') {
    assert.strictEqual(schema.additionalProperties, false, `${where}: additionalProperties`);
    const props = Object.keys(schema.properties || {});
    assert.deepStrictEqual([...(schema.required || [])].sort(), props.sort(), `${where}: required`);
    for (const [k, v] of Object.entries(schema.properties || {})) checkStrictSchema(v, `${where}.${k}`);
  }
  if (schema.type === 'array') checkStrictSchema(schema.items, `${where}[]`);
}

const text = (m) =>
  typeof m.content === 'string'
    ? m.content
    : m.content.filter((b) => b.type === 'text' && !b.text.startsWith('<context>')).map((b) => b.text).join(' ');
const reply = (content, stop_reason = 'end_turn') => ({
  id: `msg_${++n}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason,
  stop_sequence: null, stop_details: null,
  usage: { input_tokens: 100, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 3000 },
});
const call = (name, input) => reply([{ type: 'thinking', thinking: '', signature: `sig_${n}` }, { type: 'tool_use', id: `toolu_${name}_${n}`, name, input }], 'tool_use');
const say = (t) => reply([{ type: 'text', text: t }]);

/** Simulated Claude: picks tool calls from the user's last request and the last tool result. */
function respond(body) {
  const msgs = body.messages;
  const last = msgs[msgs.length - 1];
  const intent = text([...msgs].reverse().find((m) => m.role === 'user' && text(m).trim())).toLowerCase();
  const results = typeof last.content === 'string' ? [] : last.content.filter((b) => b.type === 'tool_result');
  const lastTool = results.length ? msgs[msgs.length - 2].content.find((b) => b.type === 'tool_use').name : null;
  const data = results.length && !results[0].is_error ? JSON.parse(results[0].content) : null;
  if (results.length && results[0].is_error) return say(`Fout van tool: ${results[0].content}`);

  if (intent.includes('vervang bankdrukken')) {
    if (!lastTool) return call('get_plans', {});
    if (lastTool === 'get_plans') {
      const plan = data.plans.find((p) => p.active);
      const days = plan.days.map((d, i) => ({
        day_id: d.day_id,
        name: d.name,
        exercises: d.exercises.map((e) => ({
          exercise_id: i === 0 && e.exercise_id === 'bench-press' ? 'db-bench-press' : e.exercise_id,
          new_exercise: null, sets: e.sets, target: e.target, rest_sec: e.rest_sec,
        })),
      }));
      return call('update_training_plan', { plan_id: plan.id, name: plan.name, description: plan.description, days });
    }
    return say('Gedaan: op Push staat nu bankdrukken met halters.');
  }
  if (intent.includes('banaan')) {
    if (!lastTool) return call('get_nutrition', { start_date: today(), end_date: today() });
    if (lastTool === 'get_nutrition') {
      const banaan = Object.values(data.days)[0].items.find((i) => i.name === 'Banaan');
      return call('update_food_entry', { id: banaan.id, date: null, meal: null, name: null, amount: '2 stuks', kcal: 216, protein: 2.6, carbs: 48, fat: 0.8 });
    }
    return say('Aangepast naar 2 bananen.');
  }
  if (intent.includes('verwijder de pindakaas')) {
    if (!lastTool) return call('get_nutrition', { start_date: today(), end_date: today() });
    if (lastTool === 'get_nutrition') {
      const p = Object.values(data.days)[0].items.find((i) => i.name === 'Pindakaas');
      return call('delete_food_entries', { ids: [p.id] });
    }
    return say('Pindakaas is weg.');
  }
  if (intent.includes('gelopen')) {
    if (!lastTool)
      return call('log_workout', {
        date: yesterday(), name: 'Hardlopen', duration_min: 28,
        exercises: [{ exercise_id: 'run', new_exercise: null, sets: [{ weight_kg: null, reps: null, duration: 28, distance_km: 5 }] }],
      });
    return say('Je loop van gisteren staat erin.');
  }
  if (intent.includes('verwijder het schema upper')) {
    if (!lastTool) return call('get_plans', {});
    if (lastTool === 'get_plans') return call('delete_training_plan', { plan_id: data.plans.find((p) => p.name === 'Upper / Lower').id });
    return say('Schema verwijderd.');
  }
  if (intent.includes('knie')) {
    if (!lastTool) return call('update_profile', { name: null, about: 'Testprofiel.\nLet op: lichte knieblessure links, geen diepe lunges.' });
    return say('Onthouden.');
  }
  if (intent.includes('ongeldig')) {
    if (!lastTool) return call('delete_workout', { workout_id: 'bestaat-niet' });
    return say('Klaar.');
  }
  return say('Prima!');
}
const pad = (x) => String(x).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => key(new Date());
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return key(d); };

(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('dialog', (d) => d.accept());
  await page.route('https://api.anthropic.com/**', async (route) => {
    const body = JSON.parse(route.request().postData());
    const fail = (message) =>
      route.fulfill({ status: 400, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message } }) });
    try {
      for (const t of body.tools) if (t.strict) checkStrictSchema(t.input_schema, t.name);
      const limits = checkToolLimits(body.tools);
      if (!requests.length) console.log('strict schema budget:', JSON.stringify(limits), '(limits 20 / 16 unions / 24 optional)');
      checkFallback(body, route.request().headers());
    } catch (e) {
      console.log('API WOULD REJECT:', e.message);
      return fail(e.message);
    }
    if (rejectStrictOnce && body.tools.some((t) => t.strict)) {
      rejectStrictOnce = false;
      requests.push(body);
      return fail('Schema is too complex for compilation.');
    }
    requests.push(body);
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(respond(body)) });
  });
  const v = (loc) => loc.filter({ visible: true }).first();
  const send = async (msg, expect) => {
    await v(page.getByLabel('Bericht aan de coach')).fill(msg);
    await v(page.getByLabel('Versturen')).click();
    await v(page.getByText(expect)).waitFor({ timeout: 15000 });
  };
  const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('fitlog-store')).state);

  // Seed: key, a profile, and a breakfast to edit.
  await page.goto(BASE);
  await page.evaluate((k) => {
    localStorage.setItem('anthropic-api-key', k);
  }, KEY);
  await page.goto(BASE + '/coach');
  await send('Hoi coach', 'Prima!');
  // (the generic reply logs nothing; log via the app instead)
  await page.goto(BASE + '/food-add?meal=ontbijt');
  for (const [q, item] of [['pinda', 'Pindakaas'], ['banaan', 'Banaan']]) {
    await v(page.getByPlaceholder('Zoek product, bijv. kwark')).fill(q);
    await v(page.getByText(item, { exact: true })).click();
    await v(page.getByText('Voeg toe aan Ontbijt')).click();
  }
  await page.goto(BASE + '/coach');
  await v(page.getByLabel('Bericht aan de coach')).waitFor();
  console.log('tools in request:', requests[0].tools.length, '- all strict schemas valid');

  // 1. Edit the active plan, then undo it.
  const before = await store();
  await send('Vervang bankdrukken door halters op mijn push-dag', /Gedaan: op Push staat nu/);
  let s = await store();
  const pushBefore = before.plans ? before.plans.find((p) => p.id === 'preset-ppl-ul') : null;
  const push = s.plans.find((p) => p.id === 'preset-ppl-ul').days[0];
  assert.strictEqual(push.exercises[0].exerciseId, 'db-bench-press', 'plan updated');
  assert.strictEqual(push.id, 'pplul-push', 'day id kept');
  await page.screenshot({ path: path.join(OUT, 'actions-01-plan-updated.png') });
  await v(page.getByLabel(/Ongedaan maken: Schema/)).click();
  await v(page.getByText('Ongedaan', { exact: true })).waitFor();
  s = await store();
  assert.strictEqual(s.plans.find((p) => p.id === 'preset-ppl-ul').days[0].exercises[0].exerciseId, 'bench-press', 'undo restored plan');
  await page.screenshot({ path: path.join(OUT, 'actions-02-undone.png') });
  console.log('plan edit + undo ok', pushBefore ? '' : '(plans were default before)');

  // 2. Edit a food entry — and the coach is told about the undo.
  await send('Het was eigenlijk 2 banaan', 'Aangepast naar 2 bananen.');
  const ctx = requests.find((r) => text(r.messages[r.messages.length - 1]).includes('banaan'));
  const ctxText = ctx.messages[ctx.messages.length - 1].content[0].text;
  assert.ok(ctxText.includes('ongedaan gemaakt') && ctxText.includes('Schema'), 'coach told about undo');
  s = await store();
  assert.strictEqual(s.foodLog.find((e) => e.name === 'Banaan').amountLabel, '2 stuks', 'food entry updated');
  console.log('food edit ok; undo note sent to coach');

  // 3. Delete a food entry.
  await send('Verwijder de pindakaas', 'Pindakaas is weg.');
  s = await store();
  assert.ok(!s.foodLog.some((e) => e.name === 'Pindakaas'), 'food entry deleted');

  // 4. Log a past workout.
  await send('Ik heb gisteren 5 km gelopen', 'Je loop van gisteren staat erin.');
  s = await store();
  const run = s.workouts.find((w) => w.name === 'Hardlopen');
  assert.ok(run && run.exercises[0].sets[0].distance === 5, 'workout logged');

  // 5. Delete a plan.
  await send('Verwijder het schema Upper / Lower', 'Schema verwijderd.');
  s = await store();
  assert.ok(!s.plans.some((p) => p.name === 'Upper / Lower'), 'plan deleted');

  // 6. Update the profile.
  await send('Onthoud dat ik last heb van mijn knie', 'Onthouden.');
  s = await store();
  assert.ok(s.profile.about.includes('knieblessure'), 'profile updated');

  // 7. A failing tool call is reported, not crashed, and changes nothing.
  await send('Verwijder training ongeldig', /Fout van tool/);
  await v(page.getByText(/mislukt: Training "bestaat-niet" bestaat niet/)).waitFor();
  await page.screenshot({ path: path.join(OUT, 'actions-03-chat.png') });

  // 8. History stayed append-only through all of it.
  for (let i = 1; i < requests.length; i++) {
    const prev = requests[i - 1].messages.map((m) => JSON.stringify(m));
    const next = requests[i].messages.map((m) => JSON.stringify(m));
    for (let j = 0; j < Math.min(prev.length, next.length); j++) assert.strictEqual(next[j], prev[j], `append-only ${i}:${j}`);
  }
  assert.strictEqual(new Set(requests.map((r) => JSON.stringify(r.tools))).size, 1, 'tools stable');
  console.log(`${requests.length} requests, append-only, tools stable`);

  // 9. App update with new prompt/tools: next message starts a fresh conversation.
  await page.evaluate(() => {
    const c = JSON.parse(localStorage.getItem('fitlog-coach'));
    c.state.promptVersion = 'oude-versie';
    localStorage.setItem('fitlog-coach', JSON.stringify(c));
  });
  await page.reload();
  await v(page.getByText(/nieuwe mogelijkheden gekregen/)).waitFor({ timeout: 20000 });
  const count = requests.length;
  await send('Hoi', 'Prima!');
  assert.strictEqual(requests[count].messages.length, 1, 'fresh conversation after app update');
  console.log('app update -> new conversation ok');

  // 10. Hidden API limit: strict schemas rejected -> app retries without strict, and stays non-strict.
  await v(page.getByLabel('Nieuw gesprek')).click();
  rejectStrictOnce = true;
  const before10 = requests.length;
  await send('Hallo', 'Prima!');
  assert.ok(requests[before10].tools.some((t) => t.strict), 'first try strict');
  assert.ok(!requests[before10 + 1].tools.some((t) => t.strict), 'retry without strict');
  await send('Nog een vraag', 'Prima!');
  assert.ok(!requests[requests.length - 1].tools.some((t) => t.strict), 'stays non-strict');
  console.log('strict rejected -> non-strict retry ok');

  // 11. Haiku: no fallback parameter or beta header.
  await page.evaluate(() => {
    const c = JSON.parse(localStorage.getItem('fitlog-coach'));
    c.state.model = 'claude-haiku-5-5';
    localStorage.setItem('fitlog-coach', JSON.stringify(c));
  });
  await page.reload();
  await send('Haiku test', 'Prima!');
  assert.strictEqual(requests[requests.length - 1].model, 'claude-haiku-5-5');
  console.log('haiku request without fallbacks ok');

  // Visible results in the app
  await page.goto(BASE + '/train');
  await v(page.getByText('Hardlopen')).waitFor();
  await page.goto(BASE + '/food');
  await v(page.getByText('2 stuks', { exact: false })).waitFor();

  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
