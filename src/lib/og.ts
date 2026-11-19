// Share images (1200×630 JPEG) built with sharp at build time. Pictures only,
// no text, so they look the same wherever the site is built.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PUB = join(process.cwd(), 'public');
const W = 1200, H = 630;
const TONES: Record<string, [string, string]> = {
  ink: ['#2a2d38', '#0b0c10'], red: ['#ff5a4f', '#e8362d'], volt: ['#e6ff99', '#c8ff2e'], green: ['#1fb37e', '#0e8a5f'], sky: ['#4a6bff', '#1d3fd6'],
};
const mark = readFileSync(join(PUB, 'favicon.svg'));

function panel(tone: string) {
  const [hi, lo] = TONES[tone] || TONES.ink;
  const ring = tone === 'volt' ? 'rgba(11,12,16,.12)' : 'rgba(255,255,255,.12)';
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><radialGradient id="g" cx="50%" cy="110%" r="90%"><stop offset="0" stop-color="${hi}"/><stop offset=".75" stop-color="${lo}"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <g fill="none" stroke="${ring}" stroke-width="2">${[560, 420, 280, 140, 40].map(r => `<circle cx="${W / 2}" cy="${H / 2}" r="${r}"/>`).join('')}</g></svg>`);
}

async function withMark(base: sharp.Sharp) {
  const m = await sharp(mark).resize(96, 96).png().toBuffer();
  // Flatten first: sharp keeps only the last composite() call.
  const flat = await base.png().toBuffer();
  return sharp(flat).composite([{ input: m, left: W - 96 - 36, top: 36 }]).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
}

/** A photo cropped to 1200×630 around its focus point ("48% 20%"). */
export async function ogPhoto(file: string, focus = '50% 30%') {
  const img = sharp(join(PUB, file));
  const meta = await img.metadata();
  const [fx, fy] = focus.split(' ').map(v => parseFloat(v) / 100);
  const scale = Math.max(W / meta.width!, H / meta.height!);
  const w = Math.round(meta.width! * scale), h = Math.round(meta.height! * scale);
  const left = Math.round(Math.min(w - W, Math.max(0, fx * w - W / 2)));
  const top = Math.round(Math.min(h - H, Math.max(0, fy * h - H / 2)));
  return withMark(sharp(await img.resize(w, h).extract({ left, top, width: W, height: H }).toBuffer()));
}

/** One or two player cut-outs standing on a brand-colour panel. */
export async function ogCutouts(files: string[], tone = 'ink') {
  // Each cut-out gets an equal share of the width (slight overlap), standing on the bottom edge.
  const maxW = Math.floor((W - 80) / files.length) + (files.length > 1 ? 60 : 0);
  const layers = await Promise.all(files.map(f => sharp(join(PUB, f)).resize({ height: files.length > 2 ? 560 : 600, width: Math.min(maxW, 760), fit: 'inside' }).png().toBuffer({ resolveWithObject: true })));
  const total = layers.reduce((s, l) => s + l.info.width, 0);
  const overlap = files.length > 1 ? Math.max(0, Math.ceil((total - (W - 40)) / (files.length - 1))) : 0;
  let x = Math.max(0, Math.round((W - (total - overlap * (files.length - 1))) / 2));
  const comp = layers.map(l => { const c = { input: l.data, left: Math.min(x, W - l.info.width), top: H - l.info.height }; x += l.info.width - overlap; return c; });
  return withMark(sharp(panel(tone)).composite(comp));
}

export const jpeg = (buf: Buffer) => new Response(new Uint8Array(buf), { headers: { 'Content-Type': 'image/jpeg' } });
