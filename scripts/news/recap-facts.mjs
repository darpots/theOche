// Facts for a tournament round-up, straight from the PDC feeds, so recaps
// never rely on memory. Usage: npm run recap-facts -- <tournamentId> [--out=file]
// Prints JSON: event details, final, every knockout result with averages,
// the winner's route, and tournament-wide stats (best averages, 180s, finishes,
// nine-darters).
import { writeFile } from 'node:fs/promises';
import { API, cleanName, playerName, isPlaceholder, fixtureStatsUrl } from '../../src/lib/pdc.mjs';
import { get, pool } from '../lib.mjs';

const id = process.argv[2];
const out = (process.argv.find(a => a.startsWith('--out=')) || '').slice(6);
if (!id) { console.error('usage: recap-facts <tournamentId>'); process.exit(1); }

const a = (await get(`${API.tournaments}${id}`)).data.attributes;
const { name, tag } = cleanName(a.name);
const rows = [];
for (const s of a.stages || []) for (const f of s.fixtures || []) {
  if (isPlaceholder(f.participant1) || isPlaceholder(f.participant2) || !f.winnerParticipantID) continue;
  rows.push({ id: String(f.fixtureID), stage: s.stage?.name, cup: Number(s.cupRound) || 99, sets: (s.numberOfSets || 0) > 1, date: f.startDate,
    p1: playerName(f.participant1), p2: playerName(f.participant2), id1: String(f.participant1.participantID), id2: String(f.participant2.participantID),
    s1: f.participant1Score, s2: f.participant2Score, winner: String(f.winnerParticipantID) === String(f.participant1.participantID) ? playerName(f.participant1) : playerName(f.participant2) });
}
await pool(rows, 8, async r => {
  try {
    const t = (await get(fixtureStatsUrl(r.id))).data.attributes;
    const m = t.fixtureMeta || {};
    const side = d => d ? { avg: d.threeDartAverage, f9: d.first9Average, t80: d.score180 ?? 0, co: d.checkoutPercentage, hi: d.highestCheckout } : null;
    r.stats1 = side(m.participant1Data); r.stats2 = side(m.participant2Data);
    // Nine-dart legs: a leg won in exactly nine darts.
    for (const leg of t.legs || []) for (const p1 of [true, false]) {
      const v = (leg.visits || []).filter(x => x.isParticipant1 === p1);
      const darts = v.reduce((n, x) => n + (x.numberOfDartsThrown || 0), 0);
      if (darts === 9 && v.some(x => x.remaining === 0)) (r.nineDarters ||= []).push(p1 ? r.p1 : r.p2);
    }
  } catch { /* stats are optional */ }
});
const line = r => `${r.stage}: ${r.p1} ${r.s1}-${r.s2} ${r.p2}${r.stats1 ? ` (averages ${r.stats1.avg} v ${r.stats2?.avg})` : ''}`;
const ko = rows.filter(r => r.cup < 99).sort((x, y) => x.cup - y.cup || x.date.localeCompare(y.date));
const final = ko.find(r => r.cup === 1);
const champ = a.winner && !isPlaceholder(a.winner) ? playerName(a.winner) : final?.winner || null;
const sideOf = (r, n) => (r.p1 === n ? { me: r.p1, opp: r.p2, my: r.s1, their: r.s2, st: r.stats1 } : { me: r.p2, opp: r.p1, my: r.s2, their: r.s1, st: r.stats2 });
const route = champ ? rows.filter(r => r.p1 === champ || r.p2 === champ).sort((x, y) => y.cup - x.cup || x.date.localeCompare(y.date))
  .map(r => { const s = sideOf(r, champ); return `${r.stage}: beat ${s.opp} ${s.my}-${s.their}${s.st ? ` (average ${s.st.avg})` : ''}`.replace('beat', r.winner === champ ? 'beat' : 'lost to'); }) : [];
const perf = rows.flatMap(r => [r.stats1 && { name: r.p1, opp: r.p2, stage: r.stage, ...r.stats1 }, r.stats2 && { name: r.p2, opp: r.p1, stage: r.stage, ...r.stats2 }].filter(Boolean));
const t80 = {};
for (const p of perf) t80[p.name] = (t80[p.name] || 0) + (p.t80 || 0);
const facts = {
  tournamentId: id, name, tag, fullName: a.name, start: a.startDate, end: a.endDate, venue: a.venue, city: a.city,
  pdcUrl: `https://www.pdc.tv/tournament-hub/${id}`,
  champion: champ,
  final: final ? line(final) : null,
  winnersRoute: route,
  knockout: ko.map(line),
  groupOrLeague: rows.filter(r => r.cup === 99).length ? rows.filter(r => r.cup === 99).map(line) : undefined,
  matches: rows.length,
  highestAverages: perf.sort((x, y) => y.avg - x.avg).slice(0, 5).map(p => `${p.name} ${p.avg} v ${p.opp} (${p.stage})`),
  most180s: Object.entries(t80).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([n, c]) => `${n} ${c}`),
  total180s: Object.values(t80).reduce((x, y) => x + y, 0),
  highestCheckouts: perf.filter(p => p.hi).sort((x, y) => y.hi - x.hi).slice(0, 3).map(p => `${p.name} ${p.hi} v ${p.opp} (${p.stage})`),
  nineDarters: rows.flatMap(r => (r.nineDarters || []).map(n => `${n} v ${n === r.p1 ? r.p2 : r.p1} (${r.stage})`)),
};
const json = JSON.stringify(facts, null, 1);
if (out) await writeFile(out, json); else console.log(json);
