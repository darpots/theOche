// Player images for every ranked player and everyone in the current event:
//  - avatars:   public/avatars/<key>.webp, 112px square head-and-shoulders
//  - cut-outs:  public/cutouts/<key>-400.webp and -800.webp (transparent)
// Sources, in order of preference:
//  - cut-outs: our Creative Commons cut-outs (public/cutouts/<key>.webp), else PDC's official headshot
//  - avatars:  PDC's official headshot (consistent studio shots), else our CC portrait
// PDC headshots are not licensed to us: fine for a personal site, to be replaced
// with licensed images before the site goes commercial (see /credits).
// Writes src/data/player-images.json: { key: flags } where a = avatar, c = CC cut-out,
// p = PDC cut-out, h = has a PDC headshot. Re-runs only fetch headshots that changed.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { API, keyName } from '../src/lib/pdc.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const read = async (f, d) => (existsSync(ROOT + f) ? JSON.parse(await readFile(ROOT + f, 'utf8')) : d);
const rankings = await read('src/data/rankings.json', { players: [] });
const tournament = (await read('src/data/tournament.json', {})).tournament || { stages: [] };
const portraits = await read('src/data/portraits.json', {});
const faces = await read('src/data/faces.json', {});
const cache = await read('data/headshot-cache.json', {}); // key -> PDC image file name last processed
const prev = await read('src/data/player-images.json', {});

// Who needs images: top 160 in the rankings plus everyone in the current event.
const people = new Map();
for (const p of rankings.players.filter(p => p.pos <= 160)) people.set(p.id, p.name);
for (const s of tournament.stages || []) for (const f of s.fixtures || []) for (const p of [f.p1, f.p2]) if (p) people.set(p.id, p.name);

for (const d of ['public/avatars', 'public/cutouts']) await mkdir(ROOT + d, { recursive: true });

async function json(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url); if (r.ok) return r.json(); } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 800 * (i + 1)));
  }
  return null;
}

/** Square crop around the head of a transparent cut-out: centred on the shoulders' midline, from the top of the hair. */
async function headSquare(buf, size) {
  const img = sharp(buf).ensureAlpha();
  const { data, info } = await img.clone().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, a = (x, y) => data[(y * W + x) * 4 + 3];
  let top = 0;
  outer: for (; top < H; top++) for (let x = 0; x < W; x += 2) if (a(x, top) > 40) break outer;
  // Head width from the opaque span a little below the top of the head.
  const band = Math.min(H - 1, top + Math.round(H * 0.08));
  let l = W, r = 0;
  for (let y = top; y <= band; y++) for (let x = 0; x < W; x++) if (a(x, y) > 40) { if (x < l) l = x; if (x > r) r = x; }
  const cx = Math.round((l + r) / 2), headW = Math.max(r - l, W * 0.18);
  const side = Math.min(W, H, Math.round(headW * 2.1));
  const left = Math.max(0, Math.min(W - side, cx - Math.round(side / 2)));
  const y0 = Math.max(0, Math.min(H - side, top - Math.round(side * 0.08)));
  return sharp(buf).extract({ left, top: y0, width: side, height: side }).resize(size, size).webp({ quality: 78 }).toBuffer();
}

let fetched = 0, made = 0;
const out = {};
const ids = [...people.entries()];
for (let i = 0; i < ids.length; i += 6) {
  await Promise.all(ids.slice(i, i + 6).map(async ([id, name]) => {
    const key = keyName(name);
    const flags = new Set(String(prev[key] || '').split('').filter(Boolean));
    // PDC headshot (only re-processed when its file name changes).
    const pa = await json(`${API.participants}${id}`);
    const file = pa?.data?.attributes?.media?.find(m => m.type === 'profile')?.image || null;
    if (file && (cache[key] !== file || !existsSync(`${ROOT}public/avatars/${key}.webp`))) {
      const res = await fetch(`${API.images}fit-in/900x900/${file}`).catch(() => null);
      if (res?.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const trimmed = await sharp(buf).trim({ threshold: 1 }).png().toBuffer();
        await sharp(await headSquare(trimmed, 112)).toFile(`${ROOT}public/avatars/${key}.webp`);
        // PDC cut-outs only where we have no Creative Commons one.
        if (!existsSync(`${ROOT}public/cutouts/${key}.webp`)) {
          for (const w of [400, 800]) await sharp(trimmed).resize({ width: w, withoutEnlargement: true }).webp({ quality: 76 }).toFile(`${ROOT}public/cutouts/${key}-pdc-${w}.webp`);
        }
        cache[key] = file; fetched++;
      }
    }
    if (file) flags.add('h');
    // Avatar fallback: our CC portrait, cropped to the face.
    if (!existsSync(`${ROOT}public/avatars/${key}.webp`) && portraits[key]) {
      const src = ROOT + 'public' + portraits[key].image;
      const meta = await sharp(src).metadata();
      const f = faces[key];
      const side = Math.round(Math.min(meta.width, meta.height, f ? f.h * meta.height * 1.9 : Math.min(meta.width, meta.height)));
      const cx = f ? f.x * meta.width : meta.width / 2, cy = f ? f.y * meta.height : meta.height * 0.4;
      const left = Math.round(Math.max(0, Math.min(meta.width - side, cx - side / 2)));
      const top = Math.round(Math.max(0, Math.min(meta.height - side, cy - side / 2)));
      await sharp(src).extract({ left, top, width: side, height: side }).resize(112, 112).webp({ quality: 78 }).toFile(`${ROOT}public/avatars/${key}.webp`);
      made++;
    }
    if (existsSync(`${ROOT}public/avatars/${key}.webp`)) flags.add('a');
    // Cut-outs: CC first (with smaller copies), else PDC.
    if (existsSync(`${ROOT}public/cutouts/${key}.webp`)) {
      for (const w of [400, 800]) {
        const o = `${ROOT}public/cutouts/${key}-${w}.webp`;
        if (!existsSync(o)) { await sharp(`${ROOT}public/cutouts/${key}.webp`).resize({ width: w, withoutEnlargement: true }).webp({ quality: 76 }).toFile(o); made++; }
      }
      flags.add('c'); flags.delete('p');
    } else if (existsSync(`${ROOT}public/cutouts/${key}-pdc-400.webp`)) {
      flags.add('p');
    }
    if (flags.has('a') || flags.has('c') || flags.has('p')) out[key] = [...flags].sort().join('');
  }));
}

// Keep entries for players who dropped out of the lists this run (files are still there).
for (const [k, v] of Object.entries(prev)) if (!out[k]) out[k] = v;
await writeFile(ROOT + 'src/data/player-images.json', JSON.stringify(Object.fromEntries(Object.entries(out).sort())));
await writeFile(ROOT + 'data/headshot-cache.json', JSON.stringify(cache, null, 1));
console.log(`player images: ${people.size} players, ${fetched} PDC headshots fetched, ${made} other files made, ${Object.keys(out).length} in the index`);
