# Plan B: when the panel or the server is down

The normal way to work is the Pandora panel (send a note, the project coordinator builds it). If the panel, the
coordinator or the server behind them stops answering during the hackathon, keep working directly in this repository.
Nothing below needs the server.

## 1. Get the app running (5 minutes)

The dashboard lives on the branch `feat/dashboard-v1` until pull request #1 is merged; after that, use `main`.

**In the browser, no installs (recommended):** on GitHub, open the branch, click **Code → Codespaces → Create
codespace**. In its terminal:

    npm ci
    npm run dev

Codespaces offers to open port 3000; add `/en` (English) or `/de` (German) to the address.

**On your laptop:** Node 22 (see `.nvmrc`) and git, then:

    git clone https://github.com/7heM4ster/powercoders-radar.git
    cd powercoders-radar && git checkout feat/dashboard-v1
    npm ci && npm run dev        # http://localhost:3000/en

The app starts with real numbers: `fixtures/radar.sample.json` is a snapshot of the live data (job-room.ch, BFS,
Parliament, Fedlex), dated in the file. No database server is needed; sign-in accounts use a local SQLite file.

## 2. Fresher data (optional)

The collector is plain Python 3.10+, no packages. Run it on a laptop on the venue Wi-Fi, NOT in a Codespace (job-room.ch
is meant to be used from normal internet connections, not from data centres):

    python3 -m collector.collect          # about 10 minutes, writes data/radar.db
    python3 -m collector.export           # writes data/radar.json
    RADAR_DATA=data/radar.json npm run dev

To share fresher numbers with the team, copy `data/radar.json` over `fixtures/radar.sample.json` in a pull request.
Only aggregate numbers end up in that file; never add anything about a person.

## 3. How we work without the panel

- **Notes and requests** that you would have sent in the panel: open a GitHub issue in this repo with the label
  `note`. One issue per change, in plain words, like a panel note.
- **Code changes:** one branch per person (`yourname/what`), open a pull request against `feat/dashboard-v1`
  (or `main` once #1 is merged). Lior merges.
- **Rules that still apply:** every number names its source with a link and the date of the last update; aggregate data
  only; no scraping where a site's terms forbid it; colours only from `lib/design-tokens.ts`.
- `npm test` and `npm run typecheck` before you push. The tests guard the data rules and the colours.

## 4. Showing the result

If the test site is not reachable at demo time, present from a laptop: `npm run build && npm start`, then open
http://localhost:3000/en. A Codespace works too (port 3000, set to public only for the demo).

## 5. For Lior (when the server comes back)

- Check the hackathon mode with `~/hack-mode/hack_mode.sh status` on the server; between 09:00 and 18:00 it should be
  on, after 18:00 off.
- Copy the `note` issues into the panel or let the coordinator work from them, then close them.
