import test from 'node:test';
import assert from 'node:assert/strict';
import { isRedrawn, drawNotes, bracketColumns, projectSlots } from '../src/lib/redraw.mjs';

const P = id => ({ id: String(id) });
const fx = (a, b, status = 'result') => ({ id: `${a}-${b}`, p1: a ? P(a) : null, p2: b ? P(b) : null, status });
// Round 1: 1v2, 3v4, 5v6, 7v8 (winners 1, 3, 5, 7).
const r1 = { name: 'Last 8', fixtures: [fx(1, 2), fx(3, 4), fx(5, 6), fx(7, 8)] };
const tbd = n => Array.from({ length: n }, () => fx(null, null, 'upcoming'));

test('a fixed bracket is not redrawn', () => {
  const t = { stages: [r1, { name: 'Semi-Final', fixtures: [fx(1, 3, 'upcoming'), fx(5, 7, 'upcoming')] }, { name: 'Final', fixtures: tbd(1) }] };
  assert.equal(isRedrawn(t), false);
  assert.equal(drawNotes(t).size, 0);
});

test('players from non-neighbouring matches meeting means a redraw', () => {
  const t = { stages: [r1, { name: 'Semi-Final', fixtures: [fx(1, 7, 'upcoming'), fx(3, 5, 'upcoming')] }, { name: 'Final', fixtures: tbd(1) }] };
  assert.equal(isRedrawn(t), true);
});

test('nothing to tell until a later round has its players', () => {
  const t = { stages: [r1, { name: 'Semi-Final', fixtures: tbd(2) }] };
  assert.equal(isRedrawn(t), false);
});

test('a player entering later (a seed with a bye) is ignored', () => {
  const t = { stages: [r1, { name: 'Last 6', fixtures: [fx(1, 99, 'upcoming'), fx(3, 98, 'upcoming'), fx(5, 7, 'upcoming')] }] };
  assert.equal(isRedrawn(t), false);
});

test('notes say when each round is drawn', () => {
  const L64 = { name: 'Last 64', fixtures: Array.from({ length: 8 }, (_, i) => fx(i * 2 + 1, i * 2 + 2)) };
  const L32 = { name: 'Last 32', fixtures: [fx(1, 15), fx(3, 13), fx(5, 11), { ...fx(7, 9), status: 'upcoming' }] };
  const t = { stages: [L64, L32, { name: 'Quarter-Final', fixtures: tbd(2) }, { name: 'Final', fixtures: tbd(1) }] };
  const n = drawNotes(t);
  assert.equal(n.get('Last 32'), 'Draw to come'); // the round before is finished
  assert.equal(n.get('Quarter-Final'), 'Drawn after the Last 32');
  assert.equal(n.get('Final'), 'Semi-final winners');
});

test('a fixed bracket listed in order of play (not bracket order) is not redrawn', () => {
  // Match numbers give the bracket; the feed lists the first round by start time.
  const m = (id, a, b, status = 'result') => ({ ...fx(a, b, status), id: String(id) });
  const first = { name: 'Last 8', fixtures: [m(103, 5, 6), m(101, 1, 2), m(104, 7, 8), m(102, 3, 4)] };
  const t = { stages: [first, { name: 'Semi-Final', fixtures: [m(202, 5, 7, 'upcoming'), m(201, 1, 3, 'upcoming')] }] };
  assert.equal(isRedrawn(t), false);
});

test('a partly drawn round stays in bracket order', () => {
  const m = (id, a, b, status = 'result') => ({ ...fx(a, b, status), id: String(id) });
  const first = { name: 'Last 8', fixtures: [m(103, 5, 6), m(101, 1, 2), m(104, 7, 8), m(102, 3, 4)] };
  // Only the second semi-final is known so far (5 v 7); it must stay second.
  const semis = { name: 'Semi-Final', fixtures: [m(202, 5, 7, 'upcoming'), m(201, null, null, 'upcoming')] };
  const cols = bracketColumns([first, semis]);
  assert.deepEqual(cols[0].map(f => f.id), ['101', '102', '103', '104']);
  assert.deepEqual(cols[1].map(f => f.id), ['201', '202']);
});

test('empty slots in a fixed bracket show who can fill them', () => {
  const m = (id, a, b, status = 'result', winner) => ({ ...fx(a, b, status), id: String(id), winner: winner && String(winner) });
  // Listed in order of play; match numbers give the bracket (101+102 feed 201, 103+104 feed 202).
  const first = { name: 'Last 8', fixtures: [m(103, 5, 6, 'live'), m(101, 1, 2, 'result', 2), m(104, 7, 8, 'upcoming'), m(102, 3, 4, 'result', 3)] };
  const semis = { name: 'Semi-Final', fixtures: [m(201, null, null, 'upcoming'), m(202, null, 8, 'upcoming')] };
  const slots = projectSlots({ stages: [first, semis] });
  // 201: both feeders finished -> the two winners.
  assert.deepEqual(slots.get('201').map(x => x.player.id), ['2', '3']);
  // 202: player 8 is already placed (from 104), so the empty side is 103's winner: 5 or 6.
  const s202 = slots.get('202');
  assert.equal(s202[1], null);
  assert.deepEqual(s202[0].either.map(p => p.id), ['5', '6']);
  assert.equal(s202[0].round, 'Last 8');
});

test('no slot guesses for redrawn events', () => {
  const t = { stages: [r1, { name: 'Semi-Final', fixtures: [fx(1, 7, 'upcoming'), fx(null, null, 'upcoming')] }] };
  assert.equal(projectSlots(t).size, 0);
});
