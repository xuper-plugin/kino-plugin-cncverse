// The browse screen: it paints at once from what is kept, then fills each tab as the sources answer.
//
// - `open` reads no network: the active tab is drawn from its kept copy (skeletons if none) and the tabs that still need their
//   rows become `pending` in the state.
// - A timer (`every`, only while something is pending) loads ONE tab per tick, the active one first, with the section page the
//   catalog already builds. Each tab is kept (kino.storage, 12 h) the moment it arrives, so a slow source never holds the others
//   back and a later opening paints from the copy first.
// - Tabs other than the active one are prefetched except on a TV (a weak box pays for every row it builds): there they load when
//   selected.
// The state holds only `tab`, `pending` and `failed` (a few bytes); the trees live here, in memory.
import { tabOf, recentOf, cardOf, playedKey, TAB_IDS } from "./model.js";
import { browseView, searchView, settingsView, liveView } from "./view.js";
import { makeMetaCache } from "./metaCache.js";

const TAB_KEY = "browseTab";
const SNAP_PREFIX = "browse1:";
const SNAP_TTL_MS = 12 * 3600 * 1000;
const SNAP_MAX = 20 * 1024;
const RECENT_KEY = "recent1";
const RECENT_MAX = 12;
const HIST_KEY = "searchHist1";
const HIST_MAX = 24;
const MAX_META_TICKS = 30;

/** What Kino's metadata is asked for: the name without "(2023)", "(Season 1)" and the like, and the year when the name had one. */
export function metaAsk(c) {
  const title = String(c.title).replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim() || String(c.title);
  const y = /\((19|20)\d{2}\)/.exec(String(c.title));
  return { id: c.id, title, kind: c.kind, ...(c.adult === true ? { adult: true } : {}), ...(y ? { year: parseInt(y[0].slice(1, 5), 10) } : {}) };
}
const MAX_LOAD_TRIES = 3;

/**
 * `kino`: the host; `loadTab(tab)` → the section page of that tab (`{ rows }`); `searchTitles(q)` → the cards a search finds;
 * `live`: `{ categories(), channels(categoryId), search(q) }` for the live page; `warm(cards)` asks the bridge to prepare those titles.
 */
