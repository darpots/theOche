import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveRace, liveRaceWith, eventPrizes, eventsDropping, resetCandidates, acceptReset, expiringMap, pendingEvents } from '../src/lib/pdc.mjs';

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

test('rounds are ordered by name, not the feed\'s cupRound (UK Open numbering)', () => {
  // UK Open style: the last 160/128/96 are numbered 7, 8, 9 in the feed.
  const a = { name: '2030 UK Open', tournamentTypeID: '4', stages: [
    stage('Last 64', 6, 3000, []), stage('Last 96', 9, 2000, [fx('5', '6', '5')]),
    stage('Last 128', 8, 1250, [fx('6', '7', '6')]), stage('Last 160', 7, 0, [fx('7', '8', '7')]),
  ] };
  const p = eventPrizes(a);
  assert.equal(p.get('7').amount, 1250); // won the last 160, lost the last 128
  assert.equal(p.get('6').amount, 2000);
  assert.equal(p.get('5').amount, 3000); // won the last 96, guaranteed the last 64
});

test('Grand Slam groups of three pay by finishing place', () => {
  const g = (a, b, w, sa, sb) => ({ participant1: P(a, a), participant2: P(b, b), winnerParticipantID: w, participant1Score: sa, participant2Score: sb });
  const a = { name: '2030 Grand Slam of Darts', seasonID: 2030, tournamentTypeID: '9', stages: [
    stage('Last 16', 4, 20000, []),
    { stage: { name: 'Group A' }, cupRound: 0, compensationValue: '5000', fixtures: [g('1', '2', '1', 5, 2), g('2', '3', '2', 5, 4), g('1', '3', '1', 5, 1)] },
  ] };
  const p = eventPrizes(a);
  assert.equal(p.get('2').amount, 12500);
  assert.equal(p.get('3').amount, 5000);
});

test('European Tour from 2026: a seed losing their opening match earns no ranking money', () => {
  const mk = season => ({ name: `${season} ET1`, seasonID: season, tournamentTypeID: '14', stages: [
    stage('Last 32', 5, 3500, [fx('1', '9', '9')]), stage('First Round', 7, 2000, [fx('9', '8', '9'), fx('5', '6', '6')]),
  ] });
  const p26 = eventPrizes(mk(2026)), p25 = eventPrizes(mk(2025));
  assert.equal(p26.get('1').amount, 0); // seed, out in their first match
  assert.equal(p26.get('5').amount, 0); // listed first in the first round: a seed
  assert.equal(p26.get('8').amount, 2000); // qualifier: counts
  assert.equal(p25.get('1').amount, 3500); // the rule starts in 2026
});

test('eventsDropping takes off money 104 weeks old, from after the last event in the official list', () => {
  const T = (id, endDate) => ({ id, name: id, startDate: endDate, endDate, fixtureCount: 10 });
  const idx = [T('gs24', '2024-11-17'), T('pcf24', '2024-11-24'), T('pc34', '2026-11-05'), T('gs26', '2026-11-22'), T('old', '2024-11-01')];
  assert.deepEqual(eventsDropping(idx, [idx[3]], '2026-11-22').map(t => t.id), ['gs24', 'pcf24']);
  assert.deepEqual(eventsDropping(idx, [], '2026-11-22'), []);
});

test('ranking resets: candidates from the totals, confirmed by Tour Card years or strong evidence', () => {
  const official = [{ id: '1', money: 30000 }, { id: '2', money: 85000 }];
  const totals = new Map([['1', [{ endDate: '2025-05-01', amount: 50000 }, { endDate: '2026-05-01', amount: 30000 }]], ['2', [{ endDate: '2025-05-01', amount: 15000 }, { endDate: '2026-05-01', amount: 85000 }]]]);
  const c = resetCandidates(official, totals, ['2026-01-10']);
  assert.equal(c['1'].from, '2026-01-10');
  assert.ok(acceptReset(c['1'], [2026, 2025])); // £50k explained exactly
  assert.ok(!acceptReset(c['2'], [2026, 2025])); // only £15k, card held throughout
  assert.ok(acceptReset(c['2'], [2026])); // no card in 2025
  // Expiring money from before a reset is not taken off.
  const old = { name: 'Old', endDate: '2025-05-01', stages: [stage('Final', 1, 20000, [fx('1', '2', '2')])] };
  assert.equal(expiringMap([old], { 1: '2026-01-10' }).has('1'), false);
});

test('liveRaceWith adds finished events not yet in the official list, and orders ties like the PDC', () => {
  const official = [{ id: '1', pos: 1, name: 'A', money: 100 }, { id: '2', pos: 2, name: 'B', money: 90 }];
  const r = liveRaceWith(official, null, {}, { 2: { amount: 10, name: 'B' } });
  assert.deepEqual(r.map(p => [p.id, p.money, p.live]), [['2', 100, 1], ['1', 100, 2]]);
});

test('pendingEvents keeps finished events until the official list is republished', () => {
  const T = (id, d) => ({ id, name: id, startDate: d, endDate: d, fixtureCount: 127 });
  const idx = [T('pc33', '2026-11-04'), T('pc34', '2026-11-05'), T('later', '2026-11-20')];
  // Day one: PC33 under way.
  const d1 = pendingEvents(idx, [], { day: '2026-11-04', since: '2026-11-04', republished: false });
  assert.deepEqual(d1.map(t => t.id), ['pc33']);
  // Day two, list not republished: PC33 still counts, PC34 added.
  const d2 = pendingEvents(idx, ['pc33'], { day: '2026-11-05', since: '2026-11-04', republished: false });
  assert.deepEqual(d2.map(t => t.id), ['pc33', 'pc34']);
  // A run missed in between still picks up an event that started and finished.
  assert.deepEqual(pendingEvents(idx, [], { day: '2026-11-06', since: '2026-11-04', republished: false }).map(t => t.id), ['pc33', 'pc34']);
  // Republished on day two, mid-event: PC33 is in the official list now, PC34 stays.
  assert.deepEqual(pendingEvents(idx, ['pc33', 'pc34'], { day: '2026-11-05', since: '2026-11-05', republished: true }).map(t => t.id), ['pc34']);
  // Republished after both: nothing pending.
  assert.deepEqual(pendingEvents(idx, ['pc33', 'pc34'], { day: '2026-11-07', since: '2026-11-06', republished: true }).map(t => t.id), []);
});
