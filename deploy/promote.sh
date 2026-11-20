#!/usr/bin/env bash
# Powercoders Job Radar: PRODUCTION PROMOTION. The ONLY way production deploys.
# Ported from the client template's promote.sh (the compose file, the image tag and the alias checks differ).
#
#   bash deploy/promote.sh <git-ref>        e.g. bash deploy/promote.sh 1a2b3c4
#
# THIS SCRIPT NEVER BUILDS (incident of the client template 24.10.2026: a Next.js build on the client server froze the box). The
# image is built off the server by Pandora's in-house client CI after GREEN on main, with the build arg
#   NEXT_PUBLIC_APP_URL=https://radar.gnamak.ch
# tagged with the FULL commit sha and pushed to the private GHCR package
#   ghcr.io/7hem4ster/powercoders-radar:<full sha>
# The server needs a one-time `docker login ghcr.io` with a read:packages token.
#
# What it does, in order:
#   1. Preflight-asserts deploy/.env is production-shaped (untracked file).
#   2. Takes a WAL-safe pre-promotion DB backup (VACUUM INTO).
#   3. Refuses unless <git-ref> is on origin/main, then pulls the CI image for its full sha from GHCR (exit 2 if
#      it is not there), then pins the checkout (checkout --detach: `git log -1` always documents what is live).
#   4. Writes the new tag to deploy/.env (RADAR_TAG; the old one goes to RADAR_TAG_PREV) and recreates the app with
#      --no-build. Caddy is started if it is not running, and restarted when its Caddyfile changed.
#   5. Gates: image-swap assertion, health loop on /api/health (60 s), no «Testumgebung» band, content probe (robots.txt names the
#      production URL). Any of these failing ROLLS BACK AUTOMATICALLY to the previous tag and exits 1.
#   6. Prunes old local images (the newest 3 stay, the running and the previous one always).
#
# Manual rollback (printed again on any gate failure): put the older sha into RADAR_TAG in deploy/.env, then
#   docker compose -f deploy/docker-compose.prod.yml up -d --no-build --force-recreate radar
#   (`docker images ghcr.io/7hem4ster/powercoders-radar` lists the local shas; DB, only if a migration ran:
#   restore the newest /home/ubuntu/backups/radar/pre-promote-*.db with the container stopped.)
#
# The whole script is one function, called on the last line: the checkout in step 3 rewrites this very file
# while bash is running it, and bash must not read the new text from an old byte offset.
set -e

