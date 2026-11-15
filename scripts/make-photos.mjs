// News cover photos (run on a Mac, like make-cutouts.mjs).
// 1. Library images in src/data/news-library.json -> public/news-img/<key>.jpg
// 2. Each credited player photo (src/data/portraits.json) at cover size ->
//    public/photos/<key>.jpg, with its face position from macOS Vision
//    written to src/data/photo-faces.json so covers crop around the face.
// Usage: node scripts/make-photos.mjs [key ...]
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { get, sleep, UA } from './lib.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const TMP = `${tmpdir()}/oche-photos/`;
const FACES = `${TMP}faces`;
await mkdir(TMP, { recursive: true });
await mkdir(`${ROOT}public/news-img`, { recursive: true });
await mkdir(`${ROOT}public/photos`, { recursive: true });
if (!existsSync(FACES)) execFileSync('swiftc', ['-O', `${ROOT}scripts/tools/faces.swift`, '-o', FACES]);

const only = process.argv.slice(2);
async function fetchCommons(file, width) {
  const api = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(file)}&prop=imageinfo&iiprop=url&iiurlwidth=${width}&format=json`;
  const info = Object.values((await get(api)).query.pages)[0].imageinfo[0];
  for (let k = 0; k < 5; k++) {
    const res = await fetch(info.thumburl || info.url, { headers: { 'user-agent': UA } });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    await sleep(4000 * (k + 1));
  }
  throw new Error('download failed');
}

const library = JSON.parse(await readFile(`${ROOT}src/data/news-library.json`, 'utf8'));
for (const [key, x] of Object.entries(library)) {
  const out = `${ROOT}public/news-img/${key}.jpg`;
  if ((only.length && !only.includes(key)) || (!only.length && existsSync(out))) continue;
  try { await sharp(await fetchCommons(x.file, 1600)).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toFile(out); console.log('library', key); }
  catch (e) { console.warn('skip', key, e.message); }
  await sleep(800);
}

const portraits = JSON.parse(await readFile(`${ROOT}src/data/portraits.json`, 'utf8'));
for (const [key, p] of Object.entries(portraits)) {
  const out = `${ROOT}public/photos/${key}.jpg`;
  if ((only.length && !only.includes(key)) || (!only.length && existsSync(out))) continue;
  try {
    const file = decodeURIComponent(p.source.split('/wiki/')[1]);
    await sharp(await fetchCommons(file, 1200)).resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toFile(out);
    console.log('photo', key);
  } catch (e) { console.warn('skip', key, e.message); }
  await sleep(800);
}

const files = Object.keys(portraits).map(k => `${ROOT}public/photos/${k}.jpg`).filter(existsSync);
const faces = {};
for (const line of execFileSync(FACES, files, { encoding: 'utf8' }).trim().split('\n')) {
  const [file, x, y, h] = line.split('\t');
  if (x !== '-') faces[file.split('/').pop().replace('.jpg', '')] = { x: +x, y: +y, h: +h };
}
await writeFile(`${ROOT}src/data/photo-faces.json`, JSON.stringify(faces, null, 1) + '\n');
console.log(`faces: ${Object.keys(faces).length}/${files.length}`);

// Responsive WebP copies for the site.
execFileSync('node', [`${ROOT}scripts/make-image-sizes.mjs`], { stdio: 'inherit' });
