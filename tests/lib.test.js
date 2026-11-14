// Unit tests for pure logic in src/lib. Run with `npm run test:unit`.
const assert = require('node:assert');
const { test } = require('node:test');

const { formatTime, hoursLabel, minutesBetween, normalizeTime, parseTime } = require('@/lib/time');
const { platesPerSide, warmupSets } = require('@/lib/plates');
const { progressionHint, repRange } = require('@/lib/workout-stats');
const { cleanBarcode, isValidBarcode } = require('@/lib/barcode');

test('clock times', () => {
  assert.strictEqual(parseTime('22:15'), 1335);
  assert.strictEqual(parseTime('2215'), 1335);
  assert.strictEqual(parseTime('22u15'), 1335);
  assert.strictEqual(parseTime('7'), 420);
  assert.strictEqual(parseTime('25:00'), null);
  assert.strictEqual(normalizeTime('6.45'), '06:45');
  assert.strictEqual(formatTime(-15), '23:45');
  assert.strictEqual(minutesBetween('22:15', '06:45'), 510, 'across midnight');
  assert.strictEqual(hoursLabel(510), '8 u 30');
  assert.strictEqual(hoursLabel(480), '8 u');
});

test('plates per side and warm-up ramp', () => {
  assert.deepStrictEqual(platesPerSide(100, 20), { plates: [25, 15], rest: 0 });
  assert.deepStrictEqual(platesPerSide(61, 20), { plates: [20], rest: 1 }, 'what cannot be made is reported');
  assert.strictEqual(platesPerSide(15, 20), null, 'lighter than the bar');
  assert.deepStrictEqual(warmupSets(100, 20), [
    { kg: 20, reps: 10 },
    { kg: 50, reps: 5 },
    { kg: 70, reps: 3 },
    { kg: 85, reps: 1 },
  ]);
  assert.deepStrictEqual(warmupSets(20, 20), [], 'no warm-up for the empty bar');
});

test('double progression', () => {
  const set = (weight, reps) => ({ id: 'x', weight, reps, duration: null, distance: null, done: true });
  assert.deepStrictEqual(repRange('6-10'), [6, 10]);
  assert.strictEqual(repRange('45s'), null);
  assert.match(progressionHint([set(60, 10), set(60, 10)], '6-10', 'weight'), /ga naar 62,5 kg/);
  assert.match(progressionHint([set(60, 9), set(60, 8)], '6-10', 'weight'), /Blijf op 60 kg/);
  assert.match(progressionHint([set(60, 5)], '6-10', 'weight'), /onder de 6 reps/);
  assert.strictEqual(progressionHint([set(60, 10)], '45s', 'time'), null);
});

test('barcode check digit', () => {
  assert.strictEqual(cleanBarcode('5 412345-678908'), '5412345678908');
  assert.ok(isValidBarcode('5412345678908'));
  assert.ok(!isValidBarcode('5412345678909'));
  assert.ok(!isValidBarcode('12345'));
});
