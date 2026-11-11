#!/bin/bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

APP_URL="http://127.0.0.1:8000/"
READINESS_URL="${APP_URL}healthz/"
DOCKER_WAIT_SECONDS="${DOCKER_WAIT_SECONDS:-120}"
DB_WAIT_SECONDS="${DB_WAIT_SECONDS:-60}"
SERVER_WAIT_SECONDS="${SERVER_WAIT_SECONDS:-45}"

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

if ! command -v docker >/dev/null 2>&1; then
  fail "Docker was not found. Install Docker Desktop and make sure its CLI is available."
fi

if ! docker info >/dev/null 2>&1; then
  if [[ -d "/Applications/Docker.app" ]]; then
    printf 'Starting Docker Desktop...\n'
    open -a Docker
  else
    fail "Docker is not running and /Applications/Docker.app was not found."
  fi

  docker_ready=false
  for ((second = 0; second < DOCKER_WAIT_SECONDS; second++)); do
    if docker info >/dev/null 2>&1; then
      docker_ready=true
      break
    fi
    sleep 1
  done
  [[ "$docker_ready" == true ]] || fail "Docker did not become ready within ${DOCKER_WAIT_SECONDS}s."
fi
printf 'Docker is running.\n'

if [[ ! -f .env ]]; then
  cp .env.example .env
  printf 'Created .env from .env.example. Add your Google OAuth credentials before signing in.\n'
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  fail "Node.js and npm are required to build the frontend. Install Node.js 20.19+ or 22.12+."
fi

if [[ ! -x .venv/bin/python ]]; then
  printf 'Creating Python virtual environment...\n'
  python3 -m venv .venv
fi
PYTHON="$ROOT_DIR/.venv/bin/python"

if ! "$PYTHON" -c 'import django, environ, psycopg, certifi' >/dev/null 2>&1; then
  printf 'Installing Python dependencies...\n'
  "$PYTHON" -m pip install -r requirements.txt
fi

if [[ ! -x node_modules/.bin/vite || package-lock.json -nt node_modules/.package-lock.json ]]; then
  printf 'Installing frontend dependencies...\n'
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
fi

printf 'Building React frontend...\n'
npm run build

printf 'Starting PostgreSQL...\n'
docker compose up -d db
database_ready=false
for ((second = 0; second < DB_WAIT_SECONDS; second++)); do
  if docker compose exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
    database_ready=true
    break
  fi
  sleep 1
done
[[ "$database_ready" == true ]] || fail "PostgreSQL did not become ready within ${DB_WAIT_SECONDS}s. Check: docker compose logs db"
printf 'PostgreSQL is ready.\n'

printf 'Applying database migrations...\n'
"$PYTHON" manage.py migrate --noinput

if curl --silent --fail --output /dev/null "$READINESS_URL"; then
  fail "Something is already serving at ${APP_URL}. Stop it before running this launcher."
fi

printf 'Starting Django at %s...\n' "$APP_URL"
"$PYTHON" manage.py runserver --noreload 127.0.0.1:8000 &
DJANGO_PID=$!

cleanup() {
  if kill -0 "$DJANGO_PID" 2>/dev/null; then
    kill "$DJANGO_PID"
    wait "$DJANGO_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

server_ready=false
for ((second = 0; second < SERVER_WAIT_SECONDS; second++)); do
  if ! kill -0 "$DJANGO_PID" 2>/dev/null; then
    fail "Django exited before it became ready."
  fi
  if curl --silent --fail --output /dev/null "$READINESS_URL"; then
    server_ready=true
    break
  fi
  sleep 1
done
[[ "$server_ready" == true ]] || fail "Django did not become ready within ${SERVER_WAIT_SECONDS}s."

if open -a "Google Chrome" --args --new-window "$APP_URL" 2>/dev/null; then
  :
else
  printf 'Google Chrome was not found; opening the default browser instead.\n'
  open "$APP_URL"
fi

printf 'Opta Connector is running. Press Ctrl+C to stop Django; PostgreSQL will remain running.\n'
wait "$DJANGO_PID"
