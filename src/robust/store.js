// What the plugin remembers about the server's catalogs in kino.storage (256 KB shared): which ones are failing (a circuit breaker),
// how fast each answers a search, the ones the person picked, and whether the server is answering at all. Catalogs are known only by
// the id the server's manifest gives them: nothing here knows what a catalog is.
const DAY_MS = 24 * 60 * 60 * 1000;

const get = (k) => {
  try {
    return kino.storage.get(k);
  } catch {
    return null;
  }
};
const set = (k, v, opts) => {
  try {
    kino.storage.set(k, v, opts);
  } catch {
    // a full storage: this note is simply not kept
  }
};
const readObject = (k) => {
  try {
    const o = JSON.parse(get(k) || "{}");
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
};

// ---- the server's health ------------------------------------------------------------------------------------------------
const HEALTH_KEY = "rb_health";
const DOWN_AFTER = 3;

export const readHealth = () => readObject(HEALTH_KEY);

/** Three failed manifest reads or checks in a row are reported once (the third); an answer resets the count. */
export function recordHealth(ok) {
  const prev = readHealth();
  const fails = ok ? 0 : (Number.isFinite(prev.fails) ? prev.fails : 0) + 1;
  set(HEALTH_KEY, JSON.stringify({ ok, fails, at: Date.now() }));
  try {
    if (fails === DOWN_AFTER) kino.log.report("cncverse:down", "server");
  } catch {
    // no report channel
  }
}

// ---- a circuit breaker per catalog ---------------------------------------------------------------------------------------
// Two failures in a row open the breaker for 10 min; each further failure doubles that (30 min, 2 h, 6 h). The first call after the
// pause is the trial (half-open): a success closes it, a failure reopens it for longer. Two scopes, so one kind of slowness does not
// silence the other: "play" (its page or video failed: unreliable everywhere, Home included) and "search" (it could not answer a
// search in time: left out of searches and of the fallback, but its Home row, a cheaper request, stays).
const BREAKER_KEY = "rb_breaker";
const BREAKER_AFTER = 2;
const STEPS_MIN = [10, 30, 120, 360];

export function readBreaker() {
  const out = {};
  for (const [k, v] of Object.entries(readObject(BREAKER_KEY))) if (v && Number.isFinite(v.n) && Number.isFinite(v.until)) out[k] = { n: v.n, until: v.until };
  return out;
}

/** Record a catalog's outcome. [scope] is "play" (default) or "search". */
export function noteCatalog(id, ok, scope = "play") {
  if (!id) return;
  const key = scope + ":" + id;
  const all = readBreaker();
  if (ok) delete all[key];
  else {
    const n = ((all[key] && all[key].n) || 0) + 1;
    const step = STEPS_MIN[Math.min(Math.max(0, n - BREAKER_AFTER), STEPS_MIN.length - 1)];
    all[key] = { n, until: n >= BREAKER_AFTER ? Date.now() + step * 60000 : 0 };
  }
  set(BREAKER_KEY, JSON.stringify(all), { ttlMs: DAY_MS });
}

/** Ms until a catalog's breaker closes (0 = closed); one [scope] or both. */
export function pausedFor(id, all, scope) {
  const br = all || readBreaker();
  let left = 0;
  for (const sc of scope ? [scope] : ["play", "search"]) {
    const e = br[sc + ":" + id];
    if (e && e.n >= BREAKER_AFTER && e.until > Date.now()) left = Math.max(left, e.until - Date.now());
  }
  return left;
}

export const isPaused = (id, all, scope) => pausedFor(id, all, scope) > 0;

export function resetBreaker() {
  try {
    kino.storage.remove(BREAKER_KEY);
  } catch {
    // nothing to reset
  }
}

/** The catalogs of [list] whose breaker is closed; when every one is paused, all of them (a slow answer beats none). */
export function healthyOnly(list, scope) {
  const br = readBreaker();
  const ok = list.filter((c) => !isPaused(c.id, br, scope));
  return ok.length ? ok : list;
}

// ---- how fast each catalog answers a search --------------------------------------------------------------------------------
const LAT_KEY = "rb_latency";
export const LATENCY_UNKNOWN_MS = 5000;

export const readLatency = () => readObject(LAT_KEY);

/** Smoothed (60/40): the next search asks the quick ones first. */
export function noteLatency(id, ms) {
  const all = readLatency();
  const prev = Number(all[id]);
  all[id] = Math.round(Number.isFinite(prev) && prev > 0 ? prev * 0.6 + ms * 0.4 : ms);
  set(LAT_KEY, JSON.stringify(all), { ttlMs: 7 * DAY_MS });
}

/** [list] with the quickest catalog first (measured; one never measured counts as LATENCY_UNKNOWN_MS). */
export function byLatency(list) {
  const lat = readLatency();
  const ms = (c) => lat[c.id] || LATENCY_UNKNOWN_MS;
  return list.slice().sort((a, b) => ms(a) - ms(b));
}

export { DAY_MS };

// ---- the catalogs the person picked ----------------------------------------------------------------------------------------
// Mode "all" (the setting's default) uses every catalog; "custom" uses the ones picked on the screen's sources page, and a catalog
// that has no pick yet (the server added it later) is on. The picks live in storage: a settings form cannot hold one switch each.
const PICKS_KEY = "rb_picks";

export function readPicks() {
  const out = {};
  for (const [k, v] of Object.entries(readObject(PICKS_KEY))) if (typeof v === "boolean") out[k] = v;
  return out;
}

/** Keeps the picks; true only when they were really written (a full storage refuses silently). */
export function writePicks(map) {
  const text = JSON.stringify(map);
  set(PICKS_KEY, text);
  return get(PICKS_KEY) === text;
}

export const sourceMode = () => (String(kino.config.get("srcMode") || "all") === "custom" ? "custom" : "all");

/** Is this catalog on? */
export function isOn(cat) {
  if (sourceMode() !== "custom") return true;
  const picks = readPicks();
  // Everything switched off would leave the plugin with nothing to show: that is read as "everything" until one is switched on.
  const ids = manifestIds();
  if (ids.length > 0 && ids.every((id) => picks[id] === false)) return true;
  return typeof picks[cat.id] === "boolean" ? picks[cat.id] : true;
}

// The catalog ids of the manifest the plugin keeps (key "m2", plugin.js), parsed once per distinct copy.
let idsMemo = { raw: null, ids: [] };
function manifestIds() {
  const raw = get("m2");
  if (raw !== idsMemo.raw) {
    let ids = [];
    try {
      const o = JSON.parse(raw || "null");
      ids = o && o.v && Array.isArray(o.v.catalogs) ? o.v.catalogs.map((c) => c && c.id).filter((x) => typeof x === "string") : [];
    } catch {
      ids = [];
    }
    idsMemo = { raw, ids };
  }
  return idsMemo.ids;
}

export function forgetAll() {
  for (const k of [HEALTH_KEY, BREAKER_KEY, LAT_KEY]) {
    try {
      kino.storage.remove(k);
    } catch {
      // nothing
    }
  }
}
