import test from 'node:test';
import assert from 'node:assert/strict';
import { trimHistory } from '../scripts/rank-history.mjs';

const s = (d, a) => ({ d, pos: { a } });

test('keeps the last 12 months plus the snapshot just before them', () => {
  const h = [s('2025-06-01', 9), s('2025-10-01', 8), s('2026-01-10', 7), s('2026-11-20', 6)];
  assert.deepEqual(trimHistory(h, '2026-11-28').map(x => x.d), ['2025-10-01', '2026-01-10', '2026-11-20']);
});

test('drops repeated identical snapshots', () => {
  const h = [s('2026-03-01', 5), s('2026-04-01', 5), s('2026-05-01', 4)];
  assert.deepEqual(trimHistory(h, '2026-11-28').map(x => x.d), ['2026-03-01', '2026-05-01']);
});

test('keeps the latest snapshot when all are older than a year', () => {
  assert.deepEqual(trimHistory([s('2024-01-01', 3), s('2024-02-01', 2)], '2026-11-28').map(x => x.d), ['2024-02-01']);
});

test('tolerates a snapshot without a date', () => {
  assert.deepEqual(trimHistory([s(null, 3), s('2026-11-01', 2)], '2026-11-28').map(x => x.d), [null, '2026-11-01']);
});
