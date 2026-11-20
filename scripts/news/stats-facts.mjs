// Facts for analysis pieces, from every ranked player's profile (last 12
// months, refreshed daily): leaders, who is hot and cold (recent events
// against their 12-month average), doubles specialists, the biggest scorers,
// and players over- or under-performing their ranking.
// Saves data/news-facts/stats-<date>.json for the story checker.
// Usage: npm run stats-facts
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';

const ROOT = new URL('../../', import.meta.url).pathname;
const rankings = JSON.parse(await readFile(`${ROOT}src/data/rankings.json`, 'utf8'));
const rank = new Map(rankings.players.map(p => [p.id, p.pos]));
const profiles = [];
for (const f of await readdir(`${ROOT}public/data/players`)) profiles.push(JSON.parse(await readFile(`${ROOT}public/data/players/${f}`, 'utf8')));
const MIN = 20;
const ok = profiles.filter(p => (p.season?.stats?.matches || 0) >= MIN);
const r2 = n => Math.round(n * 100) / 100;
const top = (list, key, n = 10, dir = -1) => list.map(p => ({ name: p.name, worldRank: rank.get(p.id) ?? null, value: key(p) })).filter(x => x.value != null && Number.isFinite(x.value)).sort((a, b) => (b.value - a.value) * -dir).slice(0, n);

// Recent form: the average across their last three events with an average, against the 12-month figure.
const trend = p => {
  const ev = (p.history || []).filter(h => h.avg && h.date >= (p.season?.from || '')).slice(0, 3);
  if (ev.length < 3 || !p.season?.stats?.avg) return null;
  return { recent: r2(ev.reduce((s, h) => s + h.avg, 0) / ev.length), twelveMonths: p.season.stats.avg, events: ev.map(h => `${h.name} ${h.avg}`) };
};
const trends = ok.map(p => ({ p, t: trend(p) })).filter(x => x.t);
const facts = {
  date: new Date().toISOString().slice(0, 10), window: 'last 12 months', minimumMatches: MIN, players: ok.length,
  averageLeaders: top(ok, p => p.season.stats.avg),
  checkoutLeaders: top(ok, p => p.season.stats.co),
  t80PerMatchLeaders: top(ok, p => r2(p.season.stats.t80 / p.season.stats.matches)),
  finishes170: top(profiles, p => p.season?.stats?.n170 || null),
  winRateLeaders: top(ok, p => (p.season.played ? r2((p.season.won / p.season.played) * 100) : null)),
  hot: trends.map(({ p, t }) => ({ name: p.name, worldRank: rank.get(p.id) ?? null, ...t, change: r2(t.recent - t.twelveMonths) })).sort((a, b) => b.change - a.change).slice(0, 8),
  cold: trends.map(({ p, t }) => ({ name: p.name, worldRank: rank.get(p.id) ?? null, ...t, change: r2(t.recent - t.twelveMonths) })).sort((a, b) => a.change - b.change).slice(0, 8),
  // Average much better than ranking suggests (ranked outside the top 32 but averaging like a top-16 player), and the reverse.
  aboveTheirRanking: ok.filter(p => (rank.get(p.id) || 999) > 32).sort((a, b) => b.season.stats.avg - a.season.stats.avg).slice(0, 6).map(p => ({ name: p.name, worldRank: rank.get(p.id), average: p.season.stats.avg })),
  belowTheirRanking: ok.filter(p => (rank.get(p.id) || 999) <= 32).sort((a, b) => a.season.stats.avg - b.season.stats.avg).slice(0, 6).map(p => ({ name: p.name, worldRank: rank.get(p.id), average: p.season.stats.avg })),
  rankingMovers: (() => { const prev = rankings.previous || {}; return rankings.players.filter(p => prev[p.id]).map(p => ({ name: p.name, from: prev[p.id], to: p.pos, change: prev[p.id] - p.pos })).filter(x => x.change).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 12); })(),
};
await mkdir(`${ROOT}data/news-facts`, { recursive: true });
await writeFile(`${ROOT}data/news-facts/stats-${facts.date}.json`, JSON.stringify(facts, null, 1));
console.log(JSON.stringify(facts, null, 2));
