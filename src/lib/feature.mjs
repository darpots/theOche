// The homepage's big match tile. Shared by the build (Astro) and the browser
// (live refresh) so both draw identical markup.
//
// Size order while a match is live: the match score (sets in set play) is the
// biggest thing, each player's score left in the leg comes second, and the
// averages are small and labelled. Set play also shows the legs in the set.
import { flag, formatLabel, surnameOf } from './pdc.mjs';
import { ukTime } from './format.mjs';
import { avatarSrc, cutoutImg } from './images.mjs';
import { checkout } from './checkout.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const initials = n => n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

/** Today's fixtures (normalised), the "on now" match, any others live, the next one and results. */
export function matchday(t, today, nowHHMM) {
  const all = t.stages.flatMap(s => s.fixtures.map(f => ({ ...f, stage: s.name, fmt: { sets: s.sets, bestOf: s.bestOf, twoClear: s.twoClear } }))).filter(f => f.p1 && f.p2);
  const todays = all.filter(f => f.date === today).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  const pending = todays.filter(f => f.status !== 'result');
  const started = pending.filter(f => f.status === 'live' || (f.time && f.time <= nowHHMM));
  const now = started[started.length - 1] || null;
  // Other boards in play at the same time (Players Championships, World Cup…).
  const also = started.filter(f => f !== now && f.status === 'live');
  const next = pending.find(f => f !== now && !also.includes(f) && !(f.time && f.time <= nowHHMM)) || null;
  const results = all.filter(f => f.status === 'result').sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  return { todays, now, also, next, results };
}

/** Player picture: the cut-out, else their round headshot, else initials. */
function pic(p, side) {
  const cut = p && cutoutImg(p.name, `ft-cut ${side}`, '(max-width: 640px) 40vw, 300px', p.name);
  if (cut) return cut;
  const av = p && avatarSrc(p.name);
  if (av) return `<span class="ft-round ${side}"><img src="${av}" alt="${esc(p.name)}" width="112" height="112" decoding="async"></span>`;
  return `<span class="ft-ini ${side}" role="img" aria-label="${esc(p?.name || 'To be decided')}"><span>${esc(initials(p?.name || '?'))}</span></span>`;
}

/** What one player has going on in the leg: score left, last visit, finish. */
function legSide(l, k) {
  const v = (l.visits || []).slice().sort((a, b) => a.order - b.order);
  const mine = v.filter(x => x.isParticipant1 === (k === 0));
  const lastMine = mine[mine.length - 1];
  const latest = v[v.length - 1];
  const left = l.left[k];
  const route = checkout(left);
  const throwing = l.throwing === k;
  // The visit that just happened gets a moment: a 180 is shouted about.
  const justThrew = latest && latest === lastMine;
  const big = lastMine && !lastMine.isBust && lastMine.score >= 140;
  const last = lastMine ? `<i class="ft-last${big ? ' big' : ''}${lastMine.isBust ? ' bust' : ''}">${lastMine.isBust ? 'Bust' : lastMine.score}</i>` : '';
  // Darts thrown so far in the visit, filling in as each one lands.
  const pips = throwing && l.dartsIn ? `<span class="ft-pips" aria-label="${l.dartsIn} of 3 darts thrown">${[1, 2, 3].map(n => `<i class="${n <= l.dartsIn ? 'on' : ''}"></i>`).join('')}</span>` : '';
  // Fixed layout: the number keeps its width and both chip rows are always there
  // (empty when there's nothing to show), so the tile never changes size mid-match.
  return `<div class="ft-now${throwing ? ' on' : ''}">
      ${justThrew && lastMine.score === 180 && !lastMine.isBust ? '<span class="ft-180" aria-label="One hundred and eighty">180!</span>' : ''}
      <b class="ft-rem poster-num" title="Score left in this leg${throwing ? ' (throwing)' : ''}"><span class="ft-mark">${throwing ? '<span class="ft-dot" aria-label="throwing"></span>' : ''}${pips}</span><span class="ft-num">${left}</span></b>
      <span class="ft-meta"><span class="ft-row">${last}</span><span class="ft-row">${route && left <= 170 ? `<i class="ft-co" title="Checkout">${route.join(' ')}</i>` : ''}</span></span>
    </div>`;
}

