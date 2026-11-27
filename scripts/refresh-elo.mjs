// Elo ratings over the last 12 months (src/lib/elo.mjs has the rules).
//
// Every counting event's results are kept in src/data/elo-results.json, so each
// run only re-reads events that are being played or finished in the last few
// days (results can be corrected after the event). Writes src/data/elo.json,
// the table the rankings page shows. Runs with the hourly data job, so the
// ratings move during tournaments, floor events included.
import { API } from '../src/lib/pdc.mjs';
import { isEloEvent, eventMatches, computeElo, eloTable, ELO, ELO_TYPES } from '../src/lib/elo.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { get, getAll, readJson, writeJsonIfChanged, pool, today, log } from './lib.mjs';

const CACHE = new URL('../src/data/elo-results.json', import.meta.url).pathname;
const OUT = new URL('../src/data/elo.json', import.meta.url).pathname;

const day = today();
const minus = (d, n) => new Date(Date.parse(d) - n * 864e5).toISOString().slice(0, 10);
const from = minus(day, 365); // the 12 months shown
const seedFrom = minus(day, 730); // the 12 months before: starting ratings only

const y = Number(day.slice(0, 4));
const index = (await Promise.all([y - 2, y - 1, y].map(s => getAll(API.tournaments, { seasonID: s }, 500))))
  .flat().map(d => ({ id: String(d.id), ...d.attributes }))
  .filter(t => isEloEvent(t) && t.endDate >= seedFrom && t.startDate <= day && t.fixtureCount > 0);

const cache = await readJson(CACHE, { events: {}, players: {} });
// Finished more than three days ago and already read: kept as it is.
const settled = id => cache.events[id]?.done;
const toRead = index.filter(t => !settled(t.id));
let failed = 0;
await pool(toRead, 4, async t => {
  try {
    const { rows, players } = eventMatches(await get(API.tournaments + t.id));
    cache.events[t.id] = { name: t.name, type: String(t.tournamentTypeID ?? t.type?.tournamentTypeID ?? ''), start: t.startDate, end: t.endDate, done: t.endDate < minus(day, 3), rows };
    Object.assign(cache.players, players);
  } catch (e) { failed++; log(`elo: ${t.name} not read (${e.message})`); }
});
// Events older than the two years are no longer needed.
for (const [id, e] of Object.entries(cache.events)) if (e.end < seedFrom) delete cache.events[id];
// Written compactly (a row per match would be a line each), and only when it changed.
const cacheJson = JSON.stringify(cache);
if (await readFile(CACHE, 'utf8').catch(() => '') !== cacheJson + '\n') await writeFile(CACHE, cacheJson + '\n');

const events = Object.entries(cache.events).map(([id, e]) => ({ id, name: e.name, rows: e.rows }));
const result = computeElo(events, from);
const table = eloTable(result);
const name = id => cache.events[id]?.name.replace(/^\d{4}(\/\d{2})?\s+/, '') || '';
const inWindow = events.reduce((n, e) => n + e.rows.filter(r => r[0] >= from).length, 0);

const changed = await writeJsonIfChanged(OUT, {
  updatedAt: new Date().toISOString(),
  from, to: day,
  rules: { ...ELO, types: [...new Set(Object.values(ELO_TYPES))] },
  matches: inWindow,
  events: events.filter(e => e.rows.some(r => r[0] >= from)).length,
  latest: result.latest ? name(result.latest) : null,
  players: table.map(p => ({
    id: p.id, name: cache.players[p.id]?.[0] || p.id, country: cache.players[p.id]?.[1] || null,
    pos: p.pos, move: p.move, rating: Math.round(p.rating), played: p.played, won: p.won, lost: p.lost,
    last: p.last ? { name: name(p.last.id), delta: Math.round(p.last.delta) } : null,
  })),
}, { stamp: 'updatedAt' });

log(`elo: ${table.length} players with ${ELO.minMatches}+ matches, ${inWindow} matches in ${from}..${day} (${toRead.length} events read${failed ? `, ${failed} failed` : ''}; ${changed ? 'updated' : 'unchanged'})`);
if (table[0]) log(`elo: top ${table.slice(0, 5).map(p => `${cache.players[p.id]?.[0]} ${Math.round(p.rating)}`).join(', ')}`);
