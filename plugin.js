// @ts-check
/// <reference path="./kino.d.ts" />
// CNCVerse: a bridge between Kino and a Stremio-protocol server. The server owns the catalogs, the sources and their
// upkeep; this file only translates its answers into Kino's API, and knows nothing about any of its sources. Everything
// it needs comes from the server's manifest at run time, so a catalog added or removed there shows up here untouched.
// Read it top to bottom: 1. texts  2. http  3. manifest  4. memory  5. items  6. catalogs  7. titles  8. streams
//                        9. live channels  10. subtitles  11. settings

const BASE = "https://cncverse.dpdns.org";

// ---- 1. texts ----------------------------------------------------------------------------------------------------

const TEXTS = {
  es: {
    timeout: "El servidor no responde. Inténtalo de nuevo en un momento.",
    network: "No se pudo conectar con el servidor.",
    server: "El servidor respondió {status}.",
    notStremio: "El servidor no respondió con el formato esperado.",
    noStreams: "Este título no tiene fuentes disponibles ahora.",
    noChannel: "Este canal no está disponible ahora.",
    drmOnly: "Este canal solo se ofrece con una protección que este reproductor no admite.",
    notYet: "Esta transmisión todavía no empieza.",
    unknownRef: "Referencia desconocida.",
    ok: "Conectado: {catalogs} catálogos. Contenido y reproducción comprobados.",
    stepManifest: "No se pudo leer el manifiesto del servidor: {detail}",
    stepCatalog: "El manifiesto está bien, pero falló un catálogo: {detail}",
    stepMeta: "Los catálogos están bien, pero falló la ficha de un título: {detail}",
    stepStream: "La ficha está bien, pero falló la reproducción de un título: {detail}",
    unchecked: "Sin comprobar",
    offline: "Sin conexión: {detail}",
    online: "Conectado: {catalogs} catálogos",
    movieEpisode: "Película",
  },
  en: {
    timeout: "The server isn't responding. Try again in a moment.",
    network: "Could not reach the server.",
    server: "The server answered {status}.",
    notStremio: "The server did not answer in the expected format.",
    noStreams: "This title has no sources available right now.",
    noChannel: "This channel is not available right now.",
    drmOnly: "This channel is only offered with a protection this player does not support.",
    notYet: "This broadcast has not started yet.",
    unknownRef: "Unknown reference.",
    ok: "Connected: {catalogs} catalogs. Content and playback checked.",
    stepManifest: "Could not read the server's manifest: {detail}",
    stepCatalog: "The manifest is fine, but a catalog failed: {detail}",
    stepMeta: "The catalogs are fine, but a title's page failed: {detail}",
    stepStream: "The title's page is fine, but playing a title failed: {detail}",
    unchecked: "Not checked",
    offline: "Offline: {detail}",
    online: "Connected: {catalogs} catalogs",
    movieEpisode: "Movie",
  },
};

function t(key, vars) {
  const lang = String(kino.lang || "").toLowerCase().startsWith("es") ? "es" : "en";
  const tpl = TEXTS[lang][key] || TEXTS.es[key] || key;
  return vars ? tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] != null ? vars[k] : "")) : tpl;
}

// ---- 2. http -----------------------------------------------------------------------------------------------------

function enc(s) {
  return encodeURIComponent(String(s));
}

/** The first two segments of a path ("/stream/tv"): enough to tell what failed, never an id. */
function route(path) {
  return path.split("/").slice(0, 3).join("/");
}

async function getJson(path, timeoutMs) {
  let r;
  try {
    r = await kino.fetch(BASE + path, { timeoutMs: timeoutMs || 12000 });
  } catch (e) {
    const code = e && e.code;
    kino.log("fetch " + route(path) + " failed: " + code);
    throw kino.error("unavailable", "fetch " + code, { userMessage: t(code === "timeout" ? "timeout" : "network") });
  }
  if (!r.ok) {
    kino.log("fetch " + route(path) + " answered " + r.status);
    throw kino.error(r.status === 404 ? "not_found" : "unavailable", "http " + r.status, { userMessage: t("server", { status: r.status }) });
  }
  try {
    return r.json();
  } catch {
    kino.log("fetch " + route(path) + " is not json");
    throw kino.error("unavailable", "not json", { userMessage: t("notStremio") });
  }
}

/** Runs `fn` over `list` with at most `limit` in flight (kino.fetch allows 6); a failed item answers undefined. */
async function pool(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      try { out[i] = await fn(list[i], i); } catch { out[i] = undefined; }
    }
  };
  const workers = [];
  for (let w = 0; w < Math.min(limit, list.length); w++) workers.push(worker());
  await Promise.all(workers);
  return out;
}

// Pages of a catalog stay in memory for the sandbox's life: Home, Ver más and the live tab ask for the same ones.
const MEM = new Map();
const TTL_PAGE = 10 * 60 * 1000;

async function cachedMem(key, ttl, fn) {
  const hit = MEM.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.v;
  const v = await fn();
  MEM.set(key, { at: Date.now(), v });
  return v;
}

// ---- 3. manifest -------------------------------------------------------------------------------------------------

const MANIFEST_KEY = "m2";
const TTL_MANIFEST = 60 * 60 * 1000;

