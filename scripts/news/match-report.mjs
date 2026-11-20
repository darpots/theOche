// Fact pack for a match report, from PDC's data only, so reports are original
// and accurate by construction. Gives the newsdesk the story, not a template:
//   - the match: score, averages, 180s, doubles, breaks, best finish, quickest
//     leg, decider, the swings (biggest lead each way, fightbacks), key legs
//   - the stakes: prize money now guaranteed, next opponent and when
//   - the context: world rankings and the gap, head to head before this match,
//     last-12-months form, previous best at this event, milestones
//   - records: is anything the best of the event so far?
//   - angles: what makes this match a story, ranked, with the evidence
// Also saves the pack to data/news-facts/<fixtureId>.json, which the story
// checker (npm run news:check) uses to confirm every number in the report.
// Usage: npm run match-report -- <fixtureId>
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { API, cleanName, playerName, liveMatches, liveLegs, formatLabel } from '../../src/lib/pdc.mjs';
import { ukTime, money } from '../../src/lib/format.mjs';
import { get } from '../lib.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const FX = 'https://fixtures.darts.web.gc.pdcservices.co.uk/v2/';
const id = process.argv[2];
if (!id) { console.error('usage: match-report <fixtureId>'); process.exit(1); }
const readJson = async (f, d = null) => (existsSync(ROOT + f) ? JSON.parse(await readFile(ROOT + f, 'utf8')) : d);

const a = (await get(FX + id)).data.attributes;
const tl = await get(`${FX}${id}/timeline`).catch(() => null);
const tid = String(a.tournament?.tournamentID);
const ps = [a.participant1, a.participant2];
const ids = ps.map(p => String(p?.participantID));
const names = ps.map(playerName);
const last = ps.map(p => p?.lastName);
const ts = a.tournamentStage || {};
const sets = (ts.numberOfSets || 0) > 1;
const event = cleanName(a.tournament?.name).name;

// ---- The match: every leg ----------------------------------------------
let legs = tl?.data?.attributes?.legs || [];
let meta = tl?.data?.attributes?.fixtureMeta;
if (!legs.length) {
  const m = (await liveMatches(tid, [id])).get(String(id));
  legs = m ? await liveLegs(tid, id, m) : [];
  if (m?.stats && !meta) meta = { participant1Data: { threeDartAverage: m.stats[0]?.avg, score180: m.stats[0]?.t80, highestCheckout: m.stats[0]?.hi, checkoutPercentage: m.stats[0]?.co }, participant2Data: { threeDartAverage: m.stats[1]?.avg, score180: m.stats[1]?.t80, highestCheckout: m.stats[1]?.hi, checkoutPercentage: m.stats[1]?.co } };
}
const L = legs.slice().sort((x, y) => (x.setNumber ?? 1) - (y.setNumber ?? 1) || x.legNumber - y.legNumber).map(leg => {
  const v = (leg.visits || []).slice().sort((x, y) => x.order - y.order);
  const side = p1 => { const mine = v.filter(x => x.isParticipant1 === p1); return { darts: mine.reduce((n, x) => n + (x.numberOfDartsThrown || 0), 0), won: mine.some(x => x.remaining === 0), out: mine.at(-1)?.score }; };
  const s = [side(true), side(false)];
  return { set: leg.setNumber ?? 1, n: leg.legNumber, starter: v[0]?.isParticipant1 ? 0 : 1, s, w: s[0].won ? 0 : s[1].won ? 1 : null };
}).filter(l => l.w != null);

