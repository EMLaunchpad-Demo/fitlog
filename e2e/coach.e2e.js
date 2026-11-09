// E2E test of the AI coach against a simulated Anthropic API (Playwright route interception).
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { checkToolLimits, checkFallback } = require('./api-limits');

const OUT = path.join(__dirname, 'screenshots');
const BASE = 'http://localhost:8081';
const VALID_KEY = 'fake-test-key-for-e2e';
const scheme = process.argv[2] || 'light';

const requests = []; // captured POST /v1/messages bodies + headers
let failNext = 0;
let msgCounter = 0;

function userText(msg) {
  if (typeof msg.content === 'string') return msg.content;
  return msg.content
    .filter((b) => b.type === 'text' && !b.text.startsWith('<context>'))
    .map((b) => b.text)
    .join(' ');
}

// What the real API would reject: validate the request like the server does.
function validateRequest(body, headers) {
  assert.strictEqual(headers['x-api-key'], VALID_KEY, 'api key header');
  assert.strictEqual(headers['anthropic-version'], '2026-10-21', 'version header');

  assert.strictEqual(headers['anthropic-dangerous-direct-browser-access'], 'true', 'browser header on web');
  checkFallback(body, headers);
  checkToolLimits(body.tools);
  assert.ok(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'].includes(body.model), 'model');
  assert.deepStrictEqual(body.output_config, { effort: 'medium' });
  assert.deepStrictEqual(body.cache_control, { type: 'ephemeral' });
  assert.ok(!('thinking' in body) || body.thinking.type === 'adaptive', 'no disabled thinking');
  assert.ok(!('temperature' in body) && !('top_p' in body) && !('top_k' in body), 'no sampling params');
  assert.ok(!body.tool_choice || body.tool_choice.type === 'auto', 'no forced tool choice');
  assert.ok(body.max_tokens >= 1024 && body.max_tokens <= 16000);
  assert.strictEqual(body.messages[0].role, 'user', 'first message is user');
  for (const t of body.tools) if (t.strict) checkStrictSchema(t.input_schema, t.name);
  // Every tool_use must be answered by tool_results at the start of the next user turn.
  body.messages.forEach((m, i) => {
    if (m.role !== 'assistant' || typeof m.content === 'string') return;
    const ids = m.content.filter((b) => b.type === 'tool_use').map((b) => b.id);
    if (!ids.length) return;
    const next = body.messages[i + 1];
    assert.ok(next && next.role === 'user', 'tool_use followed by user turn');
    const resultIds = next.content.filter((b) => b.type === 'tool_result').map((b) => b.tool_use_id);
    assert.deepStrictEqual(resultIds.sort(), ids.sort(), 'tool results match tool uses');
  });
  // Images must carry real JPEG data, never the local reference.
  for (const m of body.messages) {
    if (typeof m.content === 'string') continue;
    for (const b of m.content) {
      if (b.type === 'image') {
        assert.strictEqual(b.source.type, 'base64');
        assert.strictEqual(b.source.media_type, 'image/jpeg');
        assert.ok(b.source.data.startsWith('/9j/'), 'image is real JPEG base64');
      }
    }
  }
}

function checkStrictSchema(schema, where) {
  if (schema.anyOf) return schema.anyOf.forEach((s) => checkStrictSchema(s, where));
  if (schema.type === 'object') {
    assert.strictEqual(schema.additionalProperties, false, `${where}: additionalProperties false`);
    const props = Object.keys(schema.properties || {});
    assert.deepStrictEqual([...(schema.required || [])].sort(), props.sort(), `${where}: all props required`);
    for (const [k, v] of Object.entries(schema.properties || {})) checkStrictSchema(v, `${where}.${k}`);
  }
  if (schema.type === 'array') checkStrictSchema(schema.items, `${where}[]`);
  for (const bad of ['minimum', 'maximum', 'minLength', 'maxLength'])
    assert.ok(!(bad in schema), `${where}: unsupported ${bad}`);
}

function reply(content, stop_reason, model) {
  msgCounter++;
  return {
    id: `msg_mock_${msgCounter}`,
    type: 'message',
    role: 'assistant',
    model,
    content,
    stop_reason,
    stop_sequence: null,
    stop_details: null,
    usage: {
      input_tokens: 150,
      output_tokens: 220,
      cache_creation_input_tokens: msgCounter === 1 ? 4900 : 300,
      cache_read_input_tokens: msgCounter === 1 ? 0 : 4900,
    },
  };
}

const thinking = (n) => ({ type: 'thinking', thinking: '', signature: `sig_${n}_${'x'.repeat(12)}` });

function respond(body) {
  const last = body.messages[body.messages.length - 1];
  const blocks = typeof last.content === 'string' ? [] : last.content;
  const toolResults = blocks.filter((b) => b.type === 'tool_result');
  const m = body.model;

  if (toolResults.length) {
    const prevAssistant = body.messages[body.messages.length - 2];
    const call = prevAssistant.content.find((b) => b.type === 'tool_use');
    const result = toolResults[0];
    if (result.is_error) return reply([{ type: 'text', text: `Dat lukte niet: ${result.content}` }], 'end_turn', m);
    const data = JSON.parse(result.content);
    switch (call.name) {
      case 'log_food':
        return reply(
          [{ type: 'text', text: `Gelogd! Je zit nu op ${data.day_totals.kcal} kcal van je ${data.goals.kcal}. Ik ging uit van normale porties.` }],
          'end_turn',
          m,
        );
      case 'get_overview':
        assert.ok(Array.isArray(data.body_weight_weekly_avg), 'overview has weekly averages');
        return reply(
          [{ type: 'text', text: `Je hebt in totaal ${data.total_workouts} trainingen gelogd, ${data.workouts_this_week} deze week. Lekker bezig!\n- Volgende training: ${data.active_plan?.next_day ?? 'geen'}` }],
          'end_turn',
          m,
        );
      case 'create_training_plan':
        return reply([{ type: 'text', text: `Je schema "${data.name}" staat klaar en is actief.` }], 'end_turn', m);
      default:
        return reply([{ type: 'text', text: 'Klaar.' }], 'end_turn', m);
    }
  }

  const text = userText(last).toLowerCase();
  const hasImage = blocks.some((b) => b.type === 'image');
  if (hasImage) {
    return reply(
      [
        thinking('photo'),
        {
          type: 'tool_use',
          id: 'toolu_photo1',
          name: 'log_food',
          input: {
            date: null,
            meal: 'lunch',
            items: [
              { name: 'Kipfilet', amount: '120 g', kcal: 180, protein: 34, carbs: 0, fat: 4 },
              { name: 'Witte rijst', amount: '150 g', kcal: 195, protein: 4, carbs: 42, fat: 0.5 },
            ],
          },
        },
      ],
      'tool_use',
      m,
    );
  }
  if (text.includes('boterhammen')) {
    return reply(
      [
        thinking('food'),
        { type: 'text', text: 'Ik zet het in je ontbijt.' },
        {
          type: 'tool_use',
          id: 'toolu_food1',
          name: 'log_food',
          input: {
            date: null,
            meal: 'ontbijt',
            items: [
              { name: 'Volkorenbrood', amount: '2 sneetjes', kcal: 161, protein: 6.7, carbs: 26.6, fat: 2 },
              { name: 'Pindakaas', amount: '2 porties (30 g)', kcal: 186, protein: 7.5, carbs: 3.9, fat: 15 },
              { name: 'Banaan', amount: '1 stuk', kcal: 108, protein: 1.3, carbs: 24, fat: 0.4 },
            ],
          },
        },
      ],
      'tool_use',
      m,
    );
  }
  if (text.includes('training')) {
    return reply([thinking('overview'), { type: 'tool_use', id: 'toolu_ov1', name: 'get_overview', input: {} }], 'tool_use', m);
  }
  if (text.includes('schema')) {
    return reply(
      [
        thinking('plan'),
        {
          type: 'tool_use',
          id: 'toolu_plan1',
          name: 'create_training_plan',
          input: {
            name: 'Coach full body',
            description: '3× per week, kracht en spiermassa.',
            make_active: true,
            days: [
              {
                name: 'Dag A',
                exercises: [
                  { exercise_id: 'squat', new_exercise: null, sets: 3, target: '6-8', rest_sec: 150 },
                  { exercise_id: 'bench-press', new_exercise: null, sets: 3, target: '6-8', rest_sec: 120 },
                ],
              },
              {
                name: 'Dag B',
                exercises: [
                  { exercise_id: 'deadlift', new_exercise: null, sets: 3, target: '5', rest_sec: 180 },
                  { exercise_id: null, new_exercise: { name: 'Farmer’s walk', muscle: 'Rug', kind: 'time' }, sets: 3, target: '40s', rest_sec: 90 },
                ],
              },
            ],
          },
        },
      ],
      'tool_use',
      m,
    );
  }
  return reply([thinking('plain'), { type: 'text', text: 'Prima, vraag gerust verder!' }], 'end_turn', m);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const jpg = path.join(__dirname, 'meal.jpg');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text().slice(0, 250)));
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  page.on('dialog', (d) => d.accept());

  await page.route('https://api.anthropic.com/**', async (route) => {
    const req = route.request();
    const headers = req.headers();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors() });
    if (req.url().includes('/v1/models')) {
      const ok = headers['x-api-key'] === VALID_KEY;
      return route.fulfill({
        status: ok ? 200 : 401,
        headers: cors(),
        contentType: 'application/json',
        body: JSON.stringify(ok ? { data: [{ id: 'claude-opus-5-5' }] } : { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
      });
    }
    const body = JSON.parse(req.postData());
    try {
      validateRequest(body, headers);
    } catch (e) {
      console.log('INVALID REQUEST:', e.message);
      return route.fulfill({ status: 400, headers: cors(), contentType: 'application/json', body: JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: e.message } }) });
    }
    requests.push(body);
    if (failNext > 0) {
      failNext--;
      return route.fulfill({ status: 529, headers: cors(), contentType: 'application/json', body: JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }) });
    }
    return route.fulfill({ status: 200, headers: cors(), contentType: 'application/json', body: JSON.stringify(respond(body)) });
  });
  function cors() {
    return { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' };
  }

  const v = (loc) => loc.filter({ visible: true }).first();
  const shot = async (name) => {
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `coach-${scheme}-${name}.png`) });
    console.log('shot', name);
  };

  // ── Entry point on Today ──
  await page.goto(BASE + '/weight');
  await v(page.getByLabel('Gewicht in kg')).waitFor({ timeout: 30000 });
  await v(page.getByLabel('Gewicht in kg')).fill('72,4');
  await v(page.getByText('Opslaan', { exact: true })).click();
  await page.goto(BASE);
  await v(page.getByText('Vraag je coach')).waitFor({ timeout: 30000 });
  await shot('01-today-card');
  await v(page.getByText('Vraag je coach')).click();
  await v(page.getByText('Koppel je Anthropic API-key')).waitFor();
  await shot('02-no-key');

  // ── API key: invalid, then valid ──
  await v(page.getByText('API-key instellen')).click();
  await v(page.getByLabel('API-key')).fill('fake-wrong-key');
  await v(page.getByText('Opslaan en testen')).click();
  await v(page.getByText(/API-key is ongeldig/)).waitFor();
  await v(page.getByLabel('API-key')).fill(VALID_KEY);
  await v(page.getByText('Opslaan en testen')).click();
  await v(page.getByText(/Key werkt/)).waitFor();
  assert.ok(!(await page.innerText('body')).includes(VALID_KEY), 'full key never shown');
  // Profile
  await v(page.getByLabel('Naam')).fill('Sam');
  await v(page.getByLabel('Over mij')).fill('175 cm, 80 kg. Rustige cut tot eind maart.\nTraining: 5x per week PPL + Upper/Lower.\nVoeding: 2600 kcal, 160-180 g eiwit.');
  await v(page.getByText('Profiel opslaan')).click();
  await v(page.getByText('Opgeslagen', { exact: true })).waitFor();
  await shot('03-settings');
  await v(page.getByText('Klaar', { exact: true })).click();
  await v(page.getByText('Hoi Sam! Waar kan ik mee helpen?')).waitFor();
  await v(page.getByText('Zet mijn voedingsdoelen goed volgens mijn profiel')).waitFor();
  await shot('03b-greeting');

  // ── Food via text ──
  await v(page.getByLabel('Bericht aan de coach')).fill('Ik had 2 boterhammen met pindakaas en een banaan als ontbijt');
  await v(page.getByLabel('Versturen')).click();
  await v(page.getByText(/Volkorenbrood, Pindakaas, Banaan → Ontbijt/)).waitFor({ timeout: 15000 });
  await v(page.getByText(/Gelogd! Je zit nu op 455 kcal/)).waitFor();

  // ── Data question ──
  await v(page.getByLabel('Bericht aan de coach')).fill('Hoe gaat mijn training deze week?');
  await v(page.getByLabel('Versturen')).click();
  await v(page.getByText('Overzicht bekeken')).waitFor({ timeout: 15000 });
  await v(page.getByText(/Je hebt in totaal \d+ trainingen gelogd/)).waitFor();
  await shot('04-chat');

  // ── Photo ──
  const chooser = page.waitForEvent('filechooser');
  await v(page.getByLabel('Foto kiezen')).click();
  await (await chooser).setFiles(jpg);
  await v(page.getByLabel('Foto verwijderen')).waitFor({ timeout: 15000 });
  await v(page.getByLabel('Bericht aan de coach')).fill('Mijn lunch');
  await shot('05-photo-pending');
  await v(page.getByLabel('Versturen')).click();
  await v(page.getByText(/Kipfilet, Witte rijst → Lunch/)).waitFor({ timeout: 15000 });

  // ── Plan ──
  await v(page.getByLabel('Bericht aan de coach')).fill('Maak een schema voor 3 keer per week');
  await v(page.getByLabel('Versturen')).click();
  await v(page.getByText(/Schema "Coach full body" aangemaakt/)).waitFor({ timeout: 15000 });
  await shot('06-plan');

  // ── Profile edited mid-conversation: running conversation keeps its snapshot ──
  await v(page.getByLabel('Coach-instellingen')).click();
  await v(page.getByLabel('Over mij')).fill('175 cm, 78 kg. Cut voorbij, nu onderhoud op 2900 kcal.');
  await v(page.getByText('Profiel opslaan')).click();
  await v(page.getByText('Klaar', { exact: true })).click();
  await v(page.getByText(/Je profiel is aangepast sinds dit gesprek begon/)).waitFor();

  // ── Overloaded: retries, then error card, then manual retry ──
  failNext = 3;
  await v(page.getByLabel('Bericht aan de coach')).fill('Dank je');
  await v(page.getByLabel('Versturen')).click();
  await v(page.getByText(/overbelast/)).waitFor({ timeout: 20000 });
  await shot('07-error');
  await v(page.getByText('Opnieuw proberen')).click();
  await v(page.getByText('Prima, vraag gerust verder!')).waitFor({ timeout: 15000 });

  // ── Request-level checks across the whole conversation ──
  const sys = new Set(requests.map((r) => JSON.stringify(r.system)));
  const tools = new Set(requests.map((r) => JSON.stringify(r.tools)));
  assert.strictEqual(sys.size, 1, 'system prompt byte-identical across requests');
  const firstSystem = requests[0].system;
  assert.ok(Array.isArray(firstSystem) && firstSystem.length === 2, 'static prompt + profile block');
  assert.ok(firstSystem[1].text.startsWith('<profiel>') && firstSystem[1].text.includes('Naam: Sam'), 'profile block');
  assert.ok(firstSystem[1].text.includes('Rustige cut'), 'original profile kept in running conversation');
  assert.strictEqual(tools.size, 1, 'tools byte-identical across requests');
  for (let i = 1; i < requests.length; i++) {
    const prev = requests[i - 1].messages.map((m) => JSON.stringify(m));
    const next = requests[i].messages.map((m) => JSON.stringify(m));
    assert.ok(next.length >= prev.length, `request ${i} not shorter`);
    for (let j = 0; j < prev.length; j++) assert.strictEqual(next[j], prev[j], `request ${i}: message ${j} unchanged (append-only)`);
  }
  const echoed = requests[requests.length - 1].messages.some(
    (m) => m.role === 'assistant' && m.content.some((b) => b.type === 'thinking' && b.signature.startsWith('sig_food')),
  );
  assert.ok(echoed, 'thinking block passed back unchanged');
  console.log(`requests: ${requests.length}, all valid; system/tools stable; history append-only; thinking echoed`);

  // ── Results visible in the app ──
  await v(page.getByText(/Volkorenbrood, Pindakaas, Banaan → Ontbijt/)).click(); // link to /food
  await v(page.getByText('Pindakaas')).waitFor();
  const foodText = await page.innerText('body');
  assert.ok(foodText.includes('Kipfilet') && foodText.includes('Witte rijst'), 'photo items in food log');
  await shot('08-food-after');
  await page.goto(BASE + '/plans');
  await v(page.getByText('Coach full body')).waitFor();
  const plansText = await page.innerText('body');
  assert.ok(/actief schema\s*\n\s*coach full body/i.test(plansText), 'coach plan is the active plan');

  // ── Persistence ──
  await page.goto(BASE + '/coach');
  await v(page.getByText(/Gelogd! Je zit nu op 455 kcal/)).waitFor({ timeout: 20000 });
  await v(page.getByLabel('Foto')).waitFor();
  await shot('09-reloaded');

  // ── New conversation ──
  await v(page.getByLabel('Nieuw gesprek')).click();
  await v(page.getByText('Hoi Sam! Waar kan ik mee helpen?')).waitFor();
  console.log('new conversation cleared');
  const before = requests.length;
  await v(page.getByLabel('Bericht aan de coach')).fill('Hallo');
  await v(page.getByLabel('Versturen')).click();
  await v(page.getByText('Prima, vraag gerust verder!')).waitFor({ timeout: 15000 });
  const newSystem = requests[before].system;
  assert.ok(newSystem[1].text.includes('nu onderhoud op 2900 kcal'), 'new conversation uses updated profile');
  console.log('new conversation uses updated profile');

  console.log('\nconsole errors/warnings:', errors.length);
  for (const e of [...new Set(errors)].slice(0, 20)) console.log('  ', e);
  await browser.close();
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
