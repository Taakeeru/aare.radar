# Deploy: radar.gnamak.ch

**The server never builds.** Pandora's in-house CI builds this repo's `Dockerfile` on every merge to `main` and
pushes `ghcr.io/7hem4ster/powercoders-radar:<full commit sha>` (build arg
`NEXT_PUBLIC_APP_URL=https://radar.gnamak.ch`). The server only pulls that image and recreates the container with
`--no-build` (a Next.js build on a small server can freeze it). The guard test `lib/__tests__/deploy-files.test.ts`
fails when a build command or a `build:` key appears.

| File | What |
|---|---|
| `docker-compose.prod.yml` | the app (`radar`) and Caddy (`caddy`), memory limits, log rotation, SQLite and the data file on a host folder |
| `Caddyfile` | TLS for `radar.gnamak.ch`, `X-Real-IP`, access log without login tokens |
| `.env.example` | every variable the server needs; copy to `deploy/.env` (not in git) |
| `promote.sh` | pull-only promotion with automatic rollback |

Not part of v1: backup and health-probe timers (add them with the first real deployment; the SQLite file only
holds accounts and the audit log, the data file is rebuilt by the collector).

## The data file

The dashboard reads ONE JSON file, the output of `python3 -m collector.export`. On the server it is
`radar.json` in the data folder (`RADAR_DATA_DIR`, default `/home/ubuntu/radar-data`, mounted at `/app/data`). Copy the
new file over the old one after each collector run; the app picks it up within 10 minutes, no restart. Without
the file the dashboard shows "Die Daten sind gerade nicht verfügbar" and `/de/admin` shows the reason.

## First-time setup on the server

Docker is installed and `docker login ghcr.io` (read:packages token) is done.

```sh
git clone git@github.com:7heM4ster/powercoders-radar.git ~/radar && cd ~/radar
cp deploy/.env.example deploy/.env && chmod 600 deploy/.env
#   fill in AUTH_SECRET (openssl rand -hex 32) and, for password-reset mails, SMTP_HOST / SMTP_USER / SMTP_PASS
mkdir -p ~/radar-data && sudo chown 1001:1001 ~/radar-data
cp data/radar.json ~/radar-data/radar.json        # the first export
bash deploy/promote.sh <sha>                       # any commit of main whose CI image exists
```

DNS: `radar.gnamak.ch` A record to the server before the first promotion, or Caddy retries the certificate in a loop.

The first admin (no password: the person sets one through «Passwort vergessen» on `/de/login`):

```sh
docker exec -i -e ADMIN_EMAIL=name@example.ch -e ADMIN_NAME="Vorname Name" radar-radar-1 \
  node --input-type=module - < scripts/admin/create-admin.mjs
```

Set `ADMIN_TOTP_REQUIRED=1` in `deploy/.env` once every team member has set up the second step
(`/de/admin/sicherheit`) to make it mandatory.