function normalizeManifest(m) {
  if (!m || typeof m !== "object" || !Array.isArray(m.catalogs)) throw kino.error("unavailable", "no catalogs", { userMessage: t("notStremio") });
  const resources = (m.resources || []).map((r) => (typeof r === "string" ? r : r && r.name)).filter(Boolean);
  const catalogs = [];
  for (const c of m.catalogs) {
    if (!c || !c.id || !c.type) continue;
    const extra = Array.isArray(c.extra) ? c.extra : [];
    const required = extra.filter((e) => e && e.isRequired).map((e) => e.name);
    const genreExtra = extra.find((e) => e && e.name === "genre");
    const genres = Array.isArray(genreExtra && genreExtra.options)
      ? genreExtra.options.filter((o) => typeof o === "string" && o.trim()).map((o) => o.trim().slice(0, 60)).slice(0, 24)
      : [];
    catalogs.push({
      id: String(c.id),
      type: String(c.type),
      name: String(c.name || c.id),
      search: extra.some((e) => e && e.name === "search"),
      genres,
      // A catalog that only answers with a required filter (a search-only one, say) cannot fill a row.
      browsable: required.length === 0,
    });
  }
  return { resources, catalogs };
}

async function loadManifest(fresh) {
  let stale = null;
  try {
    const raw = kino.storage.get(MANIFEST_KEY);
    if (raw) stale = JSON.parse(raw);
  } catch { /* unreadable: refetch */ }
  if (!fresh && stale && Date.now() - stale.at < TTL_MANIFEST) return stale.v;
  try {
    const v = normalizeManifest(await getJson("/manifest.json", 15000));
    try { kino.storage.set(MANIFEST_KEY, JSON.stringify({ at: Date.now(), v })); } catch { /* storage full: not cached */ }
    return v;
  } catch (e) {
    if (stale && !fresh) return stale.v; // the server hiccuped: the last manifest still works
    throw e;
  }
}

function isLiveType(type) {
  return type === "tv" || type === "channel";
}

const VISUAL = /[\u{1F000}-\u{1FFFF}☀-➿️‍]/gu;
const BLANK = /^[\s⠀​-‍﻿]*$/;

/** The catalog's name without decoration and without a trailing "(type)" that only repeats the catalog's type. */
function catalogTitle(cat) {
  let name = cat.name.replace(VISUAL, "").replace(/\s+/g, " ").trim();
  const m = /\s*\(([^)]+)\)$/.exec(name);
  if (m && m[1].toLowerCase() === cat.type.toLowerCase()) name = name.slice(0, m.index).trim();
  return (name || cat.id).slice(0, 100);
}

// ---- 4. memory ---------------------------------------------------------------------------------------------------

// Catalog cards often come without a title (or without saying movie or series). Asking the server for each card's page
// is slow, so what it answered is remembered: next time the card comes out complete. Compact on purpose (256 KB shared).
const KINDS_KEY = "k1";
const MAX_KINDS = 1500;
const TTL_KINDS = 30 * 24 * 60 * 60 * 1000;
let KINDS = null;
let KINDS_DIRTY = false;

function kinds() {
  if (!KINDS) {
    try { KINDS = JSON.parse(kino.storage.get(KINDS_KEY) || "{}"); } catch { KINDS = {}; }
    if (!KINDS || typeof KINDS !== "object") KINDS = {};
  }
  return KINDS;
}

function remember(key, name, isSeries, year) {
  const k = kinds();
  delete k[key];
  k[key] = [String(name || "").slice(0, 120), isSeries ? 1 : 0, Number(year) || 0];
  KINDS_DIRTY = true;
}

function flushKinds() {
  if (!KINDS_DIRTY) return;
  const k = kinds();
  const keys = Object.keys(k);
  for (let i = 0; i < keys.length - MAX_KINDS; i++) delete k[keys[i]];
  try { kino.storage.set(KINDS_KEY, JSON.stringify(k), { ttlMs: TTL_KINDS }); } catch { /* storage full: not cached */ }
  KINDS_DIRTY = false;
}

// ---- 5. items ----------------------------------------------------------------------------------------------------

function hash(s) {
  let a = 0x811c9dc5;
  let b = 5381;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619) >>> 0;
    b = (Math.imul(b, 33) + c) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

function safeId(raw) {
  return String(raw).replace(/[^A-Za-z0-9._~-]/g, "-").slice(0, 120) || "x";
}

/** A ref is JSON: { t: Stremio type, i: Stremio id, c: catalog id and n: name, for a live channel only }. */
function makeRef(t_, i, extra) {
  return JSON.stringify(Object.assign({ t: t_, i }, extra || {}));
}

function parseRef(ref) {
  try {
    const r = JSON.parse(String(ref));
    if (r && typeof r.t === "string" && (typeof r.i === "string" || (r.c && r.n))) return r;
  } catch { /* falls through */ }
  throw kino.error("not_found", "bad ref", { userMessage: t("unknownRef") });
}

function httpUrl(v) {
  return typeof v === "string" && /^https?:\/\//.test(v) && v.length <= 2048 ? v : undefined;
}