main() {
cd "$(dirname "$0")/.."

REF="${1:-}"
if [ -z "$REF" ]; then
  echo "Usage: bash deploy/promote.sh <git-ref>   (refusing to guess a ref)"; exit 2; fi

COMPOSE_FILE="deploy/docker-compose.prod.yml"
ENV_FILE="deploy/.env"
COMPOSE="docker compose -f $COMPOSE_FILE"
CONTAINER="radar-radar-1"
PROD_URL="https://radar.gnamak.ch"
GHCR_IMAGE="ghcr.io/7hem4ster/powercoders-radar"
BACKUP_DIR="/home/ubuntu/backups/radar"

# >>> helpers (lib/__tests__/deploy-files.test.ts runs the swap block with these)
envval() { grep -E "^${1}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- || true; }
setenv() {
  # setenv KEY VALUE: replace the line in deploy/.env, or append it.
  if grep -qE "^${1}=" "$ENV_FILE" 2>/dev/null; then sed -i "s|^${1}=.*|${1}=${2}|" "$ENV_FILE"
  else echo "${1}=${2}" >> "$ENV_FILE"; fi
}
# <<< helpers

DATA_DIR="$(envval RADAR_DATA_DIR)"; DATA_DIR="${DATA_DIR:-/home/ubuntu/radar-data}"

# ── 1. Preflight: refuse anything that is not a production .env ──────────────
fail() { echo "✗ PREFLIGHT: $1"; exit 1; }
[ -f "$ENV_FILE" ] || fail "$ENV_FILE missing (cp deploy/.env.example deploy/.env and fill it in)"
AUTH_SECRET_VAL=$(envval AUTH_SECRET)
[ -n "$AUTH_SECRET_VAL" ] && [ "${#AUTH_SECRET_VAL}" -ge 32 ] || fail "AUTH_SECRET missing/too short (need 32+: openssl rand -hex 32)"
[ -z "$(envval DEMO_INSTANCE)" ] || fail "DEMO_INSTANCE must not be set in production"
[ -z "$(envval EMAIL_STUB)" ] || fail "EMAIL_STUB must not be set in production"
for S in SMTP_HOST SMTP_USER SMTP_PASS; do
  [ -n "$(envval $S)" ] || fail "$S missing: production must have real SMTP (password reset mails)"; done
URL_VAL=$(envval NEXT_PUBLIC_APP_URL)
[ -z "$URL_VAL" ] || [ "$URL_VAL" = "$PROD_URL" ] || fail "NEXT_PUBLIC_APP_URL must be $PROD_URL or unset (got '$URL_VAL')"
chmod 600 "$ENV_FILE"

# ── 2. Pre-promotion DB backup (WAL-safe) ────────────────────────────────────
mkdir -p "$BACKUP_DIR"
TS=$(date +%Y%m%d-%H%M%S)
BK="pre-promote-${TS}.db"
if docker inspect "$CONTAINER" >/dev/null 2>&1 && \
   [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER")" = "true" ]; then
  docker exec "$CONTAINER" node -e \
    "require('better-sqlite3')('/app/data/local.db').exec(\"VACUUM INTO '/app/data/${BK}'\")"
  sudo mv "${DATA_DIR}/${BK}" "$BACKUP_DIR/${BK}"
  sudo chown ubuntu:ubuntu "$BACKUP_DIR/${BK}"
elif [ -f "${DATA_DIR}/local.db" ]; then
  # Container down = no writers; a cold copy is consistent.
  sudo cp "${DATA_DIR}/local.db" "$BACKUP_DIR/${BK}"
  sudo chown ubuntu:ubuntu "$BACKUP_DIR/${BK}"
fi
if [ -f "$BACKUP_DIR/${BK}" ]; then
  [ -s "$BACKUP_DIR/${BK}" ] || { echo "✗ backup ${BK} is empty: aborting promotion"; exit 1; }
  echo "✓ DB backup: $BACKUP_DIR/${BK} ($(stat -c%s "$BACKUP_DIR/${BK}") bytes)"
else
  echo "✓ no database yet (first promotion): nothing to back up"
fi
ls -1t "$BACKUP_DIR"/pre-promote-*.db 2>/dev/null | tail -n +21 | xargs -r rm -f

# ── 3. Pin the checkout ──────────────────────────────────────────────────────
# >>> ref-gate (lib/__tests__/deploy-files.test.ts runs this block)
git fetch --all --tags --quiet
git rev-parse --verify --quiet "${REF}^{commit}" >/dev/null || { echo "✗ unknown ref: $REF"; exit 1; }
# Only what is merged ships (security review of the client template): the ref must be on origin/main, so an unreviewed
# branch or a typo'd sha of a side branch is refused. A rollback to an older main commit is still on main.
git merge-base --is-ancestor "${REF}^{commit}" origin/main \
  || { echo "✗ $REF is not on origin/main: only merged commits are promoted"; exit 1; }
# <<< ref-gate
FULL_SHA=$(git rev-parse "${REF}^{commit}")
GHCR_REF="${GHCR_IMAGE}:${FULL_SHA}"


# >>> pull-gate (lib/__tests__/deploy-files.test.ts runs this block)
# The CI-built image for exactly this commit, or nothing. Nothing is built here.
echo "Pulling ${GHCR_REF} ..."
if ! PULL_OUT=$(docker pull --quiet "$GHCR_REF" 2>&1) || ! docker image inspect "$GHCR_REF" >/dev/null 2>&1; then
  echo "✗ NO CI IMAGE for ${FULL_SHA} in GHCR (${GHCR_REF})."
  echo "$PULL_OUT" | tail -n 3 | sed 's/^/    /'
  echo "  promote.sh never builds on this server. Wait for the client CI to go GREEN on"
  echo "  this commit and push the image, or check the server's docker login to ghcr.io."
  exit 2
fi
echo "✓ pulled ${GHCR_REF}"
# <<< pull-gate

git checkout --detach --quiet "$REF"
SHORT_SHA=$(git rev-parse --short HEAD)
echo "✓ pinned to $(git log -1 --format='%h %cI %s')"

# ── 4. Stale-container sweep, tag swap + recreate (no build) ────────────────
# `--force-recreate` renames the old container to <hash>_<name> and removes it afterwards; an interrupted
# promote leaves the renamed one behind and every later one dies at «name already in use» (incident of the client template).
STALE=$(docker ps -a --format '{{.ID}} {{.Names}}' \
  | awk -v pat="^[0-9a-f]+_${CONTAINER}$" '$2 ~ pat {print $1}')
# shellcheck disable=SC2086
[ -n "$STALE" ] && docker rm -f $STALE

sudo mkdir -p "${DATA_DIR}/uploads" && sudo chown -R 1001:1001 "${DATA_DIR}" || true

# >>> swap (lib/__tests__/deploy-files.test.ts runs this block with a stubbed docker)
PREV_TAG="$(envval RADAR_TAG)"

rollback_help() {
  echo "  ROLLBACK: put the older sha into RADAR_TAG in $ENV_FILE, then"
  echo "    $COMPOSE up -d --no-build --force-recreate radar"
  echo "  DB (only if data was migrated): restore $BACKUP_DIR/${BK}"
}

# Health loop: 60 s for /api/health (it opens, migrates and seeds the database) on 127.0.0.1:3000.
wait_healthy() {
  for i in $(seq 1 60); do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/health || echo "000")
    case "$HTTP_CODE" in 200) echo "✓ up (${i}s, HTTP ${HTTP_CODE})"; return 0;; esac
    sleep 1
  done
  echo "✗ no response within 60 s (last ${HTTP_CODE})."
  return 1
}