export function makeBrowse({ kino, loadTab, searchTitles, live = null, warm = null }) {
  const meta = makeMetaCache({ kino });
  /** [data] with what the meta cache knows: the cards' TMDB ids and the slides' title logos. */
  // The bridge's lists carry posters only: the slides are the first titles Kino's metadata knows a backdrop and a synopsis for.
  const slidesFrom = (rails) => {
    const out = [];
    for (const r of rails) for (const c of r.items) {
      if (out.length >= 5) return out;
      const k = meta.known(c.id);
      if (!k.backdrop || c.adult === true || out.some((s) => s.id === c.id)) continue;
      out.push({ id: c.id, ref: c.ref, kind: c.kind, title: c.title, image: k.backdrop, text: k.overview, ...(k.logo ? { logo: k.logo } : {}) });
    }
    return out;
  };
  // A rail is all wide pictures or all posters: the "cards" look is shorter than the poster one, so a mix looks broken. Titles
  // Kino's metadata does not know have no wide picture, and until every title of a rail has one the whole rail keeps its posters.
  const uniform = (items) => (items.every((i) => i.backdrop) ? items : items.map(({ backdrop, ...rest }) => rest));
  const enrich = (data) => (data ? {
    slides: data.slides.length > 0 ? data.slides.map((s) => { const k = meta.known(s.id); return k.logo ? { ...s, logo: k.logo } : s; }) : slidesFrom(data.rails),
    rails: data.rails.map((r) => ({ ...r, items: uniform(meta.dress(r.items)) })),
  } : data);
  const metaTries = new Map(); // tab -> metadata ticks spent
  const warmed = new Set(); // card ids already warmed on the bridge
  const memo = new Map(); // tab -> { data, whole: loaded in this sandbox }
  const log = (...a) => { try { kino.log("[cncverse]", ...a); } catch (_) { /* no log */ } };
  const get = (k) => { try { return kino.storage.get(k); } catch (_) { return null; } };
  const set = (k, v, opts) => { try { kino.storage.set(k, v, opts); } catch (_) { /* full storage: no copy */ } };

  // ---- the kept copy of a tab ----
  function readSnap(tab) {
    try {
      const o = JSON.parse(get(SNAP_PREFIX + tab) || "null");
      return o && Date.now() - o.at < SNAP_TTL_MS && o.data && Array.isArray(o.data.rails) ? o.data : null;
    } catch (_) { return null; }
  }
  function writeSnap(tab, data) {
    // Trimmed until it fits: the 256 KB of storage are shared with the TMDB, match and health caches and the Home copy.
    for (let per = 10; per >= 3; per -= 2) {
      const slim = { slides: data.slides.slice(0, 4), rails: data.rails.map((r) => ({ ...r, items: r.items.slice(0, per) })) };
      const text = JSON.stringify({ at: Date.now(), data: slim });
      if (text.length <= SNAP_MAX) { set(SNAP_PREFIX + tab, text, { ttlMs: SNAP_TTL_MS }); return; }
    }
  }

  const stored = () => { const t = get(TAB_KEY); return TAB_IDS.includes(t) ? t : null; };
  const remember = (tab) => set(TAB_KEY, tab);

  /** [tab]'s data for drawing: this sandbox's, else its kept copy (not "whole": the next tick refreshes it). */
  function dataOf(tab) {
    if (memo.has(tab)) return memo.get(tab).data;
    const snap = readSnap(tab);
    if (snap) { memo.set(tab, { data: snap, whole: false }); return snap; }
    return null;
  }

  // ---- what was played ----
  const readKeys = () => { try { const a = JSON.parse(get(RECENT_KEY) || "[]"); return Array.isArray(a) ? a.filter((k) => typeof k === "string") : []; } catch (_) { return []; } };
  /** Notes that [ref] was played now (the title is remembered by its TMDB id when it has one). Never throws. */
  function notePlayed(ref) {
    try {
      const key = playedKey(ref);
      if (key === "") return;
      const keys = readKeys();
      if (keys[0] === key) return;
      set(RECENT_KEY, JSON.stringify([key, ...keys.filter((k) => k !== key)].slice(0, RECENT_MAX)));
    } catch (_) { /* the row just misses a title */ }
  }

  // ---- earlier searches ----
  const slim = (c) => ({ id: c.id, ref: c.ref, title: c.title, kind: c.kind, ...(c.poster ? { poster: c.poster } : {}) });
  function readHistory() {
    try {
      const a = JSON.parse(get(HIST_KEY) || "[]");
      return Array.isArray(a) ? a.filter((c) => c && typeof c.id === "string" && typeof c.ref === "string" && typeof c.title === "string").slice(0, HIST_MAX) : [];
    } catch (_) { return []; }
  }
  function rememberFound(cards) {
    try {
      const fresh = cards.filter((c) => c.adult !== true).slice(0, 12).map(slim);
      const ids = new Set(fresh.map((c) => c.id));
      set(HIST_KEY, JSON.stringify([...fresh, ...readHistory().filter((c) => !ids.has(c.id))].slice(0, HIST_MAX)));
    } catch (_) { /* the page just has no history */ }
  }

  // ---- live: the home row (the first category's channels) and the live page's categories and channels ----
  const CHANNELS_CAP = 60;
  let liveRow = null; // null: not asked yet; []: asked, nothing
  let liveTilesList = null;
  let liveFound = null; // { q, items }: the last live search
  const liveChannels = new Map(); // category id -> cards
  const liveCards = (items) => (Array.isArray(items) ? items : []).filter((i) => i && typeof i.id === "string" && typeof i.ref === "string").slice(0, CHANNELS_CAP).map((i) => cardOf({ ...i, kind: "live" }));
  async function loadLiveTiles() {
    let tiles = [];
    try { tiles = live ? await live.categories() : []; } catch (_) { tiles = []; }
    liveTilesList = (Array.isArray(tiles) ? tiles : []).filter((t) => t && typeof t.id === "string" && typeof t.title === "string").map((t) => ({ ref: t.id, title: t.title }));
  }
  async function loadCategory(cat) {
    let page = null;
    try { page = await live.channels(cat); } catch (e) { log("live page", (e && e.code) || "error"); }
    liveChannels.set(cat, liveCards(page && page.items));
  }
  async function loadLiveRow() {
    try {
      if (!liveTilesList) await loadLiveTiles();
      liveRow = [];
      for (const tile of (liveTilesList || []).slice(0, 3)) {
        if (!liveChannels.has(tile.ref)) await loadCategory(tile.ref);
        const got = liveChannels.get(tile.ref) || [];
        if (got.length > 0) { liveRow = got.slice(0, 20); break; }
      }
    } catch (e) { log("live row", (e && e.code) || "error"); liveRow = []; }
  }

  let found = null; // { q, items }: the last search

  const tabFromArgs = (route) => {
    const a = route && route.args && typeof route.args === "object" ? route.args : {};
    return TAB_IDS.includes(a.tab) ? a.tab : null;
  };

  /** The tabs to load: the active one if it is not whole yet, then the rest (not on a TV). */
  function needed(tab, device) {
    const order = [tab, ...TAB_IDS.filter((t) => t !== tab)];
    return order.filter((t, i) => (i === 0 || device !== "tv") && !(memo.get(t) && memo.get(t).whole));
  }

  function view(ctx) {
    const st = ctx.state && typeof ctx.state === "object" ? ctx.state : {};
    if (ctx.route && ctx.route.name === "settings") return settingsView();
    if (ctx.route && ctx.route.name === "live") {
      const cat = typeof st.lcat === "string" ? st.lcat : liveTilesList && liveTilesList[0] ? liveTilesList[0].ref : null;
      const lq = typeof st.lq === "string" ? st.lq : "";
      if (lq !== "") {
        const done = liveFound && liveFound.q === lq;
        return liveView({ tiles: liveTilesList, cat, items: done ? liveFound.items : null, query: lq, searching: !done, device: ctx.device });
      }
      return liveView({ tiles: liveTilesList, cat, items: cat && liveChannels.has(cat) ? liveChannels.get(cat) : null, device: ctx.device });
    }
    if (ctx.route && ctx.route.name === "search") {
      const query = typeof st.sq === "string" ? st.sq : "";
      const items = found && found.q === query ? found.items : null;
      const status = query === "" ? "idle" : st.sstate === "fail" ? "fail" : items ? "done" : "loading";
      return searchView({ query, status, items, history: query === "" ? readHistory() : [], device: ctx.device });
    }
    const tab = TAB_IDS.includes(st.tab) ? st.tab : (tabFromArgs(ctx.route) ?? stored() ?? TAB_IDS[0]);
    const data = enrich(dataOf(tab));
    const loaded = TAB_IDS.map((t) => memo.get(t)).filter(Boolean).map((m) => m.data);
    const pending = Array.isArray(st.pending) && st.pending.length > 0;
    return browseView({ tab, data, recent: uniform(meta.dress(recentOf(readKeys(), loaded))), live: liveRow || [], pending, failed: !!(st.failed && st.failed[tab]), device: ctx.device });
  }

  async function load(tab) {
    const page = await loadTab(tab);
    const data = tabOf(page);
    if (data) { memo.set(tab, { data, whole: true }); writeSnap(tab, data); }
    return data !== null;
  }

  // The bridge keeps scraping after a request ends, so a tab that did not load is asked again (twice) before the retry banner shows.
  const loadTries = new Map();
  function failLoad(tab, rest, failed) {
    const n = (loadTries.get(tab) || 0) + 1;
    loadTries.set(tab, n);
    if (n < MAX_LOAD_TRIES) rest.push(tab); else { failed[tab] = true; loadTries.delete(tab); }
  }

  const events = {
    open({ route, state, device }) {
      const tab = tabFromArgs(route) ?? (TAB_IDS.includes(state.tab) ? state.tab : stored() ?? TAB_IDS[0]);
      for (const t of TAB_IDS) dataOf(t); // the kept copies, so a played title is found whichever tab it was on
      const list = needed(tab, device);
      return { state: { tab, pending: live && liveRow === null ? [...list.slice(0, 1), "live", ...list.slice(1)] : list, failed: null } };
    },
    tab({ value, arg, state }) {
      const tab = TAB_IDS.includes(value) ? value : TAB_IDS.includes(arg) ? arg : null;
      if (!tab) return null;
      remember(tab);
      dataOf(tab);
      const failed = { ...(state.failed || {}) };
      delete failed[tab];
      const pending = [tab, ...(Array.isArray(state.pending) ? state.pending.filter((t) => t !== tab) : [])];
      return { state: { tab, pending: memo.get(tab) && memo.get(tab).whole ? pending.slice(1) : pending, failed } };
    },
    retry({ state, device }) {
      const tab = TAB_IDS.includes(state.tab) ? state.tab : TAB_IDS[0];
      return { state: { failed: null, pending: [tab, ...needed(tab, device).filter((t) => t !== tab)] } };
    },
    async tick({ state }) {
      const pending = Array.isArray(state.pending) ? state.pending : [];
      if (pending.length === 0) return null;
      const [next, ...rest] = pending;
      const failed = { ...(state.failed || {}) };
      // The TMDB ids, backdrops and title logos of a tab's first titles (the slides are made from them), a few lookups per tick; it
      // asks again until five slides are known, every title was asked or MAX_META_TICKS ticks passed. The first titles' pages are also
      // warmed on the bridge, so opening one the first time does not wait for it to scrape.
      if (next.startsWith("meta:")) {
        const tabId = next.slice(5);
        const m = memo.get(tabId);
        if (!m) return { state: { pending: rest } };
        // Slides and the first six titles of each rail first, then the rest of every rail (the "cards" look needs a wide picture each).
        const cards = [...m.data.slides, ...m.data.rails.flatMap((r) => r.items.slice(0, 6)), ...m.data.rails.flatMap((r) => r.items.slice(6))];
        const asked = await meta.fill(cards.map(metaAsk), 12_000);
        if (warm) {
          const fresh = m.data.rails.flatMap((r) => r.items.slice(0, 3)).filter((c) => !warmed.has(c.id)).slice(0, 3);
          for (const c of fresh) warmed.add(c.id);
          try { await warm(fresh); } catch (_) { /* a warm-up never matters */ }
        }
        // The slides made so far are kept with the tab, so the next opening paints the slider at once.
        const made = slidesFrom(m.data.rails);
        if (made.length > m.data.slides.length) { m.data = { ...m.data, slides: made.map(({ logo, ...rest }) => rest) }; writeSnap(tabId, m.data); }
        const tries = (metaTries.get(tabId) || 0) + 1;
        metaTries.set(tabId, tries);
        if (asked > 0 && tries < MAX_META_TICKS && cards.some((c) => !meta.asked(c.id))) return { state: { pending: [next, ...rest] } };
        return { state: { pending: rest } };
      }
      if (next === "live") { await loadLiveRow(); return { state: { pending: rest } }; }
      try {
        const ok = await load(next);
        if (!ok) failLoad(next, rest, failed); else delete failed[next];
        if (ok && meta.usable()) rest.unshift("meta:" + next);
      } catch (e) {
        log("browse tab", (e && e.code) || "error");
        failLoad(next, rest, failed);
      }
      return { state: { pending: rest, failed } };
    },
    // The floating button: straight to the search page, empty and ready for the words.
    openSearch() { return { route: { push: "search" }, state: { sq: "", sstate: null } }; },
    search({ value, route }) {
      const q = value && typeof value.q === "string" ? value.q.trim().slice(0, 100) : "";
      if (q === "") return null;
      const state = { sq: q, sstate: "loading" };
      return route && route.name === "search" ? { state } : { route: { push: "search" }, state };
    },
    // The search page's timer: one search per press, then no timer.
    async stick({ state }) {
      const q = typeof state.sq === "string" ? state.sq : "";
      if (q === "" || state.sstate !== "loading") return null;
      try {
        const out = await searchTitles(q);
        found = { q, items: (Array.isArray(out) ? out : []).slice(0, 60).map(cardOf) };
        rememberFound(found.items);
        return { state: { sstate: "done" } };
      } catch (e) {
        log("browse search", (e && e.code) || "error");
        return { state: { sstate: "fail" } };
      }
    },
    sretry({ state }) { return typeof state.sq === "string" && state.sq !== "" ? { state: { sstate: "loading" } } : null; },
    // The live page's timer: the categories, then the picked one's channels, one load per tick.
    async ltick({ state }) {
      const lq = typeof state.lq === "string" ? state.lq : "";
      if (lq !== "") {
        if (!(liveFound && liveFound.q === lq)) {
          let out = null;
          try { out = live ? await live.search(lq) : null; } catch (e) { log("live search", (e && e.code) || "error"); }
          liveFound = { q: lq, items: liveCards(out && out.items) };
        }
        return { state: { lq } };
      }
      if (!liveTilesList) { await loadLiveTiles(); return { state: { lcat: typeof state.lcat === "string" ? state.lcat : null } }; }
      const cat = typeof state.lcat === "string" ? state.lcat : liveTilesList[0] ? liveTilesList[0].ref : null;
      if (cat === null) { liveChannels.set("", []); return { state: { lcat: null } }; }
      if (!liveChannels.has(cat)) await loadCategory(cat);
      return { state: { lcat: cat } };
    },
    lsearch({ value }) {
      const q = value && typeof value.lq === "string" ? value.lq.trim().slice(0, 100) : "";
      return { state: { lq: q === "" ? null : q } };
    },
    lcat({ value }) { return typeof value === "string" && value !== "" ? { state: { lcat: value } } : null; },
    // The gear: the plugin's settings are a page of their own, one Back away.
    go({ arg }) {
      if (arg === "live") return { route: { push: "live" }, state: { lcat: null } };
      return arg === "settings" ? { route: { push: "settings" }, state: { fromBrowse: true } } : null;
    },
    back({ state, route }) {
      // The settings page opened on its own (from the settings button) closes; pushed from the gear, or the search page, it pops.
      if (route && route.name === "settings" && !state.fromBrowse) return { close: true };
      return { route: { pop: true }, state: { sq: null, sstate: null, lq: null } };
    },
  };

  async function event(ev) {
    const handler = Object.hasOwn(events, ev.name) ? events[ev.name] : null;
    return handler ? (await handler({ ...ev, state: ev.state || {} })) ?? null : null;
  }

  return { view, event, notePlayed };
}
