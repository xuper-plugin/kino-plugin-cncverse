// @ts-check
/// <reference path="./kino.d.ts" />
// Kino plugin: CNCVerse -- movies, series, anime, live sports and live TV from a CNCVerse Bridge address.
// CNCVerse Bridge (cncverse.dpdns.org) turns CloudStream providers into a Stremio addon. The plugin uses one
// profile address (its code is sealed in the manifest; a person's own address may replace it), and this plugin talks to it
// directly. Read it top to bottom: 1. constants  2. texts  3. cache  4. bridge client  5. items  6. search
// 7. home, browse, categories  8. episodes and details  9. resolve  10. live  11. settings.
// Declared host: cncverse.dpdns.org (kino.fetch). The video is on other servers: `streamHosts: "any"` and
// `liveStreamHosts: "any"`, which the person approves at install.

const HOST = "cncverse.dpdns.org";
const ROW_MAX = 60;
const LIST_TIMEOUT_MS = 12000;
const SLOW_TIMEOUT_MS = 30000; // a title's page or streams make the bridge scrape a site: 10-18 s is normal
const PAGE_MAX = 100;
const MAX_SKIP = 1000;

// The bridge's on-demand catalogs worth listing, measured one by one. `kind` is what a title of that source is when its
// name and shelf say nothing. Left out on purpose: Netflix, Prime Video, Hotstar, Disney, Marvel, Pixar and Star Wars
// (their cards have no title, only a poster), RingZ (2.6k titles, a search takes 40 s), Castle TV (needs VLC) and the
// duplicated Movix (tv) and Re:ANIME catalogs.
const SOURCES = [
  { key: "hdhub4u", catalog: "cnc_HDHub4U_other", title: "HDHub4U", kind: "movie" },
  { key: "4khdhub", catalog: "cnc_4KHDHUB_other", title: "4K HDHUB", kind: "movie" },
  { key: "vega", catalog: "cnc_VegaMovies_other", title: "VegaMovies", kind: "movie" },
  { key: "rog", catalog: "cnc_Rogmovies_other", title: "Rogmovies", kind: "movie" },
  { key: "multi", catalog: "cnc_MultiMovies_other", title: "MultiMovies", kind: "movie" },
  { key: "cinefreak", catalog: "cnc_Cinefreak_other", title: "Cinefreak", kind: "movie" },
  { key: "moviebox", catalog: "cnc_MovieBoxIN_other", title: "MovieBox IN", kind: "movie" },
  { key: "movix", catalog: "cnc_Movix_other", title: "Movix", kind: "movie" },
  { key: "kisskh", catalog: "cnc_Kisskh_other", title: "Kisskh", kind: "series" },
  { key: "dizilla", catalog: "cnc_Dizilla_other", title: "Dizilla", kind: "series" },
  { key: "reanime", catalog: "cnc_ReANIME_ReAnime_other", title: "Re:ANIME", kind: "series" },
];
const HOME_SOURCES = ["hdhub4u", "4khdhub", "kisskh", "reanime", "movix"];

// Live: the sports-event catalogs and JioTV, split by its own genres. `vocab` is Kino's closed genre vocabulary.
const EVENTS = [
  { id: "ev-livxow", catalog: "cnc_LivXowLiveEvents_tv", title: "LivXow" },
  { id: "ev-playztv", catalog: "cnc_PlayZTVLiveEvents_tv", title: "PlayZTV" },
  { id: "ev-playfy", catalog: "cnc_PlayFyLiveEvents_tv", title: "PlayFy" },
  { id: "ev-sportzx", catalog: "cnc_SportzXLiveEvents_tv", title: "SportzX" },
  { id: "ev-sktech", catalog: "cnc_SKTechLiveEvents_tv", title: "SKTech" },
];
const JIO_CATALOG = "cnc_JIOTV_tv";
const JIO_VOCAB = { News: "noticias", Music: "musica", Kids: "infantil", Movies: "peliculas", Sports: "deportes", Educational: "documentales" };
const LIVE_PAGE = 500;

// Adult is never offered: not a shelf, not a title.
const ADULT = /adult|18\+|xxx|porn|erotic|sexy/i;

// ---- 1. texts -------------------------------------------------------------------------------------------------

