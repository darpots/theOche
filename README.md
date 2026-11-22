# The Oche

A fast, static PDC darts site built with [Astro](https://astro.build) and hosted on Vercel. It keeps itself up to date through GitHub Actions, and uses free data sources only.

| Page | What it shows | Where the data comes from |
|---|---|---|
| **Calendar** (`/`) | PDC events on Sky Sports, ITV (incl. World Series) and PDCTV (European Tour), plus every Premier League night | PDC tournaments feed, filtered by the broadcaster map in `src/lib/pdc.mjs` |
| **Home** (`/`) | Matchday page: hero, today's order of play (live scores), latest news, live race or rankings, what's coming up | Build-time data, refreshed in the browser |
| **Calendar** (`/calendar`) | Every Sky Sports, ITV and PDCTV event, filterable by broadcaster | `calendar.json` |
| **Match centre** (`/match?id=<fixture>`) | Score, averages, stat comparison, running-average chart, remaining-score chart per leg, leg table; refreshes every 15s while live | PDC fixtures feed + timeline (every visit), in the browser |
| **Tournament pages** (`/tournament/<id>`) | One page per calendar event with the full schedule, scores and results by day (or all days). The nav's Matches link (and `/matches`) goes to the current event | PDC tournaments feed, refreshed **live in the browser every 30s** during an event; other events load their schedule from the feed in the browser |
| **News** (`/news`) | Our own dated reports, published in two editions a day (5am and 5pm UK). The page covers the last month; tournament round-ups stay on their tournament page longer. Research feeds are listed in `scripts/news/run.mjs` and are never named on the site | PDC data plus news feeds, written up by the newsdesk routine |
| **Player pages** (`/players/<slug>`) | A profile page for each of the top 128: season average, first-9 average, 180s, checkout %, record, career titles, tournament history (linked to tournament pages) and the latest news | Generated at build from `public/data/players/*.json` |
| **Rankings** (`/rankings`) | PDC Order of Merit, plus a **Live race** view while a ranking event is on; click a player for age, country, darts, season average (plus first-9 average, 180s, checkout %), season record and full tournament history | PDC rankings + participants feeds; history built from ~500 tournaments since 2005 |

## How it stays up to date

All automation is in `.github/workflows/`. Each job validates the data by building the site, and only commits when something actually changed. Every commit to `main` triggers a Vercel deploy.

| Workflow | Schedule | Does |
|---|---|---|
| `refresh-data.yml` | hourly | calendar, rankings, current tournament |
| Claude routine (claude.ai) | 5am and 5pm UK | follows `NEWSDESK.md`: the 5am and 5pm editions (fires at 04, 05, 16 and 17 UTC and skips the hour that isn't 5 o'clock in London) |
| `publish-newsdesk.yml` | when the routine pushes a `claude/newsdesk-*` branch | merges news-only changes into `main` |
| `news.yml` | 5am and 5pm UK | deletes reports older than a month (round-ups after 200 days) (and writes reports via an API if `NEWS_API_KEY` is set) |
| `refresh-players.yml` | daily | player profiles, season records, tournament history |

If a job fails, it opens a GitHub issue (and comments on it for repeat failures). The site keeps serving the last good data. All jobs can also be run by hand from the **Actions** tab (**Run workflow**).

### Newsdesk and duplicates

Reports are written by a scheduled Claude routine that follows [`NEWSDESK.md`](NEWSDESK.md). As a fallback, the script can also write reports through any OpenAI-compatible API (see below).


`scripts/news/run.mjs` groups feed items that cover the same story (shared headline words and players), skips anything whose source URL is already used or that overlaps a report from the last few days, and asks the model to reject anything else that duplicates a recent headline or is a stale preview. The model is told to write original copy, never invent facts, and keep quotes short, credited to the player only, and never name the outlets it researched. It calls any OpenAI-compatible chat API. By default that's Google Gemini's free tier, using a key stored as the `NEWS_API_KEY` repository secret. To switch provider, set the repository variables `NEWS_API_URL` and `NEWS_MODEL`. Without a key, the job only prunes old reports. Each run writes up to 6 stories.

### Known limits

- **Three-dart averages**: the PDC's free feed has no averages, and the sites that do (DartsDatabase, DartsOrakel) block automated access. Player pop-ups show the season win–loss record, legs won % and titles instead.
- **Broadcasters**: the PDC feed says whether an event is televised, but not which channel shows it. Channels are mapped per event type in `src/lib/pdc.mjs`. If a new televised event type appears, the hourly job lists it in its run summary.
- **Player photos**: `node scripts/find-portraits.mjs` looks for freely licensed photos of ranked players without one, using the player's Wikidata image (only when Wikidata confirms a darts player) or Commons files that name the player and are filed under a darts category; then run `make-cutouts.mjs` and `make-photos.mjs` for the new players (Mac). Many lower-ranked players (e.g. Charlie Manby, Sebastian Bialecki, Cristo Reyes) have no freely licensed photo anywhere yet, so they show initials. Only Creative Commons photos from Wikimedia Commons are used (`public/portraits`, credits at `/credits`). Other players show their initials. The homepage hero uses cut-outs of the same photos (`public/cutouts`), made on a Mac with `node scripts/make-cutouts.mjs` (macOS Vision subject lifting). Re-run it when new portraits are added. `node scripts/make-photos.mjs` (also Mac only) downloads larger versions of the same photos for news covers (`public/photos`, face positions in `src/data/photo-faces.json`) and the general darts photos listed in `src/data/news-library.json` (`public/news-img`). It also records each face's position (`src/data/faces.json`, via `scripts/tools/faces.swift`), so the hero and news covers can crop around the face at any size. News covers (`src/lib/covers.ts`) use a story's `image` if set, otherwise a photo of the player(s) named in the headline, otherwise a topical darts photo. Tournament round-ups (`kind: recap`, written from `npm run recap-facts -- <id>`) are linked from each tournament page's News tab.
- **Averages**: the PDC fixtures feed (`fixtures.darts.web.gc.pdcservices.co.uk/v2/<id>/timeline`) has every visit of every match. Tournament pages show each match's averages live; the daily players job sums points and darts for every main-tour match this season (cached in `data/stats-cache.json`, about 5,600 matches a year) to give darts-weighted season averages that match the PDC's own figures.
- **Live race**: worked out once a day by `scripts/refresh-live-race.mjs` (in the daily players job) and saved to `src/data/live-race.json`, so the Rankings page and homepage show it instantly; the page says when it was last updated. The PDC only republishes the official rankings after each event, and drops each event's prize money exactly 104 weeks after it was played. While a ranking event is on, the Rankings page (and the homepage tile) takes the official list, removes the money from every ranking event whose 104 weeks run out by the end of the current event (for the 2026 Grand Slam: the 2024 Grand Slam and the 2024 Players Championship Finals), adds what each player has guaranteed so far, and re-ranks. The feed gives each round's prize but not the winner's or group placings, so known winner prizes are listed in `WINNER_PRIZE` in `src/lib/pdc.mjs` and every group-stage exit counts the base group prize; figures can differ from sites like dartsrankings.com by a few thousand pounds.

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

## Design

"Floodlight Bento": chalk background, ink tiles for anything live, volt green (`--volt`) reserved for live numbers and the active menu item, Oche red for urgency, Anton (`--poster`) for scores, averages and headlines with Inter for reading. Tokens are in `src/styles/global.css`.

## Site-wide features

- **Live bar**: while the current event is on, a bar under the menu shows live scores (or the next match today) on every page, refreshed every 30 seconds, linking to the match centre.
- **Search** (⌘K / Ctrl+K, or the search tab on phones): players, events and news from `/search.json`, built at deploy.
- **Phones**: a bottom tab bar replaces the top menu.
- **Flags**: SVG flags from flag-icons (MIT) in `public/flags`.
- **Images**: cover photos have 600px and 1200px WebP copies (`scripts/make-image-sizes.mjs`) served with `srcset`.
- **Player pages** add a form guide, recent matches (linked to the match centre), an average-by-event chart and a world-ranking chart. Ranking history builds up in `rankings.json` (`history`), one snapshot per change in the official order, so that chart and the rankings-table trend lines appear after the next ranking update.
- **Play** (`/play`): Predictor (pick winners in the current event; picks in localStorage, two points for an underdog), Guess the player (daily, six clues), Checkout trainer (60-second checkout drill, `src/lib/checkout.mjs`), Head to head (`/h2h?a=<slug>&b=<slug>`), My Oche (`/my`, followed players' matches, form and news) and Records (`/records`, best single-match numbers of the season from `data/stats-cache.json`).
- **World Championship hub** (`/world-championship`): countdown, seeds (top 32 in the rankings), form players, roll of honour and Ally Pally news. The roll of honour and "defending champion" are built from PDC results (`src/lib/wc-roll.ts`), so a new champion appears within the hour of the final.
- **Share result card**: finished matches in the match centre can be shared as a 1200×630 image drawn in the browser (`src/lib/share-card.mjs`).
- **Dark mode**: follows the device, with an Auto / Light / Dark switch in the footer (saved per browser). Text uses `--fg` / `--fg-2`; `--ink` stays the dark tile colour in both themes.
- **Calendar**: past seasons load from `/calendar/past` only when "Include past 2 years" is ticked.
- **News previews** drop off the homepage and news page once their matches start (`matches` in the story, `src/lib/news.ts`).
