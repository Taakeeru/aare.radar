# Plan B: when a server is down

Two servers run AareRadar during the hackathon:

- **The site server** (radar.gnamak.ch) runs the app.
- **The Pandora server** runs the panel, the project coordinator, the daily data collection, the automatic deploys and
  the summary email.

If one of them stops answering, keep working and present from GitHub and a laptop. Nothing below needs either server.

## If the site (radar.gnamak.ch) is down

The quickest way back is the same app on a laptop or in a Codespace, with today's real data.

**In the browser, no installs:** on GitHub open `main`, click **Code → Codespaces → Create codespace**. In its terminal:

    npm ci
    RADAR_DATA=snapshots/radar-latest.json npm run dev

Codespaces offers to open port 3000; add `/en` (English) or `/de` (German) to the address.

**On a laptop:** Node 22 (see `.nvmrc`) and git, then:

    git clone https://github.com/7heM4ster/powercoders-radar.git
    cd powercoders-radar
    npm ci
    RADAR_DATA=snapshots/radar-latest.json npm run dev        # http://localhost:3000/en

`snapshots/radar-latest.json` is a copy of the live data (all IT jobs, the beginner ranking, the summary email,
federal statistics, parliament), dated inside the file (`generated_at`). Without `RADAR_DATA` the app starts with the
smaller test data in `fixtures/`.

For the demo, a production build is smoother than `dev`: `npm run build && RADAR_DATA=snapshots/radar-latest.json npm start`.

## If the Pandora server is down

The site keeps running with the data it has; only new changes, fresh data and the panel stop.

- **Notes and requests** you would send in the panel: open a GitHub issue in this repo with the label `note`. One issue
  per change, in plain words.
- **Code changes:** one branch per person (`yourname/what`), a pull request against `main`. Seckin or Isabella merges it once `npm test` passes.
- **Rules that still apply:** every number names its source with a link and the date of its data; aggregate data only;
  no scraping where a site's terms forbid it; colours only from `lib/design-tokens.ts`.
- `npm test` and `npm run typecheck` before you push. The tests guard the data rules and the colours.

## Fresher data by hand (optional)

The collector is plain Python 3.10+, no packages. Run it on a laptop on the venue Wi-Fi, not in a Codespace
(job-room.ch is meant for normal internet connections):

    python3 -m collector.collect jobroom   # about 20 minutes the first time (every IT ad is read once)
    python3 -m collector.export            # writes data/radar.json
    RADAR_DATA=data/radar.json npm run dev

Only aggregate numbers and public ad facts end up in that file; never add anything about a person.

## The video

Record the 3-minute video as early as the content is stable, and keep the file. A recording made in time does not
depend on any server at the end of the day. The script and a 90-second demo path are in the panel's reference tab.

## For Lior (when a server comes back)

- Hackathon mode: `~/hack-mode/hack_mode.sh status` on the Pandora server; on between 09:00 and 18:00, off after.
- Copy the `note` issues into the panel or let the coordinator work from them, then close them.
- Refresh the snapshot after a good data run: copy `data/radar.json` to `snapshots/radar-latest.json` in a pull request.
