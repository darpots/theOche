// Builds src/data/rankings.json from the PDC World Rankings (Order of Merit).
// Keeps the previous distinct ranking list so the page can show movement.
import { API, normaliseRankings } from '../src/lib/pdc.mjs';
import { get, readJson, writeJsonIfChanged, log } from './lib.mjs';

const OUT = new URL('../src/data/rankings.json', import.meta.url).pathname;

const players = normaliseRankings(await get(`${API.rankings}2YEAR?page.size=500`));
if (players.length < 128) throw new Error(`Rankings incomplete (${players.length})`);

const prev = await readJson(OUT, null);
const order = list => list.map(p => `${p.id}:${p.pos}`).join(',');
let previous = prev?.previous ?? null;
let changedAt = prev?.changedAt ?? new Date().toISOString();
if (prev?.players && order(prev.players) !== order(players)) {
  // Rankings moved: the old list becomes the baseline for movement arrows.
  previous = Object.fromEntries(prev.players.map(p => [p.id, p.pos]));
  changedAt = new Date().toISOString();
}

// Rank history for sparklines: one snapshot each time the official order
// changes (after each ranking event), positions for the top 150, last 26 kept.
let history = prev?.history ?? [];
const snap = Object.fromEntries(players.filter(p => p.pos <= 150).map(p => [p.id, p.pos]));
if (!history.length || order(players) !== (prev?.players ? order(prev.players) : '')) {
  if (!history.length && prev?.previous) history.push({ d: prev.changedAt?.slice(0, 10) ?? null, pos: prev.previous });
  if (!history.length || JSON.stringify(history[history.length - 1].pos) !== JSON.stringify(snap)) history.push({ d: new Date().toISOString().slice(0, 10), pos: snap });
}
history = history.slice(-26);

const changed = await writeJsonIfChanged(OUT, { changedAt, players, previous, history });
log(`rankings: ${players.length} players (${changed ? 'updated' : 'unchanged'})`);
