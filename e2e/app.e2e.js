// End-to-end walkthrough of Fitlog on the web build (phone viewport).
const { chromium } = require('playwright');
const path = require('path');

const OUT = path.join(__dirname, 'screenshots');
const BASE = 'http://localhost:8081';
const scheme = process.argv[2] || 'light';

(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  page.on('dialog', (d) => d.accept());

  const shot = async (name) => {
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `${scheme}-${name}.png`) });
    console.log('shot', name);
  };
  const click = async (locator) => {
    await locator.first().waitFor({ state: 'visible', timeout: 8000 });
    await locator.first().click();
  };

  await page.goto(BASE);
  await page.getByText('Volgende training').filter({ visible: true }).first().waitFor({ timeout: 30000 });
  await shot('01-today');
  // The default plan is now PPL + Upper/Lower; this walkthrough uses Full body.
  await page.goto(BASE + '/plans');
  await click(page.getByText('Full body', { exact: true }).filter({ visible: true }));
  await click(page.getByText('Maak actief').filter({ visible: true }));
  await page.goto(BASE);
  await page.getByText('Start Dag A').filter({ visible: true }).first().waitFor({ timeout: 30000 });

  // ── Start the next plan day ──
  await click(page.getByText('Start Dag A').filter({ visible: true }));
  await page.getByText('Squat (barbell)').filter({ visible: true }).first().waitFor();
  await shot('02-workout-start');

  // Squat: fill set 1 and tick it
  await page.getByLabel('kg set 1').filter({ visible: true }).first().fill('60');
  await page.getByLabel('reps set 1').filter({ visible: true }).first().fill('8');
  await click(page.getByLabel('Set 1 afvinken').filter({ visible: true }));
  await page.getByText('Rust', { exact: true }).filter({ visible: true }).first().waitFor();
  await shot('03-rest-timer');
  await click(page.getByText('+15').filter({ visible: true }));

  // Set 2: weight only → reps auto-filled from target (5) on tick
  await page.getByLabel('kg set 2').filter({ visible: true }).first().fill('62,5');
  await click(page.getByLabel('Set 2 afvinken').filter({ visible: true }));
  await click(page.getByText('Skip').filter({ visible: true }));

  // Bench press set 1
  await page.getByLabel('kg set 1').filter({ visible: true }).nth(1).fill('50');
  await page.getByLabel('reps set 1').filter({ visible: true }).nth(1).fill('10');
  await page.getByLabel('Set 1 afvinken').filter({ visible: true }).nth(1).click();
  await click(page.getByText('Skip').filter({ visible: true }));

  // Plank (time) set 1 — auto-fills 45 s from target
  const plankCheck = page.getByLabel('Set 1 afvinken').filter({ visible: true }).nth(4);
  await plankCheck.scrollIntoViewIfNeeded();
  await plankCheck.click();
  await click(page.getByText('Skip').filter({ visible: true }));

  // Add an exercise via the picker
  await click(page.getByText('Oefening toevoegen').filter({ visible: true }));
  await page.getByPlaceholder('Zoek oefening…').filter({ visible: true }).fill('hammer');
  await click(page.getByText('Hammer curl').filter({ visible: true }));
  await shot('04-picker');
  await click(page.getByText(/^Voeg 1 oefening toe$/).filter({ visible: true }));
  await page.getByText('Hammer curl').filter({ visible: true }).first().waitFor();
  const hammerKg = page.getByLabel('kg set 1').filter({ visible: true }).last();
  await hammerKg.scrollIntoViewIfNeeded();
  await hammerKg.fill('14');
  await page.getByLabel('reps set 1').filter({ visible: true }).last().fill('12');
  await page.getByLabel('Set 1 afvinken').filter({ visible: true }).last().click();
  await click(page.getByText('Skip').filter({ visible: true }));
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('05-workout-progress');

  // Finish
  await click(page.getByText('Afronden').filter({ visible: true }));
  await page.getByText('Goed gedaan!').filter({ visible: true }).first().waitFor();
  await shot('06-finished');
  await click(page.getByText('Klaar', { exact: true }).filter({ visible: true }));

  // ── Today now shows the training ──
  await page.getByText('Deze week').filter({ visible: true }).first().waitFor();
  await shot('07-today-after');

  // ── Repeat a second workout to create a PR on squat ──
  await click(page.getByText('Trainen', { exact: true }).filter({ visible: true }).last());
  await page.getByText('Oefeningen & records').filter({ visible: true }).first().waitFor();
  await shot('08-train-tab');
  await click(page.getByText('Lege training').filter({ visible: true }));
  await click(page.getByText('Oefening toevoegen').filter({ visible: true }));
  await page.getByPlaceholder('Zoek oefening…').filter({ visible: true }).fill('squat (barbell)');
  await click(page.getByText('Squat (barbell)').filter({ visible: true }));
  await click(page.getByText(/^Voeg 1 oefening toe$/).filter({ visible: true }));
  // Previous values show as placeholders
  await page.getByLabel('kg set 1').filter({ visible: true }).first().fill('70');
  await page.getByLabel('reps set 1').filter({ visible: true }).first().fill('6');
  await click(page.getByLabel('Set 1 afvinken').filter({ visible: true }));
  await click(page.getByText('Skip').filter({ visible: true }));
  await click(page.getByText('Afronden').filter({ visible: true }));
  await page.getByText('Goed gedaan!').filter({ visible: true }).first().waitFor();
  await page.getByText('Record').filter({ visible: true }).first().waitFor();
  await shot('09-record');
  await click(page.getByText('Klaar', { exact: true }).filter({ visible: true }));

  // Exercise progress
  await click(page.getByText('Trainen', { exact: true }).filter({ visible: true }).last());
  await click(page.getByText('Oefeningen & records').filter({ visible: true }));
  await page.getByPlaceholder('Zoek oefening…').filter({ visible: true }).fill('squat (barbell)');
  await click(page.getByText('Squat (barbell)').filter({ visible: true }));
  await page.getByText('Geschiedenis').filter({ visible: true }).first().waitFor();
  await shot('10-exercise-progress');
  await page.goBack();
  await page.goBack();

  // ── Nutrition ──
  await click(page.getByText('Voeding', { exact: true }).filter({ visible: true }).last());
  await page.getByText('Ontbijt').filter({ visible: true }).first().waitFor();
  await click(page.getByLabel('Toevoegen aan Ontbijt').filter({ visible: true }));
  await page.getByPlaceholder('Zoek product, bijv. kwark').filter({ visible: true }).fill('kwark');
  await click(page.getByText('Magere kwark').filter({ visible: true }));
  await shot('11-food-select');
  await click(page.getByText('Voeg toe aan Ontbijt').filter({ visible: true }));
  await page.getByText(/Toegevoegd: Magere kwark/).filter({ visible: true }).first().waitFor();
  await page.getByPlaceholder('Zoek product, bijv. kwark').filter({ visible: true }).fill('havermout');
  await click(page.getByText('Havermout').filter({ visible: true }));
  await click(page.getByText('Voeg toe aan Ontbijt').filter({ visible: true }));
  // Quick add
  await click(page.getByText('Snel invoeren').filter({ visible: true }));
  await page.getByPlaceholder('Bijv. Eiwitshake').filter({ visible: true }).fill('Eiwitshake');
  await page.getByLabel('Eiwit (g)').filter({ visible: true }).fill('30');
  await page.getByLabel('Koolh. (g)').filter({ visible: true }).fill('5');
  await page.getByLabel('Vet (g)').filter({ visible: true }).fill('2');
  await shot('12-quick-add');
  await click(page.getByText('Toevoegen', { exact: true }).filter({ visible: true }));
  await click(page.getByText('Klaar', { exact: true }).filter({ visible: true }));
  await page.getByText('Ontbijt').filter({ visible: true }).first().waitFor();
  await click(page.getByLabel('3 glazen water').filter({ visible: true }));
  await shot('13-food-day');

  // ── Goals calculator ──
  await click(page.getByLabel('Doelen').filter({ visible: true }));
  await click(page.getByText('Bereken doelen').filter({ visible: true }));
  await shot('14-goals');
  await click(page.getByText('Bewaar doelen').filter({ visible: true }));

  // ── Weight ──
  await click(page.getByText('Vandaag', { exact: true }).filter({ visible: true }).last());
  await click(page.getByText('Weging').filter({ visible: true }));
  await page.getByLabel('Gewicht in kg').filter({ visible: true }).fill('82,4');
  await click(page.getByText('Opslaan').filter({ visible: true }));
  await page.getByText('82,4').filter({ visible: true }).first().waitFor();

  // ── Plans ──
  // Schema's live under Trainen now.
  await click(page.getByText('Trainen', { exact: true }).filter({ visible: true }).last());
  await click(page.getByText('Schema’s', { exact: true }).filter({ visible: true }));
  await page.getByText('Actief schema').filter({ visible: true }).first().waitFor();
  await shot('15-plans');
  await click(page.getByText('Push / Pull / Legs').filter({ visible: true }));
  await page.getByText('Maak actief').filter({ visible: true }).first().waitFor();
  await click(page.getByText('Bewerk').filter({ visible: true }));
  await shot('16-plan-edit');
  await click(page.getByText('Klaar', { exact: true }).filter({ visible: true }));
  await click(page.getByText('Maak actief').filter({ visible: true }));
  await page.goBack();

  // ── Persistence after reload ──
  await page.goto(BASE);
  await page.getByText('Volgende training').filter({ visible: true }).first().waitFor({ timeout: 30000 });
  const text = await page.innerText('body');
  // After training today, Vandaag shows "Training gedaan"; the active plan is on Trainen.
  await page.goto(BASE + '/train');
  await page.getByText('Nieuwe training').filter({ visible: true }).first().waitFor({ timeout: 30000 });
  const trainText = await page.innerText('body');
  const checks = {
    'training done card on Vandaag': /training gedaan/i.test(text),
    'active plan switched to PPL': trainText.includes('Push / Pull / Legs'),
    'weight persisted': text.includes('82,4'),
    'trained this week': /\d training(en)? deze week/.test(text),
  };
  console.log('persistence', checks);
  await shot('17-today-final');

  console.log('\nconsole errors/warnings:', errors.length);
  for (const e of [...new Set(errors)].slice(0, 30)) console.log('  ', e.slice(0, 300));
  await browser.close();
  if (Object.values(checks).some((v) => !v)) process.exit(1);
})().catch(async (e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
