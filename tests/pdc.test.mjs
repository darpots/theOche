import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, normaliseTournament, flag, age, BROADCASTERS } from '../src/lib/pdc.mjs';
import { dateRange } from '../src/lib/format.mjs';

test('cleanName tidies PDC tournament names', () => {
  assert.deepEqual(cleanName('2026 ET14 - Swiss Darts Trophy'), { name: 'Swiss Darts Trophy', tag: 'European Tour 14' });
  assert.deepEqual(cleanName('2026 Premier League Night 3'), { name: 'Premier League', tag: 'Night 3' });
  assert.deepEqual(cleanName('2026/27 World Championship'), { name: 'World Championship', tag: null });
});

test('broadcaster map covers the core events', () => {
  for (const [type, b] of [[1, 'sky'], [3, 'sky'], [4, 'itv'], [14, 'pdctv'], [30, 'itv']]) assert.equal(BROADCASTERS[type], b);
});

test('normaliseTournament marks winners and hides placeholders', () => {
  const t = normaliseTournament({ data: { id: '1', attributes: { name: '2026 Grand Slam of Darts', startDate: '2026-11-14', endDate: '2026-11-22', type: { tournamentTypeID: '9' }, stages: [
    { roundNumber: 1, stage: { name: 'Final' }, fixtures: [{ fixtureID: 9, status: 'Result', startDate: '2026-11-22', startTime: '20:00:00', participant1Score: 16, participant2Score: 10, winnerParticipantID: '1',
      participant1: { participantID: '1', firstName: 'Luke', lastName: 'Littler' }, participant2: { participantID: '35295', firstName: 'Player 1', lastName: 'to be confirmed' } }] },
  ] } } });
  assert.equal(t.broadcaster, 'sky');
  const f = t.stages[0].fixtures[0];
  assert.equal(f.status, 'result');
  assert.equal(f.winner, '1');
  assert.equal(f.p2, null);
  assert.equal(f.time, '20:00');
});

test('helpers', () => {
  assert.equal(age('2007-01-21', new Date('2026-11-15')), 19);
  assert.ok(flag('NL').length > 0 && flag('GB-ENG').length > 0);
  assert.equal(dateRange('2026-12-11', '2027-01-03'), '11 Dec 2026 – 3 Jan 2027');
});
