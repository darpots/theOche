// Head to head from the PDC's own records: every earlier meeting of two
// players, oriented to the order they're given in. Used by the match centre
// and the player page's head-to-head finder.
import { API, cleanName } from './pdc.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const COLOURS = ['#2b4bff', '#e8362d'];
// Some meetings carry no date of their own (startDate null): fall back to their event's dates.
const dateOf = g => g.startDate || g.tournament?.endDate || g.tournament?.startDate || '';

/** Finished meetings, newest first: { s: [score A, score B], w: 0 | 1 | -1, … }. `exclude` skips one fixture (the match being viewed). */
export async function fetchH2H(idA, idB, exclude = null) {
  const ids = [String(idA), String(idB)];
  const res = await fetch(`${API.participants}${ids[0]}/h2h/${ids[1]}`);
  if (!res.ok) throw new Error(`h2h ${res.status}`);
  return ((await res.json()).data || [])
    .map(x => ({ id: x.id, ...x.attributes }))
    .filter(x => /result/i.test(x.status) && String(x.id) !== String(exclude))
    .map(x => {
      const flip = String(x.participant1ID) === ids[1];
      const s = flip ? [x.participant2Score, x.participant1Score] : [x.participant1Score, x.participant2Score];
      const w = x.winnerParticipantID ? ids.indexOf(String(x.winnerParticipantID)) : s[0] > s[1] ? 0 : s[1] > s[0] ? 1 : -1;
      return { ...x, s, w };
    })
    .sort((x, y) => `${dateOf(y)}${y.startTime || ''}`.localeCompare(`${dateOf(x)}${x.startTime || ''}`));
}

/** Summary line, e.g. "8 previous meetings in PDC events · last 6 below". */
export function h2hSummary(games, word = 'previous meeting') {
  const draws = games.filter(g => g.w === -1).length;
  return games.length ? `${games.length} ${word}${games.length === 1 ? '' : 's'} in PDC events${draws ? ` · ${draws} drawn` : ''}${games.length > 6 ? ' · last 6 below' : ''}` : '';
}

/** Wins either side of a split bar, then the last six meetings. names: [A, B] as shown. */
export function renderH2H(games, names) {
  if (!games.length) return `<p class="muted hh-none">${esc(names[0])} and ${esc(names[1])} haven't met in a PDC event.</p>`;
  const wins = [0, 1].map(k => games.filter(g => g.w === k).length), draws = games.length - wins[0] - wins[1];
  const pct = n => (n / games.length) * 100;
  const evName = n => cleanName(n || '').name.replace(/^European Tour \d+ - /, '');
  const day = d => (/^\d{4}-\d{2}-\d{2}/.test(d || '') ? new Date(d.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
  return `<div class="hh-sum">
      <div class="hh-n"><b class="poster-num${wins[0] > wins[1] ? ' lead' : ''}">${wins[0]}</b><span>${esc(names[0])}</span></div>
      <div class="hh-bar" role="img" aria-label="${esc(names[0])} ${wins[0]} wins, ${esc(names[1])} ${wins[1]} wins${draws ? `, ${draws} drawn` : ''}"><i style="width:${pct(wins[0])}%;background:${COLOURS[0]}"></i><i class="hh-d" style="width:${pct(draws)}%"></i><i style="width:${pct(wins[1])}%;background:${COLOURS[1]}"></i></div>
      <div class="hh-n r"><b class="poster-num${wins[1] > wins[0] ? ' lead' : ''}">${wins[1]}</b><span>${esc(names[1])}</span></div>
    </div>
    <ol class="hh-list">${games.slice(0, 6).map(g => `<li>
      <span class="hh-date">${day(dateOf(g))}</span>
      <span class="hh-ev">${esc(evName(g.tournament?.name))}<small>${esc(g.stage?.name || '')}</small></span>
      <a class="hh-sc" href="/match?id=${esc(g.id)}"><b${g.w === 0 ? ` style="color:${COLOURS[0]}"` : ''}>${g.s[0]}</b><span>–</span><b${g.w === 1 ? ` style="color:${COLOURS[1]}"` : ''}>${g.s[1]}</b></a>
    </li>`).join('')}</ol>`;
}
