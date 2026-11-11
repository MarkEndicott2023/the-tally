# the-tally

A one-page counter for prediction-error reps: attempt or predict, get the verdict, take the feedback, click once. Every click is a point. The session closes when points reach a threshold you set.

```
index.html              the whole page
tally.json              the record, wherever you save it (file mode)
cloudflare/worker.js    the server: one tally per PIN, on Cloudflare Workers + D1
cloudflare/wrangler.toml  its config (D1 binding, rate limit)
cloudflare/schema.sql   the one table
```

## Run

Open `index.html` in Chrome or Edge, or visit https://markendicott2023.github.io/the-tally/ (GitHub Pages, from `main`). Without a server the page keeps its count in that browser only.

## PIN (2026-11-08)

A PIN is the whole account: five digits, no email, no password. **New tally** (since 2026-11-11) also needs a **username**: 3–20 of letters, digits, `_ . -`, unique on the server ignoring case; a taken one is refused with "is taken · pick another username". It creates the tally under a random free PIN and shows it; the PIN is the only way back in. The form is two rows, "have a PIN · Open" and "new here · New tally", because the two actions share nothing. Logging back in needs only the PIN; the page learns the username from the server and shows it beside the PIN. Click the username beside the PIN (or "no username", on a tally from before usernames) to set or change it; the server checks uniqueness and the same rule (`PUT /t/<pin>/name`). **Open** fetches the tally under a PIN and keeps the two in step from then on: every change is pushed, the server merges both sides, and returning to the tab pulls again, so a phone and a laptop on one PIN converge. The browser remembers which PIN its copy belongs to: Open merges the copy in only when it is that PIN's or was never linked, and opening a different PIN replaces it, so switching PINs never piles one tally onto another (fixed 2026-11-11). New tally follows the same rule and starts empty when the copy belongs to another PIN. **Switch PIN** forgets the PIN on that device and leaves the tally on the server.

Known limit, by design of "extremely simple": there are 100,000 PINs and no rate limit, so a PIN is a weak secret; anyone holding it holds the tally.

### Server (2026-11-11)

`cloudflare/worker.js` is the whole backend: a Cloudflare Worker with a D1 (SQLite) database, one table (`pin`, `doc`, `updated`), live at https://the-tally.markendicott2023.workers.dev on the Workers free plan. The endpoints are `GET`, `POST` (create, 409 if taken) and `PUT` (merge) on `/t/<pin>`. D1 has no transaction across awaits, so a merge is optimistic: read, merge, `UPDATE ... WHERE updated = <what was read>`, retry if another device landed first. A rate-limit binding allows 60 requests a minute per IP, the brake on PIN guessing. The page points at it with `const API` in `index.html` (no trailing slash).

Deploy from `cloudflare/` after `npx wrangler login`:

```
npx wrangler deploy
npx wrangler d1 execute the-tally --remote --command "SELECT pin, updated FROM tallies"   # look inside
```

The database was created with `npx wrangler d1 create the-tally` (its id is in `wrangler.toml`) and `npx wrangler d1 execute the-tally --remote --file=schema.sql`. Free-plan ceilings: 100,000 Worker requests, 5,000,000 D1 rows read and 100,000 rows written a day. The earlier local server (`database/server.py`, SQLite on this Mac, removed 2026-11-11) is in git history.

## Phone

The Pages site syncs on the phone like anywhere else once a PIN is open. iOS Safari has no file picker, so Save there only downloads a copy. `ui/tally` in the-register is a symlink to this folder, so the-register's Tailscale Serve proxy also carries the page on the tailnet; undo with `rm the-register/ui/tally`.

## Use

- **REP**, or space or enter, adds a point and floats "+1 POINT". The click that reaches the threshold says "THRESHOLD MET" and turns the bar gold.
- **Threshold** is the session quota. Change it any time.
- **Label** names the session (optimization, big data, python) and is filed with it.
- **Minutes** is optional: how long the session ran, typed as a whole number up to 1440. It is filed with the session and shows in its row; a session filed without it reads "– min".
- **Streak** is dailyish. It counts days with 2 or more reps, summed across that day's sessions and the live one, and forgives a single day off between them; two days off in a row break it. The threshold plays no part. Gold is intact; ice means the chain is alive and today is still open, and the label reads "today or it breaks" when yesterday was already the day off; 0 means the chain broke. The rep that brings today to 2 and extends the streak floats "STREAK n", or "BEST STREAK n" when it sets a record.
- **Best** is the longest streak on record, the live one included. Gold when the live streak is the record.
- **Stats** (2026-11-10) sits above the sessions: reps today, last 7 days, this month, all time, the month's level and a projection to month end, the month against the benchmark band with the reps a day needed for each rung, and totals by session label.
- **Benchmarks** are the reps in a month that reach level 10, 15 and 20 (level 5 is always 0 reps). The default is the-register's band, 80 / 160 / 240, about 10 minutes a rep so 3 / 6 / 9 hours a week. Type three rising whole numbers in the Stats panel to use a static benchmark of your own; **Default** restores the register's. The band is filed with the tally (`band` in tally.json and on the server), so it follows the PIN across devices.
- **− 1** takes back a misclick.
- **New session** files the count, date, label and minutes, then resets. The date is the day of the session's first rep, so a page left open for days files under the day the reps happened. Filed sessions list below, newest first. Click a label to rename it, click a date to change it, click the minutes to set or change them; **✕** deletes the session.

## Save

**Save** links the page to `tally.json`. The first click opens a file dialog; pick the file, new or existing. The page reads it, merges, writes, and from then on every change, deletes included, goes straight to the file. Next visit, one click on Save reconnects and brings the sessions back. Deletes carry tombstones, so they never return on merge.

Theme borrowed from the-register.
