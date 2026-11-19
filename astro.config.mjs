import { defineConfig } from 'astro/config';

// Fully static site. Live data (scores, rankings) is fetched in the browser
// straight from the PDC's public, CORS-enabled feeds.
export default defineConfig({
  site: 'https://the-oche-mocha.vercel.app',
  trailingSlash: 'ignore',
  prefetch: { prefetchAll: true },
});
