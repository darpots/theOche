# The Oche

A fast, static PDC darts site built with [Astro](https://astro.build) and hosted on Vercel. It keeps itself up to date through GitHub Actions, and uses free data sources only.

| Page | What it shows | Where the data comes from |
|---|---|---|
| **Calendar** (`/`) | PDC events on Sky Sports, ITV (incl. World Series) and PDCTV (European Tour), plus every Premier League night | PDC tournaments feed, filtered by the broadcaster map in `src/lib/pdc.mjs` |
| **Tournament pages** (`/tournament/<id>`) | One page per calendar event with the full schedule, scores and results by day (or all days). The nav's Matches link (and `/matches`) goes to the current event | PDC tournaments feed, refreshed **live in the browser every 30s** during an event; other events load their schedule from the feed in the browser |
| **News** (`/news`) | Original, dated reports (the page covers the last month; tournament round-ups stay on their tournament page for longer) that link to their sources | BBC Sport, Dartsnews, Darts World and Guardian RSS feeds → written up by a free-tier LLM (Google Gemini by default) |
| **Player pages** (`/players/<slug>`) | A profile page for each of the top 128: season average, first-9 average, 180s, checkout %, record, career titles, tournament history (linked to tournament pages) and the latest news | Generated at build from `public/data/players/*.json` |
| **Rankings** (`/rankings`) | PDC Order of Merit, plus a **Live race** view while a ranking event is on; click a player for age, country, darts, season average (plus first-9 average, 180s, checkout %), season record and full tournament history | PDC rankings + participants feeds; history built from ~500 tournaments since 2005 |

## How it stays up to date

All automation is in `.github/workflows/`. Each job validates the data by building the site, and only commits when something actually changed. Every commit to `main` triggers a Vercel deploy.

| Workflow | Schedule | Does |
|---|---|---|
| `refresh-data.yml` | hourly | calendar, rankings, current tournament |
| Claude routine (claude.ai) | every 3 hours | follows `NEWSDESK.md`: finds new stories, removes duplicates, writes original reports |
| `publish-newsdesk.yml` | when the routine pushes a `claude/newsdesk-*` branch | merges news-only changes into `main` |
| `news.yml` | daily | deletes reports older than a month (round-ups after 200 days) (and writes reports via an API if `NEWS_API_KEY` is set) |
| `refresh-players.yml` | daily | player profiles, season records, tournament history |

If a job fails, it opens a GitHub issue (and comments on it for repeat failures). The site keeps serving the last good data. All jobs can also be run by hand from the **Actions** tab (**Run workflow**).

### Newsdesk and duplicates

Reports are written by a scheduled Claude routine that follows [`NEWSDESK.md`](NEWSDESK.md). As a fallback, the script can also write reports through any OpenAI-compatible API (see below).


`scripts/news/run.mjs` groups feed items that cover the same story (shared headline words and players), skips anything whose source URL is already used or that overlaps a report from the last few days, and asks the model to reject anything else that duplicates a recent headline or is a stale preview. The model is told to write original copy, never invent facts, and keep quotes short and attributed. It calls any OpenAI-compatible chat API. By default that's Google Gemini's free tier, using a key stored as the `NEWS_API_KEY` repository secret. To switch provider, set the repository variables `NEWS_API_URL` and `NEWS_MODEL`. Without a key, the job only prunes old reports. Each run writes up to 6 stories.

### Known limits

- **Three-dart averages**: the PDC's free feed has no averages, and the sites that do (DartsDatabase, DartsOrakel) block automated access. Player pop-ups show the season win–loss record, legs won % and titles instead.
- **Broadcasters**: the PDC feed says whether an event is televised, but not which channel shows it. Channels are mapped per event type in `src/lib/pdc.mjs`. If a new televised event type appears, the hourly job lists it in its run summary.
- **Player photos**: only Creative Commons photos from Wikimedia Commons are used (`public/portraits`, credits at `/credits`). Other players show their initials. The homepage hero uses cut-outs of the same photos (`public/cutouts`), made on a Mac with `node scripts/make-cutouts.mjs` (macOS Vision subject lifting). Re-run it when new portraits are added. `node scripts/make-photos.mjs` (also Mac only) downloads larger versions of the same photos for news covers (`public/photos`, face positions in `src/data/photo-faces.json`) and the general darts photos listed in `src/data/news-library.json` (`public/news-img`). It also records each face's position (`src/data/faces.json`, via `scripts/tools/faces.swift`), so the hero and news covers can crop around the face at any size. News covers (`src/lib/covers.ts`) use a story's `image` if set, otherwise a photo of the player(s) named in the headline, otherwise a topical darts photo. Tournament round-ups (`kind: recap`, written from `npm run recap-facts -- <id>`) are linked from each tournament page's News tab.
- **Averages**: the PDC fixtures feed (`fixtures.darts.web.gc.pdcservices.co.uk/v2/<id>/timeline`) has every visit of every match. Tournament pages show each match's averages live; the daily players job sums points and darts for every main-tour match this season (cached in `data/stats-cache.json`, about 5,600 matches a year) to give darts-weighted season averages that match the PDC's own figures.
- **Live race**: the PDC only republishes the official rankings after each event. While a ranking event is on, the Rankings page takes the official list, removes the prize money from the same event two years earlier (which is about to expire) and adds what each player has already guaranteed this time, then re-ranks. The feed doesn't include the winner's prize, so known winner prizes are listed in `WINNER_PRIZE` in `src/lib/pdc.mjs`; others are estimated from the runner-up prize (marked with *). Unofficial sites such as dartsrankings.com use their own prize databases and drop rules, so small differences are expected; the official list is the source of truth once the PDC publishes it.

## Local development

```sh
npm install
npm run dev            # http://localhost:4321
npm run data:fast      # refresh calendar, rankings, current tournament
npm run data:players   # refresh player profiles (first run fetches ~500 tournaments)
npm run news -- --dry  # show which stories the newsdesk would write
npm test
```

To run the newsdesk locally for real, set `NEWS_API_KEY` (and optionally `NEWS_API_URL` / `NEWS_MODEL`).
