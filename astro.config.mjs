import { defineConfig } from 'astro/config';

// Fully static site. Live data (scores, rankings) is fetched in the browser
// straight from the PDC's public, CORS-enabled feeds.
export default defineConfig({
  site: 'https://theoche.vercel.app',
  trailingSlash: 'ignore',
  prefetch: { prefetchAll: true },
});
