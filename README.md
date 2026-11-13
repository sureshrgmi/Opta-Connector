# TechnicalArea

A football analysis and creator workspace with Google sign-in, a PostgreSQL health check, and a manual StatsBomb Open Data pipeline for Premier League data.

## Requirements

- Python 3.10+
- Docker with the Compose plugin
- Node.js 20.19+ and npm 10+
- A Google OAuth web client (steps below)

## Run locally

1. Configure Google OAuth using the steps below. Create a local environment file if one does not already exist:

   ```sh
   cp .env.example .env
   ```

   Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`. For any non-local deployment, replace the development secret and database password, set `DJANGO_DEBUG=false`, and configure `DJANGO_ALLOWED_HOSTS`.

2. Run the single-command launcher:

   ```sh
   ./run-platform.command
   ```

   On macOS, the launcher starts Docker Desktop if needed, installs missing Python/Node dependencies, builds the React frontend, starts PostgreSQL, applies migrations, launches Django, and opens a new Chrome window. The launcher stays in the terminal; press **Ctrl+C** to stop Django. PostgreSQL remains running.

   On first run, if `.env` is missing, it is copied from `.env.example`. Add Google OAuth credentials to `.env` before signing in. The launcher does not overwrite an existing `.env`.

3. Visit <http://127.0.0.1:8000/> if Chrome did not open automatically. Choose **Continue with Google**. Browse imported datasets from the expandable **Tables** group on the left. The PostgreSQL health check is under **Config**.

To run without the launcher, create/activate a virtual environment, install `requirements.txt`, run `npm install && npm run build`, start PostgreSQL with `docker compose up -d db`, apply migrations with `python manage.py migrate`, then run `python manage.py runserver`.

The dashboard frontend uses React, TypeScript, Vite, Tailwind CSS, and Lucide icons. Django serves the built assets from `static/frontend/`.

## User roles and administration

New accounts receive the **Analyst** role. Analysts can use Overview, Ball By Ball, and the data tables. Admins also get the Admin section (user/access management and pipeline settings), Config (PostgreSQL check), and StatsBomb sync controls. Admin-only pages and write APIs enforce these roles server-side; hiding a menu item is not the access-control boundary.

To grant the first Admin, have the intended account sign in once, then run:

```sh
python manage.py promote_to_admin your-google-sign-in-email@example.com
```

Use the Google sign-in email of the account that should administer this workspace. Existing Django superusers retain Admin access; their superuser accounts are protected from role or activation changes in the workspace user panel. The panel prevents demoting or disabling the last active Admin.

Use **Admin → Data pipeline** to enable or disable manual syncs and configure match-import concurrency, source request timeouts, and retry attempts. These settings apply to subsequent syncs; the data source and competition are the configured StatsBomb Open Data Premier League feed.

## Configure Google OAuth

1. In [Google Cloud Console](https://console.cloud.google.com/), select or create a project.
2. Configure the OAuth consent screen (Google Auth Platform) and add the scopes `openid`, `email`, and `profile`. Add your Google account as a test user while the app is in testing.
3. Create an OAuth client ID with application type **Web application**.
4. Add an authorized JavaScript origin:
   - `http://127.0.0.1:8000`
   - `http://localhost:8000` (if you also browse using `localhost`)
5. Add this authorized redirect URI:
   - `http://127.0.0.1:8000/accounts/google/login/callback/`
   - If you use `localhost`, add `http://localhost:8000/accounts/google/login/callback/` too.
6. Copy the client ID and client secret to `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`, then restart the Django server.

The OAuth callback uses the exact host used to open the site; the redirect URI in Google Cloud must match it exactly. For production, use HTTPS and register the production callback URI.

## PostgreSQL configuration