const score = [a.participant1Score, a.participant2Score];
const winner = a.winnerParticipantID ? (String(a.winnerParticipantID) === ids[0] ? 0 : 1) : (score[0] > score[1] ? 0 : 1);
const loser = 1 - winner;
const tally = [0, 0], lead = [0, 0];
for (const l of L) { tally[l.w]++; lead[0] = Math.max(lead[0], tally[0] - tally[1]); lead[1] = Math.max(lead[1], tally[1] - tally[0]); l.after = [...tally]; }
const breaks = [0, 1].map(k => L.filter(l => l.w === k && l.starter !== k).length);
const finishes = L.map(l => ({ by: l.w, out: l.s[l.w].out, leg: l.n })).filter(f => f.out).sort((x, y) => y.out - x.out);
const quick = L.map(l => ({ by: l.w, darts: l.s[l.w].darts, leg: l.n })).sort((x, y) => x.darts - y.darts)[0];
const nineDarters = L.filter(l => l.s[l.w].darts === 9).map(l => ({ player: names[l.w], leg: l.n }));
const t170 = L.filter(l => l.s[l.w].out === 170).map(l => ({ player: names[l.w], leg: l.n }));
const decider = !sets && L.length && Math.abs(score[0] - score[1]) === 1 ? L.at(-1) : null;
const gap = l => l.after[winner] - l.after[loser];
// The winner's biggest lead, and whether the loser then got back level or ahead.
const firstBig = lead[winner] >= 3 ? L.find(l => gap(l) === lead[winner]) : null;
const afterBig = firstBig ? L.slice(L.indexOf(firstBig)) : [];
const low = afterBig.length ? Math.min(...afterBig.map(gap)) : 1;
const fightback = low <= 0 ? afterBig.find(l => gap(l) === low) : null;
// Runs: the longest streak of legs for each player.
const runs = [0, 0]; let cur = null, len = 0;
for (const l of L) { if (l.w === cur) len++; else { cur = l.w; len = 1; } runs[l.w] = Math.max(runs[l.w], len); }
// The turning point: the leg after which the eventual winner never trailed again
// (or, after a fightback, the leg that put them back in front for good).
let turn = null;
for (let i = L.length - 1; i >= 0; i--) { if (gap(L[i]) <= 0) { turn = L[i + 1] || null; break; } }
const st = [meta?.participant1Data || {}, meta?.participant2Data || {}];
const avg = k => (st[k].threeDartAverage != null ? Number(Number(st[k].threeDartAverage).toFixed(2)) : null);
const co = k => (st[k].checkoutPercentage != null ? Number(Number(st[k].checkoutPercentage).toFixed(1)) : null);

// ---- Stakes: prize money and what's next ----------------------------------
const tour = (await get(`${API.tournaments}${tid}`).catch(() => null))?.data?.attributes;
const stages = (tour?.stages || []).slice();
const cup = Number(ts.cupRound) || null;
const stageByCup = c => stages.find(s => Number(s.cupRound) === c);
const nextStage = cup && cup > 1 ? stageByCup(cup - 1) : null;
const prize = {
  loserTakes: ts.compensationValue ? money(Number(ts.compensationValue)) : null,
  winnerGuaranteed: nextStage?.compensationValue ? money(Number(nextStage.compensationValue)) : null,
};
let next = null;
if (nextStage) {
  const f = (nextStage.fixtures || []).find(x => [x.participant1, x.participant2].some(p => String(p?.participantID) === ids[winner]));
  if (f) {
    const opp = String(f.participant1?.participantID) === ids[winner] ? f.participant2 : f.participant1;
    const real = opp && !/to be confirmed/i.test(`${opp.lastName}`) && opp.lastName;
    next = { stage: nextStage.stage?.name, opponent: real ? playerName(opp) : 'to be decided', when: f.startDate ? `${new Date(f.startDate + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}${f.startTime ? `, ${ukTime(f.startTime.slice(0, 5), f.startDate)}` : ''}` : null };
  }
}

