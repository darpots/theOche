import test from 'node:test';
import assert from 'node:assert/strict';
import { winChance, winPercents } from '../src/lib/win-chance.mjs';

test('level ratings are a coin toss', () => {
  assert.equal(winChance(1600, 1600), 0.5);
  assert.deepEqual(winPercents(1600, 1600), [50, 50]);
});

test('a 450-point gap is 10 to 1', () => {
  assert.ok(Math.abs(winChance(1950, 1500) - 10 / 11) < 1e-9);
});

test('the two sides add up to 100 and favour the higher rating', () => {
  const [a, b] = winPercents(1712, 1650);
  assert.equal(a + b, 100);
  assert.ok(a > b);
  assert.deepEqual(winPercents(1650, 1712), [b, a]);
});

import { race, legChance, formatChance } from '../src/lib/win-chance.mjs';

test('race: even points are even, first to 1 is the point itself', () => {
  assert.ok(Math.abs(race(0.5, 6) - 0.5) < 1e-12);
  assert.ok(Math.abs(race(0.6, 1) - 0.6) < 1e-12);
});

test('leg chance turns back into the same first-to-6 chance', () => {
  for (const p of [0.3, 0.5, 0.62, 0.8]) assert.ok(Math.abs(race(legChance(p), 6) - p) < 1e-9);
});

test('longer matches favour the favourite; first to 6 is unchanged', () => {
  const p = 0.7;
  assert.ok(Math.abs(formatChance(p, { sets: false, bestOf: 11 }) - p) < 1e-9);
  const ft10 = formatChance(p, { sets: false, bestOf: 19 });
  const ft4 = formatChance(p, { sets: false, bestOf: 7 });
  assert.ok(ft10 > p && ft4 < p);
  // sets: first to 4 sets of first to 3 legs is longer still
  assert.ok(formatChance(p, { sets: true, bestOf: 7, legsPerSet: 5 }) > ft10);
  // the underdog side mirrors it
  assert.ok(Math.abs(formatChance(1 - p, { sets: false, bestOf: 19 }) - (1 - ft10)) < 1e-9);
});

test('no format keeps the Elo chance', () => {
  assert.equal(formatChance(0.64, null), 0.64);
});
