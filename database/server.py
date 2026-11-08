#!/usr/bin/env python3
"""the-tally API: one tally per 5-digit PIN, in a SQLite file on this machine. Standard library only.

    GET  /t/12345   the tally, or 404
    POST /t/12345   create it from the body; 409 if the PIN is taken
    PUT  /t/12345   merge the body into it and answer with the result; 404 if it does not exist

The merge is the page's: sessions by id, minus every tombstone from either side; the live count, threshold,
label and start date from whichever copy is newer. The PIN is the only credential, so anyone holding it holds
the tally; nothing else is stored.

    python3 server.py                  serves on 127.0.0.1:8766, database tally.db beside this file
    python3 server.py --port 8766 --db /path/to/tally.db --host 0.0.0.0
"""
import argparse
import json
import os
import re
import sqlite3
import threading
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BODY = 256 * 1024
ROUTE = re.compile(r"^/t/(\d{5})$")
CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    # Chrome asks this of a loopback or LAN server reached from a public HTTPS page (private network access)
    "Access-Control-Allow-Private-Network": "true",
}
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class NotATally(ValueError):
    pass


def empty():
    return {"points": 0, "threshold": 20, "started": "", "label": "", "sessions": [], "deleted": [], "updated": 0}


def as_int(v, lo):
    try:
        n = int(float(v))
    except (TypeError, ValueError):
        n = 0
    return max(lo, n)


def as_str(v, n):
    return "" if v is None else str(v)[:n]


def is_date(s):
    """YYYY-MM-DD that survives a round trip, so 2026-02-30 and 2026-13-99 are refused."""
    if not isinstance(s, str) or not DATE.match(s):
        return False
    try:
        return date.fromisoformat(s).isoformat() == s
    except ValueError:
        return False


def norm(d):
    """A clean copy of a document in the page's shape, every field typed and capped; bad sessions are dropped."""
    if not isinstance(d, dict):
        raise NotATally()
    x = empty()
    x["points"] = as_int(d.get("points"), 0)
    x["threshold"] = as_int(d.get("threshold"), 1)
    x["started"] = d.get("started") if is_date(d.get("started")) else ""
    x["label"] = as_str(d.get("label"), 40)
    x["updated"] = as_int(d.get("updated"), 0)
    raw_del = d.get("deleted") if isinstance(d.get("deleted"), list) else []
    deleted = {s[:80] for s in raw_del if isinstance(s, str)}
    sessions = []
    for s in (d.get("sessions") if isinstance(d.get("sessions"), list) else []):
        if not isinstance(s, dict) or not is_date(s.get("date")):
            continue
        sid = s.get("id") or f"{s.get('date')}|{s.get('label') or ''}|{s.get('points')}|{s.get('threshold')}"
        sessions.append({"id": as_str(sid, 80), "date": s["date"], "label": as_str(s.get("label"), 40),
                         "points": as_int(s.get("points"), 0), "threshold": as_int(s.get("threshold"), 1)})
    x["sessions"] = [s for s in sessions if s["id"] not in deleted]
    x["deleted"] = sorted(deleted)
    return x


def merge(a, b):
    newer = b if b["updated"] > a["updated"] else a
    tomb = set(a["deleted"]) | set(b["deleted"])
    by = {}
    for x in (a, b):
        for s in x["sessions"]:
            if s["id"] not in tomb:
                by[s["id"]] = s
    out = empty()
    out.update(points=newer["points"], threshold=newer["threshold"], label=newer["label"], started=newer["started"],
               sessions=list(by.values()), deleted=sorted(tomb), updated=max(a["updated"], b["updated"]))
    return out