// ---- Context: rankings, form, head to head, history ----------------------
const rankings = await readJson('src/data/rankings.json', { players: [] });
const rankOf = pid => rankings.players.find(p => p.id === pid)?.pos ?? null;
const ranks = ids.map(rankOf);
const profiles = await Promise.all(ids.map(pid => readJson(`public/data/players/${pid}.json`)));
const form = profiles.map(p => p?.season ? { period: 'last 12 months', played: p.season.played, won: p.season.won, average: p.season.stats?.avg ?? null, titles: p.season.titles?.length ?? 0, last5: (p.form || []).filter(m => String(m.id) !== String(id)).slice(0, 5).map(m => `${m.won ? 'W' : 'L'} ${m.my}-${m.their} v ${m.opp}`) } : null);
let h2h = null;
try {
  const r = await get(`${API.participants}${ids[0]}/h2h/${ids[1]}`);
  const games = (r.data || []).map(x => ({ id: x.id, ...x.attributes })).filter(x => /result/i.test(x.status) && String(x.id) !== String(id));
  const w = [0, 1].map(k => games.filter(g => String(g.winnerParticipantID) === ids[k]).length);
  const lastMeet = games.sort((x, y) => y.startDate.localeCompare(x.startDate))[0];
  h2h = { meetingsBefore: games.length, wins: { [names[0]]: w[0], [names[1]]: w[1] }, lastMeeting: lastMeet ? `${lastMeet.startDate}: ${cleanName(lastMeet.tournament?.name).name}, ${lastMeet.participant1ID === ids[0] ? `${lastMeet.participant1Score}-${lastMeet.participant2Score}` : `${lastMeet.participant2Score}-${lastMeet.participant1Score}`} (${names[0]} first)` : null };
} catch { /* optional */ }
// Previous best at this event, and whether the winner has reached this stage of a major before.
const roundRank = { Winner: 0, 'Runner-up': 1, 'Semi-Final': 2, 'Quarter-Final': 3 };
const history = profiles.map(p => p?.history || []);
const prevAtEvent = history.map(h => {
  const past = h.filter(x => x.name === event && String(x.id) !== tid && x.date < a.startDate);
  const best = past.slice().sort((x, y) => x.rank - y.rank)[0];
  return best ? `${best.label} (${best.season})` : 'first appearance on record';
});
const reached = nextStage?.stage?.name;
const isMajor = x => !x.tag && !/masters$|world series/i.test(x.name);
const priorAtStage = reached && roundRank[reached] != null ? history[winner].filter(x => isMajor(x) && String(x.id) !== tid && x.date < a.startDate && x.rank <= roundRank[reached]).length : null;

// ---- Records within the event so far (current event data) -----------------
const current = await readJson('src/data/tournament.json');
let records = null;
if (current?.tournament?.id === tid) {
  const others = current.tournament.stages.flatMap(s => s.fixtures).filter(f => f.stats && f.id !== String(id) && f.date <= a.startDate);
  const allAvgs = others.flatMap(f => f.stats.map(x => x?.avg || 0));
  const allHi = others.flatMap(f => f.stats.map(x => x?.hi || 0));
  const allT80 = others.flatMap(f => f.stats.map(x => x?.t80 || 0));
  const best = Math.max(avg(0) || 0, avg(1) || 0);
  records = {
    highestAverageOfEvent: best > Math.max(0, ...allAvgs) ? best : null,
    highestLosingAverage: (avg(loser) || 0) >= 100 ? avg(loser) : null,
    bestCheckoutOfEvent: finishes[0] && finishes[0].out > Math.max(0, ...allHi) ? finishes[0].out : null,
    most180sInAMatchAtEvent: Math.max(st[0].score180 || 0, st[1].score180 || 0) > Math.max(0, ...allT80) ? Math.max(st[0].score180 || 0, st[1].score180 || 0) : null,
  };
}

