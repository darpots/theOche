import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveRace, eventPrizes } from '../src/lib/pdc.mjs';

const P = (id, n) => ({ participantID: id, firstName: n, lastName: 'X' });
const stage = (name, cupRound, comp, fixtures) => ({ stage: { name }, cupRound, compensationValue: String(comp), fixtures });
const fx = (a, b, w) => ({ participant1: P(a, a), participant2: P(b, b), winnerParticipantID: w });

test('eventPrizes credits losers by round and estimates the winner', () => {
  const a = { name: '2030 Test Open', tournamentTypeID: '7', stages: [
    stage('Final', 1, 60000, [fx('1', '2', '1')]),
    stage('Semi-Final', 2, 30000, [fx('1', '3', '1'), fx('2', '4', '2')]),
  ] };
  const p = eventPrizes(a);
  assert.equal(p.get('1').amount, 120000); // 2x runner-up when not in the table
  assert.equal(p.get('2').amount, 60000);
  assert.equal(p.get('3').amount, 30000);
});

test('players still in an event are guaranteed the next round once they win', () => {
  const a = { name: 'Live', stages: [stage('Final', 1, 50000, []), stage('Semi-Final', 2, 25000, [fx('1', '2', '1'), fx('3', '4', null)])] };
  const p = eventPrizes(a);
  assert.equal(p.get('1').amount, 50000);
  assert.equal(p.get('3').amount, 25000);
});

test('liveRace swaps expiring money for money earned and re-ranks', () => {
  const official = [{ id: '1', pos: 1, name: 'A', money: 100000 }, { id: '2', pos: 2, name: 'B', money: 90000 }];
  const prev = { name: 'Old', stages: [stage('Final', 1, 20000, [fx('1', '9', '9')])] };
  const cur = { name: 'New', stages: [stage('Semi-Final', 2, 5000, [fx('2', '8', null)])] };
  const r = liveRace(official, cur, prev);
  assert.deepEqual(r.map(p => [p.id, p.money, p.live, p.move]), [['2', 95000, 1, 1], ['1', 80000, 2, -1], ['8', 5000, 3, null]]);
});
