// Builds the ranking ledger: every player's counting prize money, event by
// event, with the date each amount comes off (104 weeks after the event ends).
// Writes src/data/ranking-ledger.json (used by the live race) and
// src/data/ranking-ledger.csv (the same, one row per prize, for reading).
//
// Source: the PDPA's Order of Merit breakdowns (pdpa.co.uk/ranking-tables),
// which list only money that counts. Each row is matched to a PDC event for its
// dates, and a player's rows are accepted (verified) only when they add up to
// the player's official PDC total. The PDPA can lag the PDC after an event, so
// the job runs hourly and rebuilds until everyone is verified again; when the
// ledger is already verified against the current official list it does nothing.
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { API, normaliseRankings, isRankedEvent, eventPrizes, parsePdpaRankings, buildLedger } from '../src/lib/pdc.mjs';
import { get, getAll, readJson, writeJsonIfChanged, pool, today, log } from './lib.mjs';

const OUT = new URL('../src/data/ranking-ledger.json', import.meta.url).pathname;
const CSV = new URL('../src/data/ranking-ledger.csv', import.meta.url).pathname;
const PDPA = 'https://pdpa.co.uk/ranking-tables/';

const prev = await readJson(OUT, null);
const official = normaliseRankings(await get(`${API.rankings}2YEAR?page.size=500`));
if (official.length < 128) throw new Error(`Rankings incomplete (${official.length})`);
const sig = createHash('sha1').update(official.map(p => `${p.id}:${p.money}`).join(',')).digest('hex').slice(0, 16);

if (prev?.officialSig === sig && prev.verified === prev.players && !prev.unmatched?.length) {
  log(`ranking ledger: unchanged (${prev.verified}/${prev.players} players verified)`);
  process.exit(0);
}

const pdpa = parsePdpaRankings(await get(PDPA, { as: 'text' }));
if (pdpa.length < 128) throw new Error(`PDPA rankings incomplete (${pdpa.length})`);

const y = Number(today().slice(0, 4));
const events = (await Promise.all([y - 3, y - 2, y - 1, y].map(s => getAll(API.tournaments, { seasonID: s }, 500))))
  .flat().map(d => ({ id: d.id, ...d.attributes })).filter(t => isRankedEvent(t) && !/test/i.test(t.name));

// Feed prize money, only for the events with known PDPA errors.
const feed = new Map();
await pool(events.filter(t => /^2026 Grand Slam of Darts$/.test(t.name)), 2, async t => feed.set(t.id, eventPrizes((await get(API.tournaments + t.id)).data.attributes)));
const { players, unmatched } = buildLedger(pdpa, official, events, id => feed.get(id));

// Players on £0 have nothing to break down: an empty ledger is exact.
for (const o of official) if (!players[o.id] && o.money === 0) players[o.id] = { name: o.name, total: 0, verified: true, rows: [] };
const ids = Object.keys(players);
const verified = ids.filter(id => players[id].verified).length;
const missing = official.filter(o => !players[o.id]).map(o => o.name);
const names = Object.fromEntries(events.map(t => [t.id, t.name]));
const ledger = {
  updatedAt: new Date().toISOString(),
  source: PDPA,
  officialSig: sig,
  players: ids.length,
  verified,
  unmatched: [...unmatched, ...missing.map(n => `${n}: not in the PDPA breakdowns`)],
  // Row: [PDC event id, event end date, expiry date, finishing position, amount]
  events: Object.fromEntries([...new Set(ids.flatMap(id => players[id].rows.map(r => r[0])))].sort().map(id => [id, names[id]])),
  byPlayer: players,
};
const changed = await writeJsonIfChanged(OUT, ledger, { stamp: 'updatedAt' });

const csvRows = [['player_id', 'player', 'event_id', 'event', 'event_end', 'expires', 'position', 'amount', 'player_verified']];
for (const o of official) {
  const p = players[o.id]; if (!p) continue;
  for (const r of p.rows) csvRows.push([o.id, o.name, r[0], names[r[0]] || '', r[1], r[2], r[3], r[4], p.verified ? 'yes' : 'no']);
}
await writeFile(CSV, csvRows.map(r => r.map(v => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',')).join('\n') + '\n');

log(`ranking ledger: ${verified}/${official.length} players verified against the official totals, ${csvRows.length - 1} prizes (${changed ? 'updated' : 'unchanged'})`);
if (ledger.unmatched.length) log(`ranking ledger: not matched: ${ledger.unmatched.slice(0, 10).join('; ')}`);
if (verified < official.length) {
  await writeFile('.ranking-ledger-check.txt', `The ranking ledger (PDPA breakdowns) does not add up to the official PDC total for ${official.length - verified} player(s); the live race uses its own calculation for them.\n\n`
    + ids.filter(id => !players[id].verified).slice(0, 30).map(id => `- ${players[id].name}: ledger £${players[id].ledgerTotal}, official £${players[id].total}`).join('\n')
    + (ledger.unmatched.length ? `\n\nNot matched:\n${ledger.unmatched.map(x => `- ${x}`).join('\n')}` : '') + '\n');
}