// ---- Angles: what makes this a story, ranked ------------------------------
const angles = [];
const rankGap = ranks[winner] && ranks[loser] ? ranks[winner] - ranks[loser] : 0;
if (rankGap >= 15 && ranks[loser] <= 16) angles.push({ angle: 'upset', score: 50 + Math.min(40, rankGap), evidence: `world No ${ranks[winner]} beat world No ${ranks[loser]} (${rankGap} places higher)` });
if (nineDarters.length) angles.push({ angle: 'nine-darter', score: 100, evidence: nineDarters.map(n => `${n.player}, leg ${n.leg}`).join('; ') });
if (decider) angles.push({ angle: 'decider', score: 35 + (fightback ? 15 : 0), evidence: `${last[decider.starter]} had the throw in the final leg; ${last[decider.w]} won it in ${decider.s[decider.w].darts} darts, finishing on ${decider.s[decider.w].out}` });
if (fightback) angles.push({ angle: 'fightback', score: 40, evidence: `${last[winner]} led ${firstBig.after[winner]}-${firstBig.after[loser]}, ${last[loser]} came back to ${fightback.after[loser]}-${fightback.after[winner]}` });
if (lead[loser] >= 3) angles.push({ angle: 'comeback', score: 30 + lead[loser] * 5, evidence: `${last[winner]} came from ${lead[loser]} legs down` });
if ((avg(loser) || 0) >= 100) angles.push({ angle: 'high-average-defeat', score: 30, evidence: `${last[loser]} averaged ${avg(loser)} and lost` });
if ((avg(winner) || 0) >= 105) angles.push({ angle: 'big-average', score: 30 + Math.round((avg(winner) - 105) * 4), evidence: `${last[winner]} averaged ${avg(winner)}` });
if (t170.length) angles.push({ angle: '170', score: 25, evidence: t170.map(x => `${x.player}, leg ${x.leg}`).join('; ') });
if (score[loser] === 0) angles.push({ angle: 'whitewash', score: 30, evidence: `${score[winner]}-0` });
if (records?.highestAverageOfEvent) angles.push({ angle: 'event-record-average', score: 35, evidence: `${records.highestAverageOfEvent}, the best average of the ${event} so far` });
if (priorAtStage === 0) angles.push({ angle: 'milestone', score: 35, evidence: `${names[winner]} reaches a major ${reached?.toLowerCase()} for the first time on record` });
if (runs[winner] >= 4) angles.push({ angle: 'run', score: 15 + runs[winner] * 2, evidence: `${last[winner]} won ${runs[winner]} legs in a row` });
angles.push({ angle: 'result', score: 10, evidence: `${names[winner]} beat ${names[loser]} ${score[winner]}-${score[loser]}` });
angles.sort((x, y) => y.score - x.score);

const facts = {
  fixture: String(id), event, stage: ts.stage?.name, format: formatLabel({ sets, bestOf: sets ? ts.numberOfSets : ts.numberOfLegsPerSet, twoClear: ts.twoClearLegsToWin }), date: a.startDate, venue: [tour?.venue, tour?.city].filter(Boolean).join(', ') || null,
  winner: names[winner], loser: names[loser], score: `${score[winner]}-${score[loser]}`,
  // Leads the story: the strongest angle first. Notable = worth a full report (see NEWSDESK.md).
  angles, notable: angles[0].score >= 35,
  players: [0, 1].map(k => ({ name: names[k], worldRank: ranks[k], average: avg(k), t80s: st[k].score180 ?? null, checkoutPct: co(k), highestCheckout: st[k].highestCheckout ?? null, breaks: breaks[k], biggestLead: lead[k], longestRun: runs[k], previousBestAtEvent: prevAtEvent[k], form: form[k] })),
  swings: { fightback: fightback ? { leaderWas: names[winner], ledBy: `${firstBig.after[winner]}-${firstBig.after[loser]}`, trailerReached: `${fightback.after[loser]}-${fightback.after[winner]}` } : null, turningPoint: turn ? `leg ${turn.n}: ${last[turn.w]}${turn.w !== turn.starter ? ' broke throw' : ' held'} for ${turn.after[winner]}-${turn.after[loser]}${turn.s[turn.w].out ? `, finishing on ${turn.s[turn.w].out}` : ''}` : null },
  decidingLeg: decider ? { thrower: names[decider.starter], won: names[decider.w], darts: decider.s[decider.w].darts, finish: decider.s[decider.w].out } : null,
  bestFinish: finishes[0] ? { player: names[finishes[0].by], score: finishes[0].out, leg: finishes[0].leg } : null,
  quickestLeg: quick ? { player: names[quick.by], darts: quick.darts, leg: quick.leg } : null,
  nineDarters, finishes170: t170,
  stakes: { ...prize, next },
  headToHead: h2h, milestone: priorAtStage === 0 ? `first major ${reached?.toLowerCase()} on record for ${names[winner]}` : null, records,
  legs: L.map(l => `${sets ? `S${l.set} ` : ''}L${l.n}: ${last[l.w]}${l.w !== l.starter ? ' (break)' : ''} ${l.s[l.w].darts} darts, out ${l.s[l.w].out} -> ${l.after.join('-')}`),
  source: { name: 'PDC', url: `https://www.pdc.tv/matches/${id}`, title: `${names[0]} v ${names[1]}` },
};
await mkdir(`${ROOT}data/news-facts`, { recursive: true });
await writeFile(`${ROOT}data/news-facts/${id}.json`, JSON.stringify(facts, null, 1));
console.log(JSON.stringify(facts, null, 2));
