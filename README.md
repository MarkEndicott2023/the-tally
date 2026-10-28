# the-tally

A one-page counter for prediction-error reps: attempt or predict, get the verdict, take the feedback, click once. Every click is a point. The session closes when points reach a threshold you set.

```
index.html     the whole thing
tally.json     the record, wherever you save it
```

## Run

Open `index.html` in Chrome or Edge. Nothing to install or run.

## Use

- **REP**, or space or enter, adds a point and floats "+1 POINT". The click that reaches the threshold says "THRESHOLD MET" and turns the bar gold.
- **Threshold** is the session quota. Change it any time.
- **Label** names the session (optimization, big data, python) and is filed with it.
- **− 1** takes back a misclick.
- **New session** files the count, date and label, then resets. Filed sessions list below, newest first. Click a label to rename it; **✕** deletes the session.

## Save

**Save** links the page to `tally.json`. The first click opens a file dialog; pick the file, new or existing. The page reads it, merges, writes, and from then on every change, deletes included, goes straight to the file. Next visit, one click on Save reconnects and brings the sessions back. Deletes carry tombstones, so they never return on merge.

Theme borrowed from the-register.
