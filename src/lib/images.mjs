// Player images, shared by the build and the browser. The index (written by
// scripts/make-player-images.mjs) is a few KB: { key: flags } with
// a = avatar, c = Creative Commons cut-out, p = PDC cut-out, h = PDC headshot.
import index from '../data/player-images.json';
import { keyName } from './pdc.mjs';

const flags = name => (name ? index[keyName(name)] || '' : '');

/** 112px square head-and-shoulders, or null. */
export function avatarSrc(name) {
  return flags(name).includes('a') ? `/avatars/${keyName(name)}.webp` : null;
}

/** Transparent cut-out at 400px wide (800px for retina), or null. prefer: 'cc' (default) or 'pdc' (studio shot, used by news panels). */
export function cutout(name, prefer = 'cc') {
  const f = flags(name), k = keyName(name || '');
  const cc = f.includes('c') ? `/cutouts/${k}` : null, pdc = f.includes('p') ? `/cutouts/${k}-pdc` : null;
  const base = prefer === 'pdc' ? pdc || cc : cc || pdc;
  if (!base) return null;
  return { src: `${base}-400.webp`, srcset: `${base}-400.webp 400w, ${base}-800.webp 800w`, licensed: f.includes('c') };
}

/** <img> markup for a cut-out; `sizes` is how wide it is shown. */
export function cutoutImg(name, cls = '', sizes = '300px', alt = '', prefer = 'cc') {
  const c = cutout(name, prefer);
  if (!c) return '';
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  // Studio cut-outs are full length: tagged 'studio' so a page can crop them to head and chest.
  return `<img class="${cls}${c.src.includes('-pdc-') ? ' studio' : ''}" src="${c.src}" srcset="${c.srcset}" sizes="${sizes}" alt="${esc(alt)}" decoding="async">`;
}

/** For a pair shown side by side: PDC studio cut-outs when both players have one (same framing), else the default. */
export const pairPrefer = (a, b) => (flags(a).includes('p') && flags(b).includes('p') ? 'pdc' : 'cc');

/** Keys of players whose pictures come from PDC rather than a licensed source (for /credits). */
export const pdcImageKeys = () => Object.entries(index).filter(([, f]) => f.includes('a') && f.includes('h') || f.includes('p')).map(([k]) => k);
