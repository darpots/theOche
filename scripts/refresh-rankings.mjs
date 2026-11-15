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

const changed = await writeJsonIfChanged(OUT, { changedAt, players, previous });
log(`rankings: ${players.length} players (${changed ? 'updated' : 'unchanged'})`);
