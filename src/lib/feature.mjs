// The homepage's big match tile. Shared by the build (Astro) and the browser
// (live refresh) so both draw identical markup.
//
// Size order while a match is live: the match score (sets in set play) is the
// biggest thing, each player's score left in the leg comes second, and the
// averages are small and labelled. Set play also shows the legs in the set.
import { flag, formatLabel, surnameOf, onBreak } from './pdc.mjs';
import { ukTime, scoreHtml } from './format.mjs';
import { avatarSrc, cutoutImg, pairPrefer } from './images.mjs';

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
function pic(p, side, prefer) {
  const cut = p && cutoutImg(p.name, `ft-cut ${side}`, '(max-width: 640px) 40vw, 300px', p.name, prefer);
  if (cut) return cut;
  const av = p && avatarSrc(p.name);
  if (av) return `<span class="ft-round ${side}"><img src="${av}" alt="${esc(p.name)}" width="112" height="112" decoding="async"></span>`;
  return `<span class="ft-ini ${side}" role="img" aria-label="${esc(p?.name || 'To be decided')}"><span>${esc(initials(p?.name || '?'))}</span></span>`;
}

/** One player's leg in play: score left (the hero number), who's throwing, their match average under it. */
function legParts(l, k, s) {
  const v = (l.visits || []).slice().sort((a, b) => a.order - b.order);
  const mine = v.filter(x => x.isParticipant1 === (k === 0));
  const lastMine = mine[mine.length - 1];
  const latest = v[v.length - 1];
  // Just after a checkout: the leg that was won stays up (winner's 0 in volt) until the next leg's first dart.
  const held = l.held;
  const left = held ? held.left[k] : l.left[k];
  const throwing = !held && l.throwing === k;
  const justThrew = !held && latest && latest === lastMine;
  // Big number (with a 180 shout), and their average under it.
  const big = `<div class="ft-big ${k ? 'r' : 'l'}${throwing ? ' on' : ''}${held?.winner === k ? ' won' : ''}">
      ${justThrew && lastMine.score === 180 && !lastMine.isBust ? '<span class="ft-180" aria-label="One hundred and eighty">180!</span>' : ''}
      <b class="ft-rem poster-num" title="Score left in this leg${throwing ? ' (throwing)' : ''}">${throwing ? '<span class="ft-dot" aria-label="throwing"></span>' : ''}<span class="ft-num">${left}</span></b>
      <span class="ft-bigav" title="Three-dart average">${s?.avg != null ? `${Number(s.avg).toFixed(2)} <i>avg</i>` : ''}</span>
    </div>`;
  return { big };
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
  const setLine = sets && inPlay && legs ? `<div class="ft-set">Set ${f.liveSet || 1} · legs <b>${scoreHtml(legs[0], legs[1])}</b></div>` : '';
  const playing = inPlay && f.legNow;
  const parts = playing ? [legParts(f.legNow, 0, st?.[0]), legParts(f.legNow, 1, st?.[1])] : null;
  // In play the score left is the hero; the match score sits small in the middle, labelled.
  // No darts for a while at the start of a leg: the players are on a break.
  const brk = playing && onBreak(f.legNow);
  const playCentre = playing ? `<span class="lbl ft-legs-l">${sets ? 'Sets' : 'Legs'}</span><div class="ft-legs poster-num">${scoreHtml(f.s1, f.s2)}</div>${sets && legs ? `<span class="lbl ft-legs-l">Legs <b>${scoreHtml(legs[0], legs[1])}</b></span>` : ''}${brk ? '<span class="brk-tag">Break</span>' : ''}` : '';
  const centre = playing ? playCentre : done || inPlay || (f.s1 ?? 0) + (f.s2 ?? 0) > 0
    ? `<div class="ft-score poster-num${Math.max(f.s1 ?? 0, f.s2 ?? 0) >= 10 ? ' wide' : ''}">${f.s1 ?? 0}<span>–</span>${f.s2 ?? 0}</div>${setLine}${inPlay ? (sets ? '<div class="lbl ft-sub">Sets</div>' : '') : `<div class="lbl ft-sub">${mode === 'now' ? 'Latest score' : `Final${sets ? ' · sets' : ''}`}</div>`}`
    : `<div class="ft-score ft-vs poster-num">V</div>${mode === 'now' ? '<div class="lbl ft-sub">Waiting for the first dart</div>' : ''}`;
  const side = (p, won, s, k) => `<div class="ft-who ${k ? 'r' : 'l'}${won ? ' won' : ''}">
      <div class="ft-id"><b>${esc(p.name)}</b><small>${flag(p.country)} ${p.ranking ? `<span class="ft-wr">World </span>#${p.ranking}` : ''}</small></div>
      ${playing ? '' : s?.avg != null ? `<div class="ft-avg" title="Three-dart average"><span class="poster-num">${Number(s.avg).toFixed(2)}</span><small>avg</small></div>` : ''}
    </div>`;
  const fmt = formatLabel(f.fmt);
  const others = also.length
    ? `<div class="ft-also"><span class="lbl">Also live</span>${also.map(o => `<a href="/match?id=${esc(o.id)}">${esc(surnameOf(o.p1))} <b>${scoreHtml(o.s1, o.s2)}</b> ${esc(surnameOf(o.p2))}</a>`).join('')}</div>`
    : '';
  return `<a class="ft-link" href="/match?id=${esc(f.id)}" aria-label="${esc(`${f.p1.name} v ${f.p2.name}`)}"></a>
    <div class="ft-top">${tag}<span class="lbl ft-stage">${esc(f.stage || '')}${fmt ? ` · ${esc(fmt)}` : ''}${inPlay && f.legNow ? ` · Leg ${f.legNow.leg}` : ''}</span></div>
    <div class="ft-stage-row${playing ? ' play' : ''}${brk ? ' brk' : ''}">
      <div class="ft-p l">${pic(f.p1, 'l', pairPrefer(f.p1?.name, f.p2?.name))}</div>
      <div class="ft-mid">${centre}</div>
      <div class="ft-p r">${pic(f.p2, 'r', pairPrefer(f.p1?.name, f.p2?.name))}</div>
      ${playing ? parts[0].big + parts[1].big : ''}
    </div>
    <div class="ft-bottom${playing ? ' live' : ''}">${side(f.p1, w1, st?.[0], 0)}${side(f.p2, w2, st?.[1], 1)}</div>${others}`;
}

/** HTML for the volt "Next up" tile (inside its <a>). */
export function nextTileInner(f, eventName) {
  return `<span class="lbl">Next up · ${esc(ukTime(f.time, f.date) || 'TBC')}</span>
    <span class="poster nu-names">${esc(surnameOf(f.p1))}<br>v ${esc(surnameOf(f.p2))}</span>
    <span class="nu-sub">${esc(f.stage || '')} · ${esc(eventName)}</span>`;
}
