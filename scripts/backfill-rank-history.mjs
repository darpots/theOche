// One-off: fills the rankings sparkline history (src/data/rankings.json →
// history) with the Order of Merit as it stood over the last year, from the
// Wayback Machine's copies of the PDPA ranking page (pdpa.co.uk/ranking-tables).
// Each copy gives every ranked player's official total; positions are worked
// out from those totals and players are matched to PDC ids by name, as the
// ranking ledger does. Snapshots already in the history are kept; a copy on
// a date the history already has is skipped. Safe to run again.
//
//   node scripts/backfill-rank-history.mjs
import { matchPdpaPlayer, parsePdpaRankings } from '../src/lib/pdc.mjs';
import { get, readJson, writeJsonIfChanged, today, log } from './lib.mjs';
import { trimHistory } from './rank-history.mjs';

const OUT = new URL('../src/data/rankings.json', import.meta.url).pathname;
const PAGE = 'pdpa.co.uk/ranking-tables/';

const data = await readJson(OUT, null);
if (!data?.players?.length) throw new Error('Run npm run data:rankings first');

// Look back 13 months: the latest copy from before the year starts the line.
const end = today().replace(/-/g, '');
const back = new Date(); back.setUTCMonth(back.getUTCMonth() - 13);
const from = back.toISOString().slice(0, 10).replace(/-/g, '');
const cdx = await get(`https://web.archive.org/cdx/search/cdx?url=${PAGE}&from=${from}&to=${end}&output=json&fl=timestamp&filter=statuscode:200&collapse=timestamp:8`);
const stamps = cdx.slice(1).map(r => r[0]);
log(`backfill: ${stamps.length} archived copies since ${from}`);

const have = new Set((data.history || []).map(h => h.d));
const added = [];
for (const ts of stamps) {
  const d = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
  if (have.has(d)) continue;
  let list;
  try { list = parsePdpaRankings(await get(`https://web.archive.org/web/${ts}id_/https://${PAGE}`, { as: 'text' })); }
  catch (e) { log(`backfill: ${d} could not be fetched (${e.message})`); continue; }
  if (list.length < 128) { log(`backfill: ${d} skipped, only ${list.length} players read`); continue; }
  // Positions from the totals: tied players share the higher place.
  const pos = {};
  let matched = 0;
  list.forEach((p, i) => {
    const rank = 1 + list.filter(q => q.total > p.total).length;
    if (rank > 150) return;
    const o = matchPdpaPlayer(p, data.players);
    if (o) { pos[o.id] = rank; matched++; }
  });
  added.push({ d, pos });
  log(`backfill: ${d} ${list.length} players, ${matched} in the top 150 matched`);
}

const history = trimHistory([...(data.history || []), ...added].sort((a, b) => (a.d || '').localeCompare(b.d || '')), today());
const changed = await writeJsonIfChanged(OUT, { ...data, history });
log(`backfill: ${added.length} snapshots added, ${history.length} kept (${changed ? 'updated' : 'unchanged'})`);
