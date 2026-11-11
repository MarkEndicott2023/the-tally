// the-tally API on Cloudflare Workers + D1. Ported from the earlier local server (database/server.py, in git history).
//
//   GET  /t/12345   the tally (with its `name`), or 404
//   POST /t/12345   create it from the body, which must carry a unique `name`; 400 bad name, 409 "name taken" or
//                   409 "taken" (the PIN)
//   PUT  /t/12345   merge the body into it and answer with the result; 404 if it does not exist
//   PUT  /t/12345/name   set or change the username from {"name": "..."}; 400 bad name, 404 no tally, 409 name taken
//
// `name` is a username, 3-20 of [A-Za-z0-9_.-], unique ignoring case, stored beside the document and never
// inside it. Logging back in needs only the PIN. Rows from before 2026-11-11 have none until /name sets one.
//
// D1 has no BEGIN IMMEDIATE across awaits, so a merge is optimistic: read the row, merge, then
// UPDATE ... WHERE updated = <what we read>. If another device landed in between, changes is 0 and we retry.
// The rate limiter (env.PIN_LIMIT) counts requests per client IP; PINs are a weak secret, so guessing is throttled.

const ROUTE = /^\/t\/(\d{5})$/;
const NAME_ROUTE = /^\/t\/(\d{5})\/name$/;
const NAME = /^[A-Za-z0-9_.-]{3,20}$/;
const MAX_BODY = 256 * 1024;
const DEFAULT_BAND = [80, 160, 240];
const BAND_MAX = 100000;
const MAX_MIN = 1440;
const LABEL_MAX = 80;
const RETRIES = 4;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

class NotATally extends Error {}

const empty = () => ({ points: 0, threshold: 20, started: "", label: "", minutes: 0, band: DEFAULT_BAND.slice(), sessions: [], deleted: [], updated: 0 });

function asInt(v, lo) {
  const n = Math.trunc(Number(v));
  return Math.max(lo, Number.isFinite(n) ? n : 0);
}
const asMin = v => Math.min(MAX_MIN, asInt(v, 0));
const asStr = (v, n) => (v == null ? "" : String(v).slice(0, n));
function asBand(v) {
  if (!Array.isArray(v)) return DEFAULT_BAND.slice();
  const b = v.slice(0, 3).map(x => Math.trunc(Number(x)));
  const ok = b.length === 3 && b.every(x => Number.isFinite(x) && x >= 1 && x <= BAND_MAX) && b[0] < b[1] && b[1] < b[2];
  return ok ? b : DEFAULT_BAND.slice();
}
// YYYY-MM-DD that survives a round trip, so 2026-02-30 and 2026-13-99 are refused.
function isDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(s + "T00:00:00Z");
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

// A clean copy of a document in the page's shape, every field typed and capped; bad sessions are dropped.
function norm(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) throw new NotATally();
  const x = empty();
  x.points = asInt(d.points, 0);
  x.threshold = asInt(d.threshold, 1);
  x.started = isDate(d.started) ? d.started : "";
  x.label = asStr(d.label, LABEL_MAX);
  x.minutes = asMin(d.minutes);
  x.band = asBand(d.band);
  x.updated = asInt(d.updated, 0);
  const deleted = new Set((Array.isArray(d.deleted) ? d.deleted : []).filter(s => typeof s === "string").map(s => s.slice(0, 80)));
  const sessions = [];
  for (const s of Array.isArray(d.sessions) ? d.sessions : []) {
    if (!s || typeof s !== "object" || !isDate(s.date)) continue;
    const sid = s.id || `${s.date}|${s.label || ""}|${s.points}|${s.threshold}`;
    sessions.push({ id: asStr(sid, 80), date: s.date, label: asStr(s.label, LABEL_MAX), points: asInt(s.points, 0), threshold: asInt(s.threshold, 1), minutes: asMin(s.minutes) });
  }
  x.sessions = sessions.filter(s => !deleted.has(s.id));
  x.deleted = [...deleted].sort();
  return x;
}

function merge(a, b) {
  const newer = b.updated > a.updated ? b : a;
  const tomb = new Set([...a.deleted, ...b.deleted]);
  const by = new Map();
  for (const x of [a, b]) for (const s of x.sessions) if (!tomb.has(s.id)) by.set(s.id, s);
  return Object.assign(empty(), {
    points: newer.points, threshold: newer.threshold, label: newer.label, started: newer.started, minutes: newer.minutes,
    band: newer.band.slice(), sessions: [...by.values()], deleted: [...tomb].sort(), updated: Math.max(a.updated, b.updated),
  });
}

