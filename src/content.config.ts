import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const news = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/news', generateId: ({ data }) => String(data.slug) }),
  schema: z.object({
    slug: z.string(),
    date: z.string(),
    headline: z.string(),
    standfirst: z.string(),
    body: z.array(z.string()).min(1),
    tags: z.array(z.string()).default([]),
    players: z.array(z.string()).default([]),
    sources: z.array(z.object({ name: z.string(), url: z.string().url(), title: z.string().optional() })).min(1),
    originalTitles: z.array(z.string()).optional(),
    writtenBy: z.string().optional(),
    // 'recap' = a tournament round-up; kept while the event is on the calendar.
    // Data-led formats: 'match-report' (notable TV match), 'session' (results round-up of a
    // session), 'numbers' (numbers of the day), 'preview', 'analysis', 'movers' (weekly rankings);
    // 'talking-points' after a session; 'gear' = equipment launches (kept to a small share).
    kind: z.enum(['report', 'recap', 'match-report', 'session', 'numbers', 'talking-points', 'movers', 'preview', 'analysis', 'gear']).default('report'),
    // Facts file the story was written from (data/news-facts/<facts>.json); the checker verifies its numbers.
    facts: z.string().optional(),
    // Set when a story is revised (a quote added, a correction): shown on the article.
    updated: z.string().optional(),
    // PDC tournament id the story belongs to (links it to the tournament page).
    tournament: z.string().optional(),
    // Cover: a key from src/data/news-library.json, 'player' for the main player's photo, or omit to choose automatically.
    image: z.string().optional(),
    // Up to five headline numbers for the story ("10–8" / "Final score"). Match reports in
    // the current event get these from PDC's stats automatically when left out.
    keyNumbers: z.array(z.object({ value: z.string(), label: z.string() })).max(5).optional(),
    // A pull quote shown in the article: the words and who said them.
    quote: z.object({ text: z.string(), by: z.string() }).optional(),
  }),
});

export const collections = { news };
