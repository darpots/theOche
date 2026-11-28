import test from 'node:test';
import assert from 'node:assert/strict';
import { nextTileLabel } from '../src/lib/next-label.mjs';

const at = (time, date = '2026-11-28') => ({ date, time });

test('"Next up" while a match is on, or with no feature', () => {
  assert.match(nextTileLabel(at('13:30'), { f: at('13:15'), mode: 'now' }), /^Next up · 1:30pm/);
  assert.match(nextTileLabel(at('13:30'), null), /^Next up · 1:30pm/);
  assert.match(nextTileLabel(at('13:30'), { f: at('12:00'), mode: 'result' }), /^Next up · 1:30pm/);
});

test('"Also at" for another board at the same time as the feature', () => {
  assert.match(nextTileLabel(at('13:30'), { f: at('13:30'), mode: 'next' }), /^Also at 1:30pm/);
});

test('"After that" for a later match than the feature', () => {
  assert.match(nextTileLabel(at('13:45'), { f: at('13:30'), mode: 'next' }), /^After that · 1:45pm/);
  assert.match(nextTileLabel(at('13:30', '2026-11-29'), { f: at('13:30'), mode: 'next' }), /^After that · 1:30pm/);
});

test('no time: "After that · TBC", never "Also at"', () => {
  assert.equal(nextTileLabel({ date: '2026-11-28' }, { f: { date: '2026-11-28' }, mode: 'next' }), 'After that · TBC');
});
