// The homepage's big match tile. Shared by the build (Astro) and the browser
// (live refresh) so both draw identical markup.
import { keyName, flag } from './pdc.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const initials = n => n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

/** Today's fixtures (normalised), the "on now" match, the next one and results. */
export function matchday(t, today, nowHHMM) {
  const all = t.stages.flatMap(s => s.fixtures.map(f => ({ ...f, stage: /^group/i.test(s.name) ? s.name : s.name }))).filter(f => f.p1 && f.p2);
  const todays = all.filter(f => f.date === today).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  const pending = todays.filter(f => f.status !== 'result');
  const started = pending.filter(f => f.status === 'live' || (f.time && f.time <= nowHHMM));
  const now = started[started.length - 1] || null;
  const next = pending.find(f => f !== now && !(f.time && f.time <= nowHHMM)) || null;
  const results = all.filter(f => f.status === 'result').sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  return { todays, now, next, results };
}

function pic(p, cutouts, side) {
  const c = p && cutouts[keyName(p.name)];
  if (c) return `<img class="ft-cut ${side}" src="${c}" alt="${esc(p.name)}" decoding="async">`;
  return `<span class="ft-ini ${side}" role="img" aria-label="${esc(p?.name || 'To be decided')}"><span>${esc(initials(p?.name || '?'))}</span></span>`;
}

/** The leg in play: what each player needs either side of the leg number; a dot marks who's throwing. */
export function legChip(l) {
  return `<div class="ft-leg" title="Score left in the leg being played; the dot marks who is throwing"><b class="${l.throwing === 0 ? 'on' : ''}">${l.left[0]}</b><span class="ft-leg-n">Leg ${l.leg}</span><b class="${l.throwing === 1 ? 'on' : ''}">${l.left[1]}</b></div>`;
}

/** HTML for the feature tile. mode: 'now' | 'next' | 'result'. */
export function featureTile(f, mode, eventName, cutouts) {
  const done = f.status === 'result';
  const w1 = done && f.winner === f.p1.id, w2 = done && f.winner === f.p2.id;
  const st = f.stats || null;
  const tag = mode === 'now' ? `<span class="lbl ft-live">● On now · ${esc(eventName)}</span>`
    : mode === 'next' ? `<span class="lbl ft-next">Next up · ${esc(f.time || 'TBC')} · ${esc(eventName)}</span>`
    : `<span class="lbl ft-res">Result · ${esc(eventName)}</span>`;
  const inPlay = mode === 'now' && f.status === 'live';
  const centre = done || inPlay || (f.s1 ?? 0) + (f.s2 ?? 0) > 0
    ? `${inPlay && f.legNow ? legChip(f.legNow) : ''}<div class="ft-score poster-num">${f.s1 ?? 0}<span>–</span>${f.s2 ?? 0}</div><div class="lbl ft-sub">${inPlay ? '<span class="ft-pulse"></span>Live score' : mode === 'now' ? 'Latest score' : 'Final score'}</div>`
    : `<div class="ft-score ft-vs poster-num">V</div><div class="lbl ft-sub">${mode === 'now' ? 'Waiting for the first dart' : esc(f.time ? `${f.time} UK time` : 'Time TBC')}</div>`;
  const side = (p, won, s, align) => `<div class="ft-who ${align}${won ? ' won' : ''}">
      <div><b>${esc(p.name)}</b><small>${flag(p.country)} ${p.ranking ? `World #${p.ranking}` : ''}${won ? ' · Winner' : ''}</small></div>
      ${s?.avg != null ? `<div class="ft-avg" title="Three-dart average"><span class="poster-num">${Number(s.avg).toFixed(2)}</span></div>` : ''}
    </div>`;
  return `<a class="ft-link" href="/match?id=${esc(f.id)}" aria-label="${esc(`${f.p1.name} v ${f.p2.name}`)}"></a>
    <div class="ft-top">${tag}<span class="lbl ft-stage">${esc(f.stage || '')}</span></div>
    <div class="ft-stage-row">
      <div class="ft-p l">${pic(f.p1, cutouts, 'l')}</div>
      <div class="ft-mid">${centre}</div>
      <div class="ft-p r">${pic(f.p2, cutouts, 'r')}</div>
    </div>
    <div class="ft-bottom">${side(f.p1, w1, st?.[0], 'l')}${side(f.p2, w2, st?.[1], 'r')}</div>`;
}

/** HTML for the volt "Next up" tile (inside its <a>). */
export function nextTileInner(f, eventName) {
  const last = n => n.split(' ').slice(-1)[0];
  return `<span class="lbl">Next up · ${esc(f.time || 'TBC')}</span>
    <span class="poster nu-names">${esc(last(f.p1.name))}<br>v ${esc(last(f.p2.name))}</span>
    <span class="nu-sub">${esc(f.stage || '')} · ${esc(eventName)}</span>`;
}