function send(status, data) {
  const headers = { ...CORS };
  if (data !== undefined) { headers["Content-Type"] = "application/json"; headers["Cache-Control"] = "no-store"; }
  return new Response(data === undefined ? null : JSON.stringify(data), { status, headers });
}

async function readBody(request) {
  const n = Number(request.headers.get("content-length") || 0);
  if (n > MAX_BODY) return { err: send(413, { error: "too big" }) };
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return { err: send(413, { error: "too big" }) };
    const raw = JSON.parse(text);
    return { doc: norm(raw), name: typeof raw.name === "string" ? raw.name.trim() : "" };
  } catch (e) {
    return { err: send(400, { error: "body is not a tally" }) };
  }
}

async function getDoc(db, pin) {
  const row = await db.prepare("SELECT doc, updated, name FROM tallies WHERE pin = ?1").bind(pin).first();
  if (!row) return null;
  let doc;
  try { doc = norm(JSON.parse(row.doc)); } catch (e) { doc = empty(); }
  return { doc, updated: row.updated, name: row.name || "" };
}

const withName = (doc, name) => ({ ...doc, name: name || "" });

async function nameTaken(db, name) {
  const row = await db.prepare("SELECT pin FROM tallies WHERE name = ?1 COLLATE NOCASE").bind(name).first();
  return !!row;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return send(204);
    const url = new URL(request.url);
    const nm = NAME_ROUTE.exec(url.pathname);
    const m = nm || ROUTE.exec(url.pathname);
    if (!m) return send(404, { error: "use /t/<5 digits>" });
    const pin = m[1];

    if (env.PIN_LIMIT) {
      const ip = request.headers.get("cf-connecting-ip") || "unknown";
      const { success } = await env.PIN_LIMIT.limit({ key: ip });
      if (!success) return send(429, { error: "slow down" });
    }

    if (nm) {
      if (request.method !== "PUT") return send(405, { error: "method not allowed" });
      let name;
      try { const raw = JSON.parse(await request.text()); name = typeof raw.name === "string" ? raw.name.trim() : ""; }
      catch (e) { return send(400, { error: "body is not {name}" }); }
      if (!NAME.test(name)) return send(400, { error: "bad name" });
      const cur = await getDoc(env.DB, pin);
      if (!cur) return send(404, { error: "no tally" });
      if (cur.name.toLowerCase() === name.toLowerCase()) {   // same name, maybe new casing
        await env.DB.prepare("UPDATE tallies SET name = ?1 WHERE pin = ?2").bind(name, pin).run();
        return send(200, { name });
      }
      if (await nameTaken(env.DB, name)) return send(409, { error: "name taken" });
      try {
        await env.DB.prepare("UPDATE tallies SET name = ?1 WHERE pin = ?2").bind(name, pin).run();
      } catch (e) {
        if (/UNIQUE/i.test(String(e && e.message))) return send(409, { error: "name taken" });   // lost the race
        throw e;
      }
      return send(200, { name });
    }

    if (request.method === "GET") {
      const cur = await getDoc(env.DB, pin);
      return cur ? send(200, withName(cur.doc, cur.name)) : send(404, { error: "no tally" });
    }

    if (request.method === "POST") {
      const { doc, name, err } = await readBody(request);
      if (err) return err;
      if (!NAME.test(name)) return send(400, { error: "bad name" });
      if (await nameTaken(env.DB, name)) return send(409, { error: "name taken" });
      // OR IGNORE swallows a unique clash on either pin or name; when nothing landed, ask which it was.
      const r = await env.DB.prepare("INSERT OR IGNORE INTO tallies (pin, doc, updated, name) VALUES (?1, ?2, ?3, ?4)")
        .bind(pin, JSON.stringify(doc), doc.updated, name).run();
      if (r.meta.changes > 0) return send(201, withName(doc, name));
      return send(409, { error: (await getDoc(env.DB, pin)) ? "taken" : "name taken" });
    }

    if (request.method === "PUT") {
      const { doc, err } = await readBody(request);
      if (err) return err;
      for (let i = 0; i < RETRIES; i++) {
        const cur = await getDoc(env.DB, pin);
        if (!cur) return send(404, { error: "no tally" });
        const out = merge(cur.doc, doc);
        const r = await env.DB.prepare("UPDATE tallies SET doc = ?1, updated = ?2 WHERE pin = ?3 AND updated = ?4")
          .bind(JSON.stringify(out), out.updated, pin, cur.updated).run();
        if (r.meta.changes > 0) return send(200, withName(out, cur.name));
      }
      return send(503, { error: "busy, try again" });
    }

    return send(405, { error: "method not allowed" });
  },
};
