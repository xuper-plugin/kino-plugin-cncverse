// Which copy of a title to offer first, and which ones not to offer again. The server lists a title's copies in its own order; the
// person's quality and size settings, and what failed a moment ago, decide the order here. Reads only what a Stremio stream says
// about itself (its name and title lines), never what site it came from.
import { DAY_MS } from "./store.js";

const get = (k) => {
  try {
    return kino.storage.get(k);
  } catch {
    return null;
  }
};
const set = (k, v, ttlMs) => {
  try {
    kino.storage.set(k, v, { ttlMs });
  } catch {
    // not remembered: the next play just starts from the same order
  }
};

export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

const lineOf = (title, emoji) => {
  const l = String(title || "").split("\n").find((x) => x.startsWith(emoji));
  return l ? l.slice(emoji.length).trim() : "";
};

/** `{ quality, gb }` of a stream: the resolution its name or title mentions, and the size its title gives. 0 = unknown. */
export function describe(s) {
  const text = String(s.name || "") + " " + String(s.title || "");
  const q = /(2160|1440|1080|720|480|360)p/i.exec(text) || (/\b4k\b/i.test(text) ? [null, "2160"] : null);
  const size = /(\d+(?:\.\d+)?)\s*(GB|MB)\b/i.exec(lineOf(s.title, "💾") || String(s.title || ""));
  return { quality: q ? parseInt(q[1], 10) : 0, gb: size ? parseFloat(size[1]) / (size[2].toUpperCase() === "MB" ? 1024 : 1) : 0 };
}

/** Lower plays first: under the person's cap best first ("max" = highest of all), then the ones over the cap, nearest first. */
function qualityRank(q, pref) {
  if (pref === "max") return -q;
  const cap = pref === "720" ? 720 : 1080;
  const v = q || cap;
  return v <= cap ? cap - v : 100000 + (v - cap);
}

/** A direct file, HLS, anything else (the setting `prefer` swaps the first two); plain http after every https one. */
function tierOf(url, prefer) {
  if (/^http:\/\//i.test(url)) return 3;
  const hlsFirst = prefer === "hls";
  if (/\.m3u8(\?|$)/i.test(url)) return hlsFirst ? 0 : 1;
  if (/\.(mkv|mp4|webm)(\?|$)/i.test(url)) return hlsFirst ? 1 : 0;
  return 2;
}

/** A stream's file as the same file on another try: host and file name, never the (expiring) query. */
export function fileKey(url) {
  const path = String(url).split("?")[0];
  return hostOf(url) + ":" + path.slice(path.lastIndexOf("/") + 1).slice(0, 40);
}

// ---- copies that failed ------------------------------------------------------------------------------------------------------
// Kino only says a copy failed when the origin REFUSED it; a dead link just moves the player on. So a second resolve of the same title
// soon after the first is read as "that copy did not work": the copy served first goes last for a while.
const SERVED_PREFIX = "rb_served:";
const BAD_KEY = "rb_bad";
const REOPEN_WINDOW_MS = 2 * 60 * 1000;
const BAD_FOR_MS = 10 * 60 * 1000;
const BAD_MAX = 40;

function readBad() {
  try {
    const raw = JSON.parse(get(BAD_KEY) || "{}");
    const now = Date.now();
    const out = {};
    if (raw && typeof raw === "object" && !Array.isArray(raw)) for (const [k, until] of Object.entries(raw)) if (Number(until) > now) out[k] = Number(until);
    return out;
  } catch {
    return {};
  }
}

function writeBad(bad) {
  const entries = Object.entries(bad).sort((a, b) => b[1] - a[1]).slice(0, BAD_MAX);
  set(BAD_KEY, JSON.stringify(Object.fromEntries(entries)), BAD_FOR_MS);
}

/**
 * [usable] sorted for [ref] (the title being played): copies that failed first-time-around last, then over the size cap last, then
 * quality, then kind of file, then size, then the server's own order. Remembers what was served so a quick reopen demotes it.
 * `options.retry` (Kino says the previous copy failed) counts as a reopen. Returns the same stream objects.
 */
export function rank(usable, ref, options, hash) {
  const pref = String(kino.config.get("quality") || "1080");
  const prefer = String(kino.config.get("prefer") || "file");
  const capGb = parseFloat(String(kino.config.get("maxSize") || "10")) || 0;
  const bad = readBad();
  const servedKey = SERVED_PREFIX + hash(ref);
  let prev = null;
  try {
    prev = JSON.parse(get(servedKey) || "null");
  } catch {
    prev = null;
  }
  const now = Date.now();
  const reopened = (options && options.retry) || (prev && typeof prev.t === "number" && now - prev.t < REOPEN_WINDOW_MS);
  if (reopened && prev && prev.key) {
    bad[prev.key] = now + BAD_FOR_MS;
    writeBad(bad);
  }
  // The memory is per title: "index.m3u8" on one CDN is every title there, so the file alone would demote unrelated copies.
  const scope = hash(ref);
  const rows = usable.map((s, index) => ({ s, index, key: scope + "|" + fileKey(s.url), ...describe(s), tier: tierOf(s.url, prefer) }));
  const heavy = (x) => (capGb > 0 && x.gb > capGb ? 1 : 0);
  rows.sort(
    (a, b) =>
      (bad[a.key] ? 1 : 0) - (bad[b.key] ? 1 : 0) ||
      heavy(a) - heavy(b) ||
      qualityRank(a.quality, pref) - qualityRank(b.quality, pref) ||
      a.tier - b.tier ||
      (a.gb || 99) - (b.gb || 99) ||
      a.index - b.index,
  );
  if (rows.length) set(servedKey, JSON.stringify({ t: now, key: rows[0].key }), BAD_FOR_MS);
  return rows.map((r) => r.s);
}

export { DAY_MS };