const TEXTS = {
  es: {
    needAddress: "No se pudo abrir el código sellado del plugin: instálalo desde su rama principal, sin @rama, o pega tu propia dirección en los ajustes.",
    badAddress: "La dirección no es válida: debe ser la de cncverse.dpdns.org con tu código personal.",
    unavailable: "CNCVerse no responde ahora. Intenta de nuevo en un rato.",
    noStreams: "Este título no tiene video disponible por ahora. Prueba otro o vuelve más tarde.",
    noEpisodes: "Este título no trae lista de episodios.",
    noSignal: "Este canal no tiene señal ahora mismo. Si el evento aún no empieza, vuelve más tarde.",
    shelfAll: "Lo último", copy: "Opción {n}", episode: "Episodio {n}",
    tileEvents: "Eventos · {name}", tileJio: "JioTV · {name}", tileLive: "En vivo",
    cacheStatus: "Caché: {n} entradas, {kb} KB", cacheCleared: "Listo: se vació la caché",
    healthOk: "responde", healthFail: "falla", healthNone: "sin datos",
    probeOk: "Listo: el puente responde", probeFail: "El puente no responde ahora",
    genreSports: "Deportes", genreNews: "Noticias", genreMusic: "Música", genreKids: "Infantil", genreMovies: "Películas",
    genreEntertainment: "Entretenimiento", genreInfotainment: "Infoentretenimiento", genreDevotional: "Devocional",
    genreEducational: "Educativo", genreBusiness: "Negocios", genreShopping: "Compras", genreLifestyle: "Estilo de vida",
  },
  en: {
    needAddress: "The plugin's sealed code could not be opened: install it from its default branch, without a @branch, or paste your own address in the settings.",
    badAddress: "The address is not valid: it must be the cncverse.dpdns.org one with your personal code.",
    unavailable: "CNCVerse isn't responding right now. Try again in a while.",
    noStreams: "This title has no video available right now. Try another or come back later.",
    noEpisodes: "This title has no episode list.",
    noSignal: "This channel has no signal right now. If the event has not started yet, come back later.",
    shelfAll: "Latest", copy: "Option {n}", episode: "Episode {n}",
    tileEvents: "Events · {name}", tileJio: "JioTV · {name}", tileLive: "Live",
    cacheStatus: "Cache: {n} entries, {kb} KB", cacheCleared: "Done: the cache is empty",
    healthOk: "responding", healthFail: "failing", healthNone: "no data",
    probeOk: "Done: the bridge responds", probeFail: "The bridge is not responding right now",
    genreSports: "Sports", genreNews: "News", genreMusic: "Music", genreKids: "Kids", genreMovies: "Movies",
    genreEntertainment: "Entertainment", genreInfotainment: "Infotainment", genreDevotional: "Devotional",
    genreEducational: "Educational", genreBusiness: "Business", genreShopping: "Shopping", genreLifestyle: "Lifestyle",
  },
};

function isSpanish() {
  return String(kino.lang || "").toLowerCase().startsWith("es");
}

function t(key, vars) {
  const template = TEXTS[isSpanish() ? "es" : "en"][key] || TEXTS.es[key] || key;
  return vars ? template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] != null ? vars[k] : "")) : template;
}

// ---- 2. cache -------------------------------------------------------------------------------------------------

// kino.storage keeps 256 KB in all. An entry is `{ at, v }`, kept HARD_TTL_MS, "fresh" for the window the caller gives;
// an expired-but-kept one is the fallback when the bridge fails (an old list beats an empty screen).
const CACHE_PREFIX = "c1:";
const HARD_TTL_MS = 24 * 60 * 60 * 1000;
const ENTRY_MAX_CHARS = 48 * 1024;
const FRESH_LIST_MS = 15 * 60 * 1000;
const FRESH_META_MS = 60 * 60 * 1000;
const FRESH_MANIFEST_MS = 12 * 60 * 60 * 1000;

function cacheKeys() {
  return kino.storage.keys().filter((k) => k.startsWith(CACHE_PREFIX));
}

function cacheRead(key) {
  const raw = kino.storage.get(CACHE_PREFIX + key);
  if (!raw) return null;
  try {
    const e = JSON.parse(raw);
    return e && typeof e.at === "number" ? e : null;
  } catch {
    kino.storage.remove(CACHE_PREFIX + key);
    return null;
  }
}

function evictOldest() {
  let victim = null;
  let oldest = Infinity;
  for (const k of cacheKeys()) {
    let at = 0;
    try {
      at = JSON.parse(kino.storage.get(k) || "{}").at || 0;
    } catch {
      // unreadable: the first to go
    }
    if (at < oldest) {
      oldest = at;
      victim = k;
    }
  }
  if (!victim) return false;
  kino.storage.remove(victim);
  return true;
}

// A cache never fails the call it serves: whatever storage refuses is simply not cached.
function cacheWrite(key, v) {
  const raw = JSON.stringify({ at: Date.now(), v });
  if (raw.length > ENTRY_MAX_CHARS) return;
  for (let tries = 0; tries < 20; tries++) {
    try {
      kino.storage.set(CACHE_PREFIX + key, raw, { ttlMs: HARD_TTL_MS });
      return;
    } catch (e) {
      if (!e || e.code !== "too_large" || !evictOldest()) return;
    }
  }
}

async function cached(key, freshMs, load) {
  const hit = cacheRead(key);
  if (hit && Date.now() - hit.at < freshMs) return hit.v;
  try {
    const v = await load();
    cacheWrite(key, v);
    return v;
  } catch (e) {
    if (hit) {
      kino.log("serving stale " + key + ": " + (e && e.message));
      return hit.v;
    }
    throw e;
  }
}

// ---- 3. bridge client -----------------------------------------------------------------------------------------

const enc = encodeURIComponent;

const HEALTH_KEY = "health";
const DOWN_AFTER = 3;

function readHealth() {
  try {
    const h = JSON.parse(kino.storage.get(HEALTH_KEY) || "{}");
    return h && typeof h === "object" && !Array.isArray(h) ? h : {};
  } catch {
    return {};
  }
}

