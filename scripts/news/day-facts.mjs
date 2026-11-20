// Facts for a day's session at an event, from PDC data only.
//   results (default): every finished match with averages, 180s, best finish,
//     flags (upset, decider, 100+ average), and the day's leaders, for a
//     session round-up or "numbers of the day"
//   --preview: every match still to come that day with world rankings,
//     last-12-months form, head to head and previous best at the event, for a preview
// Saves to data/news-facts/<tournamentId>-<date>[-preview].json for the story checker.
// Usage: npm run day-facts -- <tournamentId> [YYYY-MM-DD] [--preview]
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { API, cleanName, playerName, isPlaceholder, fixtureStatsUrl, formatLabel } from '../../src/lib/pdc.mjs';
import { ukTime, money } from '../../src/lib/format.mjs';
import { get, pool } from '../lib.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const tid = process.argv[2];
const preview = process.argv.includes('--preview');
const day = process.argv.find(a => /^\d{4}-\d\d-\d\d$/.test(a)) || new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
if (!tid) { console.error('usage: day-facts <tournamentId> [YYYY-MM-DD] [--preview]'); process.exit(1); }
const readJson = async f => (existsSync(ROOT + f) ? JSON.parse(await readFile(ROOT + f, 'utf8')) : null);

const t = (await get(`${API.tournaments}${tid}`)).data.attributes;
const event = cleanName(t.name).name;
const rankings = (await readJson('src/data/rankings.json')) || { players: [] };
const rankOf = pid => rankings.players.find(p => p.id === String(pid))?.pos ?? null;
const rows = [];
for (const s of t.stages || []) for (const f of s.fixtures || []) {
  if (f.startDate !== day || isPlaceholder(f.participant1) || isPlaceholder(f.participant2)) continue;
  const done = /result/i.test(f.status || '');
  if (preview === done) continue;
  const sets = (s.numberOfSets || 0) > 1;
  const nextUp = (t.stages || []).find(x => Number(x.cupRound) && Number(x.cupRound) === Number(s.cupRound) - 1);
  rows.push({ f, stage: s.stage?.name, format: formatLabel({ sets, bestOf: sets ? s.numberOfSets : s.numberOfLegsPerSet }), prize: s.compensationValue ? Number(s.compensationValue) : null, nextPrize: nextUp?.compensationValue ? Number(nextUp.compensationValue) : null });
}
rows.sort((x, y) => (x.f.startTime || '').localeCompare(y.f.startTime || ''));

const out = { event, date: day, kind: preview ? 'preview' : 'results', matches: [] };
if (!preview) {
  await pool(rows, 6, async r => {
    const f = r.f, ids = [String(f.participant1.participantID), String(f.participant2.participantID)];
    const names = [playerName(f.participant1), playerName(f.participant2)];
    const sc = [f.participant1Score, f.participant2Score];
    const w = String(f.winnerParticipantID) === ids[1] ? 1 : 0, l = 1 - w;
    const m = (await get(fixtureStatsUrl(f.fixtureID)).catch(() => null))?.data?.attributes?.fixtureMeta || {};
    const st = [m.participant1Data || {}, m.participant2Data || {}];
    const ranks = ids.map(rankOf);
    const flags = [];
    if (ranks[w] && ranks[l] && ranks[w] - ranks[l] >= 15 && ranks[l] <= 16) flags.push(`upset: world No ${ranks[w]} beat world No ${ranks[l]}`);
    if (Math.abs(sc[0] - sc[1]) === 1 && Math.max(...sc) > 2) flags.push('went to a deciding leg');
    if ((st[l].threeDartAverage || 0) >= 100) flags.push(`${names[l]} averaged ${st[l].threeDartAverage} and lost`);
    if (sc[l] === 0) flags.push('whitewash');
    out.matches.push({ fixture: String(f.fixtureID), stage: r.stage, time: ukTime(f.startTime?.slice(0, 5), day), winner: names[w], loser: names[l], score: `${sc[w]}-${sc[l]}`,
      averages: { [names[w]]: st[w].threeDartAverage ?? null, [names[l]]: st[l].threeDartAverage ?? null },
      t80s: { [names[w]]: st[w].score180 ?? null, [names[l]]: st[l].score180 ?? null },
      bestCheckout: Math.max(st[0].highestCheckout || 0, st[1].highestCheckout || 0) || null, worldRanks: { [names[w]]: ranks[w], [names[l]]: ranks[l] }, flags });
  });
  const all = out.matches.flatMap(x => Object.entries(x.averages).map(([n, v]) => ({ n, v: v || 0 })));
  const t80 = out.matches.flatMap(x => Object.entries(x.t80s).map(([n, v]) => ({ n, v: v || 0 })));
  const top = list => list.slice().sort((a, b) => b.v - a.v)[0];
  out.leaders = {
    highestAverage: top(all), most180s: top(t80),
    total180s: t80.reduce((s, x) => s + x.v, 0),
    bestCheckout: out.matches.slice().sort((a, b) => (b.bestCheckout || 0) - (a.bestCheckout || 0))[0]?.bestCheckout ?? null,
    hundredPlusAverages: all.filter(x => x.v >= 100).length,
  };
} else {
  await pool(rows, 4, async r => {
    const f = r.f, ids = [String(f.participant1.participantID), String(f.participant2.participantID)];
    const names = [playerName(f.participant1), playerName(f.participant2)];
    const profiles = await Promise.all(ids.map(id => readJson(`public/data/players/${id}.json`)));
    let h2h = null;
    try {
      const games = ((await get(`${API.participants}${ids[0]}/h2h/${ids[1]}`)).data || []).map(x => x.attributes).filter(x => /result/i.test(x.status));
      h2h = { meetings: games.length, wins: { [names[0]]: games.filter(g => String(g.winnerParticipantID) === ids[0]).length, [names[1]]: games.filter(g => String(g.winnerParticipantID) === ids[1]).length } };
    } catch { /* optional */ }
    out.matches.push({ fixture: String(f.fixtureID), stage: r.stage, format: r.format, time: ukTime(f.startTime?.slice(0, 5), day),
      winnerGuaranteed: r.nextPrize ? money(r.nextPrize) : null, losersTake: r.prize ? money(r.prize) : null,
      players: names.map((n, k) => ({ name: n, worldRank: rankOf(ids[k]), last12Months: profiles[k]?.season ? { average: profiles[k].season.stats?.avg ?? null, won: profiles[k].season.won, played: profiles[k].season.played, titles: profiles[k].season.titles?.length ?? 0 } : null,
        last5: (profiles[k]?.form || []).slice(0, 5).map(m => `${m.won ? 'W' : 'L'} ${m.my}-${m.their} v ${m.opp}`),
        previousBestAtEvent: (() => { const p = (profiles[k]?.history || []).filter(x => x.name === event && String(x.id) !== String(tid)).sort((a, b) => a.rank - b.rank)[0]; return p ? `${p.label} (${p.season})` : 'first appearance on record'; })() })),
      headToHead: h2h });
  });
  out.matches.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
}
await mkdir(`${ROOT}data/news-facts`, { recursive: true });
await writeFile(`${ROOT}data/news-facts/${tid}-${day}${preview ? '-preview' : ''}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 2));
