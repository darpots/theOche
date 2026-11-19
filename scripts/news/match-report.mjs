// Facts and a first draft for a match report, straight from PDC's data, so
// match reports are original and accurate by construction.
// Usage: npm run match-report -- <fixtureId> [--out=file.json]
// Prints { facts, draft }. `draft` is a ready-to-edit news JSON (kind
// 'match-report'); the newsdesk polishes the wording before publishing.
import { writeFile } from 'node:fs/promises';
import { cleanName, playerName, liveMatches, liveLegs, formatLabel } from '../../src/lib/pdc.mjs';
import { get } from '../lib.mjs';

const FX = 'https://fixtures.darts.web.gc.pdcservices.co.uk/v2/';
const id = process.argv[2];
const out = (process.argv.find(a => a.startsWith('--out=')) || '').slice(6);
if (!id) { console.error('usage: match-report <fixtureId>'); process.exit(1); }

const a = (await get(FX + id)).data.attributes;
const tl = await get(`${FX}${id}/timeline`).catch(() => null);
const tid = String(a.tournament?.tournamentID);
const names = [playerName(a.participant1), playerName(a.participant2)];
const last = [a.participant1?.lastName, a.participant2?.lastName];
const ts = a.tournamentStage || {};
const sets = (ts.numberOfSets || 0) > 1;

// Every leg with its visits: the official timeline, else PDC live scoring.
let legs = tl?.data?.attributes?.legs || [];
let meta = tl?.data?.attributes?.fixtureMeta;
if (!legs.length) {
  const m = (await liveMatches(tid, [id])).get(String(id));
  legs = m ? await liveLegs(tid, id, m) : [];
  if (m?.stats && !meta) meta = { participant1Data: { threeDartAverage: m.stats[0]?.avg, score180: m.stats[0]?.t80, highestCheckout: m.stats[0]?.hi, checkoutPercentage: m.stats[0]?.co }, participant2Data: { threeDartAverage: m.stats[1]?.avg, score180: m.stats[1]?.t80, highestCheckout: m.stats[1]?.hi, checkoutPercentage: m.stats[1]?.co } };
}
const L = legs.slice().sort((x, y) => (x.setNumber ?? 1) - (y.setNumber ?? 1) || x.legNumber - y.legNumber).map(leg => {
  const v = (leg.visits || []).slice().sort((x, y) => x.order - y.order);
  const side = p1 => { const mine = v.filter(x => x.isParticipant1 === p1); return { darts: mine.reduce((n, x) => n + (x.numberOfDartsThrown || 0), 0), won: mine.some(x => x.remaining === 0), out: mine.at(-1)?.score, t80: mine.filter(x => x.score === 180 && !x.isBust).length }; };
  const s = [side(true), side(false)];
  return { set: leg.setNumber ?? 1, n: leg.legNumber, starter: v[0]?.isParticipant1 ? 0 : 1, s, w: s[0].won ? 0 : s[1].won ? 1 : null };
}).filter(l => l.w != null);

// Running score, biggest lead each way, breaks, best finish, quickest leg.
const tally = [0, 0], lead = [0, 0];
let decider = null;
for (const l of L) { tally[l.w]++; lead[0] = Math.max(lead[0], tally[0] - tally[1]); lead[1] = Math.max(lead[1], tally[1] - tally[0]); l.after = [...tally]; }
const winner = a.winnerParticipantID ? (String(a.winnerParticipantID) === String(a.participant1?.participantID) ? 0 : 1) : (a.participant1Score > a.participant2Score ? 0 : 1);
const loser = 1 - winner;
const breaks = [0, 1].map(k => L.filter(l => l.w === k && l.starter !== k).length);
const finishes = L.map(l => ({ by: l.w, out: l.s[l.w].out, leg: l.n })).filter(f => f.out).sort((x, y) => y.out - x.out);
const quick = L.map(l => ({ by: l.w, darts: l.s[l.w].darts, leg: l.n })).sort((x, y) => x.darts - y.darts)[0];
if (!sets && L.length && Math.abs(a.participant1Score - a.participant2Score) === 1) decider = L.at(-1);
const comeback = lead[loser] >= 2 ? lead[loser] : 0; // the winner came from this many legs down
// The winner led by 3+ early, then the loser hit back to lead or level: the story of the match.
const gap = l => l.after[winner] - l.after[loser];
const firstBig = lead[winner] >= 3 ? L.find(l => gap(l) === lead[winner]) : null;
const after = firstBig ? L.slice(L.indexOf(firstBig)) : [];
const low = after.length ? Math.min(...after.map(gap)) : 1;
const fightback = low <= 0 ? after.find(l => gap(l) === low) : null;
const an = n => (/^(8|11|18)$/.test(String(n)) || String(n).startsWith('8') ? 'an' : 'a');
const st = [meta?.participant1Data || {}, meta?.participant2Data || {}];
const avg = k => (st[k].threeDartAverage != null ? Number(st[k].threeDartAverage).toFixed(2) : null);

