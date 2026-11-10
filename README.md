# the-tally

A one-page counter for prediction-error reps: attempt or predict, get the verdict, take the feedback, click once. Every click is a point. The session closes when points reach a threshold you set.

```
index.html        the whole page
tally.json        the record, wherever you save it (file mode)
database/server.py  the server: one tally per PIN, in a SQLite file on this Mac (standard library only)
database/tally.db   that database, created on first run; not committed
```

## Run

Open `index.html` in Chrome or Edge, or visit https://markendicott2023.github.io/the-tally/ (GitHub Pages, from `main`). Without a server the page keeps its count in that browser only.

## PIN (2026-11-08)

A PIN is the whole account: five digits, no name, no email. **New tally** creates one under the typed PIN, or a random free one when the box is empty, and shows the PIN; it is the only way back in. **Open** fetches the tally under a PIN, merges it with the browser's copy, and keeps the two in step from then on: every change is pushed, the server merges both sides, and returning to the tab pulls again, so a phone and a laptop on one PIN converge. **Switch PIN** forgets the PIN on that device and leaves the tally on the server.

Known limit, by design of "extremely simple": there are 100,000 PINs and no rate limit, so a PIN is a weak secret; anyone holding it holds the tally.

### Server

`database/server.py` is the whole backend: Python 3 standard library, SQLite, one table (`pin`, `doc`, `updated`). Writes run under `BEGIN IMMEDIATE`, so two devices pushing the same PIN at once serialize and both land in the merge. The endpoints are `GET`, `POST` (create, 409 if taken) and `PUT` (merge) on `/t/<pin>`.

```
python3 database/server.py                  # 127.0.0.1:8766, database/tally.db
python3 database/server.py --port 8766 --db ~/tally.db --host 0.0.0.0
```

Point the page at it: `const API = "http://127.0.0.1:8766"` in `index.html` (no trailing slash). From the Pages site over HTTPS, Chrome 142 and later asks once whether the site may reach your local network (its Local Network Access permission, [developer.chrome.com](https://developer.chrome.com/blog/local-network-access)); click Allow and the loopback call works on this Mac. Anyone else, or the phone, needs the server reachable over HTTPS, which is what the-register's Tailscale Serve proxy already does for the page (`tailscale serve` can map a second path to this port). Reaching it from outside the tailnet is Tailscale Funnel or a reverse proxy; that step is deliberately not set up here.

Back the database up like any file: copy `database/tally.db` while the server is stopped, or `sqlite3 database/tally.db ".backup ~/tally-backup.db"` while it runs.

## Phone (2026-11-02)

`ui/tally` in the-register is a symlink to this folder, so the-register's server and its Tailscale Serve proxy carry the page: https://marks-macbook-pro.taila29e61.ts.net/tally/ on the tailnet, with the Mac awake. iOS Safari has no file picker, so on the phone Save downloads a copy and the count lives in that browser alone; it does not reach tally.json. Undo with `rm the-register/ui/tally`.

## Use

- **REP**, or space or enter, adds a point and floats "+1 POINT". The click that reaches the threshold says "THRESHOLD MET" and turns the bar gold.
- **Threshold** is the session quota. Change it any time.
- **Label** names the session (optimization, big data, python) and is filed with it.
- **Minutes** is optional: how long the session ran, typed as a whole number up to 1440. It is filed with the session and shows in its row; a session filed without it reads "– min".
- **Streak** is dailyish. It counts days with 2 or more reps, summed across that day's sessions and the live one, and forgives a single day off between them; two days off in a row break it. The threshold plays no part. Gold is intact; ice means the chain is alive and today is still open, and the label reads "today or it breaks" when yesterday was already the day off; 0 means the chain broke. The rep that brings today to 2 and extends the streak floats "STREAK n", or "BEST STREAK n" when it sets a record.
- **Best** is the longest streak on record, the live one included. Gold when the live streak is the record.
- **Stats** (2026-11-10) sits above the sessions: reps today, last 7 days, this month, all time, a score for the month and a projection to month end, the month against the benchmark band with the reps a day needed for each rung, and totals by session label.
- **Benchmarks** are the reps in a month that score 10, 15 and 20 (5 is always 0 reps). The default is the-register's band, 80 / 160 / 240, about 10 minutes a rep so 3 / 6 / 9 hours a week. Type three rising whole numbers in the Stats panel to use a static benchmark of your own; **Default** restores the register's. The band is filed with the tally (`band` in tally.json and on the server), so it follows the PIN across devices.
- **− 1** takes back a misclick.
- **New session** files the count, date, label and minutes, then resets. The date is the day of the session's first rep, so a page left open for days files under the day the reps happened. Filed sessions list below, newest first. Click a label to rename it, click a date to change it, click the minutes to set or change them; **✕** deletes the session.

## Save

**Save** links the page to `tally.json`. The first click opens a file dialog; pick the file, new or existing. The page reads it, merges, writes, and from then on every change, deletes included, goes straight to the file. Next visit, one click on Save reconnects and brings the sessions back. Deletes carry tombstones, so they never return on merge.

Theme borrowed from the-register.
