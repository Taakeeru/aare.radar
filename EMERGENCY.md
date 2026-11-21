# Emergency card (Saturday 21.11., 14:00 to 17:00, Lior is away)

You can fix everything below yourselves. Seckin (GitHub `Taakeeru`) and Isabella (`isa-tr`) both have write access to
the repository, so you can open Codespaces, create branches and merge pull requests without Lior.

**First, check what is down** (on a phone with mobile data too, to rule out the venue Wi-Fi):

| Open this | Works? |
|---|---|
| https://radar.gnamak.ch/en | the site |
| https://projekte.gnamak.ch/panel/powercoders-hack | the panel |

## A. The site does not load (more than 5 minutes)

Run the same app with today's real data in your browser:

1. On GitHub open https://github.com/7heM4ster/powercoders-radar, branch `main`.
2. Click **Code → Codespaces → Create codespace on main**. Wait until a terminal appears (2 to 3 minutes).
3. In the terminal, type:

       npm ci
       npm run build
       RADAR_DATA=snapshots/radar-latest.json npm start

4. A pop-up offers **Open in Browser** for port 3000. Add `/en` to the address. That is the site.
5. To show it to someone else (or record it): in the **Ports** tab, right-click port 3000 → **Port Visibility → Public**,
   then share that address.

Use this for the demo and the video. The numbers are today's (job-room.ch, federal statistics, parliament).

## B. The panel does not load, or nobody answers there for 30 minutes

The site keeps working. Only new changes and the summary emails stop.

1. **Requests:** open an issue in the repository with the label `note`, in plain words, one change per issue.
2. **Changes you make yourselves:** a branch `yourname/what`, then a pull request against `main`. When the tests on your
   Codespace pass (`npm test`), one of you merges it.
3. While the server is down, merged changes do **not** reach radar.gnamak.ch. Show them from a Codespace (A, steps 2 to
   5, without `RADAR_DATA=...` if you changed the data).

## C. Something on the site looks wrong (numbers, a page, a text)

1. Write it in the panel (if it works) as a new note: what, on which page, a screenshot. Changes are usually live
   within 15 to 30 minutes.
2. If it is urgent for the video, record that part from a Codespace (A) instead.

## D. The video

Record it **by 16:00**, from the live site or a Codespace (A), and keep the file on two devices. The script and a
90-second demo path are in the panel's reference tab («Pitch» and «Tutorial»), and in this repo under `docs/` if the
panel is down.

## What never to do

- Do not change anything about who can sign in, passwords or secrets.
- Do not delete branches, issues or pull requests that you did not make.
- Do not paste personal data (names, emails of people) into issues, the panel or the code.
