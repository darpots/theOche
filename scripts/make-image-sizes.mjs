// Responsive copies of the cover photos: <name>-600.webp and <name>-1200.webp
// next to each JPEG in public/photos and public/news-img. Runs anywhere (sharp).
import { readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import sharp from 'sharp';

const ROOT = new URL('..', import.meta.url).pathname;
let made = 0;
for (const dir of ['public/photos', 'public/news-img']) {
  for (const f of await readdir(ROOT + dir)) {
    if (!f.endsWith('.jpg')) continue;
    for (const w of [600, 1200]) {
      const out = `${ROOT}${dir}/${f.replace('.jpg', `-${w}.webp`)}`;
      if (existsSync(out)) continue;
      await sharp(`${ROOT}${dir}/${f}`).resize({ width: w, withoutEnlargement: true }).webp({ quality: 74 }).toFile(out);
      made++;
    }
  }
}
// Widths of the player photos, so covers can skip ones too small to look sharp.
const sizes = {};
for (const f of await readdir(ROOT + 'public/photos')) {
  if (!f.endsWith('.jpg')) continue;
  sizes[f.replace('.jpg', '')] = (await sharp(`${ROOT}public/photos/${f}`).metadata()).width;
}
await writeFile(`${ROOT}src/data/photo-sizes.json`, JSON.stringify(sizes, null, 1) + '\n');
console.log(`image sizes: ${made} written; ${Object.keys(sizes).length} photo widths recorded`);
