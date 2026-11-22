import { defineConfig } from 'astro/config';
import { readdir, readFile, unlink, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// After the build, drop original JPG/PNG photos nothing on the site refers to: they're
// only read at build time (share cards, resized copies), so they don't need deploying.
// Photo credits show the webp copies.
const IMAGE_DIRS = ['photos', 'news-img', 'venues', 'portraits', 'cutouts'];
function pruneUnusedImages() {
  return {
    name: 'prune-unused-images',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const files = [];
        const visit = async d => { for (const e of await readdir(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) await visit(p); else files.push(p); } };
        await visit(root);
        // Everything the site can ask for: pages, scripts, styles and data files.
        let text = '';
        for (const f of files) if (/\.(html|js|css|json|xml|txt|webmanifest)$/.test(f)) text += await readFile(f, 'utf8');
        let removed = 0, bytes = 0;
        for (const f of files) {
          const rel = relative(root, f);
          // Only originals: the webp sizes are often named in the browser from a player key, so they always stay.
          if (!IMAGE_DIRS.includes(rel.split('/')[0]) || !/\.(jpe?g|png)$/i.test(rel)) continue;
          const name = rel.split('/').pop();
          if (text.includes(name)) continue;
          bytes += (await stat(f)).size; await unlink(f); removed++;
        }
        logger.info(`removed ${removed} unreferenced images (${(bytes / 1e6).toFixed(1)} MB)`);
      },
    },
  };
}

// Fully static site. Live data (scores, rankings) is fetched in the browser
// straight from the PDC's public, CORS-enabled feeds.
export default defineConfig({
  site: 'https://the-oche-mocha.vercel.app',
  trailingSlash: 'ignore',
  prefetch: { prefetchAll: true },
  integrations: [pruneUnusedImages()],
});
