// Builds src/data/tournament.json: the PDC tournament in progress (or the most
// recent / next one). The Matches page also refreshes this live in the browser.
import { API, BROADCASTERS, broadcasterFor, normaliseTournament, fixtureStatsUrl, slimStats, liveMatches } from '../src/lib/pdc.mjs';
import { get, getAll, readJson, writeJsonIfChanged, pool, today, log } from './lib.mjs';

const OUT = new URL('../src/data/tournament.json', import.meta.url).pathname;
const t = today();
const year = Number(t.slice(0, 4));

const rows = [];
for (const season of [year - 1, year, year + 1]) rows.push(...(await getAll(API.tournaments, { seasonID: season }, 100)));
const list = rows
  .map(r => ({ id: r.id, ...r.attributes }))
  .filter(a => ['2', '3', '4'].includes(a.tournamentCategoryID) && !/qualifier|test/i.test(a.name));

const inScope = a => !!broadcasterFor(a);
const live = a => a.startDate <= t && a.endDate >= t;
const pick =
  list.find(a => live(a) && inScope(a)) ||
  list.find(a => live(a)) ||
  list.filter(a => inScope(a) && a.startDate > t).sort((x, y) => x.startDate.localeCompare(y.startDate))
    .find(a => (new Date(a.startDate) - new Date(t)) / 864e5 <= 3) ||
  list.filter(a => inScope(a) && a.endDate < t).sort((x, y) => y.endDate.localeCompare(x.endDate))[0];

if (!pick) throw new Error('No tournament found');
const tournament = normaliseTournament(await get(`${API.tournaments}${pick.id}`));

// Averages and 180s for finished matches (kept from the last run once fetched).
// Official stats are kept once fetched; matches showing live figures keep checking for the official ones.
const prevStats = new Map(((await readJson(OUT, null))?.tournament?.stages || []).flatMap(s => s.fixtures).filter(f => f.stats && !f.statsLive).map(f => [f.id, f.stats]));
const need = tournament.stages.flatMap(s => s.fixtures).filter(f => f.status !== 'upcoming');
await pool(need, 6, async f => {
  if (f.status === 'result' && prevStats.has(f.id)) { f.stats = prevStats.get(f.id); return; }
  try { const s = slimStats(await get(fixtureStatsUrl(f.id))); if (s) f.stats = s; } catch { /* stats are optional */ }
});
// Until the PDC publishes them (often the next day), use the figures from its live scoring.
const gaps = need.filter(f => !f.stats);
if (gaps.length) {
  try {
    const live = await liveMatches(tournament.id, gaps.map(f => f.id));
    for (const f of gaps) { const m = live.get(String(f.id)); if (m?.stats) { f.stats = m.stats; f.statsLive = true; } }
  } catch (e) { log(`live stats unavailable: ${e.message}`); }
}
log(`stats: ${need.filter(f => f.stats && !f.statsLive).length} official, ${need.filter(f => f.statsLive).length} live, of ${need.length} matches`);

const next = list.filter(a => inScope(a) && a.startDate > tournament.end)
  .sort((x, y) => x.startDate.localeCompare(y.startDate))[0];

const changed = await writeJsonIfChanged(OUT, {
  updatedAt: new Date().toISOString(),
  tournament,
  next: next ? { id: next.id, name: next.name.replace(/^\d{4}(\/\d{2,4})?\s+/, ''), start: next.startDate, end: next.endDate, broadcaster: broadcasterFor(next) } : null,
}, { stamp: 'updatedAt' });
log(`tournament: ${tournament.fullName} (${changed ? 'updated' : 'unchanged'})`);
