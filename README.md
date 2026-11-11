# Opta Connector

A Django dashboard with Google sign-in, a PostgreSQL health check, and a manual StatsBomb Open Data pipeline for Premier League data.

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

## Production checklist

- Set `DJANGO_DEBUG=false` and a strong, unique `DJANGO_SECRET_KEY`.
- Set secure database and Google OAuth credentials through the deployment secret manager.
- Set `DJANGO_ALLOWED_HOSTS`, use HTTPS, and configure secure cookie and proxy settings for the hosting platform.
- Serve static assets with the deployment's static-file server or CDN.
- Run the StatsBomb sync worker through a durable task queue such as Celery for multi-process production deployments. The included background worker is designed for the single-process local launcher.