function num(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

function year(meta) {
  return num(meta.year) || num(String(meta.releaseInfo || "").slice(0, 4)) || 0;
}

function ratingOf(meta) {
  const r = parseFloat(meta.imdbRating);
  return r >= 0 && r <= 10 ? r : undefined;
}

function genresOf(meta) {
  const g = Array.isArray(meta.genres) ? meta.genres : [];
  const out = g.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim().slice(0, 30)).slice(0, 5);
  return out.length ? out : undefined;
}

/** What a Stremio meta says about the title's ids. The imdb id also hides in metahub logos, a common Stremio habit. */
function idsOf(meta) {
  const ids = {};
  const imdb = [meta.imdb_id, meta.id, (/\/(tt\d{5,10})\//.exec(String(meta.logo || "")) || [])[1]].find((x) => /^tt\d{5,10}$/.test(String(x || "")));
  if (imdb) ids.imdb = imdb;
  const tmdb = num(meta.moviedb_id || meta.tmdb_id);
  if (tmdb > 0) ids.tmdb = tmdb;
  return Object.keys(ids).length ? ids : undefined;
}

function seriesInfo(meta) {
  const runtime = num(meta.runtime);
  return {
    title: meta.name ? String(meta.name).slice(0, 200) : undefined,
    poster: httpUrl(meta.poster),
    backdrop: httpUrl(meta.background),
    overview: meta.description ? String(meta.description) : undefined,
    genres: genresOf(meta),
    year: year(meta) || undefined,
    rating: ratingOf(meta),
    ids: idsOf(meta),
    runtimeMinutes: runtime >= 1 && runtime <= 1000 ? runtime : undefined,
  };
}

// ---- 6. catalogs -------------------------------------------------------------------------------------------------

const PAGE = 100; // Stremio's page size for `skip`
const DEADLINE_MS = 9000;
const ENRICH_BUDGET = 24;

function catalogPath(cat, extras) {
  const e = extras ? "/" + extras : "";
  return `/catalog/${enc(cat.type)}/${enc(cat.id)}${e}.json`;
}

/** Stremio's extra properties as a path segment: `genre=Action&skip=100`. */
function extrasOf(o) {
  const parts = [];
  if (o.genre) parts.push("genre=" + enc(o.genre));
  if (o.search) parts.push("search=" + enc(o.search));
  if (o.skip) parts.push("skip=" + o.skip);
  return parts.join("&");
}

const ADULT = /\b(adult|18\s?\+|xxx|porn|erotic|hentai)\b/i;

function adultName(name) {
  return ADULT.test(String(name || ""));
}

/** The best resolution a title's name mentions ("4K", "1080p", "720p", "480p"), for the card's quality chip. */
function qualityOf(text) {
  const s = String(text || "");
  if (/\b(2160p|4k)\b/i.test(s)) return "4K";
  for (const q of ["1080p", "720p", "480p"]) if (s.toLowerCase().includes(q)) return q;
  return undefined;
}

async function catalogMetas(cat, extras, timeoutMs) {
  const path = catalogPath(cat, extras);
  const data = await cachedMem(path, TTL_PAGE, () => getJson(path, timeoutMs || 12000));
  return Array.isArray(data && data.metas) ? data.metas.filter((m) => m && typeof m.id === "string") : [];
}

/** One catalog card, before it is a Kino item: the server's meta plus what was remembered about its title. */
function card(m, cat) {
  const type = String(m.type || cat.type);
  const key = "n" + hash(m.id);
  const known = kinds()[key];
  const name = !BLANK.test(String(m.name || "")) ? String(m.name) : known ? known[0] : "";
  return { m, type, key, name, series: known ? known[1] === 1 : undefined, overview: undefined, genres: undefined };
}

function needsMeta(c) {
  if (!c.name) return 2;
  if (c.type !== "movie" && c.type !== "series" && c.series === undefined) return 1;
  return 0;
}

/** Fills blank titles first, then unknown kinds, asking the server for each card's page (bounded in number and time). */
async function enrich(cards, budget, deadline) {
  const todo = cards.filter(needsMeta).sort((a, b) => needsMeta(b) - needsMeta(a)).slice(0, budget);
  await pool(todo, 5, async (c) => {
    if (Date.now() > deadline) return;
    const meta = (await getJson(`/meta/${enc(c.type)}/${enc(c.m.id)}.json`, 8000)).meta;
    if (!meta) return;
    const isSeries = Array.isArray(meta.videos) && meta.videos.length > 0;
    if (!c.name && !BLANK.test(String(meta.name || ""))) c.name = String(meta.name);
    c.series = isSeries;
    c.overview = meta.description ? String(meta.description) : undefined;
    c.genres = genresOf(meta);
    remember(c.key, c.name, isSeries, year(meta));
  });
}

function toItem(c) {
  if (!c.name) return null; // no title even after asking: a blank card helps nobody
  const m = c.m;
  const kind = c.type === "movie" ? "movie" : c.type === "series" ? "series" : isLiveType(c.type) ? "live" : c.series === false ? "movie" : "series";
  const rating = ratingOf(m);
  const y = year(m) || (kinds()[c.key] || [])[2] || 0;
  const item = { id: c.key, ref: makeRef(c.type, m.id), title: c.name.slice(0, 200), kind };
  if (y) item.year = y;
  const quality = qualityOf(c.name);
  if (quality) item.quality = quality;
  const poster = httpUrl(m.poster);
  if (poster) item.poster = poster;
  const backdrop = httpUrl(m.background);
  if (backdrop) item.backdrop = backdrop;
  const overview = c.overview || (m.description ? String(m.description) : "");
  if (overview) item.overview = overview;
  const genres = c.genres || genresOf(m);
  if (genres) item.genres = genres;
  if (rating !== undefined) item.rating = rating;
  const ids = idsOf(m);
  if (ids) item.ids = ids;
  return item;
}

async function itemsOf(metas, cat, budget, deadline, adult) {
  const cards = metas.map((m) => card(m, cat));
  await enrich(cards, budget, deadline);
  flushKinds();
  const seen = new Set();
  const items = [];
  for (const c of cards) {
    const item = toItem(c);
    if (!item || seen.has(item.id)) continue;
    if (adult) item.adult = true;
    seen.add(item.id);
    items.push(item);
  }
  return items;
}

function browseCatalogs(manifest) {
  return manifest.catalogs.filter((c) => c.browsable && !isLiveType(c.type));
}

function rowsSetting() {
  const n = num(kino.config.get("homeRows"));
  return n > 0 && n <= 24 ? n : 4;
}

/**
 * Rows for a list of `{ cat, genre, metas }`: the blank-title budget is shared by all of them and spent row by row, so
 * the first rows are the best ones. `genre` is one of the server's sections of that catalog, or null for its default list.
 */
async function buildRows(specs, deadline) {
  let budget = ENRICH_BUDGET;
  const rows = [];
  for (const { cat, genre, metas } of specs) {
    if (!metas || !metas.length) continue;
    const cards = metas.map((m) => card(m, cat));
    const spend = Math.min(budget, cards.filter(needsMeta).length);
    budget -= spend;
    await enrich(cards, spend, deadline);
    const adult = adultName(cat.name) || adultName(genre);
    const items = cards.map(toItem).filter(Boolean);
    if (adult) items.forEach((item) => { item.adult = true; });
    if (!items.length) continue;
    rows.push({
      id: "r" + safeId(cat.id).slice(0, 80) + (genre ? "-" + hash(genre).slice(0, 8) : ""),
      title: (genre || catalogTitle(cat)).slice(0, 100),
      items,
      ref: makeRef(cat.type, cat.id, genre ? { c: cat.id, g: genre } : { c: cat.id }),
    });
  }
  flushKinds();
  return rows;
}

async function homeRows(manifest) {
  const cats = browseCatalogs(manifest).slice(0, rowsSetting());
  const deadline = Date.now() + DEADLINE_MS;
  const pages = await pool(cats, 5, async (cat) => (await catalogMetas(cat, "", 10000)).slice(0, 12));
  return buildRows(cats.map((cat, i) => ({ cat, genre: null, metas: pages[i] })), deadline);
}

/** A row of live channels for each live catalog that has something playable: the first two, at most. */
async function homeLiveRows(manifest) {
  const cats = (await playableLiveCatalogs(manifest)).slice(0, 2);
  const rows = await pool(cats, 2, async (cat) => {
    const taken = new Set();
    const items = (await catalogMetas(cat, "", 15000))
      .slice(0, 12)
      .map((m) => channelOf(m, cat, safeId(cat.id), taken))
      .filter(Boolean)
      .map((ch) => {
        const item = { id: ch.id, ref: ch.ref, title: ch.title, kind: "live" };
        if (ch.logo) item.poster = ch.logo;
        return item;
      });
    return items.length ? { id: "v" + safeId(cat.id).slice(0, 90), title: catalogTitle(cat), items } : null;
  });
  return rows.filter(Boolean);
}

export async function home() {
  const manifest = await loadManifest(false);
  const [live, rows] = await Promise.all([homeLiveRows(manifest).catch(() => []), homeRows(manifest)]);
  return live.concat(rows);
}

// ---- the server's sections as the plugin's own section: one tab per catalog, one row per section of that catalog

const SECTION_TABS = 8; // Kino shows at most 8 tabs
const SECTION_ROWS = 12;

/** The catalogs whose tabs are showing: "Catálogos 1–8" is the first window, and so on (the plugin's settings). */
function sectionCatalogs(manifest) {
  const page = Math.max(1, num(kino.config.get("sectionPage")) || 1);
  return browseCatalogs(manifest).slice((page - 1) * SECTION_TABS, page * SECTION_TABS);
}

export async function section(arg) {
  const manifest = await loadManifest(false);
  const cats = sectionCatalogs(manifest);
  if (!cats.length) return { rows: [] };
  const tabs = cats.map((c) => ({ id: safeId(c.id).slice(0, 100), label: catalogTitle(c).slice(0, 24) }));
  const index = Math.max(0, tabs.findIndex((x) => x.id === (arg && arg.tab)));
  const cat = cats[index];
  const genres = [null].concat(cat.genres.slice(0, SECTION_ROWS - 1));
  const deadline = Date.now() + DEADLINE_MS;
  const pages = await pool(genres, 5, async (genre) => (await catalogMetas(cat, extrasOf({ genre }), 10000)).slice(0, 12));
  const rows = await buildRows(genres.map((genre, i) => ({ cat, genre, metas: pages[i] })), deadline);
  return { tabs, tab: tabs[index].id, rows };
}

// A category tile has no art of its own in the Stremio protocol: borrow the poster of the catalog's first title.
const ART_KEY = "a1";
const TTL_ART = 60 * 60 * 1000;

async function categoryArt(cats) {
  let cached = null;
  try { cached = JSON.parse(kino.storage.get(ART_KEY) || "null"); } catch { /* unreadable: ask again */ }
  if (cached && Date.now() - cached.at < TTL_ART) return cached.v;
  const deadline = Date.now() + DEADLINE_MS;
  const posters = await pool(cats, 5, async (cat) => {
    if (Date.now() > deadline) return undefined;
    const metas = await catalogMetas(cat, "", 8000);
    const first = metas.find((m) => httpUrl(m.poster));
    return first ? httpUrl(first.poster) : undefined;
  });
  const v = {};
  cats.forEach((cat, i) => { if (posters[i]) v[cat.id] = posters[i]; });
  if (Object.keys(v).length) {
    try { kino.storage.set(ART_KEY, JSON.stringify({ at: Date.now(), v })); } catch { /* storage full: not cached */ }
  }
  return v;
}

export async function categories() {
  const manifest = await loadManifest(false);
  const cats = browseCatalogs(manifest).slice(0, 24);
  const art = await categoryArt(cats);
  return cats.map((cat) => {
    const tile = {
      id: "g" + safeId(cat.id).slice(0, 100),
      title: catalogTitle(cat).slice(0, 40),
      ref: makeRef(cat.type, cat.id, { c: cat.id }),
    };
    if (art[cat.id]) tile.art = art[cat.id];
    return tile;
  });
}

const SLICE = 24;

/** The cursor is "<server skip>,<offset inside that page>": a server page is 100 cards, a Kino page shows fewer. */
export async function browse(ref, cursor) {
  const r = parseRef(ref);
  const manifest = await loadManifest(false);
  const cat = manifest.catalogs.find((c) => c.id === r.c && c.type === r.t);
  if (!cat) throw kino.error("not_found", "no catalog", { userMessage: t("unknownRef") });
  const [skipText, offsetText] = String(cursor || "0,0").split(",");
  const skip = num(skipText);
  const offset = num(offsetText);
  const genre = typeof r.g === "string" && cat.genres.includes(r.g) ? r.g : null;
  const metas = await catalogMetas(cat, extrasOf({ genre, skip }), 15000);
  const slice = metas.slice(offset, offset + SLICE);
  const items = await itemsOf(slice, cat, ENRICH_BUDGET, Date.now() + DEADLINE_MS, adultName(cat.name) || adultName(genre));
  let next;
  if (offset + SLICE < metas.length) next = `${skip},${offset + SLICE}`;
  else if (metas.length >= PAGE && skip + metas.length < 10000) next = `${skip + metas.length},0`;
  return next ? { items, next } : { items };
}

const MAX_SEARCH_CATALOGS = 18;

export async function search(query) {
  const q = String(query.q || "").trim();
  if (q.length < 2) return [];
  const manifest = await loadManifest(false);
  let cats = manifest.catalogs.filter((c) => c.search && !isLiveType(c.type));
  if (query.within) {
    // Searching inside a "Ver más" page: only that page's catalog, and null when it cannot search (Kino then filters).
    let r;
    try { r = parseRef(query.within); } catch { return null; }
    cats = cats.filter((c) => c.id === r.c && c.type === r.t);
    if (!cats.length) return null;
  }
  cats = cats.slice(0, MAX_SEARCH_CATALOGS);
  const deadline = Date.now() + DEADLINE_MS;
  const found = await pool(cats, 5, async (cat) => (await catalogMetas(cat, extrasOf({ search: q }), 10000)).slice(0, 12).map((m) => card(m, cat)));
  const seen = new Set();
  const cards = [];
  for (const list of found) {
    for (const c of list || []) {
      if (seen.has(c.key)) continue;
      seen.add(c.key);
      cards.push(c);
    }
  }
  const top = cards.slice(0, 60);
  await enrich(top, ENRICH_BUDGET, deadline);
  flushKinds();
  return top.map(toItem).filter(Boolean);
}

// ---- 7. titles ---------------------------------------------------------------------------------------------------

async function getMeta(type, id) {
  const data = await getJson(`/meta/${enc(type)}/${enc(id)}.json`, 15000);
  if (!data || !data.meta) throw kino.error("not_found", "no meta", { userMessage: t("notStremio") });
  return data.meta;
}

function learn(type, id, meta) {
  const key = "n" + hash(id);
  remember(key, meta.name, Array.isArray(meta.videos) && meta.videos.length > 0, year(meta));
  flushKinds();
}

/** `kino.meta` by title: the ids Kino knows (TMDB, IMDb, AniList...), so its info page, subtitles and skip marks can work. */
const SEARCH_NOISE = /\s*[\[(].*$/;

async function externalIds(isSeries, meta) {
  if (typeof kino.meta !== "function" || kino.meta.byTitle !== true) return undefined;
  const title = String(meta.name || "").replace(SEARCH_NOISE, "").trim().slice(0, 200);
  if (!title) return undefined;
  const query = { type: isSeries ? "series" : "movie", title };
  const y = year(meta);
  if (y >= 1870 && y <= 2100) query.year = y;
  try {
    const answer = await kino.meta(query);
    return answer && answer.ids ? answer.ids : undefined;
  } catch (e) {
    kino.log("kino.meta failed: " + (e && e.code));
    return undefined;
  }
}

/** What the server told about the ids wins; what Kino found fills the rest. */
async function withExternalIds(info, meta, isSeries) {
  const ext = await externalIds(isSeries, meta);
  if (!ext) return info;
  const ids = Object.assign({}, info.ids);
  for (const k of ["tmdb", "imdb", "mal", "anilist", "kitsu"]) if (ids[k] === undefined && ext[k] !== undefined) ids[k] = ext[k];
  if (Object.keys(ids).length) info.ids = ids;
  return info;
}

export async function details(ref) {
  const r = parseRef(ref);
  const meta = await getMeta(r.t, r.i);
  learn(r.t, r.i, meta);
  return withExternalIds(seriesInfo(meta), meta, false);
}

export async function episodes(ref) {
  const r = parseRef(ref);
  const meta = await getMeta(r.t, r.i);
  learn(r.t, r.i, meta);
  const videos = (Array.isArray(meta.videos) ? meta.videos : []).filter((v) => v && typeof v.id === "string");
  const list = [];
  videos.forEach((v, index) => {
    const season = num(v.season) || 1;
    if (season < 1 || season > 999) return;
    const number = num(v.episode != null ? v.episode : v.number) || index + 1;
    const ep = { season, number: Math.min(Math.max(number, 1), 99999), ref: makeRef(r.t, v.id) };
    const title = v.title || v.name;
    if (title) ep.title = String(title).slice(0, 200);
    const still = httpUrl(v.thumbnail);
    if (still) ep.still = still;
    const overview = v.overview || v.description;
    if (overview) ep.overview = String(overview);
    const aired = /^\d{4}-\d{2}-\d{2}/.exec(String(v.released || ""));
    if (aired) ep.airDate = aired[0];
    list.push(ep);
  });
  // A title with no episode list (a movie, to Stremio) plays as one entry: the card's own id is the playable one.
  if (!list.length) list.push({ season: 1, number: 1, ref: makeRef(r.t, r.i), title: t("movieEpisode") });
  list.sort((a, b) => (a.season - b.season) || (a.number - b.number));
  return { series: await withExternalIds(seriesInfo(meta), meta, videos.length > 0), episodes: list };
}

// ---- 8. streams --------------------------------------------------------------------------------------------------

const LANGS = {
  eng: "en", spa: "es", por: "pt", fre: "fr", fra: "fr", ger: "de", deu: "de", ita: "it", hin: "hi", jpn: "ja", kor: "ko",
  chi: "zh", zho: "zh", ara: "ar", rus: "ru", tur: "tr", ind: "id", tam: "ta", tel: "te", ben: "bn", mal: "ml", kan: "kn",
};

function langOf(code) {
  const c = String(code || "").toLowerCase().trim();
  return (LANGS[c] || c || "und").slice(0, 16);
}

function trackFormat(url) {
  const decoded = decodeURIComponent(url.split("?")[0] + " " + (/[?&]url=([^&]+)/.exec(url) || [, ""])[1]);
  return /\.vtt\b/i.test(decoded) ? "vtt" : /\.srt\b/i.test(decoded) ? "srt" : undefined;
}

function tracksOf(list) {
  const out = [];
  for (const s of Array.isArray(list) ? list : []) {
    const url = s && httpUrl(s.url);
    if (!url) continue;
    const track = { lang: langOf(s.lang), url };
    const format = trackFormat(url);
    if (format) track.format = format;
    out.push(track);
  }
  return out;
}

function labelOf(s) {
  const text = String(s.name || s.title || "").replace(VISUAL, "").replace(/\s+/g, " ").trim().slice(0, 48);
  return text || undefined;
}

function headersOf(s) {
  const h = s.behaviorHints && s.behaviorHints.proxyHeaders && s.behaviorHints.proxyHeaders.request;
  if (!h || typeof h !== "object") return undefined;
  const out = {};
  for (const k of Object.keys(h).slice(0, 20)) if (typeof h[k] === "string") out[k] = h[k];
  return Object.keys(out).length ? out : undefined;
}

function mimeOf(url) {
  return /\.m3u8(\b|$)/i.test(url.split("?")[0]) || /\.m3u8/i.test(url) ? "application/x-mpegURL" : undefined;
}

// A server that has nothing to play yet may answer with a stand-in address instead of leaving the stream out.
const PLACEHOLDER_HOSTS = ["no.link"];

/** Why Kino cannot play a stream even though it has a URL: "drm" (it carries ClearKey keys) or "soon" (a stand-in address). */
function blockedBy(s) {
  if (s.clearkey || s.drm || /[?&]clearkey=/i.test(s.url)) return "drm"; // CENC over HLS: the player cannot decrypt it
  const host = /^https?:\/\/([^/:?#]+)/i.exec(s.url);
  if (host && PLACEHOLDER_HOSTS.includes(host[1].toLowerCase())) return "soon";
  return null;
}

/** A stream Kino can play: a URL, and not a torrent, a YouTube id, a link out to a web page (the donation card) or a blocked one. */
function playable(s) {
  return !!s && typeof s.url === "string" && /^https?:\/\//.test(s.url) && !s.infoHash && !s.ytId && !blockedBy(s);
}

function streamFor(list, live) {
  const seen = new Set();
  const usable = list.filter(playable).filter((s) => !seen.has(s.url) && seen.add(s.url));
  if (!usable.length) return null;
  const main = usable[0];
  const stream = { url: main.url };
  const mime = mimeOf(main.url);
  if (mime) stream.mime = mime;
  const headers = headersOf(main);
  if (headers) stream.headers = headers;
  const label = labelOf(main);
  if (label) stream.label = label;
  if (live) stream.expiresInSeconds = 1800; // live URLs carry short-lived tokens: ask again when one stops working
  else {
    const subs = [];
    const urls = new Set();
    for (const s of usable) for (const track of tracksOf(s.subtitles)) if (!urls.has(track.url) && urls.add(track.url)) subs.push(track);
    if (subs.length) stream.subtitles = subs.slice(0, 30);
  }
  const alternatives = [];
  const taken = new Map();
  const unique = (text) => {
    if (!text) return text;
    const n = (taken.get(text) || 0) + 1;
    taken.set(text, n);
    return n === 1 ? text : `${text} · ${n}`.slice(0, 48);
  };
  stream.label = unique(stream.label);
  for (const s of usable.slice(1, 9)) {
    const alt = { url: s.url };
    const m = mimeOf(s.url);
    if (m) alt.mime = m;
    const h = headersOf(s);
    if (h) alt.headers = h;
    const l = unique(labelOf(s));
    if (l) alt.label = l;
    alternatives.push(alt);
  }
  if (alternatives.length) stream.alternatives = alternatives;
  return stream;
}

async function streamsOf(type, id) {
  const data = await getJson(`/stream/${enc(type)}/${enc(id)}.json`, 25000);
  return Array.isArray(data && data.streams) ? data.streams : [];
}

export async function resolve(ref) {
  const r = parseRef(ref);
  const live = isLiveType(r.t);
  let list = r.i ? await streamsOf(r.t, r.i) : [];
  let stream = streamFor(list, live);
  if (!stream && live && r.c && r.n) {
    // The id inside a saved channel may be stale (its token expired): find the channel again by name and ask afresh.
    const cat = (await loadManifest(false)).catalogs.find((c) => c.id === r.c);
    const fresh = cat ? (await catalogMetas(cat, "", 15000)).find((m) => plainName(m.name) === r.n) : null;
    if (fresh) {
      list = await streamsOf(r.t, fresh.id);
      stream = streamFor(list, true);
    }
  }
  if (!stream) {
    const why = list.map((s) => (s && typeof s.url === "string" ? blockedBy(s) : null)).filter(Boolean);
    const key = why.includes("soon") && !why.includes("drm") ? "notYet" : why.includes("drm") ? "drmOnly" : live ? "noChannel" : "noStreams";
    throw kino.error("unavailable", "no streams", { userMessage: t(key) });
  }
  return stream;
}

// ---- 9. live channels --------------------------------------------------------------------------------------------

const LIVE_OK_KEY = "p1";
const TTL_LIVE_OK = 30 * 60 * 1000;

/**
 * The live catalogs worth showing: those whose first channels have a stream Kino can play. A catalog whose channels all
 * come with ClearKey keys (the player cannot decrypt them) is left out until the server offers something else. The
 * verdict is kept for half an hour; a catalog that could not be checked is shown.
 */
async function playableLiveCatalogs(manifest) {
  const cats = manifest.catalogs.filter((c) => c.browsable && isLiveType(c.type));
  let cached = null;
  try { cached = JSON.parse(kino.storage.get(LIVE_OK_KEY) || "null"); } catch { /* unreadable: check again */ }
  if (cached && Date.now() - cached.at < TTL_LIVE_OK) return cats.filter((c) => cached.v[c.id] !== false);
  const verdicts = await pool(cats, 5, async (cat) => {
    const metas = (await catalogMetas(cat, "", 20000)).slice(0, 2);
    let asked = false;
    for (const m of metas) {
      try {
        const list = await streamsOf(cat.type, m.id);
        asked = true;
        if (list.some(playable)) return true;
      } catch { /* try the next one */ }
    }
    return asked ? false : undefined;
  });
  const v = {};
  cats.forEach((cat, i) => { if (verdicts[i] !== undefined) v[cat.id] = verdicts[i]; });
  try { kino.storage.set(LIVE_OK_KEY, JSON.stringify({ at: Date.now(), v })); } catch { /* storage full: not cached */ }
  return cats.filter((c) => v[c.id] !== false);
}

export async function liveCategories() {
  const manifest = await loadManifest(false);
  return (await playableLiveCatalogs(manifest)).map((c) => ({ id: safeId(c.id), title: catalogTitle(c) }));
}

/** What names a channel, without the live/ended marks a server puts in front of an event's title. */
function plainName(name) {
  return String(name || "").replace(VISUAL, "").replace(/\s+/g, " ").trim();
}

/** One server card as a Kino channel, or null when it has no name. `taken` keeps ids unique inside one answer. */
function channelOf(m, cat, categoryId, taken) {
  const name = BLANK.test(String(m.name || "")) ? "" : plainName(m.name);
  if (!name) return null;
  let id = "l" + hash(cat.id + "|" + name);
  if (taken.has(id)) id = "l" + hash(cat.id + "|" + name + "|" + m.id);
  taken.add(id);
  // The stremio id may be huge and holds an expiring token: keep it only while it fits, resolve() can find the channel by name.
  const withId = makeRef(cat.type, m.id, { c: cat.id, n: name });
  const channel = { id, title: String(m.name).trim().slice(0, 200), ref: withId.length <= 4000 ? withId : makeRef(cat.type, "", { c: cat.id, n: name }), categoryId };
  const logo = httpUrl(m.poster) || httpUrl(m.logo);
  if (logo) channel.logo = logo;
  return channel;
}

const CHANNEL_PAGE = 500;

/** The cursor is "<server skip>,<offset inside that page>", like browse's: a server page may hold more than Kino takes. */
export async function liveChannels(arg) {
  const manifest = await loadManifest(false);
  const cat = manifest.catalogs.find((c) => isLiveType(c.type) && safeId(c.id) === arg.categoryId);
  if (!cat) return { items: [] };
  const [skipText, offsetText] = String(arg.cursor || "0,0").split(",");
  const skip = num(skipText);
  const offset = num(offsetText);
  const metas = await catalogMetas(cat, extrasOf({ skip }), 20000);
  // Some catalogs ignore `skip` and send the same list again: a page that opens with the first page's card is the end.
  const first = skip ? await catalogMetas(cat, "", 20000) : null;
  if (first && first.length && metas.length && first[0].id === metas[0].id) return { items: [] };
  const taken = new Set();
  const items = metas.slice(offset, offset + CHANNEL_PAGE).map((m) => channelOf(m, cat, arg.categoryId, taken)).filter(Boolean);
  let next = null;
  if (offset + CHANNEL_PAGE < metas.length) next = `${skip},${offset + CHANNEL_PAGE}`;
  else if (metas.length >= PAGE && skip + metas.length < 10000) next = `${skip + metas.length},0`;
  return { items, next };
}

const MAX_LIVE_SEARCH_CATALOGS = 12;

/** Channels by name across the live catalogs that can search; each hit names its category so Kino can place it. */
export async function liveSearch(arg) {
  const q = String(arg.query || "").trim();
  if (q.length < 2) return { items: [] };
  const manifest = await loadManifest(false);
  const cats = (await playableLiveCatalogs(manifest)).filter((c) => c.search).slice(0, MAX_LIVE_SEARCH_CATALOGS);
  const found = await pool(cats, 5, async (cat) => {
    const taken = new Set();
    return (await catalogMetas(cat, extrasOf({ search: q }), 10000)).slice(0, 40).map((m) => channelOf(m, cat, safeId(cat.id), taken)).filter(Boolean);
  });
  const seen = new Set();
  const items = [];
  for (const list of found) for (const c of list || []) if (!seen.has(c.id) && seen.add(c.id)) items.push(c);
  return { items: items.slice(0, 100) };
}

// ---- 10. subtitles -----------------------------------------------------------------------------------------------

export async function subtitles(arg) {
  const manifest = await loadManifest(false);
  if (!manifest.resources.includes("subtitles") || !arg.imdbId) return [];
  const series = arg.kind === "series";
  const id = series && arg.season && arg.episode ? `${arg.imdbId}:${arg.season}:${arg.episode}` : arg.imdbId;
  const data = await getJson(`/subtitles/${series ? "series" : "movie"}/${enc(id)}.json`, 9000);
  return tracksOf(data && data.subtitles);
}

// ---- 11. settings ------------------------------------------------------------------------------------------------

function detailOf(e) {
  return (e && (e.userMessage || e.code)) || "error";
}

export async function settingsStatus() {
  try {
    const manifest = await loadManifest(false);
    return { serverStatus: t("online", { catalogs: manifest.catalogs.length }) };
  } catch (e) {
    return { serverStatus: t("offline", { detail: detailOf(e) }) };
  }
}

/** Walks the same road a person does (manifest, catalog, title page, stream) and names the first step that fails. */
export async function action(key) {
  if (key !== "checkConn") return null;
  let manifest;
  try { manifest = await loadManifest(true); } catch (e) { return { message: t("stepManifest", { detail: detailOf(e) }) }; }
  const cat = browseCatalogs(manifest)[0];
  if (!cat) return { message: t("stepCatalog", { detail: "0" }) };
  let metas;
  try {
    metas = await catalogMetas(cat, "", 15000);
    if (!metas.length) throw kino.error("unavailable", "empty");
  } catch (e) { return { message: t("stepCatalog", { detail: catalogTitle(cat) + ": " + detailOf(e) }) }; }
  const sample = metas[0];
  const type = String(sample.type || cat.type);
  try { await getMeta(type, sample.id); } catch (e) { return { message: t("stepMeta", { detail: detailOf(e) }) }; }
  try {
    if (!streamFor(await streamsOf(type, sample.id), false)) throw kino.error("unavailable", "no streams");
  } catch (e) { return { message: t("stepStream", { detail: detailOf(e) }) }; }
  return { message: t("ok", { catalogs: manifest.catalogs.length }) };
}
