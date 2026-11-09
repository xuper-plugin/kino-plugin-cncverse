// @ts-check
/// <reference path="./kino.d.ts" />
// CNCVerse: a bridge between Kino and a Stremio-protocol server. The server owns the catalogs, the sources and their
// upkeep; this file only translates its answers into Kino's API, and knows nothing about any of its sources. Everything
// it needs comes from the server's manifest at run time, so a catalog added or removed there shows up here untouched.
// Read it top to bottom: 1. texts  2. http  3. manifest  4. memory  5. items  6. catalogs  7. titles  8. streams
//                        9. live channels  10. subtitles  11. settings

import { makeBrowse } from "./browse/index.js";
import { makeBudget, withTime } from "./robust/budget.js";
import { byLatency, forgetAll, healthyOnly, isOn, isPaused, noteCatalog, noteLatency, pausedFor, readBreaker, readHealth, readLatency, readPicks, recordHealth, resetBreaker, sourceMode, writePicks } from "./robust/store.js";
import { clearIndex, indexGet, indexItems, indexRemove, indexSize, searchIndex } from "./robust/index.js";
import { rank } from "./robust/rank.js";

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
    warming: "El servidor está preparando esta lista. Vuelve a abrirla en un momento.",
    warmingVideo: "El servidor está buscando el video (puede tardar la primera vez). Vuelve a intentarlo en un momento.",
    revoked: "El servidor ya no atiende esta dirección.",
    indexStatus: "{n} títulos",
    sourcesStatus: "{on} activos de {all}, {paused} en pausa",
    resumed: "Listo: los catálogos en pausa vuelven a intentarse",
    indexCleared: "Listo: se vació el índice de búsqueda",
    cacheCleared: "Listo: se vació la caché",
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
    warming: "The server is preparing this list. Open it again in a moment.",
    warmingVideo: "The server is looking for the video (it can take a while the first time). Try again in a moment.",
    revoked: "The server no longer serves this address.",
    indexStatus: "{n} titles",
    sourcesStatus: "{on} on of {all}, {paused} paused",
    resumed: "Done: paused catalogs will be tried again",
    indexCleared: "Done: the search index is empty",
    cacheCleared: "Done: the cache is empty",
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

// Two callers asking the same path at once (a warm-up and the real call, Home and the screen) share one request.
const INFLIGHT = new Map();

function getJson(path, timeoutMs) {
  const shared = INFLIGHT.get(path);
  if (shared) return shared;
  const p = fetchJson(path, timeoutMs).finally(() => INFLIGHT.delete(path));
  INFLIGHT.set(path, p);
  return p;
}