const facts = {
  fixture: id, event: cleanName(a.tournament?.name).name, stage: ts.stage?.name, format: formatLabel({ sets, bestOf: sets ? ts.numberOfSets : ts.numberOfLegsPerSet }),
  date: a.startDate, winner: names[winner], loser: names[loser], score: `${[a.participant1Score, a.participant2Score][winner]}-${[a.participant1Score, a.participant2Score][loser]}`,
  averages: { [names[0]]: avg(0), [names[1]]: avg(1) }, t80s: { [names[0]]: st[0].score180 ?? null, [names[1]]: st[1].score180 ?? null },
  checkoutPct: { [names[0]]: st[0].checkoutPercentage ?? null, [names[1]]: st[1].checkoutPercentage ?? null },
  breaks: { [names[0]]: breaks[0], [names[1]]: breaks[1] }, biggestLead: { [names[0]]: lead[0], [names[1]]: lead[1] },
  bestFinish: finishes[0] ? { player: names[finishes[0].by], score: finishes[0].out, leg: finishes[0].leg } : null,
  quickestLeg: quick ? { player: names[quick.by], darts: quick.darts, leg: quick.leg } : null,
  decidingLeg: decider ? { thrower: names[decider.starter], won: names[decider.w], darts: decider.s[decider.w].darts, finish: decider.s[decider.w].out } : null,
  comebackFrom: comeback || null, fightback: fightback ? { leaderWas: names[winner], ledBy: `${firstBig.after[winner]}-${firstBig.after[loser]}`, thenTrailerReached: `${fightback.after[loser]}-${fightback.after[winner]}` } : null, legs: L.map(l => `${l.set > 1 || sets ? `S${l.set} ` : ''}L${l.n}: ${last[l.w]}${l.w !== l.starter ? ' (break)' : ''} ${l.s[l.w].darts} darts, out ${l.s[l.w].out} -> ${l.after.join('-')}`),
};

// A plain first draft from the facts: three short paragraphs.
const W = last[winner], Lo = last[loser], sc = facts.score;
const headline = fightback && decider ? `${W} survives ${Lo} fightback to win ${sc}` : decider ? `${W} edges ${Lo} ${sc} in a deciding leg` : comeback ? `${W} fights back from ${comeback} down to beat ${Lo}` : avg(winner) && Number(avg(winner)) >= 100 ? `${avg(winner)} average carries ${W} past ${Lo}` : `${W} beats ${Lo} ${sc}`;
const p1 = `${names[winner]} beat ${names[loser]} ${sc} in the ${(facts.stage || '').toLowerCase()} of the ${facts.event}${avg(winner) ? `, averaging ${avg(winner)} to ${Lo}'s ${avg(loser)}` : ''}.`;
const swing = fightback
  ? `${W} raced ${firstBig.after[winner]}-${firstBig.after[loser]} ahead, but ${Lo} hit back to ${fightback.after[loser] > fightback.after[winner] ? 'lead' : 'level at'} ${fightback.after[loser]}-${fightback.after[winner]}. `
  : '';
const turn = swing + (decider
  ? `It went the distance: ${last[decider.starter]} had the throw in the deciding leg, and ${W} took it in ${facts.decidingLeg.darts} darts, checking out on ${facts.decidingLeg.finish}.`
  : comeback ? `${Lo} led by ${comeback} at one stage before ${W} took control, with ${breaks[winner]} break${breaks[winner] === 1 ? '' : 's'} of throw.`
  : `${W} broke throw ${breaks[winner]} time${breaks[winner] === 1 ? '' : 's'} and never trailed by more than ${lead[loser]}.`);
const extras = [facts.bestFinish && `The best finish was a ${facts.bestFinish.score} from ${last[finishes[0].by]} in leg ${facts.bestFinish.leg}`, facts.quickestLeg && `the quickest leg ${an(facts.quickestLeg.darts)} ${facts.quickestLeg.darts}-darter from ${last[quick.by]}`, (st[0].score180 != null) && `the 180s finished ${st[winner].score180 ?? 0}-${st[loser].score180 ?? 0}`].filter(Boolean);
const draft = {
  slug: headline.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  date: new Date().toISOString(), headline, standfirst: `${p1.replace(/\.$/, '')}.`.slice(0, 200),
  body: [p1, turn, extras.length ? `${extras.join(', ').replace(/^./, c => c.toUpperCase())}.` : null].filter(Boolean),
  tags: [facts.event], players: [names[winner], names[loser]],
  sources: [{ name: 'PDC', url: `https://www.pdc.tv/matches/${id}`, title: `${names[0]} v ${names[1]}` }],
  writtenBy: 'The Oche newsdesk (Claude)', tournament: tid, kind: 'match-report',
};
const result = { facts, draft };
if (out) await writeFile(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
