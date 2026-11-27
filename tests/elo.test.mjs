import test from 'node:test';
import assert from 'node:assert/strict';
import { computeElo, eloTable, isEloEvent, ELO } from '../src/lib/elo.mjs';

const ev = (id, rows) => ({ id, name: id, rows });
const m = (d, w, l, o = '1') => [d, o, w, l];

test('Elo: everyone starts on 1500; a win is a win; equal players swap half of K', () => {
  const { players } = computeElo([ev('e1', [m('2026-06-01', 'a', 'b')])], '2026-01-01');
  assert.equal(players.get('a').rating, 1500 + ELO.k / 2);
  assert.equal(players.get('b').rating, 1500 - ELO.k / 2);
  assert.deepEqual([players.get('a').won, players.get('a').lost, players.get('b').played], [1, 0, 1]);
});

test('Elo: beating a stronger player earns more than beating a weaker one', () => {
  // a is built up first, then c beats a and b beats d (a 1500 newcomer).
  const rows = [m('2026-02-01', 'a', 'x'), m('2026-02-02', 'a', 'y'), m('2026-02-03', 'a', 'z'), m('2026-03-01', 'c', 'a'), m('2026-03-01', 'b', 'd')];
  const { players } = computeElo([ev('e', rows)], '2026-01-01');
  assert.ok(players.get('c').rating - 1500 > players.get('b').rating - 1500);
});

test('Elo: matches before the window set the starting rating but not the record', () => {
  const { players } = computeElo([ev('old', [m('2025-06-01', 'a', 'b')]), ev('new', [m('2026-06-01', 'b', 'a')])], '2026-01-01');
  const a = players.get('a');
  assert.deepEqual([a.played, a.won, a.lost], [1, 0, 1]); // only the 2026 match counts in the record
  assert.ok(a.rating > 1500 - ELO.k / 2); // but a started the window above 1500
});

test('Elo table: 20 matches to be listed, best first, movement since the latest event began', () => {
  const rows = [];
  for (let i = 0; i < 20; i++) { rows.push(m('2026-03-01', 'a', 'b', String(i).padStart(3, '0'))); }
  const late = [m('2026-04-01', 'b', 'a', '1'), m('2026-04-01', 'b', 'a', '2'), m('2026-04-01', 'c', 'a', '3')];
  const table = eloTable(computeElo([ev('e1', rows), ev('e2', late)], '2026-01-01'));
  assert.deepEqual(table.map(p => p.id), ['a', 'b']); // c has 1 match: not listed
  assert.equal(table[0].pos, 1);
  assert.equal(table[0].last.id, 'e2');
  assert.ok(table[0].last.delta < 0);
});

test('Elo events: the majors, floor Players Championships, Euro Tour, World Series and Premier League; not qualifiers, the World Cup or other tours', () => {
  const t = (type, name) => ({ tournamentTypeID: type, name });
  assert.ok(isEloEvent(t(29, '2026 Players Championship 12')));
  assert.ok(isEloEvent(t(30, '2026 Players Championship Finals')));
  assert.ok(isEloEvent(t(14, '2026 ET5 - Austrian Darts Open')));
  assert.ok(isEloEvent(t(3, '2026 Premier League Night 4')));
  assert.ok(isEloEvent(t(18, '2026 Nordic Darts Masters')));
  assert.ok(isEloEvent(t(1, '2026 World Championship')));
  assert.ok(!isEloEvent(t(13, '2026 Euro Tour 1 Host Nation Qualifier')));
  assert.ok(!isEloEvent(t(17, '2026 World Cup of Darts')));
  assert.ok(!isEloEvent(t(32, '2026 Winmau Challenge Tour 1')));
  assert.ok(!isEloEvent(t(86, '2026 Winmau Development Tour 1')));
});