async function fetchJson(path, timeoutMs) {
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

function staleManifest() {
  try {
    const raw = kino.storage.get(MANIFEST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; /* unreadable: refetch */ }
}

/** The last manifest kept, whatever its age, without waiting for anything (the screen draws from it). */
export function manifestNow() {
  const s = staleManifest();
  return s && s.v && Array.isArray(s.v.catalogs) ? s.v : null;
}

// [capMs]: the longest this read may take. With an older copy to fall back on a slow server is not waited for (6 s); with none the
// first read gets up to 12 s. Either way it stays inside Kino's 20 s together with what the caller does next.
async function loadManifest(fresh, capMs) {
  const stale = staleManifest();
  if (!fresh && stale && Date.now() - stale.at < TTL_MANIFEST) return stale.v;
  try {
    const v = normalizeManifest(await getJson("/manifest.json", capMs || (stale && !fresh ? 6000 : 12000)));
    try { kino.storage.set(MANIFEST_KEY, JSON.stringify({ at: Date.now(), v })); } catch { /* storage full: not cached */ }
    recordHealth(true);
    return v;
  } catch (e) {
    recordHealth(false);
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
  flushCats();
  if (!KINDS_DIRTY) return;
  const k = kinds();
  const keys = Object.keys(k);
  for (let i = 0; i < keys.length - MAX_KINDS; i++) delete k[keys[i]];
  try { kino.storage.set(KINDS_KEY, JSON.stringify(k), { ttlMs: TTL_KINDS }); } catch { /* storage full: not cached */ }
  KINDS_DIRTY = false;
}

// Which catalog a title came from, so a failed play can be charged to that catalog's breaker and its copy looked for in the others.
// Compact on purpose: the first eight characters of the card key and the position of the catalog id in a short list.
const CATS_KEY = "rb_cats";
const MAX_CATS = 600;
let CATS = null;
let CATS_DIRTY = false;

function catsMemo() {
  if (!CATS) {
    try { CATS = JSON.parse(kino.storage.get(CATS_KEY) || "null"); } catch { CATS = null; }
    if (!CATS || !Array.isArray(CATS.c) || typeof CATS.m !== "object" || !CATS.m) CATS = { c: [], m: {} };
  }
  return CATS;
}

function noteCatOf(cardKey, catId) {
  const memo = catsMemo();
  let i = memo.c.indexOf(catId);
  if (i < 0) {
    if (memo.c.length >= 200) return;
    i = memo.c.push(catId) - 1;
  }
  const k = cardKey.slice(0, 9);
  if (memo.m[k] === i) return;
  delete memo.m[k];
  memo.m[k] = i;
  CATS_DIRTY = true;
}

/** The id of the catalog a card key came from, "" when not known. */
function catOfKey(cardKey) {
  const memo = catsMemo();
  const i = memo.m[cardKey.slice(0, 9)];
  return Number.isInteger(i) && memo.c[i] ? memo.c[i] : "";
}

function flushCats() {
  if (!CATS_DIRTY) return;
  const memo = catsMemo();
  const keys = Object.keys(memo.m);
  for (let i = 0; i < keys.length - MAX_CATS; i++) delete memo.m[keys[i]];
  try { kino.storage.set(CATS_KEY, JSON.stringify(memo), { ttlMs: TTL_KINDS }); } catch { /* storage full: not kept */ }
  CATS_DIRTY = false;
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
const HOME_BUDGET_MS = 15500; // Kino cuts Home at 20 s: the manifest, the rows and the live rows share this
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

// A catalog's answer is also kept in storage (survives the sandbox): fresh for 10 min, the old copy serves up to 24 h when the network fails.
const CM_PREFIX = "cm1:";
const CM_INDEX = "cm1idx";
const CM_ENTRY_MAX = 48 * 1024;
const CM_TOTAL_MAX = 130 * 1024; // storage (256 KB) is shared with the manifest, Home's copy, the screen's tabs and the caches
const CM_STALE_MS = 24 * 3600 * 1000;

function cmRead(key) {
  try {
    const o = JSON.parse(kino.storage.get(key) || "null");
    return o && typeof o.at === "number" && o.v ? o : null;
  } catch { return null; }
}

function cmWrite(key, v, path) {
  try {
    const text = JSON.stringify({ at: Date.now(), p: path, v });
    if (text.length > CM_ENTRY_MAX) return;
    let idx;
    try { idx = JSON.parse(kino.storage.get(CM_INDEX) || "[]"); } catch { idx = []; }
    idx = (Array.isArray(idx) ? idx : []).filter((e) => e && e.k !== key && typeof e.k === "string");
    idx.push({ k: key, at: Date.now(), n: text.length });
    idx.sort((a, b) => a.at - b.at);
    let total = idx.reduce((n, e) => n + (e.n || 0), 0);
    while (idx.length > 1 && total > CM_TOTAL_MAX) {
      const old = idx.shift();
      total -= old.n || 0;
      try { kino.storage.set(old.k, "", { ttlMs: 1 }); } catch { /* it expires anyway */ }
    }
    kino.storage.set(key, text, { ttlMs: CM_STALE_MS });
    kino.storage.set(CM_INDEX, JSON.stringify(idx), { ttlMs: CM_STALE_MS });
  } catch { /* full storage: only the memory copy */ }
}

async function catalogData(path, timeoutMs) {
  const mem = MEM.get(path);
  if (mem && Date.now() - mem.at < TTL_PAGE) return mem.v;
  const key = CM_PREFIX + hash(path);
  const kept = cmRead(key);
  if (kept && kept.p === path && Date.now() - kept.at < TTL_PAGE) {
    MEM.set(path, { at: kept.at, v: kept.v });
    return kept.v;
  }
  try {
    const v = await getJson(path, timeoutMs || 12000);
    MEM.set(path, { at: Date.now(), v });
    if (v && Array.isArray(v.metas)) cmWrite(key, v, path);
    return v;
  } catch (e) {
    if (kept && kept.p === path && Date.now() - kept.at < CM_STALE_MS) return kept.v;
    throw e;
  }
}

async function catalogMetas(cat, extras, timeoutMs) {
  const path = catalogPath(cat, extras);
  const data = await catalogData(path, timeoutMs);
  return Array.isArray(data && data.metas) ? data.metas.filter((m) => m && typeof m.id === "string") : [];
}

/** One catalog card, before it is a Kino item: the server's meta plus what was remembered about its title. */
function card(m, cat) {
  const type = String(m.type || cat.type);
  const key = "n" + hash(m.id);
  const known = kinds()[key];
  const name = !BLANK.test(String(m.name || "")) ? String(m.name) : known ? known[0] : "";
  noteCatOf(key, cat.id);
  return { m, type, key, name, series: known ? known[1] === 1 : undefined, overview: undefined, genres: undefined, cat: cat.id };
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
    const room = deadline - Date.now();
    if (room < 1500) return;
    const meta = (await getJson(`/meta/${enc(c.type)}/${enc(c.m.id)}.json`, Math.min(8000, room))).meta;
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
  await indexItems(items, cat.id);
  return items;
}

function browseCatalogs(manifest) {
  return manifest.catalogs.filter((c) => c.browsable && !isLiveType(c.type) && isOn(c));
}

/** Home's and the catalogs tab's catalogs: the ones that are on and not failing to deliver titles (all of them when every one is). */
function shownCatalogs(manifest) {
  return healthyOnly(browseCatalogs(manifest), "play");
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
    await indexItems(items, cat.id);
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

async function homeRows(manifest, budget) {
  const cats = shownCatalogs(manifest).slice(0, rowsSetting());
  const b = budget || makeBudget(HOME_BUDGET_MS);
  const pages = await pool(cats, 5, async (cat) => (b.short(2500) ? [] : (await catalogMetas(cat, "", b.cap(10000, 200))).slice(0, 12)));
  return buildRows(cats.map((cat, i) => ({ cat, genre: null, metas: pages[i] })), Math.min(b.end, Date.now() + DEADLINE_MS));
}

/** A row of live channels for each live catalog that has something playable: the first two, at most. */
async function homeLiveRows(manifest, budget) {
  const b = budget || makeBudget(HOME_BUDGET_MS);
  const cats = (await playableLiveCatalogs(manifest, b)).slice(0, 2);
  const rows = await pool(cats, 2, async (cat) => {
    if (b.short(2500)) return null;
    const taken = new Set();
    const items = (await catalogMetas(cat, "", b.cap(15000, 200)))
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

// Home's rows (not the live ones) are kept: the browse screen's Inicio paints from them, and Home itself answers with them when the network fails.
const HOME_KEY = "home1";
const HOME_MAX = 60 * 1024;
const HOME_TTL_MS = 7 * 24 * 3600 * 1000;

function saveHome(rows) {
  try {
    if (!rows.length) return;
    for (let per = 12; per >= 2; per -= 2) {
      const text = JSON.stringify({ at: Date.now(), rows: rows.map((r) => ({ ...r, items: r.items.slice(0, per) })) });
      if (text.length <= HOME_MAX) { kino.storage.set(HOME_KEY, text, { ttlMs: HOME_TTL_MS }); return; }
    }
  } catch { /* full storage: no copy */ }
}

function savedHome() {
  try {
    const o = JSON.parse(kino.storage.get(HOME_KEY) || "null");
    const rows = o && Array.isArray(o.rows) ? o.rows : [];
    // Only the rows of catalogs that are still on (the person may have switched one off since the copy was kept).
    const m = manifestNow();
    const on = m ? m.catalogs.filter(isOn).map((c) => "r" + safeId(c.id).slice(0, 80)) : null;
    const kept = on ? rows.filter((r) => typeof r.id === "string" && on.some((p) => r.id.startsWith(p))) : rows;
    return kept.length ? kept : null;
  } catch { return null; }
}

export async function home() {
  let rows = [];
  let live = [];
  let failure = null;
  const budget = makeBudget(HOME_BUDGET_MS);
  try {
    const manifest = await loadManifest(false, 9000);
    [live, rows] = await Promise.all([homeLiveRows(manifest, budget).catch(() => []), homeRows(manifest, budget)]);
  } catch (e) { failure = e; }
  if (rows.length) { saveHome(rows); return live.concat(rows); }
  const kept = savedHome();
  if (kept) return live.concat(kept);
  if (failure) throw failure;
  return live;
}

// ---- the server's sections as the plugin's own section: one tab per catalog, one row per section of that catalog

const SECTION_TABS = 8; // Kino shows at most 8 tabs
const SECTION_ROWS = 12;

/** The catalogs whose tabs are showing: "Catálogos 1–8" is the first window, and so on (the plugin's settings). */
function sectionCatalogs(manifest) {
  const page = Math.max(1, num(kino.config.get("sectionPage")) || 1);
  return shownCatalogs(manifest).slice((page - 1) * SECTION_TABS, page * SECTION_TABS);
}

export async function section(arg) {
  const b = makeBudget(HOME_BUDGET_MS);
  const manifest = await loadManifest(false, 9000);
  const cats = sectionCatalogs(manifest);
  if (!cats.length) return { rows: [] };
  const tabs = cats.map((c) => ({ id: safeId(c.id).slice(0, 100), label: catalogTitle(c).slice(0, 24) }));
  const index = Math.max(0, tabs.findIndex((x) => x.id === (arg && arg.tab)));
  const cat = cats[index];
  const genres = [null].concat(cat.genres.slice(0, SECTION_ROWS - 1));
  const pages = await pool(genres, 5, async (genre) => (b.short(2500) ? [] : (await catalogMetas(cat, extrasOf({ genre }), b.cap(10000, 200))).slice(0, 12)));
  const rows = await buildRows(genres.map((genre, i) => ({ cat, genre, metas: pages[i] })), Math.min(b.end, Date.now() + DEADLINE_MS));
  return { tabs, tab: tabs[index].id, rows };
}

// ---- the browse screen -------------------------------------------------------------------------------------------

// One tab of the browse screen as a section page: Inicio is the home rows (the live ones have their own page), Catálogos the
// catalogs after those, one row each. The slides and the wide pictures come from Kino's metadata, the server gives posters only.
async function tabPage(tab) {
  const b = makeBudget(HOME_BUDGET_MS);
  const manifest = await loadManifest(false, 9000);
  if (tab !== "catalogos") return { rows: await homeRows(manifest, b) };
  const cats = shownCatalogs(manifest).slice(rowsSetting(), rowsSetting() + SECTION_ROWS);
  const pages = await pool(cats, 5, async (cat) => (b.short(2500) ? [] : (await catalogMetas(cat, "", b.cap(10000, 200))).slice(0, 12)));
  return { rows: await buildRows(cats.map((cat, i) => ({ cat, genre: null, metas: pages[i] })), Math.min(b.end, Date.now() + DEADLINE_MS)) };
}

let browseInstance = null;
const browseScreen = () => (browseInstance ??= makeBrowse({
  kino,
  loadTab: (tab) => tabPage(tab),
  searchTitles: async (q) => { const out = await search({ q }); return Array.isArray(out) ? out : out && out.items ? out.items : []; },
  sources: { list: () => sourcesList(), toggle: (id, on) => toggleSource(id, on) },
  live: {
    categories: () => liveCategories(),
    channels: (categoryId) => liveChannels({ categoryId }),
    search: (q) => liveSearch({ query: q }),
  },
}));

/** `screen(ctx)`: the plugin's own browse screen (a pure view: it draws what it holds and never waits for the server). */
export async function screen(ctx) {
  await null;
  return browseScreen().view(ctx && typeof ctx === "object" ? ctx : {});
}

/** `screenEvent(ev)`: the screen's events (its timers load a tab or a search, one per call). */
export async function screenEvent(ev) {
  await null;
  return browseScreen().event(ev && typeof ev === "object" ? ev : {});
}

// An episode's ref names its video, not its series, so the series whose episodes were listed last is kept with them: a play of one
// of those episodes is that series' ("Continuar viendo"). A movie's own ref is what its card carries.
const LAST_EPISODES_KEY = "lastEpisodes";

function rememberEpisodes(seriesRef, episodeRefs) {
  try {
    kino.storage.set(LAST_EPISODES_KEY, JSON.stringify({ series: seriesRef, eps: episodeRefs.slice(0, 300) }));
  } catch { /* only the "Continuar viendo" row misses a series */ }
}

function seriesOfEpisode(ref) {
  try {
    const o = JSON.parse(kino.storage.get(LAST_EPISODES_KEY) || "null");
    return o && Array.isArray(o.eps) && o.eps.includes(ref) ? o.series : "";
  } catch {
    return "";
  }
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
    const room = deadline - Date.now();
    if (room < 2000) return undefined;
    const metas = await catalogMetas(cat, "", Math.min(8000, room));
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
  const manifest = await loadManifest(false, 6000);
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
  const b = makeBudget(17500);
  const manifest = await loadManifest(false, 6000);
  const cat = manifest.catalogs.find((c) => c.id === r.c && c.type === r.t);
  if (!cat) throw kino.error("not_found", "no catalog", { userMessage: t("unknownRef") });
  const [skipText, offsetText] = String(cursor || "0,0").split(",");
  const skip = num(skipText);
  const offset = num(offsetText);
  const genre = typeof r.g === "string" && cat.genres.includes(r.g) ? r.g : null;
  const metas = await catalogMetas(cat, extrasOf({ genre, skip }), b.cap(13000, 3500, 3000));
  const slice = metas.slice(offset, offset + SLICE);
  const items = await itemsOf(slice, cat, ENRICH_BUDGET, b.end - 1000, adultName(cat.name) || adultName(genre));
  let next;
  if (offset + SLICE < metas.length) next = `${skip},${offset + SLICE}`;
  else if (metas.length >= PAGE && skip + metas.length < 10000) next = `${skip + metas.length},0`;
  return next ? { items, next } : { items };
}

const MAX_SEARCH_CATALOGS = 40; // the budget, not this, decides how many get asked: the quickest first, the never-measured (5 s) after them
const SEARCH_TOTAL_MS = 13500; // Kino cuts a search at 15 s: asking, naming the top results and ranking all fit in this
const SEARCH_BUDGET_MS = 11000; // for asking the server when the index had nothing
const SEARCH_BUDGET_LOCAL_MS = 6000; // the index already answered: the server only adds to it
const CAP_MIN_MS = 3500; // under this a try says nothing about a catalog
const CAP_MAX_MS = 9000;
const CAP_UNKNOWN_MS = 6000;
const SCOPED_ENOUGH = 8;
const flat = (x) => String(x || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

// A catalog is only blamed for a search it had a fair chance to answer: a try cut short by what was left of the budget says nothing
// about it, and one never asked (the budget ran out first) is not counted at all.
const FAIR_MS = 3500;
const SKIPPED = Symbol("skipped");

/** One catalog's search: its cards, null (it did not answer) or SKIPPED (no time left to ask). */
async function askCatalog(cat, q, cap, left) {
  if (left < 1500) return SKIPPED;
  const t0 = Date.now();
  try {
    const metas = (await catalogMetas(cat, extrasOf({ search: q }), Math.min(cap, left))).slice(0, 12);
    noteLatency(cat.id, Date.now() - t0);
    kino.log(`search ${safeId(cat.id).slice(0, 24)}: ${metas.length} in ${Date.now() - t0} ms`);
    return metas.map((m) => card(m, cat));
  } catch (e) {
    if (left >= cap && cap >= FAIR_MS) noteLatency(cat.id, Math.round(cap * 1.5));
    kino.log(`search ${safeId(cat.id).slice(0, 24)} failed after ${Date.now() - t0} ms: ${(e && e.code) || "error"}`);
    return null;
  }
}

/** How long a catalog is given: 1.6 times what it has taken (so one that answers in 6 s gets 9.6 s, capped), 6 s when never measured. */
function capFor(cat) {
  const ms = readLatency()[cat.id];
  return Math.round(Math.min(CAP_MAX_MS, Math.max(CAP_MIN_MS, ms ? ms * 1.6 : CAP_UNKNOWN_MS)));
}

/**
 * The server's answer from [cats], one catalog at a time (it answers searches almost serially: asking all at once slowed every one
 * to the sum and all missed the cut), the quickest first, each given a wait that follows how long it has taken, inside [budget]. When
 * nothing answered and time is left, the first that failed gets one more try with what is left: the server kept scraping after the
 * first one hung up, so the second often answers at once.
 */
async function askCatalogs(cats, q, budget, wantExact, targets) {
  const lists = new Map();
  const failed = [];
  const fair = new Set();
  let done = false;
  let asked = 0;
  const take = async (cat, cap) => {
    const room = budget.left();
    const cards = await askCatalog(cat, q, cap, room);
    if (cards === SKIPPED) return "skipped";
    asked++;
    if (cards === null) {
      if (room >= cap && cap >= FAIR_MS) fair.add(cat.id);
      return "failed";
    }
    lists.set(cat.id, cards);
    fair.delete(cat.id);
    noteCatalog(cat.id, true, "search");
    if (wantExact && cards.some((c) => targets.includes(baseTitle(c.name)))) done = true;
    return "ok";
  };
  for (const cat of cats) {
    if (done) break;
    if ((await take(cat, capFor(cat))) === "failed") failed.push(cat);
  }
  if (lists.size === 0 && !done) {
    for (const cat of failed.slice(0, 2)) {
      if (budget.left() < FAIR_MS) break;
      if ((await take(cat, budget.left())) === "ok") {
        failed.splice(failed.indexOf(cat), 1);
        fair.delete(cat.id);
        break;
      }
    }
  }
  // Only a catalog that failed a try long enough to mean it is counted, and only in the search scope (its Home row is another request).
  for (const id of fair) noteCatalog(id, false, "search");
  return { lists, failed: failed.length, asked };
}

const rankItems = (items, titles) => (typeof kino.rank === "object" && kino.rank && typeof kino.rank.sortBySimilarity === "function" ? kino.rank.sortBySimilarity(items, titles) : items);

export async function search(query) {
  const total = makeBudget(SEARCH_TOTAL_MS);
  const q = String(query.q || "").trim().slice(0, 200);
  if (q.length < 2) return [];
  const manifest = await loadManifest(false, 4000);
  const all = manifest.catalogs.filter((c) => c.search && !isLiveType(c.type) && isOn(c));
  // Inside a "Ver más" page (capability scopedSearch): only that page's catalog, and null when it cannot search (Kino then filters).
  let only = null;
  if (query.within) {
    let r;
    try { r = parseRef(query.within); } catch { return null; }
    only = all.find((c) => c.id === r.c && c.type === r.t) || null;
    if (!only) return null;
  }
  const titles = [query.q, query.originalTitle].concat(Array.isArray(query.altTitles) ? query.altTitles : []).filter((x) => typeof x === "string" && x.trim());
  const local = await searchIndex(q, { only: only && only.id, onKeys: only ? null : new Set(all.map((c) => c.id)), limit: 60 });
  const localItems = local.map((x) => x.item);
  // With enough in the index the server is not asked; with a few (a catalog only seen by its Home row) it still is, and adds to them.
  if (only && local.length >= SCOPED_ENOUGH) return rankItems(localItems, titles);

  const pool_ = byLatency(only ? [only] : healthyOnly(all, "search")).slice(0, MAX_SEARCH_CATALOGS);
  const budget = makeBudget(Math.min(local.length >= 8 ? SEARCH_BUDGET_LOCAL_MS : SEARCH_BUDGET_MS, total.left()));
  // When Kino asks for one specific title (it sends a year or a TMDB id), an exact match ends the round early.
  const wantExact = (query.year > 0 || query.tmdbId > 0) && !only;
  const { lists, failed } = await askCatalogs(pool_, q, budget, wantExact, titles.map(baseTitle).filter(Boolean));
  // Not one catalog answered: the server is down or hung. Say so, instead of an empty list that reads "not found" — but only when the
  // index had nothing to show either.
  if (lists.size === 0 && failed > 0 && !local.length) throw kino.error("unavailable", "no catalog answered the search", { userMessage: t("timeout") });

  // The answers interleaved (one from each catalog in turn, the quickest first), so no single catalog fills the list.
  const ordered = pool_.map((c) => lists.get(c.id) || []);
  const merged = [];
  for (let i = 0, longest = Math.max(0, ...ordered.map((l) => l.length)); i < longest; i++) for (const l of ordered) if (l[i]) merged.push(l[i]);
  const seen = new Set();
  const cards = merged.filter((c) => !seen.has(c.key) && seen.add(c.key));
  const top = cards.slice(0, 60);
  await enrich(top, ENRICH_BUDGET, total.end - 1000);
  flushKinds();
  // A catalog the server names as adult: its titles are marked 18+ (they show only behind the person's code) and never enter the index.
  const adultCats = new Set(all.filter((c) => adultName(c.name)).map((c) => c.id));
  const built = top.map((c) => ({ c, item: toItem(c) })).filter((x) => x.item);
  for (const x of built) if (adultCats.has(x.c.cat)) x.item.adult = true;
  // Everything the search saw that has a name goes in the index (not only the sixty shown): the next search, and a "Ver más" page's own
  // search, find them without asking the server.
  const byCat = new Map();
  for (const c of merged) {
    const item = c.name && !adultCats.has(c.cat) ? toItem(c) : null;
    if (item) byCat.set(c.cat, (byCat.get(c.cat) || []).concat(item));
  }
  for (const [id, items] of byCat) await indexItems(items, id);
  const names = new Set();
  const out = built.map((x) => x.item).concat(localItems).filter((it) => {
    const k = flat(it.title);
    if (!k || names.has(k)) return false;
    names.add(k);
    return true;
  });
  return rankItems(out, titles);
}

// ---- 7. titles ---------------------------------------------------------------------------------------------------

/** "The server is still preparing it": a first, cold try that ran out of time. Asking again answers, so it is not a failure of the catalog. */
function warming(userMessage) {
  const err = kino.error("unavailable", "the server is still preparing it", { userMessage });
  err.warming = true;
  return err;
}

// Kino cuts these calls at 20 s: the page first (up to 17 s), then the extras (Kino's ids, the warm-up) only if time is left.
const TITLE_BUDGET_MS = 19000;
const EXTRAS_UNTIL_MS = 12000;

async function getMeta(type, id, capMs) {
  let data;
  try {
    data = await getJson(`/meta/${enc(type)}/${enc(id)}.json`, capMs || 15000);
  } catch (e) {
    // "unavailable", not "timeout": Kino words a timeout itself and would drop this sentence; the server keeps scraping, so asking again answers.
    if (e && e.code === "unavailable" && /timeout/.test(String(e.message))) throw warming(t("warming"));
    throw e;
  }
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

/** What the server told about the ids wins; what Kino found fills the rest. Never waits past [ms]: the ids are a nicety. */
async function withExternalIds(info, meta, isSeries, ms) {
  const ext = await withTime(ms, externalIds(isSeries, meta));
  if (!ext) return info;
  const ids = Object.assign({}, info.ids);
  for (const k of ["tmdb", "imdb", "mal", "anilist", "kitsu"]) if (ids[k] === undefined && ext[k] !== undefined) ids[k] = ext[k];
  if (Object.keys(ids).length) info.ids = ids;
  return info;
}

/** The catalog a title's card id came from: the index first, then the short memory; "" when not known. */
async function catOfRef(r) {
  const key = "n" + hash(r.i || "");
  const seen = await indexGet(key);
  return (seen && seen.cat) || catOfKey(key);
}

export async function details(ref) {
  const budget = makeBudget(TITLE_BUDGET_MS - 500);
  const r = parseRef(ref);
  const meta = await getMeta(r.t, r.i, budget.cap(17000));
  learn(r.t, r.i, meta);
  const info = seriesInfo(meta);
  return budget.left() > 6000 ? withExternalIds(info, meta, false, Math.min(4000, budget.left() - 1500)) : info;
}

// Kino's answer must hold a season and a number for each episode, each pair once. A server sends specials as episode 0, season 0, or
// with no number at all: those are numbered after the last real episode of their season instead of being merged into episode 1.
function numbered(rows) {
  const top = new Map();
  for (const r of rows) if (r.number > 0) top.set(r.season, Math.max(top.get(r.season) || 0, r.number));
  for (const r of rows) {
    if (r.number > 0) continue;
    r.number = (top.get(r.season) || 0) + 1;
    top.set(r.season, r.number);
  }
  const seen = new Set();
  return rows
    .sort((a, b) => a.season - b.season || a.number - b.number)
    .filter((r) => {
      const k = r.season + ":" + r.number;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

export async function episodes(ref) {
  const budget = makeBudget(TITLE_BUDGET_MS);
  const r = parseRef(ref);
  const own = await catOfRef(r);
  let meta;
  try {
    meta = await getMeta(r.t, r.i, budget.cap(17000));
  } catch (e) {
    // The server is still scraping the page. Rather than a dead end, the title plays as one entry: its own streams (a pack's files come
    // together in them). The page is warming, so the next time the full list is there.
    if (e && e.warming) return { series: {}, episodes: [{ season: 1, number: 1, ref: makeRef(r.t, r.i), title: t("movieEpisode") }] };
    throw e;
  }
  noteCatalog(own, true, "play");
  learn(r.t, r.i, meta);
  const videos = (Array.isArray(meta.videos) ? meta.videos : []).filter((v) => v && typeof v.id === "string");
  const rows = [];
  videos.forEach((v) => {
    const seasonRaw = num(v.season);
    if (seasonRaw > 999) return;
    const raw = num(v.episode != null ? v.episode : v.number);
    // A special (season 0) is numbered after the last real episode of season 1, never over its first one.
    rows.push({ v, season: seasonRaw > 0 ? seasonRaw : 1, number: seasonRaw > 0 && raw > 0 ? Math.min(raw, 99999) : 0 });
  });
  const list = numbered(rows).map(({ v, season, number }) => {
    const ep = { season, number, ref: makeRef(r.t, v.id) };
    const title = v.title || v.name;
    if (title) ep.title = String(title).slice(0, 200);
    const still = httpUrl(v.thumbnail);
    if (still) ep.still = still;
    const overview = v.overview || v.description;
    if (overview) ep.overview = String(overview);
    const aired = /^\d{4}-\d{2}-\d{2}/.exec(String(v.released || ""));
    if (aired) ep.airDate = aired[0];
    return ep;
  });
  // A title with no episode list (a movie, to Stremio) plays as one entry: the card's own id is the playable one.
  if (!list.length) list.push({ season: 1, number: 1, ref: makeRef(r.t, r.i), title: t("movieEpisode") });
  rememberEpisodes(ref, list.map((e) => e.ref));
  let series = seriesInfo(meta);
  if (TITLE_BUDGET_MS - budget.left() < EXTRAS_UNTIL_MS) series = await withExternalIds(series, meta, videos.length > 0, Math.min(4000, budget.left() - 1500));
  return { series, episodes: list };
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

const STREAM_CAP_MS = 17000;

/** A title's streams. [capMs] cuts the wait (Kino ends a resolve at 20 s: the server keeps scraping, so a try that ran out says so). */
async function streamsOf(type, id, capMs) {
  let data;
  try {
    data = await getJson(`/stream/${enc(type)}/${enc(id)}.json`, capMs || STREAM_CAP_MS);
  } catch (e) {
    if (e && e.code === "unavailable" && /timeout/.test(String(e.message))) throw warming(t("warmingVideo"));
    throw e;
  }
  return Array.isArray(data && data.streams) ? data.streams : [];
}

const RESOLVE_BUDGET_MS = 18500; // inside the 20 s Kino gives a resolve
const MIN_CALL_MS = 2500; // under this a request is not worth starting

/** Streams inside [budget]: each try is cut to what is left, and a second look after an empty answer never starts past it. */
async function streamsWithin(type, id, capMs, retry, budget) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const cap = Math.min(capMs || STREAM_CAP_MS, budget.left() - 500);
    if (cap < MIN_CALL_MS) return [];
    const tryStart = Date.now();
    const list = (await streamsOf(type, id, cap)).filter(playable);
    if (list.length) return list;
    if (retry !== false && attempt < 1 && Date.now() - tryStart < 6000 && budget.left() - 800 > MIN_CALL_MS + 500) await kino.sleep(800);
    else break;
  }
  return [];
}

// ---- the same title in another catalog
const XSRC_PREFIX = "rb_xsrc:";
const XSRC_FOR_MS = 6 * 60 * 60 * 1000;

/** A title reduced to what two catalogs agree on: no season, year, quality tags or punctuation. */
function baseTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s(?:\d{3,4}p\b|web-?dl|web-?rip|blu-?ray|brrip|hdrip|hdtc|hdcam|dual audio|\{).*$/i, " ")
    .replace(/\(.*?\)|\[.*?\]|\{.*?\}/g, " ")
    .replace(/\b(?:season|temporada)\s*\d+.*$/i, " ")
    .replace(/\bs\d{1,2}\b.*$/i, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function seasonOf(title) {
  const m = /\bseason\s*(\d+)|\btemporada\s*(\d+)|\bS(\d{1,2})\b/i.exec(String(title || ""));
  return m ? parseInt(m[1] || m[2] || m[3], 10) : null;
}

/**
 * Looks for [title] in the other catalogs and asks the first exact match for its streams, all inside [budget]. First in the local
 * index (titles already seen cost no request, so the budget goes to the streams), then by searching the catalogs quickest first.
 * Paused catalogs are left out. Returns `{ list, ref, label }` or null.
 */
async function crossCatalog(title, ownCat, manifest, budget, wantType, wantYear) {
  const want = baseTitle(title);
  if (want.length < 2) return null;
  const wantSeason = seasonOf(title);
  // The same film: the same words, the same season, and (when both say one) the same year; "Dune (1984)" is not "Dune (2021)".
  const yearOf = (name) => { const m = /\((19|20)\d{2}\)/.exec(String(name || "")); return m ? parseInt(m[0].slice(1, 5), 10) : 0; };
  const wantY = wantYear || yearOf(title);
  const same = (name, y) => {
    if (baseTitle(name) !== want) return false;
    if (wantSeason !== null && seasonOf(name) !== null && seasonOf(name) !== wantSeason) return false;
    const there = y || yearOf(name);
    return !(wantY && there && wantY !== there);
  };
  const br = readBreaker();
  const others = manifest.catalogs.filter((c) => c.search && !isLiveType(c.type) && c.id !== ownCat && isOn(c) && !isPaused(c.id, br));
  const titleOf = (id) => catalogTitle(others.find((c) => c.id === id) || { name: id, type: "" });

  // 1. what the index already knows
  const words = String(title).replace(/\(.*?\)|\[.*?\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  const known = (await searchIndex(words, { onKeys: new Set(others.map((c) => c.id)), limit: 40 })).filter((x) => same(x.item.title, x.item.year));
  const rankOf = new Map(byLatency(others).map((c, i) => [c.id, i]));
  known.sort((a, b) => (rankOf.has(a.cat) ? rankOf.get(a.cat) : 99) - (rankOf.has(b.cat) ? rankOf.get(b.cat) : 99));
  for (const x of known.slice(0, 3)) {
    if (budget.left() < MIN_CALL_MS + 500) return null;
    let ref;
    try { ref = parseRef(x.item.ref); } catch { continue; }
    if (wantType && ref.t !== wantType) continue; // a film is not swapped for a series of the same name: its streams need an episode
    try {
      const list = await streamsWithin(ref.t, ref.i, Math.min(8000, budget.left() - 500), false, budget);
      if (list.length) return { list, ref: x.item.ref, label: titleOf(x.cat) };
    } catch { /* this one is not ready: the next */ }
  }

  // 2. ask the catalogs
  for (const cat of byLatency(others)) {
    if (budget.left() < 5500) return null;
    let metas = [];
    try { metas = await catalogMetas(cat, extrasOf({ search: words }), Math.min(5000, budget.left() - 3500)); } catch { continue; }
    const hit = metas.find((m) => m && typeof m.id === "string" && same(String(m.name || ""), year(m)) && (!wantType || String(m.type || cat.type) === wantType));
    if (!hit) continue;
    if (budget.left() < 3000) return null;
    const type = String(hit.type || cat.type);
    try {
      const list = await streamsWithin(type, hit.id, Math.min(8000, budget.left() - 500), false, budget);
      if (list.length) return { list, ref: makeRef(type, hit.id), label: catalogTitle(cat) };
    } catch { /* not ready: warmed below */ }
    getJson(`/stream/${enc(type)}/${enc(hit.id)}.json`, 1000).catch(() => null);
    return null;
  }
  return null;
}

/** Why none of [list] can play, as the text the person reads. */
function whyNot(list, live) {
  const why = list.map((s) => (s && typeof s.url === "string" ? blockedBy(s) : null)).filter(Boolean);
  const key = why.includes("soon") && !why.includes("drm") ? "notYet" : why.includes("drm") ? "drmOnly" : live ? "noChannel" : "noStreams";
  return kino.error("unavailable", "no streams", { userMessage: t(key) });
}

async function resolveLive(r, budget) {
  let list = r.i ? await streamsOf(r.t, r.i, budget.cap(STREAM_CAP_MS, 500, MIN_CALL_MS)) : [];
  let stream = streamFor(list, true);
  if (!stream && r.c && r.n && budget.left() > 6000) {
    // The id inside a saved channel may be stale (its token expired): find the channel again by name and ask afresh.
    const cat = (await loadManifest(false, 4000)).catalogs.find((c) => c.id === r.c);
    const fresh = cat ? (await catalogMetas(cat, "", budget.cap(10000, 4000, MIN_CALL_MS))).find((m) => plainName(m.name) === r.n) : null;
    if (fresh && budget.left() > MIN_CALL_MS + 500) {
      list = await streamsOf(r.t, fresh.id, budget.cap(STREAM_CAP_MS, 500, MIN_CALL_MS));
      stream = streamFor(list, true);
    }
  }
  if (!stream) throw whyNot(list, true);
  return stream;
}

async function resolveVideo(r, ref, options, budget) {
  const key = "n" + hash(r.i);
  const seen = await indexGet(key);
  let own = (seen && seen.cat) || catOfKey(key);
  let title = seen ? seen.title : "";
  // An episode's ref names its video, not its series: the series it was listed under supplies the title and the catalog.
  if (!title) {
    const seriesRef = seriesOfEpisode(ref);
    if (seriesRef) {
      try {
        const sk = "n" + hash(parseRef(seriesRef).i);
        const ss = await indexGet(sk);
        if (!own) own = (ss && ss.cat) || catOfKey(sk);
      } catch { /* no series: the title just has no fallback */ }
    }
  }
  // Only a title's own card has a copy in another catalog to fall back on; one episode of a series does not.
  const canSwap = title.length > 1;
  const memKey = XSRC_PREFIX + hash(ref);
  const manifest = canSwap ? await loadManifest(false, 3000).catch(() => null) : null;
  let list = [];
  let from = "";
  let failure = null;
  // Kino says the copy it was given did not play: the swap remembered for this title may be the one that failed.
  if (options && options.retry) { try { kino.storage.remove(memKey); } catch { /* none kept */ } }

  // The same title was already found in another catalog for this ref: that one first (it was warm a moment ago).
  if (canSwap) {
    try {
      const mem = JSON.parse(kino.storage.get(memKey) || "null");
      if (mem && typeof mem.t === "string" && typeof mem.i === "string") {
        list = await streamsWithin(mem.t, mem.i, 8000, false, budget);
        if (list.length) from = String(mem.label || "");
      }
    } catch { list = []; }
  }
  // A catalog whose breaker is open has been failing: do not spend the 20 s on it first, ask the others, and come back to it only if
  // they gave nothing and time is left.
  const pausedFirst = !list.length && canSwap && manifest && own && isPaused(own, null, "play");
  const cross = async () => {
    if (!manifest) return;
    const swap = await crossCatalog(title, own, manifest, budget, r.t, seen && seen.year).catch(() => null);
    if (!swap) return;
    list = swap.list;
    from = swap.label;
    try {
      const sr = parseRef(swap.ref);
      kino.storage.set(memKey, JSON.stringify({ t: sr.t, i: sr.i, label: swap.label }), { ttlMs: XSRC_FOR_MS });
    } catch { /* not remembered */ }
  };
  if (pausedFirst) await cross();
  if (!list.length && (!pausedFirst || budget.left() > 6000)) {
    try {
      list = await streamsWithin(r.t, r.i, pausedFirst ? budget.left() - 500 : canSwap ? 9000 : STREAM_CAP_MS, !canSwap, budget);
    } catch (e) {
      failure = e;
    }
    // A cold try that ran out of time ("still preparing") is the normal first open, not a failure of the catalog.
    if (!(failure && failure.warming)) noteCatalog(own, list.length > 0, "play");
  }
  if (!list.length && canSwap && !pausedFirst) await cross();
  if (!list.length) {
    if (failure) throw failure;
    // Nothing anywhere, and nobody timed out: the title is gone, so it stops turning up in searches.
    await indexRemove(key);
    throw whyNot([], false);
  }
  const ranked = rank(list.filter(playable), ref, options, hash);
  const stream = streamFor(ranked, false);
  if (!stream) throw whyNot(list, false);
  if (from) {
    const mark = (s) => (s.label ? { ...s, label: `${from} · ${s.label}`.slice(0, 48) } : { ...s, label: from.slice(0, 48) });
    Object.assign(stream, mark(stream));
    if (stream.alternatives) stream.alternatives = stream.alternatives.map(mark);
  }
  return stream;
}

async function resolveRef(ref, options) {
  const budget = makeBudget(RESOLVE_BUDGET_MS);
  const r = parseRef(ref);
  return isLiveType(r.t) ? resolveLive(r, budget) : resolveVideo(r, ref, options, budget);
}

// ---- 9. live channels --------------------------------------------------------------------------------------------

const LIVE_OK_KEY = "p1";
const TTL_LIVE_OK = 30 * 60 * 1000;

/**
 * The live catalogs worth showing: those whose first channels have a stream Kino can play. A catalog whose channels all
 * come with ClearKey keys (the player cannot decrypt them) is left out until the server offers something else. The
 * verdict is kept for half an hour; a catalog that could not be checked is shown.
 */
async function playableLiveCatalogs(manifest, budget) {
  const cats = manifest.catalogs.filter((c) => c.browsable && isLiveType(c.type) && isOn(c));
  let cached = null;
  try { cached = JSON.parse(kino.storage.get(LIVE_OK_KEY) || "null"); } catch { /* unreadable: check again */ }
  if (cached && Date.now() - cached.at < TTL_LIVE_OK) return cats.filter((c) => cached.v[c.id] !== false);
  // Checking asks a catalog's channels and their streams, a slow thing: it shares one budget (12 s unless the caller has less), and a
  // catalog it had no time to check is shown rather than hidden.
  const b = budget && budget.left() < 12000 ? budget : makeBudget(12000);
  const verdicts = await pool(cats, 5, async (cat) => {
    if (b.short(3000)) return undefined;
    const metas = (await catalogMetas(cat, "", b.cap(8000, 200))).slice(0, 2);
    let asked = false;
    for (const m of metas) {
      if (b.short(2500)) break;
      try {
        const list = await streamsOf(cat.type, m.id, b.cap(8000, 200));
        asked = true;
        if (list.some(playable)) return true;
      } catch { /* try the next one */ }
    }
    return asked ? false : undefined;
  });
  const v = {};
  cats.forEach((cat, i) => { if (verdicts[i] !== undefined) v[cat.id] = verdicts[i]; });
  if (Object.keys(v).length) {
    try { kino.storage.set(LIVE_OK_KEY, JSON.stringify({ at: Date.now(), v })); } catch { /* storage full: not cached */ }
  }
  return cats.filter((c) => v[c.id] !== false);
}

export async function liveCategories() {
  const budget = makeBudget(18500);
  const manifest = await loadManifest(false, 6000);
  return (await playableLiveCatalogs(manifest, budget)).map((c) => ({ id: safeId(c.id), title: catalogTitle(c) }));
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
  const budget = makeBudget(18500);
  const manifest = await loadManifest(false, 5000);
  const cat = manifest.catalogs.find((c) => isLiveType(c.type) && safeId(c.id) === arg.categoryId);
  if (!cat) return { items: [] };
  const [skipText, offsetText] = String(arg.cursor || "0,0").split(",");
  const skip = num(skipText);
  const offset = num(offsetText);
  const metas = await catalogMetas(cat, extrasOf({ skip }), budget.cap(12000, 4500, 3000));
  // Some catalogs ignore `skip` and send the same list again: a page that opens with the first page's card is the end.
  const first = skip ? await catalogMetas(cat, "", budget.cap(12000, 500, 2500)) : null;
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
  const budget = makeBudget(13500);
  const manifest = await loadManifest(false, 4000);
  const cats = (await playableLiveCatalogs(manifest, makeBudget(Math.min(5000, budget.left() - 6000)))).filter((c) => c.search).slice(0, MAX_LIVE_SEARCH_CATALOGS);
  // Every catalog at once, each cut to what is left (Kino cuts a search at 15 s and keeps nothing of one that ran over).
  const found = await pool(cats, Math.max(1, cats.length), async (cat) => {
    const taken = new Set();
    return (await catalogMetas(cat, extrasOf({ search: q }), budget.cap(9000, 500, 2000))).slice(0, 40).map((m) => channelOf(m, cat, safeId(cat.id), taken)).filter(Boolean);
  });
  const seen = new Set();
  const items = [];
  for (const list of found) for (const c of list || []) if (!seen.has(c.id) && seen.add(c.id)) items.push(c);
  return { items: items.slice(0, 100) };
}

// ---- 10. subtitles -----------------------------------------------------------------------------------------------

export async function subtitles(arg) {
  const manifest = await loadManifest(false, 5000);
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

// The catalogs the sources page lists: every one the manifest has (live ones too), with whether it is on and how it is doing. Read
// from the kept manifest without waiting for anything: the screen is a pure view.
export function sourcesList() {
  const m = manifestNow();
  if (!m) return [];
  const br = readBreaker();
  const lat = readLatency();
  return m.catalogs.filter((c) => c.id && !adultName(c.name)).slice(0, 60).map((c) => ({
    id: c.id,
    key: safeId(c.id).slice(0, 48) + "-" + hash(c.id).slice(0, 8),
    title: catalogTitle(c),
    live: isLiveType(c.type),
    on: isOn(c),
    pausedMin: Math.ceil(pausedFor(c.id, br) / 60000),
    ms: lat[c.id] || 0,
  }));
}

/** One switch on the sources page: freeze what every catalog is now, then apply this change, so picking one never moves the others. */
export function toggleSource(id, on) {
  const m = manifestNow();
  if (!m || !m.catalogs.some((c) => c.id === id)) return false;
  const picks = Object.fromEntries(m.catalogs.map((c) => [c.id, isOn(c)]));
  picks[id] = on !== false;
  // Picks of catalogs the manifest no longer lists are kept (the server may bring one back); and a write the storage refused is not "done".
  return writePicks({ ...readPicks(), ...picks });
}

export async function settingsStatus() {
  const out = {};
  try {
    const manifest = await loadManifest(false, 6000);
    out.serverStatus = t("online", { catalogs: manifest.catalogs.length });
    const list = sourcesList();
    out.sources = t("sourcesStatus", { on: list.filter((x) => x.on).length, all: list.length, paused: list.filter((x) => x.on && x.pausedMin > 0).length });
  } catch (e) {
    out.serverStatus = t("offline", { detail: detailOf(e) });
  }
  out.index = t("indexStatus", { n: await indexSize() });
  return out;
}

/** Walks the same road a person does (manifest, catalog, title page, stream) and names the first step that fails. */
async function checkConnection() {
  const budget = makeBudget(27000); // Kino gives an action 30 s
  let manifest;
  try { manifest = await loadManifest(true, 10000); } catch (e) { return { message: t("stepManifest", { detail: detailOf(e) }) }; }
  const cat = browseCatalogs(manifest)[0];
  if (!cat) return { message: t("stepCatalog", { detail: "0" }) };
  let metas;
  try {
    metas = await catalogMetas(cat, "", budget.cap(10000, 9000, 3000));
    if (!metas.length) throw kino.error("unavailable", "empty");
  } catch (e) { return { message: t("stepCatalog", { detail: catalogTitle(cat) + ": " + detailOf(e) }) }; }
  const sample = metas[0];
  const type = String(sample.type || cat.type);
  try { await getMeta(type, sample.id, budget.cap(15000, 4000, 3000)); } catch (e) { return { message: t("stepMeta", { detail: detailOf(e) }) }; }
  try {
    if (!streamFor(await streamsOf(type, sample.id, budget.cap(STREAM_CAP_MS, 0, 3000)), false)) throw kino.error("unavailable", "no streams");
  } catch (e) { return { message: t("stepStream", { detail: detailOf(e) }) }; }
  return { message: t("ok", { catalogs: manifest.catalogs.length }) };
}

/** What is only a copy of the server's answers (the person's own data is not touched: recent titles, search history, the picks). */
function clearCaches() {
  let idx = [];
  try { idx = JSON.parse(kino.storage.get(CM_INDEX) || "[]"); } catch { idx = []; }
  for (const e of Array.isArray(idx) ? idx : []) if (e && typeof e.k === "string") { try { kino.storage.remove(e.k); } catch { /* gone anyway */ } }
  for (const k of [CM_INDEX, MANIFEST_KEY, ART_KEY, LIVE_OK_KEY, HOME_KEY]) { try { kino.storage.remove(k); } catch { /* gone anyway */ } }
  MEM.clear();
}

export async function action(key) {
  if (key === "checkConn") return checkConnection();
  if (key === "resume") {
    resetBreaker();
    return { message: t("resumed") };
  }
  if (key === "clearIndex") {
    await clearIndex();
    return { message: t("indexCleared") };
  }
  if (key === "clearCache") {
    clearCaches();
    return { message: t("cacheCleared") };
  }
  return null;
}

export async function resolve(ref, options) {
  const out = await resolveRef(ref, options);
  // The browse screen's "Continuar viendo": a play that found a copy is remembered under its series (or the movie's own ref).
  try {
    if (!isLiveType(parseRef(ref).t)) browseScreen().notePlayed(seriesOfEpisode(ref) || ref);
  } catch { /* never fails a play */ }
  return out;
}