class Store:
    """One table: pin, the document as JSON, its updated stamp. Every write runs under BEGIN IMMEDIATE so two
    devices pushing the same PIN at once serialize and both land in the merge."""

    def __init__(self, path):
        self.path = path
        self.lock = threading.Lock()
        with self._conn() as c:
            c.execute("CREATE TABLE IF NOT EXISTS tallies (pin TEXT PRIMARY KEY, doc TEXT NOT NULL, updated INTEGER NOT NULL)")

    def _conn(self):
        c = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        c.execute("PRAGMA journal_mode=WAL")
        return c

    def get(self, pin):
        with self._conn() as c:
            row = c.execute("SELECT doc FROM tallies WHERE pin = ?", (pin,)).fetchone()
        return json.loads(row[0]) if row else None

    def create(self, pin, doc):
        """True if created, False if the PIN is taken."""
        with self.lock, self._conn() as c:
            c.execute("BEGIN IMMEDIATE")
            if c.execute("SELECT 1 FROM tallies WHERE pin = ?", (pin,)).fetchone():
                c.execute("ROLLBACK")
                return False
            c.execute("INSERT INTO tallies (pin, doc, updated) VALUES (?, ?, ?)", (pin, json.dumps(doc), doc["updated"]))
            c.execute("COMMIT")
            return True

    def merge(self, pin, doc):
        """The merged document, or None if the PIN does not exist."""
        with self.lock, self._conn() as c:
            c.execute("BEGIN IMMEDIATE")
            row = c.execute("SELECT doc FROM tallies WHERE pin = ?", (pin,)).fetchone()
            if not row:
                c.execute("ROLLBACK")
                return None
            try:
                prior = norm(json.loads(row[0]))
            except (NotATally, ValueError):
                prior = empty()
            out = merge(prior, doc)
            c.execute("UPDATE tallies SET doc = ?, updated = ? WHERE pin = ?", (json.dumps(out), out["updated"], pin))
            c.execute("COMMIT")
            return out


def make_handler(store, quiet):
    class Handler(BaseHTTPRequestHandler):
        server_version = "the-tally/1"

        def log_message(self, fmt, *args):
            if not quiet:
                super().log_message(fmt, *args)

        def send(self, status, data=None):
            body = b"" if data is None else json.dumps(data).encode()
            self.send_response(status)
            for k, v in CORS.items():
                self.send_header(k, v)
            if data is not None:
                self.send_header("Content-Type", "application/json")
                self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if body:
                self.wfile.write(body)

        def pin(self):
            m = ROUTE.match(self.path.split("?", 1)[0])
            if not m:
                self.send(404, {"error": "use /t/<5 digits>"})
                return None
            return m.group(1)

        def body(self):
            n = int(self.headers.get("Content-Length") or 0)
            if n > MAX_BODY:
                self.send(413, {"error": "too big"})
                return None
            try:
                return norm(json.loads(self.rfile.read(n).decode("utf-8")))
            except (NotATally, ValueError, UnicodeDecodeError):
                self.send(400, {"error": "body is not a tally"})
                return None

        def do_OPTIONS(self):
            self.send(204)

        def do_GET(self):
            pin = self.pin()
            if pin is None:
                return
            doc = store.get(pin)
            self.send(200, doc) if doc is not None else self.send(404, {"error": "no tally"})

        def do_POST(self):
            pin = self.pin()
            if pin is None:
                return
            doc = self.body()
            if doc is None:
                return
            self.send(201, doc) if store.create(pin, doc) else self.send(409, {"error": "taken"})

        def do_PUT(self):
            pin = self.pin()
            if pin is None:
                return
            doc = self.body()
            if doc is None:
                return
            out = store.merge(pin, doc)
            self.send(200, out) if out is not None else self.send(404, {"error": "no tally"})

        def do_DELETE(self):
            self.send(405, {"error": "method not allowed"})

    return Handler


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8766)
    ap.add_argument("--db", default=os.path.join(here, "tally.db"))
    ap.add_argument("--quiet", action="store_true", help="no request log")
    a = ap.parse_args()
    store = Store(a.db)
    srv = ThreadingHTTPServer((a.host, a.port), make_handler(store, a.quiet))
    print(f"the-tally api on http://{a.host}:{a.port}  db {a.db}", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
