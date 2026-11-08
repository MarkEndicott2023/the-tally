# the-tally

A one-page counter for prediction-error reps: attempt or predict, get the verdict, take the feedback, click once. Every click is a point. The session closes when points reach a threshold you set.

```
index.html     the whole thing
tally.json     the record, wherever you save it
```

## Run

Open `index.html` in Chrome or Edge. Nothing to install or run.

## Phone (2026-11-02)

`ui/tally` in the-register is a symlink to this folder, so the-register's server and its Tailscale Serve proxy carry the page: https://marks-macbook-pro.taila29e61.ts.net/tally/ on the tailnet, with the Mac awake. iOS Safari has no file picker, so on the phone Save downloads a copy and the count lives in that browser alone; it does not reach tally.json. Undo with `rm the-register/ui/tally`.

## Use

- **REP**, or space or enter, adds a point and floats "+1 POINT". The click that reaches the threshold says "THRESHOLD MET" and turns the bar gold.
- **Threshold** is the session quota. Change it any time.
- **Label** names the session (optimization, big data, python) and is filed with it.
- **Streak** counts consecutive days, through today or yesterday, with 2 or more reps each, summed across that day's sessions and the live one. The threshold plays no part. Gold is intact; ice means yesterday held and today is still open; 0 means the chain broke. The rep that brings today to 2 and extends the streak floats "STREAK n", or "BEST STREAK n" when it sets a record.
- **Best** is the longest streak on record, the live one included. Gold when the live streak is the record.
- **− 1** takes back a misclick.
- **New session** files the count, date and label, then resets. The date is the day of the session's first rep, so a page left open for days files under the day the reps happened. Filed sessions list below, newest first. Click a label to rename it, click a date to change it; **✕** deletes the session.

## Save

**Save** links the page to `tally.json`. The first click opens a file dialog; pick the file, new or existing. The page reads it, merges, writes, and from then on every change, deletes included, goes straight to the file. Next visit, one click on Save reconnects and brings the sessions back. Deletes carry tombstones, so they never return on merge.

Theme borrowed from the-register.
