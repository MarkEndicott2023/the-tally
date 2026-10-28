# the-tally

A one-page counter for prediction-error reps: attempt a problem or predict an answer, get the verdict, take the feedback, click once. Every click is a point; the session closes when points reach a threshold you set.

```
index.html     the whole thing: markup, the-register theme, and the script
tally.json     the record, wherever you choose to save it (this folder is the natural place)
```

## Run

Open `index.html` in Chrome or Edge. No server, nothing to run.

Every change is kept in that browser's localStorage immediately. The one file is `tally.json`, and **Save** is the only button for it:

- The first click opens the browser's file dialog. Pick `tally.json` (suggested name) and where it lives; picking an existing one is fine. The page reads what the file already holds, merges it with what is on the page, writes the result, and from then on every change for the rest of the visit, deletes included, is written straight to the file. The line at the bottom says "saved to tally.json" when the file is current, or "unsaved changes" in amber when it is behind.
- On the next visit the page remembers the file. If the browser still allows access it merges on open by itself and the prior sessions are there; if it has to ask again, the bottom line says "remembered · click Save to reconnect", and one click brings the file's sessions in and resumes writing.

A session deleted on the page is deleted from the file at the next write and carries a tombstone, so it does not come back when the two copies merge. A session removed from the file by hand is gone from the page after the next reconnect. Browser storage is only a cache: if it is blank (a different browser, a preview pane that forgets), one Save against the same file restores everything.

Safari and Firefox lack the file-picker API: there, Save downloads `tally.json` each time.

## Use

- **REP** (or space / enter) adds a point and floats a "+1 POINT" notice. The click that reaches the threshold says "THRESHOLD MET" and turns the bar gold.
- **Threshold** in the header is the session quota. Change it any time; the bar rescales.
- **Label** in the header names the session (optimization, big data, python, whatever the reps were about). It is filed with the session and cleared for the next one.
- **− 1** takes back a misclick.
- **New session** files the current count against its threshold with the date the session started and its label, then resets to zero. Filed sessions list below the button, newest first, marked met or short. Click a filed label to rename it; **✕** deletes the session after a confirm.

Theme and type are the-register's (teal on black, Jost and Share Tech Mono, the boxed titles); the style block is a copy, so the two can drift independently.