# A failed gate puts the previous tag back, recreates and exits non-zero.
auto_rollback() {
  echo "✗ $1"
  if [ -z "$PREV_TAG" ] || ! docker image inspect "${GHCR_IMAGE}:${PREV_TAG}" >/dev/null 2>&1; then
    echo "✗ AUTO-ROLLBACK IMPOSSIBLE: there is no previous image. Production needs a manual fix now."
    rollback_help; exit 1
  fi
  echo "↩ AUTO-ROLLBACK: RADAR_TAG goes back to ${PREV_TAG}, recreating"
  setenv RADAR_TAG "$PREV_TAG"
  if $COMPOSE up -d --no-build --force-recreate radar && wait_healthy; then
    echo "↩ ROLLED BACK: production runs the previous image again. ${SHORT_SHA} was NOT promoted."
  else
    echo "✗ ROLLBACK DID NOT COME UP. Production needs a manual fix now."
  fi
  echo "  DB (only if data was migrated): restore $BACKUP_DIR/${BK}"
  exit 1
}

setenv RADAR_TAG_PREV "$PREV_TAG"
setenv RADAR_TAG "$FULL_SHA"
$COMPOSE up -d --no-build --force-recreate radar \
  || auto_rollback "docker compose up failed for ${SHORT_SHA}."

# ── 5. Gates ─────────────────────────────────────────────────────────────────
NEW_IMAGE=$(docker image inspect -f '{{.Id}}' "$GHCR_REF" 2>/dev/null || echo "")
RUNNING_IMAGE=$(docker inspect -f '{{.Image}}' "$CONTAINER" 2>/dev/null || echo "")
if [ -z "$NEW_IMAGE" ] || [ "$NEW_IMAGE" != "$RUNNING_IMAGE" ]; then
  auto_rollback "PROMOTION DID NOT SWAP (pulled ${NEW_IMAGE#sha256:} vs running ${RUNNING_IMAGE#sha256:})."
fi

echo "Waiting for the app on 127.0.0.1:3000..."
wait_healthy || auto_rollback "the app did not come up within 60 s."

# The image has NEXT_PUBLIC_APP_URL baked in at build time; robots.txt names the sitemap by that address
# (app/robots.ts): a CI image built with another address is not production.
# the template's staging check, ported: the production site must never come up as the test environment (SITE_ENV=test in
# the wrong .env or compose file). Its home page then shows the «Testumgebung» band.
HOME_PAGE=$(curl -s http://127.0.0.1:3000/de || echo "")
if echo "$HOME_PAGE" | grep -qi "Testumgebung"; then
  auto_rollback "the production page shows the TEST banner: SITE_ENV=test reached production."; fi
PAGE=$(curl -s http://127.0.0.1:3000/robots.txt || echo "")
if ! echo "$PAGE" | grep -q "$PROD_URL"; then
  auto_rollback "robots.txt does not reference ${PROD_URL}: CI image built with the wrong NEXT_PUBLIC_APP_URL?"; fi
# <<< swap

# ── Caddy: up when missing, restarted when the Caddyfile this checkout carries differs from the one it runs
# (a git checkout replaces the file, a single-file bind mount keeps the old inode).
$COMPOSE up -d --no-build caddy
if ! docker exec radar-caddy-1 cat /etc/caddy/Caddyfile 2>/dev/null | cmp -s - deploy/Caddyfile; then
  echo "Caddyfile changed: restarting Caddy"
  $COMPOSE restart caddy
fi

# ── 6. Prune (rollback depth 3): the running and the previous tag always stay ─
docker images "${GHCR_IMAGE}" --format '{{.Tag}}' \
  | grep -vE "^(${FULL_SHA}|${PREV_TAG:-none})\$" | tail -n +2 | xargs -r -I{} docker rmi "${GHCR_IMAGE}:{}" || true

echo "[$(date)] ✓ PROMOTED ${SHORT_SHA} to production (${PROD_URL})."
echo "  Rollback one step: put RADAR_TAG_PREV into RADAR_TAG in $ENV_FILE, then $COMPOSE up -d --no-build --force-recreate radar"
}

main "$@"
exit $?
