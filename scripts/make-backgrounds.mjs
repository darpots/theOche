// Eight generated backgrounds for calendar cards whose venue has no photo:
// dark, in the site's colours, darts-themed, no text. Each event picks one by
// its id, so a card always keeps the same background.
// Writes public/venues/bg-<n>-600.webp (1200x600). Usage: node scripts/make-backgrounds.mjs
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const ROOT = new URL('..', import.meta.url).pathname;
await mkdir(`${ROOT}public/venues`, { recursive: true });
const W = 1200, H = 600;
const INK = '#0b0c10', RED = '#e8362d', GREEN = '#0e8a5f', VOLT = '#c8ff2e', CREAM = '#f3ead2', SKY = '#2b4bff';
// Seeded random so the files are the same every run.
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const base = (extra = '') => `<rect width="${W}" height="${H}" fill="${INK}"/>${extra}`;
const svg = body => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`);
const ring = (cx, cy, r, sw, colA, colB, n = 20) => {
  const c = 2 * Math.PI * r, seg = c / n;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colA}" stroke-width="${sw}"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colB}" stroke-width="${sw}" stroke-dasharray="${seg} ${seg}"/>`;
};
const segments = (cx, cy, r, colA, colB, n = 20) => Array.from({ length: n }, (_, i) => {
  const a0 = (i / n) * 2 * Math.PI - Math.PI / 2 - Math.PI / n, a1 = a0 + (2 * Math.PI) / n;
  const p = a => `${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
  return `<path d="M${cx} ${cy} L${p(a0)} A${r} ${r} 0 0 1 ${p(a1)}Z" fill="${i % 2 ? colA : colB}"/>`;
}).join('');

const designs = [
  // 1. Rings: a dartboard's doubles and trebles, off to the right
  base(`<g opacity=".55">${ring(980, 300, 420, 46, GREEN, RED)}${ring(980, 300, 270, 36, GREEN, RED)}</g><circle cx="980" cy="300" r="40" fill="${GREEN}" opacity=".6"/><circle cx="980" cy="300" r="16" fill="${RED}" opacity=".7"/>`),
  // 2. A giant board segment, cream and black, darkened
  base(`<g opacity=".38">${segments(1150, 640, 900, '#1b1d26', CREAM)}</g>${ring(1150, 640, 900, 60, GREEN, RED)}<rect width="${W}" height="${H}" fill="url(#fade)"/><defs><linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="${INK}"/><stop offset=".7" stop-color="${INK}" stop-opacity=".2"/></linearGradient></defs>`),
  // 3. Stage spotlights through haze
  base(`<defs>${[0, 1, 2].map(i => `<linearGradient id="b${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${i === 1 ? VOLT : '#fff'}" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`).join('')}</defs>${[[620, -40, 380, 760], [900, -40, 780, 760], [1180, -40, 1000, 760]].map(([x1, y1, x2, y2], i) => `<polygon points="${x1 - 20},${y1} ${x1 + 20},${y1} ${x2 + 160},${y2} ${x2 - 160},${y2}" fill="url(#b${i})"/>`).join('')}<rect y="470" width="${W}" height="130" fill="${INK}" opacity=".6"/>`),
  // 4. The oche: floor lines running to the board, red throw line
  base(`<g stroke="#2a2d38" stroke-width="2">${Array.from({ length: 22 }, (_, i) => `<line x1="${900}" y1="120" x2="${-600 + i * 140}" y2="${H}"/>`).join('')}${Array.from({ length: 8 }, (_, i) => { const y = 160 + i * i * 9; return `<line x1="0" y1="${y}" x2="${W}" y2="${y}" opacity="${0.3 + i * 0.08}"/>`; }).join('')}</g><rect x="0" y="520" width="${W}" height="16" fill="${RED}"/><circle cx="900" cy="120" r="70" fill="none" stroke="${CREAM}" stroke-opacity=".35" stroke-width="6"/>`),
  // 5. Crowd lights: soft bokeh
  base(`<defs><filter id="blur"><feGaussianBlur stdDeviation="9"/></filter></defs><g filter="url(#blur)">${Array.from({ length: 70 }, () => `<circle cx="${(rnd() * W).toFixed(0)}" cy="${(220 + rnd() * 380).toFixed(0)}" r="${(8 + rnd() * 34).toFixed(0)}" fill="${[VOLT, RED, '#fff', SKY][Math.floor(rnd() * 4)]}" opacity="${(0.12 + rnd() * 0.35).toFixed(2)}"/>`).join('')}</g>`),
  // 6. Flight stripes: diagonal bands in red and green
  base(`<g transform="rotate(-24 600 300)" opacity=".7">${Array.from({ length: 9 }, (_, i) => `<rect x="${380 + i * 110}" y="-400" width="${i % 3 === 1 ? 70 : 34}" height="1400" fill="${[RED, GREEN, '#23252d'][i % 3]}" opacity="${0.35 + (i % 3) * 0.15}"/>`).join('')}</g><rect width="${W}" height="${H}" fill="url(#f)"/><defs><linearGradient id="f" x1="0" x2="1"><stop offset="0" stop-color="${INK}"/><stop offset=".55" stop-color="${INK}" stop-opacity=".1"/></linearGradient></defs>`),
  // 7. The board's wire: radial spider lines and circles, thin on deep blue
  `<rect width="${W}" height="${H}" fill="#0c1233"/><g stroke="#8fa2ff" stroke-opacity=".28" stroke-width="2" fill="none">${Array.from({ length: 20 }, (_, i) => { const a = (i / 20) * 2 * Math.PI + Math.PI / 20; return `<line x1="950" y1="300" x2="${(950 + Math.cos(a) * 900).toFixed(0)}" y2="${(300 + Math.sin(a) * 900).toFixed(0)}"/>`; }).join('')}${[60, 180, 210, 330, 360, 600].map(r => `<circle cx="950" cy="300" r="${r}"/>`).join('')}</g><circle cx="950" cy="300" r="22" fill="${RED}" opacity=".7"/>`,
  // 8. Confetti in gold and lime
  base(`${Array.from({ length: 140 }, () => { const x = rnd() * W, y = rnd() * H, s = 6 + rnd() * 14; return `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${s.toFixed(0)}" height="${(s * 0.45).toFixed(0)}" fill="${['#e8c766', '#c99a1c', VOLT, '#fff'][Math.floor(rnd() * 4)]}" opacity="${(0.25 + rnd() * 0.5).toFixed(2)}" transform="rotate(${(rnd() * 180).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`; }).join('')}<rect width="${W}" height="${H}" fill="url(#g)"/><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${INK}"/><stop offset=".6" stop-color="${INK}" stop-opacity="0"/></linearGradient></defs>`),
];
for (const [i, body] of designs.entries()) {
  await sharp(svg(body)).webp({ quality: 74 }).toFile(`${ROOT}public/venues/bg-${i + 1}-600.webp`);
}
console.log(`backgrounds: ${designs.length} written`);
