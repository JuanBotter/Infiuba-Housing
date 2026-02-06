#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.test.yml"
SERVICE_NAME="postgres-test"
DATABASE_URL="postgres://infiuba:infiuba@localhost:5433/infiuba_test"

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
else
  COMPOSE_CMD=(docker-compose)
fi

cleanup() {
  "${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" down -v
}

trap cleanup EXIT

"${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" up -d

for _ in {1..30}; do
  if "${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" exec -T "$SERVICE_NAME" \
    pg_isready -U infiuba -d infiuba_test >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! "${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" exec -T "$SERVICE_NAME" \
  pg_isready -U infiuba -d infiuba_test >/dev/null 2>&1; then
  echo "Postgres did not become ready in time."
  exit 1
fi

export DATABASE_URL
export NODE_ENV="test"

npm run db:migrate
npm run test:integration