`docker-compose.yml` runs PostgreSQL on port 5432 with a named data volume. Django reads `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, and `POSTGRES_PORT` from the process environment. The defaults are for local development only. The health endpoint executes `SELECT 1`, returns JSON and HTTP 503 on a database error, and is restricted to authenticated users.

## StatsBomb Open Data pipeline

The **Sync StatsBomb** page downloads the official [StatsBomb Open Data](https://github.com/statsbomb/open-data) JSON files and incrementally upserts them into PostgreSQL. The imported tables are competitions, seasons, teams, players, matches, lineups, and events. Browse them from the expandable **Tables** sidebar. A sync runs in a background worker; the page polls its progress and displays errors and imported/updated counts.

The upstream repository's free Premier League coverage is historical: **2003/04 and 2015/16**. It does not provide the current Premier League season or a live feed. Manual sync checks the repository for updates to those available files; it cannot fetch newer paid Opta/StatsBomb coverage. The open data is intended for research and football analytics; credit StatsBomb when publishing analysis based on it, as described in the upstream repository's terms.

Use **Ball By Ball** under Overview to choose an imported match and explicitly load its events; playback data begins loading after a short two-second preparation state. The scoreboard shows the event-by-event live score alongside the final score and lists credited scorers as goals occur. Playback speed is adjustable; goal events are highlighted in the event stream. Goal and red-card filters show the selected moment plus the ten preceding events; player-touch and player-pass filters cover that player's events across the full match. The timeline, event stream, team/player context, locations, and full source event payload are shown when available. Pitch coordinates use StatsBomb's 120 × 80 grid; events without source coordinates still appear in the timeline and event stream.

### Creator Studio

Open **Creator Studio** under Overview and choose **Broadcast Studio** to build 16:9 broadcast graphics for a match:

- **Pass network** shows average player locations, completed receiver-to-receiver pass volume, and a dashed 10m forward-progression proxy.
- **Shot map** scales shot markers by StatsBomb xG and distinguishes goals and big chances.
- **xG race** plots cumulative StatsBomb xG with goal and big-chance markers.
- **StatsBomb 360** renders the selected freeze frame, visible-area polygon, players, and candidate passing lanes when a match has a published `three-sixty` file. 360 JSON is fetched on demand from the public source with a short timeout and at most one retry, then cached in `Match360Data`; a missing upstream file is cached as unavailable. Ordinary match syncs do not download 360 files.

Toggle **Creator Export Mode** to hide application navigation. Export the current graphic as a 3840 × 2160 PNG or scalable SVG, with a transparent or broadcast-dark canvas. The title, score, season, and source watermark are included in the exported artwork. Calculations are memoized in the browser per loaded match, and derived statistics are explicitly labeled as illustrative proxies rather than official Opta metrics.

The feature code is isolated under `frontend/src/creator/`: `CreatorStudio.tsx` owns selection and export state, `analytics.ts` computes match aggregates, `PitchVisual.tsx` renders SVG graphics, and `exportGraphic.ts` serializes PNG/SVG files. The Django `Match360Data` one-to-one cache stores source freeze frames separately from event rows. For future cross-match creator analysis, keep raw event/lineup/360 source data canonical and add reusable server-side analytics services and compact, versioned derived-data caches only when measurements show client aggregation is no longer sufficient; avoid persisting duplicate per-match xG or pass aggregates.

Choose **Starting XI** to make a one- or two-team formation graphic. Team rosters and shirt numbers come from each club's most recent synced lineup; starting players are preselected when the source lineup identifies them. Formation, club-color defaults, and player assignments are editable, and custom players can be added to the sheet. Export the finished 16:9 graphic as a 4K PNG or SVG. The authenticated `/api/creator/starting-xi/teams/` and `/api/creator/starting-xi/teams/<team_id>/players/` endpoints provide team options and latest-lineup data.

### StatsBomb Explore

Open **Explore** under Overview to select a competition, season, match, team, player, match phase, minute window, and grouping. The dashboard includes shot maps, pass networks, binned action-density heatmaps, match-peer player percentile profiles, configurable player scatter plots, and cumulative xG timelines. The filtered event rows can be exported as CSV.

The implementation adds no framework or plotting dependency. `dashboard/explore.py` processes the existing StatsBomb event and lineup JSON fields into compact event and per-player metrics; `/api/explore/options/` and `/api/explore/data/` provide authenticated filter and analysis APIs. `frontend/src/explore/` contains the typed API shapes, query panel, and native SVG visualizations. Per-90 and percentile values are match-peer comparisons for the currently selected match, not a cross-season scouting baseline; progressive actions use a documented 10m forward-distance proxy. Cross-match benchmarks can later be added using a measured, versioned server-side aggregation cache without changing the raw event source of truth.

## Production checklist

- Set `DJANGO_DEBUG=false` and a strong, unique `DJANGO_SECRET_KEY`.
- Set secure database and Google OAuth credentials through the deployment secret manager.
- Set `DJANGO_ALLOWED_HOSTS`, use HTTPS, and configure secure cookie and proxy settings for the hosting platform.
- Serve static assets with the deployment's static-file server or CDN.
- Run the StatsBomb sync worker through a durable task queue such as Celery for multi-process production deployments. The included background worker is designed for the single-process local launcher.