/** HTML for the feature tile. mode: 'now' | 'next' | 'result'. also: other matches live now. */
export function featureTile(f, mode, eventName, also = []) {
  const done = f.status === 'result';
  const w1 = done && f.winner === f.p1.id, w2 = done && f.winner === f.p2.id;
  const st = f.stats || null;
  const sets = !!f.fmt?.sets;
  const tag = mode === 'now' ? `<span class="lbl ft-live">● On now · ${esc(eventName)}</span>`
    : mode === 'next' ? `<span class="lbl ft-next">Next up · ${esc(ukTime(f.time, f.date) || 'TBC')} · ${esc(eventName)}</span>`
    : `<span class="lbl ft-res">Result · ${esc(eventName)}</span>`;
  const inPlay = mode === 'now' && f.status === 'live';
  const legs = f.liveLegs;
  const setLine = sets && inPlay && legs ? `<div class="ft-set">Set ${f.liveSet || 1} · legs <b>${legs[0]}–${legs[1]}</b></div>` : '';
  const centre = done || inPlay || (f.s1 ?? 0) + (f.s2 ?? 0) > 0
    ? `<div class="ft-score poster-num">${f.s1 ?? 0}<span>–</span>${f.s2 ?? 0}</div>${setLine}<div class="lbl ft-sub">${inPlay ? `<span class="ft-pulse"></span>Live${sets ? ' · sets' : ''}` : mode === 'now' ? 'Latest score' : `Final${sets ? ' · sets' : ''}`}</div>`
    : `<div class="ft-score ft-vs poster-num">V</div><div class="lbl ft-sub">${mode === 'now' ? 'Waiting for the first dart' : esc(ukTime(f.time, f.date) || 'Time TBC')}</div>`;
  const avg = s => (s?.avg != null ? `<span class="ft-av" title="Three-dart average">${Number(s.avg).toFixed(2)} <i>avg</i></span>` : '');
  const side = (p, won, s, k) => `<div class="ft-who ${k ? 'r' : 'l'}${won ? ' won' : ''}">
      <div class="ft-id"><b>${esc(p.name)}</b><small>${flag(p.country)} ${p.ranking ? `World #${p.ranking}` : ''}${won ? ' · Winner' : ''}</small>${inPlay && f.legNow ? avg(s) : ''}</div>
      ${inPlay && f.legNow ? legSide(f.legNow, k) : s?.avg != null ? `<div class="ft-avg" title="Three-dart average"><span class="poster-num">${Number(s.avg).toFixed(2)}</span><small>avg</small></div>` : ''}
    </div>`;
  const fmt = formatLabel(f.fmt);
  const others = also.length
    ? `<div class="ft-also"><span class="lbl">Also live</span>${also.map(o => `<a href="/match?id=${esc(o.id)}">${esc(surnameOf(o.p1))} <b>${o.s1 ?? 0}–${o.s2 ?? 0}</b> ${esc(surnameOf(o.p2))}</a>`).join('')}</div>`
    : '';
  return `<a class="ft-link" href="/match?id=${esc(f.id)}" aria-label="${esc(`${f.p1.name} v ${f.p2.name}`)}"></a>
    <div class="ft-top">${tag}<span class="lbl ft-stage">${esc(f.stage || '')}${fmt ? ` · ${esc(fmt)}` : ''}${inPlay && f.legNow ? ` · Leg ${f.legNow.leg}` : ''}</span></div>
    <div class="ft-stage-row">
      <div class="ft-p l">${pic(f.p1, 'l')}</div>
      <div class="ft-mid">${centre}</div>
      <div class="ft-p r">${pic(f.p2, 'r')}</div>
    </div>
    <div class="ft-bottom">${side(f.p1, w1, st?.[0], 0)}${side(f.p2, w2, st?.[1], 1)}</div>${others}`;
}

/** HTML for the volt "Next up" tile (inside its <a>). */
export function nextTileInner(f, eventName) {
  return `<span class="lbl">Next up · ${esc(ukTime(f.time, f.date) || 'TBC')}</span>
    <span class="poster nu-names">${esc(surnameOf(f.p1))}<br>v ${esc(surnameOf(f.p2))}</span>
    <span class="nu-sub">${esc(f.stage || '')} · ${esc(eventName)}</span>`;
}