// Three failed requests in a row are reported once (the third only); an ok answer resets the count.
function recordHealth(ok) {
  try {
    const prev = readHealth();
    const fails = ok ? 0 : (Number.isFinite(prev.fails) ? prev.fails : 0) + 1;
    kino.storage.set(HEALTH_KEY, JSON.stringify({ ok, fails, at: Date.now() }));
    if (fails === DOWN_AFTER) kino.log.report("cncverse:down", "bridge");
  } catch {
    // a full storage: the next request records again
  }
}

// The bridge's address. By default it is the plugin's own profile: the code in its path is sealed in the manifest
// (`secrets.bridgeCode`), so the marker stands in for it until kino.fetch sends the request (the code never reaches this file,
// a log or an error). A person's own address, pasted in the settings, takes its place: `https://cncverse.dpdns.org/u/<code>`,
// a `stremio://` link and a trailing /manifest.json are tolerated; any other host is refused.
function base() {
  let raw = String(kino.config.get("address") || "").trim();
  if (!raw) {
    try {
      return `https://${HOST}/u/${kino.secret("bridgeCode")}`;
    } catch {
      // A seal only opens when the plugin is installed from its default branch, without @branch.
      throw kino.error("auth_required", "the sealed bridge code is not available", { userMessage: t("needAddress") });
    }
  }
  raw = raw.replace(/^stremio:\/\//i, "https://").replace(/\/manifest\.json.*$/i, "").replace(/\/+$/, "");
  if (!/^https:\/\//i.test(raw)) raw = "https://" + raw.replace(/^https?:\/\//i, "");
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw kino.error("invalid_request", "bad bridge address", { userMessage: t("badAddress") });
  }
  if (u.hostname.toLowerCase() !== HOST || u.pathname.length < 4) throw kino.error("invalid_request", "bad bridge address", { userMessage: t("badAddress") });
  return "https://" + HOST + u.pathname.replace(/\/+$/, "");
}

// [slice]: one of many sources asked at once (a search, a home row): its failure is that source's, not the bridge's, so
// it is not counted in the health the settings show and the report.
async function getJson(path, timeoutMs, slice) {
  const note = (ok) => (slice && !ok ? undefined : recordHealth(ok));
  let r;
  try {
    r = await kino.fetch(base() + path, { timeoutMs: timeoutMs || 15000, headers: { Accept: "application/json" } });
  } catch (e) {
    if (e && (e.code === "auth_required" || e.code === "invalid_request")) throw e;
    note(false);
    throw e;
  }
  if (!r.ok) {
    note(false);
    throw kino.error("unavailable", "CNCVerse answered " + r.status, { userMessage: t("unavailable") });
  }
  try {
    const body = await r.json();
    recordHealth(true);
    return body;
  } catch {
    note(false);
    throw kino.error("unavailable", "CNCVerse answered something that is not JSON", { userMessage: t("unavailable") });
  }
}

async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const i = next++;
      out[i] = await fn(list[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  return out;
}

// A catalog's shelves are the `genre` options its manifest entry declares. Adult ones are dropped.
async function genresOf(catalog) {
  const all = await cached("genres", FRESH_MANIFEST_MS, async () => {
    const m = await getJson("/manifest.json", LIST_TIMEOUT_MS);
    const out = {};
    for (const c of Array.isArray(m.catalogs) ? m.catalogs : []) {
      const g = (Array.isArray(c.extra) ? c.extra : []).find((e) => e && e.name === "genre");
      out[c.id] = g && Array.isArray(g.options) ? g.options.filter((o) => typeof o === "string" && o.trim()).map((o) => o.trim().slice(0, 60)) : [];
    }
    return out;
  });
  return (all[catalog] || []).filter((g) => !ADULT.test(g));
}

// ---- 4. items -------------------------------------------------------------------------------------------------

const MAX_ID = 128;

// A Kino item id (^[A-Za-z0-9._~-]{1,128}$) from the bridge's id ("cnc:" + base64): the url-safe alphabet, shortened with a
// hash when it is too long. The ref keeps the bridge's own id.
function kinoId(addonId) {
  const clean = String(addonId || "").replace(/^cnc:/, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").replace(/[^A-Za-z0-9._~-]/g, "-") || "unknown";
  if (clean.length <= MAX_ID) return clean;
  return clean.slice(0, MAX_ID - 9) + "-" + kino.crypto.hash("sha1", String(addonId)).slice(0, 8);
}

// The sites title a release like "Gunaah (Season 1 – 2) Hindi Complete Hotstar Exclusive WEB Series 480p | 720p | 1080p
// WEB-DL": the title is what comes before the first technical word.
function cleanTitle(name) {
  let s = String(name || "").replace(/[⠀​]/g, "").replace(/^[^\p{L}\p{N}(\[]+/u, "");
  const cut = /\s(?:\d{3,4}p\b|WEB-?DL|WEB-?Rip|Blu-?Ray|BRRip|HDRip|HDTC|HDCAM|Dual Audio|\{|Hindi (?:Dubbed|Complete|TV)|Complete\b)/i.exec(s);
  if (cut && cut.index > 2) s = s.slice(0, cut.index);
  return s.replace(/[\s\-–:|]+$/, "").slice(0, 120);
}

/** The text a bridge id carries ("Source::<url or json>"), from its url-safe or plain base64; "" when it is not base64. */
function decodeId(addonId) {
  const b64 = String(addonId || "").replace(/^cnc:/, "").replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  if (!/^[A-Za-z0-9+/]+$/.test(b64)) return "";
  const bytes = [];
  let acc = 0;
  let bits = 0;
  for (const ch of b64) {
    acc = (acc << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 255);
    }
  }
  try {
    return decodeURIComponent(bytes.map((b) => "%" + (b < 16 ? "0" : "") + b.toString(16)).join(""));
  } catch {
    return bytes.map((b) => String.fromCharCode(b)).join("");
  }
}
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const SERIES_WORDS = /\bseason\b|\bS\d{1,2}\b|\bS\d{1,2}E\d|\bseries\b|\btv[- ]?show\b|\bepisode|\bepisodes\b|\bs[ée]ries\b|\bdizi\b|\bseasons\b/i;
const MOVIE_WORDS = /\bmovie\b|\bfilms?\b|\bfull movie\b/i;

// A title's kind: its shelf's label when it names one, else the path of the page it comes from ("/series/", "/movie/"),
// else its name, else its source's usual kind.
function kindOf(name, shelfKind, source, addonId) {
  if (shelfKind) return shelfKind;
  const page = decodeId(addonId);
  if (/\/(?:series|tv-?series|tv-?shows?|web-?series|shows?|dizi|diziler|anime-series|episodes?)\//i.test(page)) return "series";
  if (/\/(?:movies?|films?|film)\//i.test(page)) return "movie";
  if (SERIES_WORDS.test(name)) return "series";
  if (MOVIE_WORDS.test(name)) return "movie";
  return source.kind;
}

function shelfKindOf(label) {
  const s = String(label || "");
  if (/movie|film|cinema|bioskop/i.test(s) && !/series|show|s[ée]rie/i.test(s)) return "movie";
  if (/series|show|episod|s[ée]rie|dizi|bölüm|drama|k-?drama|c-?drama|tv/i.test(s)) return "series";
  return null;
}

function toItem(m, source, shelfKind) {
  const title = cleanTitle(m && m.name);
  if (!m || typeof m.id !== "string" || !m.id.startsWith("cnc:") || title.length < 2) return null;
  const kind = kindOf(String(m.name || ""), shelfKind, source, m.id);
  const item = { id: kinoId(m.id), ref: (kind === "movie" ? "m:" : "i:") + m.id, title, kind };
  if (typeof m.poster === "string" && m.poster.startsWith("https://")) item.poster = m.poster;
  const year = /\((19|20)\d{2}\)/.exec(String(m.name || ""));
  if (year) item.year = year[0].slice(1, 5);
  return item;
}

function itemsOf(body, source, shelfKind) {
  const seen = new Set();
  const out = [];
  for (const m of body && Array.isArray(body.metas) ? body.metas : []) {
    const it = toItem(m, source, shelfKind);
    if (it && !seen.has(it.id)) {
      seen.add(it.id);
      out.push(it);
    }
  }
  return out;
}

function sourceOf(key) {
  return SOURCES.find((s) => s.key === key);
}

// A shelf: a source's catalog, optionally one genre, from `skip`.
async function shelfItems(source, genreIndex, skip, slice) {
  let genre = "";
  if (genreIndex > 0) genre = (await genresOf(source.catalog))[genreIndex - 1] || "";
  const extra = [genre ? "genre=" + enc(genre) : "", skip > 0 ? "skip=" + skip : ""].filter(Boolean).join("&");
  const body = await getJson(`/catalog/other/${source.catalog}${extra ? "/" + extra : ""}.json`, LIST_TIMEOUT_MS, slice);
  return { items: itemsOf(body, source, shelfKindOf(genre)), genre };
}

// ---- 5. search ------------------------------------------------------------------------------------------------

// Every searchable source at once, a few at a time; one that is slow or fails is left out. ORDERED (never filtered) by how
// much each title resembles what was typed.
export async function search(query) {
  const q = kino.rank.shortQuery(String(query.q || "").trim());
  if (!q) return [];
  base();
  const titles = [query.q, query.originalTitle].concat(Array.isArray(query.altTitles) ? query.altTitles : []).filter((x) => typeof x === "string" && x.trim());
  const lists = await mapLimit(SOURCES, 3, async (s) => {
    try {
      const body = await getJson(`/catalog/other/${s.catalog}/search=${enc(q)}.json`, 12000, true);
      return itemsOf(body, s, null);
    } catch (e) {
      if (e && (e.code === "auth_required" || e.code === "invalid_request")) throw e;
      kino.log("search " + s.key + " failed: " + (e && e.message));
      return [];
    }
  });
  const merged = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) for (const l of lists) if (l[i]) merged.push(l[i]);
  const seen = new Set();
  const unique = merged.filter((it) => {
    const key = it.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return kino.rank.sortBySimilarity(unique, titles);
}

// ---- 6. home, browse, categories ------------------------------------------------------------------------------

async function homeRow(key) {
  const source = sourceOf(key);
  if (!source) return null;
  try {
    const items = await cached("row:" + key, FRESH_LIST_MS, async () => (await shelfItems(source, 0, 0, true)).items.slice(0, ROW_MAX));
    return items.length ? { id: "src-" + key, title: source.title, ref: `c:${key}:0`, items, genre: source.kind === "series" ? "series" : "peliculas" } : null;
  } catch (e) {
    if (e && (e.code === "auth_required" || e.code === "invalid_request")) throw e;
    kino.log("row " + key + " failed: " + (e && e.message));
    return null;
  }
}

export async function home() {
  if (kino.config.get("homeRows") === false) return [];
  base();
  return (await mapLimit(HOME_SOURCES, 3, homeRow)).filter(Boolean);
}

// ref "c:<source>:<genre index>" (0 = the catalog's own front shelf), paged by the bridge's `skip`.
export async function browse(ref, cursor) {
  const m = /^c:([a-z0-9]+):(\d{1,3})$/.exec(String(ref || ""));
  const source = m && sourceOf(m[1]);
  if (!m || !source) throw kino.error("not_found", "unknown browse ref: " + String(ref).slice(0, 60));
  const skip = Math.min(MAX_SKIP, Math.max(0, parseInt(cursor || "0", 10) || 0));
  const { items } = await shelfItems(source, parseInt(m[2], 10), skip);
  const page = items.slice(0, PAGE_MAX);
  // `skip` counts the items already read, whatever size the bridge's pages have.
  return items.length && skip + items.length < MAX_SKIP ? { items: page, next: String(skip + items.length) } : { items: page };
}

// Categorías: one tile per source (at most 24); the art is the first title's poster.
export async function categories() {
  const tiles = SOURCES.map((s) => ({ id: s.key, title: s.title, ref: `c:${s.key}:0`, source: s }));
  return (await mapLimit(tiles, 4, async (tile) => {
    let art = "";
    try {
      art = await cached("art:" + tile.id, 12 * 60 * 60 * 1000, async () => {
        const first = (await shelfItems(tile.source, 0, 0, true)).items.find((x) => x.poster);
        return first ? first.poster : "";
      });
    } catch (e) {
      if (e && (e.code === "auth_required" || e.code === "invalid_request")) throw e;
      kino.log("art " + tile.id + " failed: " + (e && e.message));
    }
    const out = { id: tile.id, title: tile.title, ref: tile.ref };
    if (art) out.art = art;
    return out;
  }));
}

// ---- 7. episodes and details ----------------------------------------------------------------------------------

function idOf(ref, prefix) {
  const s = String(ref || "");
  return s.startsWith(prefix) && s.length > prefix.length ? s.slice(prefix.length) : null;
}

async function metaOf(id) {
  return cached("meta:" + kinoId(id), FRESH_META_MS, async () => {
    const body = await getJson(`/meta/other/${enc(id)}.json`, SLOW_TIMEOUT_MS);
    const m = body && body.meta;
    if (!m || typeof m !== "object") throw kino.error("not_found", "no meta");
    return {
      title: cleanTitle(m.name),
      poster: typeof m.poster === "string" && m.poster.startsWith("https://") ? m.poster : "",
      backdrop: typeof m.background === "string" && m.background.startsWith("https://") ? m.background : "",
      overview: String(m.description || "").slice(0, 2000),
      genres: (Array.isArray(m.genres) ? m.genres : []).filter((g) => typeof g === "string").slice(0, 5),
      year: /^(19|20)\d{2}/.test(String(m.year || m.releaseInfo || "")) ? String(m.year || m.releaseInfo).slice(0, 4) : "",
      rating: parseFloat(m.imdbRating) || 0,
      // [id, season, number, title, thumbnail]
      videos: (Array.isArray(m.videos) ? m.videos : [])
        .filter((v) => v && typeof v.id === "string" && v.id.startsWith("cnc:"))
        .slice(0, 5000)
        .map((v) => [v.id, Math.max(0, parseInt(v.season, 10) || 0), Math.max(1, parseInt(v.episode, 10) || 1), String(v.title || "").slice(0, 120), typeof v.thumbnail === "string" && v.thumbnail.startsWith("https://") ? v.thumbnail : ""]),
    };
  });
}

function infoOf(meta) {
  const info = {};
  if (meta.title) info.title = meta.title;
  if (meta.poster) info.poster = meta.poster;
  if (meta.backdrop) info.backdrop = meta.backdrop;
  if (meta.overview) info.overview = meta.overview;
  if (meta.genres.length) info.genres = meta.genres;
  if (meta.year) info.year = meta.year;
  return info;
}

// Seasons, then numbers. A title the shelf took for a series that has no episode list (a film) comes back as one episode
// that plays it.
export async function episodes(ref) {
  const id = idOf(ref, "i:");
  if (!id) throw kino.error("not_found", "not a series ref: " + String(ref).slice(0, 80));
  const meta = await metaOf(id);
  if (!meta.videos.length) return { series: infoOf(meta), episodes: [{ season: 1, number: 1, ref: "e:" + id, title: meta.title || t("episode", { n: 1 }) }] };
  const seen = new Set();
  const eps = [];
  for (const [vid, season, number, title, still] of meta.videos.slice().sort((a, b) => a[1] - b[1] || a[2] - b[2])) {
    const key = season + ":" + number;
    if (seen.has(key)) continue;
    seen.add(key);
    const ep = { season: season || 1, number, ref: "e:" + vid };
    if (title) ep.title = title;
    if (still) ep.still = still;
    eps.push(ep);
  }
  return { series: infoOf(meta), episodes: eps };
}

export async function details(ref) {
  const movie = idOf(ref, "m:");
  const id = movie || idOf(ref, "i:");
  if (!id) return null;
  try {
    const info = infoOf(await metaOf(id));
    return info;
  } catch (e) {
    kino.log("details failed: " + (e && e.message));
    return null;
  }
}

// ---- 8. resolve: copies ---------------------------------------------------------------------------------------

// The bridge already resolves the file lockers: its links are direct files (mkv/mp4 on r2, cocktail.beer, pixeldrain...)
// and HLS. Measured: the ones named "[Download]" on `*.workers.dev` are HTML pages and cannot play.
function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function playable(s) {
  if (!s || typeof s.url !== "string" || !/^https?:\/\//.test(s.url)) return false; // the "support the project" row has no url
  const h = hostOf(s.url);
  if (!h) return false;
  if (/\.workers\.dev$/.test(h) && /\[Download\]/i.test(String(s.title || ""))) return false;
  return true;
}

// Lower plays first: a direct file, then HLS, then anything else; a plain-http link (the bridge's own DASH proxy on an IP)
// goes after every https one.
function tierOf(url) {
  if (/^http:\/\//i.test(url)) return 3;
  if (/\.m3u8(\?|$)/i.test(url)) return 1;
  if (/\.(mkv|mp4|webm)(\?|$)/i.test(url) || /pixeldrain|\.r2\.cloudflarestorage\.com|cocktail\.beer|valentine\.guru/i.test(hostOf(url) + url)) return 0;
  return 2;
}

function lineOf(title, emoji) {
  const l = String(title || "").split("\n").find((x) => x.startsWith(emoji));
  return l ? l.slice(emoji.length).trim() : "";
}

function describe(s) {
  const name = String(s.name || "");
  const title = String(s.title || "");
  const q = /(2160|1440|1080|720|480|360)p/i.exec(name + " " + lineOf(title, "🎞️")) || (/\b4k\b/i.test(name) ? [null, "2160"] : null);
  const quality = q ? parseInt(q[1], 10) : 0;
  const size = /(\d+(?:\.\d+)?)\s*(GB|MB)\b/i.exec(lineOf(title, "💾"));
  const gb = size ? parseFloat(size[1]) / (size[2].toUpperCase() === "MB" ? 1024 : 1) : 0;
  // "Source: HDhub4u • HubDrive HubCloud [FSL Server]" -> the bracketed server name when there is one
  const src = lineOf(title, "🛰️").replace(/^Source:\s*/i, "");
  const br = /\[([^\]]{2,24})\]/.exec(src);
  const server = br ? br[1] : src.split("•").pop().trim().slice(0, 24);
  return { quality, gb, server };
}

function qualityName(q) {
  return q >= 2160 ? "4K" : q ? q + "p" : "";
}

function qualityRank(q, pref) {
  if (pref === "max") return -q;
  const cap = pref === "720" ? 720 : 1080;
  const v = q || cap;
  return v <= cap ? cap - v : 100000 + (v - cap);
}

function headersOf(s) {
  const req = s.behaviorHints && s.behaviorHints.proxyHeaders && s.behaviorHints.proxyHeaders.request;
  const out = {};
  if (req && typeof req === "object") for (const k of ["Referer", "Origin", "User-Agent"]) if (typeof req[k] === "string" && req[k]) out[k] = req[k];
  return out;
}

function mimeOf(url) {
  if (/\.m3u8(\?|$)/i.test(url)) return "application/vnd.apple.mpegurl";
  if (/\.mpd(\?|$)/i.test(url)) return "application/dash+xml";
  return undefined;
}

function fileKey(url) {
  const path = url.split("?")[0];
  return hostOf(url) + ":" + path.slice(path.lastIndexOf("/") + 1).slice(0, 40);
}

function toStream(s, index) {
  const d = describe(s);
  const url = String(s.url);
  const parts = [t("copy", { n: index + 1 })];
  if (d.quality) parts.push(qualityName(d.quality));
  if (d.gb) parts.push(d.gb >= 1 ? d.gb.toFixed(1).replace(/\.0$/, "") + " GB" : Math.round(d.gb * 1024) + " MB");
  if (d.server) parts.push(d.server);
  const stream = { url, label: parts.join(" · ").slice(0, 48) };
  const headers = headersOf(s);
  if (Object.keys(headers).length) stream.headers = headers;
  const mime = mimeOf(url);
  if (mime) stream.mime = mime;
  return { stream, quality: d.quality, gb: d.gb, tier: tierOf(url), index, key: fileKey(url) };
}

// ---- 8b. what failed before -------------------------------------------------------------------------------------

// Kino only says a copy failed when the origin REFUSED it; a dead link just moves the player on. So a second resolve of the
// same title soon after the first is read as "that copy did not work": the copy served first goes last for a while.
const SERVED_PREFIX = "served:";
const BAD_KEY = "bad";
const REOPEN_WINDOW_MS = 2 * 60 * 1000;
const BAD_FOR_MS = 10 * 60 * 1000;
const BAD_MAX = 40;

function readBad() {
  try {
    const raw = JSON.parse(kino.storage.get(BAD_KEY) || "{}");
    const now = Date.now();
    const out = {};
    if (raw && typeof raw === "object" && !Array.isArray(raw)) for (const [k, until] of Object.entries(raw)) if (Number(until) > now) out[k] = Number(until);
    return out;
  } catch {
    return {};
  }
}

function writeBad(bad) {
  try {
    const entries = Object.entries(bad).sort((a, b) => b[1] - a[1]).slice(0, BAD_MAX);
    kino.storage.set(BAD_KEY, JSON.stringify(Object.fromEntries(entries)), { ttlMs: BAD_FOR_MS });
  } catch {
    // a full storage: the order just is not learned this time
  }
}

async function streamsOf(type, id) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const body = await getJson(`/stream/${type}/${enc(id)}.json`, SLOW_TIMEOUT_MS);
    const list = Array.isArray(body.streams) ? body.streams.filter(playable) : [];
    if (list.length) return list;
    if (attempt < 1) await kino.sleep(800);
  }
  return [];
}

async function resolveVideo(id, ref, options) {
  const raw = await streamsOf("other", id);
  const seen = new Set();
  const pref = String(kino.config.get("quality") || "1080");
  const capGb = parseFloat(String(kino.config.get("maxSize") || "10")) || 0;
  const bad = readBad();
  const servedKey = SERVED_PREFIX + kino.crypto.hash("sha1", ref).slice(0, 24);
  let prev = null;
  try {
    prev = JSON.parse(kino.storage.get(servedKey) || "null");
  } catch {
    prev = null;
  }
  const now = Date.now();
  const reopened = (options && options.retry) || (prev && typeof prev.t === "number" && now - prev.t < REOPEN_WINDOW_MS);
  if (reopened && prev && prev.key) {
    bad[prev.key] = now + BAD_FOR_MS;
    writeBad(bad);
  }
  const heavy = (x) => (capGb > 0 && x.gb > capGb ? 1 : 0);
  const pool = raw
    .map((s, i) => toStream(s, i))
    .filter((x) => (seen.has(x.stream.url) ? false : (seen.add(x.stream.url), true)))
    .sort(
      (a, b) =>
        (bad[a.key] ? 1 : 0) - (bad[b.key] ? 1 : 0) ||
        heavy(a) - heavy(b) ||
        qualityRank(a.quality, pref) - qualityRank(b.quality, pref) ||
        a.tier - b.tier ||
        (a.gb || 99) - (b.gb || 99) ||
        a.index - b.index,
    );
  if (!pool.length) throw kino.error("not_found", "no playable streams", { userMessage: t("noStreams") });
  const [first, ...rest] = pool;
  try {
    kino.storage.set(servedKey, JSON.stringify({ t: now, key: first.key }), { ttlMs: BAD_FOR_MS });
  } catch {
    // not remembered: the next play just starts from the same order
  }
  const main = { ...first.stream, expiresInSeconds: 1800 };
  const alternatives = rest.slice(0, 8).map((x) => x.stream);
  if (alternatives.length) main.alternatives = alternatives;
  return main;
}

// ---- 9. live --------------------------------------------------------------------------------------------------

// A live category is a catalog (an events source) or JioTV with one genre; the id says which.
function liveSpec(categoryId) {
  const ev = EVENTS.find((e) => e.id === categoryId);
  if (ev) return { catalog: ev.catalog, genre: "" };
  const m = /^jio-(\d{1,2})$/.exec(String(categoryId || ""));
  return m ? { catalog: JIO_CATALOG, genreIndex: parseInt(m[1], 10) } : null;
}

function genreLabel(g) {
  const key = "genre" + g.replace(/[^A-Za-z]/g, "");
  return TEXTS.es[key] ? t(key) : g;
}

export async function liveCategories() {
  const out = EVENTS.map((e) => ({ id: e.id, title: t("tileEvents", { name: e.title }), genre: "deportes" }));
  let genres = [];
  try {
    genres = await genresOf(JIO_CATALOG);
  } catch (e) {
    if (e && (e.code === "auth_required" || e.code === "invalid_request")) throw e;
    kino.log("jio genres failed: " + (e && e.message));
  }
  genres.forEach((g, i) => out.push({ id: "jio-" + (i + 1), title: t("tileJio", { name: genreLabel(g) }), genre: JIO_VOCAB[g] || "entretenimiento" }));
  return out;
}

function channelOf(m, categoryId) {
  const out = {
    id: kinoId(m.id),
    title: String(m.name || "").replace(/[⠀​]/g, "").replace(/^[^\p{L}\p{N}(\[]+/u, "").slice(0, 120) || "Channel",
    ref: "l:" + m.id,
    categoryId,
  };
  if (typeof m.poster === "string" && m.poster.startsWith("https://")) out.logo = m.poster;
  return out;
}

// The bridge ignores `skip` on these catalogs (it answers the whole list each time), so a page is a slice. Not cached: a
// JioTV list is ~1.5 KB per channel and carries signed links.
async function liveList(categoryId) {
  const spec = liveSpec(categoryId);
  if (!spec) return [];
  let genre = "";
  if (spec.genreIndex) genre = (await genresOf(JIO_CATALOG))[spec.genreIndex - 1] || "";
  const body = await getJson(`/catalog/tv/${spec.catalog}${genre ? "/genre=" + enc(genre) : ""}.json`, SLOW_TIMEOUT_MS);
  const seen = new Set();
  return (Array.isArray(body.metas) ? body.metas : []).filter((m) => {
    if (!m || typeof m.id !== "string" || !m.id.startsWith("cnc:") || m.id.length > 4000 || !String(m.name || "").trim()) return false;
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

export async function liveChannels({ categoryId, cursor }) {
  const metas = await liveList(categoryId);
  const from = cursor ? Math.max(0, parseInt(cursor, 10) || 0) : 0;
  const page = metas.slice(from, from + LIVE_PAGE);
  return { items: page.map((m) => channelOf(m, categoryId)), next: from + LIVE_PAGE < metas.length ? String(from + LIVE_PAGE) : null };
}

export async function liveSearch({ query }) {
  const q = encodeURIComponent(String(query || "").trim());
  if (!q) return { items: [] };
  const catalogs = [JIO_CATALOG].concat(EVENTS.map((e) => e.catalog));
  const lists = await mapLimit(catalogs, 3, async (c) => {
    try {
      const body = await getJson(`/catalog/tv/${c}/search=${q}.json`, 12000, true);
      return Array.isArray(body.metas) ? body.metas : [];
    } catch (e) {
      if (e && (e.code === "auth_required" || e.code === "invalid_request")) throw e;
      return [];
    }
  });
  const seen = new Set();
  const items = [];
  for (const metas of lists) {
    for (const m of metas) {
      if (!m || typeof m.id !== "string" || !m.id.startsWith("cnc:") || m.id.length > 4000 || seen.has(m.id) || !String(m.name || "").trim()) continue;
      seen.add(m.id);
      items.push({ ...channelOf(m, ""), categoryId: undefined, adult: false });
    }
  }
  return { items: items.slice(0, 100) };
}

const LIVE_RETRY_MS = 2 * 60 * 1000;

async function resolveLive(id) {
  const body = await getJson(`/stream/tv/${enc(id)}.json`, SLOW_TIMEOUT_MS);
  const streams = (Array.isArray(body.streams) ? body.streams : []).filter(playable);
  if (!streams.length) throw kino.error("not_found", "no streams", { userMessage: t("noSignal") });
  // HLS first (a DASH copy comes through the bridge's own proxy), then the bridge's order.
  streams.sort((a, b) => tierOf(a.url) - tierOf(b.url));
  // Opening the same channel again within LIVE_RETRY_MS means the copy served last did not play: it is remembered as bad.
  const key = "try:" + kino.crypto.hash("sha1", id).slice(0, 24);
  let bad = [];
  try {
    const last = JSON.parse(kino.storage.get(key) || "null");
    if (last && Array.isArray(last.bad)) bad = last.bad.filter((x) => Date.now() - x.t < BAD_FOR_MS);
    if (last && last.url && Date.now() - last.t < LIVE_RETRY_MS) bad.push({ url: last.url, t: Date.now() });
  } catch {
    bad = [];
  }
  let fresh = streams.filter((s) => !bad.some((x) => x.url === s.url));
  if (!fresh.length) {
    bad = [];
    fresh = streams;
  }
  const pick = fresh[0];
  try {
    kino.storage.set(key, JSON.stringify({ t: Date.now(), url: pick.url, bad: bad.slice(-8) }), { ttlMs: BAD_FOR_MS });
  } catch {
    // the memory is a nicety: the channel plays without it
  }
  const out = { url: pick.url, headers: headersOf(pick) };
  const mime = mimeOf(pick.url);
  if (mime) out.mime = mime;
  return out;
}

// ---- 10. resolve ----------------------------------------------------------------------------------------------

export async function resolve(ref, options) {
  const r = String(ref || "");
  const live = idOf(r, "l:");
  if (live) return resolveLive(live);
  const id = idOf(r, "m:") || idOf(r, "e:");
  if (!id) throw kino.error("not_found", "not a playable ref: " + r.slice(0, 80));
  return resolveVideo(id, r, options);
}

// ---- 11. settings ---------------------------------------------------------------------------------------------

export async function settingsStatus() {
  const keys = cacheKeys();
  let chars = 0;
  for (const k of keys) chars += k.length + (kino.storage.get(k) || "").length;
  const h = readHealth();
  const state = !h || h.ok === undefined ? "healthNone" : h.ok ? "healthOk" : "healthFail";
  return { cache: t("cacheStatus", { n: keys.length, kb: Math.ceil(chars / 1024) }), health: t(state) };
}

export async function action(key) {
  if (key === "clearCache") {
    for (const k of cacheKeys()) kino.storage.remove(k);
    return { message: t("cacheCleared") };
  }
  if (key === "probe") {
    try {
      await getJson("/manifest.json", LIST_TIMEOUT_MS);
      return { message: t("probeOk") };
    } catch (e) {
      if (e && (e.code === "auth_required" || e.code === "invalid_request")) throw e;
      return { message: t("probeFail") };
    }
  }
  throw kino.error("not_found", "unknown action " + String(key).slice(0, 40));
}
