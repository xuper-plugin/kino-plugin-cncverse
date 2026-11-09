// src/browse/model.js
var TAB_IDS = ["inicio", "catalogos"];
var MAX_SLIDES = 6;
var MAX_RAILS = 8;
var MAX_RAIL_ITEMS = 20;
var MAX_SLIDE_TEXT = 160;
var HTTPS = /^https:\/\//;
function cardOf(item) {
  const out = { id: item.id, ref: item.ref, title: item.title, kind: item.kind };
  const poster = item.poster || item.logo;
  if (poster && HTTPS.test(poster)) out.poster = poster;
  if (item.backdrop && HTTPS.test(item.backdrop)) out.backdrop = item.backdrop;
  if (item.badges) out.badges = item.badges;
  if (item.rating !== void 0) out.rating = item.rating;
  if (item.year !== void 0) out.year = item.year;
  if (item.ids && item.ids.tmdb) out.ids = { tmdb: item.ids.tmdb };
  if (item.adult === true) out.adult = true;
  return out;
}
function slidesOf(rows) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const row of rows) {
    for (const item of row.items) {
      if (out.length >= MAX_SLIDES) return out;
      if (item.adult === true || seen.has(item.id) || !item.backdrop || !HTTPS.test(item.backdrop)) continue;
      const text = typeof item.overview === "string" ? item.overview.trim() : "";
      if (text === "") continue;
      seen.add(item.id);
      out.push({
        id: item.id,
        ref: item.ref,
        kind: item.kind,
        title: item.title,
        image: item.backdrop,
        text: text.length <= MAX_SLIDE_TEXT ? text : `${text.slice(0, MAX_SLIDE_TEXT - 1).trimEnd()}\u2026`
      });
    }
  }
  return out;
}
function railsOf(rows) {
  return rows.filter((r) => r.items && r.items.length > 0).slice(0, MAX_RAILS).map((r) => ({
    id: r.id,
    title: r.title,
    ...r.ref ? { ref: r.ref } : {},
    items: r.items.slice(0, MAX_RAIL_ITEMS).map(cardOf)
  }));
}
function tabOf(page) {
  const rows = page && Array.isArray(page.rows) ? page.rows : [];
  const rails = railsOf(rows);
  if (rails.length === 0) return null;
  return { slides: slidesOf(rows), rails };
}
function playedKey(ref) {
  const r = String(ref || "");
  return r.startsWith("{") && r.length <= 1e3 ? r : "";
}
function recentOf(keys, tabs) {
  if (keys.length === 0) return [];
  const byKey = /* @__PURE__ */ new Map();
  for (const data of tabs) for (const rail2 of data.rails) for (const card2 of rail2.items) if (!byKey.has(card2.ref)) byKey.set(card2.ref, card2);
  const out = [];
  const used = /* @__PURE__ */ new Set();
  for (const key of keys) {
    const card2 = byKey.get(key);
    if (card2 && !used.has(card2.id)) {
      used.add(card2.id);
      out.push(card2);
    }
  }
  return out;
}

// src/browse/words.js
var WORDS = {
  tabHome: ["Inicio", "Home"],
  tabCatalogs: ["Cat\xE1logos", "Catalogs"],
  brWatch: ["Ver", "Watch"],
  brInfo: ["M\xE1s informaci\xF3n", "More info"],
  brRecent: ["Continuar viendo", "Continue watching"],
  brSearch: ["Buscar", "Search"],
  brSearchHint: ["Buscar en CNCVerse", "Search CNCVerse"],
  brSearchTitle: ["Buscar", "Search"],
  brSearchedBefore: ["Buscado recientemente", "Recently searched"],
  brNoResults: ["No encontramos nada con esas palabras.", "Nothing matched those words."],
  brSearchFailed: ["No se pudo buscar. Revisa tu conexi\xF3n e int\xE9ntalo de nuevo.", "The search failed. Check your connection and try again."],
  brFailed: ["No se pudo cargar esta secci\xF3n. Revisa tu conexi\xF3n e int\xE9ntalo de nuevo.", "This section could not be loaded. Check your connection and try again."],
  brRetry: ["Reintentar", "Retry"],
  brEmpty: ["A\xFAn no hay nada aqu\xED.", "Nothing here yet."],
  brBack: ["Atr\xE1s", "Back"],
  brClose: ["Cerrar", "Close"],
  brSettings: ["Configuraci\xF3n", "Settings"],
  brLive: ["En vivo", "Live"],
  brLiveSearchHint: ["Buscar en los canales en vivo", "Search the live channels"],
  brSources: ["Fuentes", "Sources"],
  brSourcesHelp: ["Enciende las que quieras. Una que falla se pausa sola un rato y las dem\xE1s siguen.", "Switch on the ones you want. One that fails pauses itself for a while and the others carry on."],
  brSrcOk: ["responde", "responding"],
  brSrcSlow: ["lenta", "slow"],
  brSrcPaused: ["en pausa {min} min", "paused {min} min"],
  brSrcNotSaved: ["No se pudo guardar la elecci\xF3n (almacenamiento lleno). Vac\xEDa la cach\xE9 en Configuraci\xF3n.", "The choice could not be saved (storage full). Clear the cache in Settings."],
  brSrcNew: ["sin medir todav\xEDa", "not measured yet"],
  brSrcOff: ["apagada", "off"],
  brSrcLive: ["en vivo", "live"],
  brLiveEmpty: ["No hay canales en vivo por ahora.", "No live channels right now."]
};
var both = (key) => ({ es: WORDS[key][0], en: WORDS[key][1] });
var fill = (key, vars = {}) => {
  const f = (s) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] != null ? vars[k] : ""));
  return { es: f(WORDS[key][0]), en: f(WORDS[key][1]) };
};
var KEYS = Object.keys(WORDS);

// src/browse/logo.js
var LOGO_ASPECT = "3.33:1";
var LOGO_DATA = "data:image/png;base64,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";

// src/browse/view.js
var TAB_KEYS = { inicio: "tabHome", catalogos: "tabCatalogs" };
var POLL_MS = 1500;
var SEARCH_CAP = 60;
var twin = (key, field = "text", vars) => {
  const w = both(key, vars);
  return { [field]: w.es, [field + "En"]: w.en };
};
var logo = () => ({
  type: "Image",
  key: "logo",
  url: LOGO_DATA,
  aspect: LOGO_ASPECT,
  fit: "contain",
  h: 40,
  alt: "CNCVerse",
  altEn: "CNCVerse",
  fallback: { type: "Text", text: "CNCVerse", textEn: "CNCVerse", style: "h4" }
});
var tabBar = (active) => ({ type: "TabBar", key: "tabs", divider: false, value: active, onChanged: "tab", tabs: TAB_IDS.map((id) => ({ value: id, ...twin(TAB_KEYS[id], "label") })) });
var railSkeleton = (n) => ({
  type: "Column",
  key: "skel" + n,
  gap: 8,
  children: [
    { type: "Skeleton", shape: "line", width: 120 },
    { type: "Row", gap: 12, sizes: ["compact"], children: [1, 2, 3].map((i) => ({ type: "Skeleton", shape: "card", key: `sk${n}c${i}`, flex: 1 })) },
    { type: "Row", gap: 12, sizes: ["medium", "expanded"], children: [1, 2, 3, 4, 5, 6].map((i) => ({ type: "Skeleton", shape: "card", key: `sk${n}w${i}`, flex: 1 })) }
  ]
});
var gridSkeleton = () => ({
  type: "Column",
  key: "gridSkeleton",
  gap: 12,
  children: [
    ...[1, 2].map((r) => ({ type: "Row", gap: 12, sizes: ["compact"], key: `gc${r}`, children: [1, 2, 3].map((i) => ({ type: "Skeleton", shape: "card", key: `gc${r}-${i}`, flex: 1 })) })),
    ...[1, 2].map((r) => ({ type: "Row", gap: 12, sizes: ["medium", "expanded"], key: `gw${r}`, children: [1, 2, 3, 4, 5, 6].map((i) => ({ type: "Skeleton", shape: "card", key: `gw${r}-${i}`, flex: 1 })) }))
  ]
});
var heroSkeleton = () => ({ type: "Skeleton", key: "heroSkeleton", shape: "block", height: { compact: 200, expanded: 320 } });
var slideNode = (s) => ({
  type: "heroCard",
  key: "slide-" + s.id,
  h: { compact: 200, expanded: 240 },
  ...s.logo ? { logo: s.logo } : {},
  title: s.title,
  text: s.text,
  image: s.image,
  buttons: [
    {
      type: "ElevatedButton",
      key: "watch-" + s.id,
      ...twin("brWatch", "labelText"),
      icon: "play",
      onPressed: { go: { play: { ref: s.ref, kind: s.kind, id: s.id, title: s.title } } }
    },
    {
      type: "TextButton",
      key: "info-" + s.id,
      ...twin("brInfo", "labelText"),
      onPressed: { go: { title: { ref: s.ref, kind: s.kind, id: s.id, title: s.title } } }
    }
  ]
});
var hero = (slides) => slides.length === 1 ? slideNode(slides[0]) : {
  type: "PageView",
  key: "hero" + slides.length,
  autoPlayMs: 6e3,
  children: slides.map(slideNode)
};
var roundChannel = (c, n) => ({
  type: "Column",
  key: "ch-" + n,
  w: 120,
  gap: 8,
  crossAxisAlignment: "center",
  onTap: { go: { play: { ref: c.ref, kind: "live", id: c.id, title: c.title } } },
  children: [
    { type: "CircleAvatar", key: "chl-" + n, radius: 44, ...c.poster ? { image: c.poster } : { text: String(c.title).slice(0, 2).toUpperCase() }, labelText: c.title, labelTextEn: c.title },
    { type: "Text", text: c.title, textEn: c.title, style: "caption", maxLines: 1, textAlign: "center" }
  ]
});
var roundRail = (items, titleOverride) => ({
  type: "Column",
  key: "live",
  gap: 8,
  children: [
    { type: "Text", ...titleOverride, style: "h4" },
    { type: "SingleChildScrollView", key: "liveScroll", direction: "horizontal", children: [{ type: "Row", gap: 24, children: items.slice(0, 20).map(roundChannel) }] }
  ]
});
var rail = (r, key, titleOverride, size = "medium") => ({
  type: "titleRail",
  key,
  ...titleOverride || { title: r.title },
  ...r.ref ? { ref: r.ref } : {},
  items: r.items,
  size
});
function liveView({ tiles, cat, items, query = "", searching = false, device = "phone" }) {
  const tv = device === "tv";
  const liveForm = () => ({
    type: "Form",
    key: "liveSearch",
    onSubmitted: "lsearch",
    gap: 8,
    children: tv ? [{ type: "Row", key: "liveSearchRow", gap: 16, crossAxisAlignment: "center", children: [
      { type: "TextField", key: "lq", kind: "text", value: query, ...twin("brLiveSearchHint", "labelText"), maxLength: 100, weight: 1 },
      { type: "ElevatedButton", key: "lsearchGo", ...twin("brSearch", "labelText"), icon: "search", submit: true }
    ] }] : [
      { type: "TextField", key: "lq", kind: "text", value: query, ...twin("brLiveSearchHint", "labelText"), maxLength: 100 },
      { type: "ElevatedButton", key: "lsearchGo", ...twin("brSearch", "labelText"), icon: "search", submit: true }
    ]
  });
  const body = tv ? [] : [liveForm()];
  if (tiles && tiles.length === 0) body.push({ type: "Text", ...twin("brLiveEmpty", "text"), color: "muted" });
  else if (items && items.length === 0) body.push({ type: "Text", ...twin("brLiveEmpty", "text"), color: "muted" });
  else if (items && device === "tv") body.push({ type: "Row", key: "channels", wrap: true, gap: 24, children: items.slice(0, 40).map(roundChannel) });
  else if (items) body.push({ type: "titleGrid", key: "channels", columns: { compact: 3, expanded: 6 }, items: items.slice(0, SEARCH_CAP) });
  else body.push(gridSkeleton());
  return {
    type: "Scaffold",
    appBar: {
      type: "AppBar",
      mergeWithKinoBar: true,
      dense: true,
      divider: false,
      leading: { type: "IconButton", key: "back", icon: "arrow_back", ...twin("brBack", "labelText"), ...twin("brBack", "tooltip"), onPressed: "back" },
      ...tv ? { title: liveForm() } : twin("brLive", "title")
    },
    body: { type: "Column", key: "livePage", children: [
      ...tiles && tiles.length > 1 && query === "" ? [{ type: "TabBar", key: "genres", divider: false, value: cat, onChanged: "lcat", tabs: tiles.map((t2) => ({ value: t2.ref, label: t2.title, labelEn: t2.title })) }] : [],
      { type: "SingleChildScrollView", key: "live-" + String(cat).replace(/[^A-Za-z0-9_-]/g, "_"), flex: 1, children: [{ type: "Column", padding: { compact: 12, expanded: 24 }, gap: 16, children: body }] }
    ] },
    ...searching || query === "" && (!tiles || !items) ? { every: { ms: 1e3, event: "ltick" } } : {}
  };
}
function browseView({ tab, data, recent, live = [], pending, failed, device = "phone" }) {
  const tv = device === "tv";
  const liveButton = { type: "IconButton", key: "liveButton", icon: "tv", ...twin("brLive", "labelText"), ...twin("brLive", "tooltip"), onPressed: { event: "go", arg: "live" } };
  const gear = { type: "IconButton", key: "settingsButton", icon: "settings", ...twin("brSettings", "labelText"), ...twin("brSettings", "tooltip"), onPressed: { event: "go", arg: "settings" } };
  const active = TAB_IDS.includes(tab) ? tab : TAB_IDS[0];
  const body = [];
  if (data) {
    if (data.slides.length > 0) body.push(hero(data.slides));
    else if (pending) body.push(heroSkeleton());
    if (recent.length > 0) body.push(rail({ items: recent }, "recent", twin("brRecent", "title"), tv ? "small" : "medium"));
    if (live.length > 0) body.push(tv ? roundRail(live, twin("brLive", "text")) : rail({ items: live }, "live", twin("brLive", "title"), tv ? "small" : "medium"));
    for (const r of data.rails) body.push(rail(r, "rail-" + String(r.id).replace(/[^A-Za-z0-9_-]/g, "_"), null, tv ? "small" : "medium"));
    if (data.rails.length === 0) body.push({ type: "Text", ...twin("brEmpty", "text"), color: "muted" });
  } else if (failed) {
    body.push({
      type: "MaterialBanner",
      key: "loadFailed",
      role: "error",
      ...twin("brFailed"),
      action: { ...twin("brRetry", "label"), onTap: "retry" }
    });
  } else {
    body.push(heroSkeleton(), railSkeleton(1), railSkeleton(2), railSkeleton(3));
  }
  return {
    type: "Scaffold",
    appBar: {
      type: "AppBar",
      // One bar instead of two (Kino 0.9.81+; an older Kino draws its own bar above and this one under it): the close button where
      // Kino's was and the plugin's logo where its name was (its name when the logo cannot be drawn), with no line under it.
      mergeWithKinoBar: true,
      dense: true,
      divider: false,
      leading: { type: "IconButton", key: "close", icon: "close", ...twin("brClose", "labelText"), ...twin("brClose", "tooltip"), onPressed: { go: { close: true } } },
      // On a TV the search is a button of the bar (a floating one is hard to reach with a remote); elsewhere it floats.
      actions: tv ? [{ type: "IconButton", key: "searchButton", icon: "search", ...twin("brSearch", "labelText"), ...twin("brSearch", "tooltip"), onPressed: "openSearch" }, liveButton, gear] : [liveButton, gear],
      title: tv ? { type: "Row", key: "titleRow", gap: 24, crossAxisAlignment: "center", children: [logo(), tabBar(active)] } : logo()
    },
    ...tv ? {} : { floatingActionButton: { type: "FloatingActionButton", key: "searchFab", icon: "search", ...twin("brSearch", "tooltip"), onPressed: "openSearch" } },
    // The tabs stay pinned under the bar; only the rows scroll.
    body: { type: "Column", key: "page", children: [
      // The tabs line up with the bar's buttons and the cards below (a wide window and the TV pad their content by 24).
      ...tv ? [] : [{ type: "Column", key: "tabsRow", padding: { compact: 0, expanded: 24 }, children: [tabBar(active)] }],
      { type: "SingleChildScrollView", key: "browse-" + active, flex: 1, children: [{ type: "Column", padding: { compact: 12, expanded: 24 }, gap: 16, children: body }] }
    ] },
    ...pending ? { every: { ms: POLL_MS, event: "tick" } } : {}
  };
}
function sourceStatus(x) {
  const parts = (l) => {
    const out = [];
    if (!x.on) out.push(both("brSrcOff")[l]);
    else if (x.pausedMin > 0) out.push(fill("brSrcPaused", { min: x.pausedMin })[l]);
    else if (!x.ms) out.push(both("brSrcNew")[l]);
    else out.push(both(x.ms > 8e3 ? "brSrcSlow" : "brSrcOk")[l] + " \xB7 " + (x.ms / 1e3).toFixed(1) + " s");
    if (x.live) out.push(both("brSrcLive")[l]);
    return out.join(" \xB7 ");
  };
  return { text: parts("es"), textEn: parts("en") };
}
function sourcesBlock(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return [];
  return [{
    type: "Column",
    key: "sources",
    gap: 12,
    children: [
      { type: "Text", key: "srcTitle", style: "h4", ...twin("brSources") },
      { type: "Text", key: "srcHelp", color: "muted", ...twin("brSourcesHelp") },
      ...sources.slice(0, 60).map((x) => ({
        type: "Column",
        key: "src-" + x.key,
        gap: 4,
        children: [
          { type: "Switch", key: "sw-" + x.key, labelText: x.title, labelTextEn: x.title, value: x.on, onChanged: { event: "toggleSource", arg: x.id } },
          { type: "Text", key: "st-" + x.key, color: "muted", ...sourceStatus(x) }
        ]
      })),
      { type: "Divider", key: "srcEnd" }
    ]
  }];
}
function settingsView({ sources = [] } = {}) {
  return {
    type: "Scaffold",
    appBar: {
      type: "AppBar",
      mergeWithKinoBar: true,
      dense: true,
      divider: false,
      leading: { type: "IconButton", key: "back", icon: "arrow_back", ...twin("brBack", "labelText"), ...twin("brBack", "tooltip"), onPressed: "back" },
      title: logo()
    },
    body: { type: "SingleChildScrollView", key: "settings-page", children: [{ type: "Column", padding: { compact: 12, expanded: 24 }, gap: 16, children: [...sourcesBlock(sources), { type: "settings", key: "form", onSaved: "settingsSaved" }] }] }
  };
}
function searchView({ query, status, items, history = [], device = "phone" }) {
  const tv = device === "tv";
  const searchForm = () => ({
    type: "Form",
    key: "searchForm",
    onSubmitted: "search",
    gap: 8,
    children: tv ? [{ type: "Row", key: "searchRow", gap: 16, crossAxisAlignment: "center", children: [
      { type: "TextField", key: "q", kind: "text", value: query, ...twin("brSearchHint", "labelText"), maxLength: 100, autofocus: true, weight: 1 },
      { type: "ElevatedButton", key: "searchGo", ...twin("brSearch", "labelText"), icon: "search", submit: true }
    ] }] : [
      { type: "TextField", key: "q", kind: "text", value: query, ...twin("brSearchHint", "labelText"), maxLength: 100, autofocus: true },
      { type: "ElevatedButton", key: "searchGo", ...twin("brSearch", "labelText"), icon: "search", submit: true }
    ]
  });
  const body = tv ? [] : [searchForm()];
  if (status === "fail") {
    body.push({ type: "MaterialBanner", key: "searchFailed", role: "error", ...twin("brSearchFailed"), action: { ...twin("brRetry", "label"), onTap: "sretry" } });
  } else if (status === "done" && items) {
    if (items.length === 0) body.push({ type: "Text", ...twin("brNoResults", "text"), color: "muted" });
    else body.push({ type: "titleGrid", key: "results", columns: { compact: 3, expanded: 6 }, items: items.slice(0, SEARCH_CAP) });
  } else if (status !== "idle") {
    body.push(gridSkeleton());
  } else if (history.length > 0) {
    body.push({ type: "Text", ...twin("brSearchedBefore", "text"), style: "h4" });
    body.push({ type: "titleGrid", key: "history", columns: { compact: 3, expanded: 6 }, items: history.slice(0, SEARCH_CAP) });
  }
  return {
    type: "Scaffold",
    appBar: {
      type: "AppBar",
      mergeWithKinoBar: true,
      dense: true,
      divider: false,
      leading: { type: "IconButton", key: "back", icon: "arrow_back", ...twin("brBack", "labelText"), ...twin("brBack", "tooltip"), onPressed: "back" },
      ...tv ? { title: searchForm() } : twin("brSearchTitle", "title")
    },
    body: { type: "SingleChildScrollView", key: "search-page", children: [{ type: "Column", padding: { compact: 12, expanded: 24 }, gap: 16, children: body }] },
    ...status === "loading" ? { every: { ms: 1e3, event: "stick" } } : {}
  };
}

// src/browse/metaCache.js
var KEY = "meta2";
var MAX = 260;
var CALL_MS = 8e3;
var CONCURRENCY = 3;
var HTTPS2 = /^https:\/\//;
function makeMetaCache({ kino: kino2, clock = { now: () => Date.now() } }) {
  const usable = () => {
    try {
      return typeof kino2.meta === "function" && kino2.meta.byTitle === true;
    } catch (_) {
      return false;
    }
  };
  let book = null;
  function read() {
    if (book) return book;
    try {
      const o = JSON.parse(kino2.storage.get(KEY) || "null");
      book = o && typeof o === "object" && !Array.isArray(o) ? o : {};
    } catch (_) {
      book = {};
    }
    return book;
  }
  function write() {
    try {
      const ids = Object.keys(book);
      if (ids.length > MAX) for (const id of ids.slice(0, ids.length - MAX)) delete book[id];
      kino2.storage.set(KEY, JSON.stringify(book));
    } catch (_) {
    }
  }
  function known(id) {
    const e = read()[id];
    if (!e) return {};
    return {
      ...e.t > 0 ? { tmdb: e.t } : {},
      ...e.l && HTTPS2.test(e.l) ? { logo: e.l } : {},
      ...e.b && HTTPS2.test(e.b) && e.o ? { backdrop: e.b, overview: e.o } : {}
    };
  }
  const asked = (id) => Object.hasOwn(read(), id);
  function dress(cards) {
    return cards.map((c) => {
      const k = known(c.id);
      const withId = k.tmdb && !(c.ids && c.ids.tmdb) ? { ...c, ids: { ...c.ids || {}, tmdb: k.tmdb } } : c;
      return k.backdrop && !withId.backdrop ? { ...withId, backdrop: k.backdrop } : withId;
    });
  }
  async function fill2(cards, budgetMs) {
    if (!usable()) return 0;
    const b = read();
    const end = clock.now() + budgetMs;
    let asked2 = 0;
    let stop = false;
    const todo = cards.filter((c) => c && typeof c.id === "string" && !Object.hasOwn(b, c.id) && c.adult !== true && !(c.ids && c.ids.tmdb && c.noLogo));
    let next = 0;
    const worker = async () => {
      while (!stop && next < todo.length) {
        if (clock.now() + CALL_MS > end) return;
        const c = todo[next++];
        const year2 = c.year !== void 0 ? { year: c.year } : {};
        try {
          const a = await kino2.meta({ type: c.kind === "series" ? "series" : "movie", title: c.title, ...year2 });
          b[c.id] = {
            t: a && a.ids && Number.isInteger(a.ids.tmdb) ? a.ids.tmdb : 0,
            l: a && typeof a.logo === "string" ? a.logo : "",
            b: a && typeof a.backdrop === "string" ? a.backdrop : "",
            o: a && typeof a.overview === "string" ? a.overview.slice(0, 160) : ""
          };
          asked2++;
        } catch (e) {
          if (e && e.code === "rate_limited") stop = true;
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (asked2 > 0) write();
    return asked2;
  }
  return { known, asked, dress, fill: fill2, usable };
}

// src/browse/index.js
var TAB_KEY = "browseTab";
var SNAP_PREFIX = "browse1:";
var SNAP_TTL_MS = 7 * 24 * 3600 * 1e3;
var HOME_KEY = "home1";
var SNAP_MAX = 20 * 1024;
var RECENT_KEY = "recent1";
var RECENT_MAX = 12;
var HIST_KEY = "searchHist1";
var HIST_MAX = 24;
var MAX_META_TICKS = 30;
function metaAsk(c) {
  const title = String(c.title).replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim() || String(c.title);
  const y = /\((19|20)\d{2}\)/.exec(String(c.title));
  return { id: c.id, title, kind: c.kind, ...c.adult === true ? { adult: true } : {}, ...y ? { year: parseInt(y[0].slice(1, 5), 10) } : {} };
}
var MAX_LOAD_TRIES = 3;
function makeBrowse({ kino: kino2, loadTab, searchTitles, live = null, warm = null, sources = null }) {
  const meta = makeMetaCache({ kino: kino2 });
  const slidesFrom = (rails) => {
    const out = [];
    for (const r of rails) for (const c of r.items) {
      if (out.length >= 5) return out;
      const k = meta.known(c.id);
      if (!k.backdrop || c.adult === true || out.some((s) => s.id === c.id)) continue;
      out.push({ id: c.id, ref: c.ref, kind: c.kind, title: c.title, image: k.backdrop, text: k.overview, ...k.logo ? { logo: k.logo } : {} });
    }
    return out;
  };
  const uniform = (items) => items.every((i) => i.backdrop) ? items : items.map(({ backdrop, ...rest }) => rest);
  const enrich2 = (data) => data ? {
    slides: data.slides.length > 0 ? data.slides.map((s) => {
      const k = meta.known(s.id);
      return k.logo ? { ...s, logo: k.logo } : s;
    }) : slidesFrom(data.rails),
    rails: data.rails.map((r) => ({ ...r, items: uniform(meta.dress(r.items)) }))
  } : data;
  const metaTries = /* @__PURE__ */ new Map();
  const warmed = /* @__PURE__ */ new Set();
  const memo = /* @__PURE__ */ new Map();
  const log = (...a) => {
    try {
      kino2.log("[cncverse]", ...a);
    } catch (_) {
    }
  };
  const get3 = (k) => {
    try {
      return kino2.storage.get(k);
    } catch (_) {
      return null;
    }
  };
  const set3 = (k, v, opts) => {
    try {
      kino2.storage.set(k, v, opts);
    } catch (_) {
    }
  };
  function readSnap(tab) {
    try {
      const o = JSON.parse(get3(SNAP_PREFIX + tab) || "null");
      return o && Date.now() - o.at < SNAP_TTL_MS && o.data && Array.isArray(o.data.rails) ? o.data : null;
    } catch (_) {
      return null;
    }
  }
  function writeSnap(tab, data) {
    for (let per = 10; per >= 3; per -= 2) {
      const slim2 = { slides: data.slides, rails: data.rails.map((r) => ({ ...r, items: r.items.slice(0, per) })) };
      const text = JSON.stringify({ at: Date.now(), data: slim2 });
      if (text.length <= SNAP_MAX) {
        set3(SNAP_PREFIX + tab, text, { ttlMs: SNAP_TTL_MS });
        return;
      }
    }
  }
  function homeSeed(tab) {
    if (tab !== "inicio") return null;
    try {
      const o = JSON.parse(get3(HOME_KEY) || "null");
      return o && Array.isArray(o.rows) && o.rows.length ? tabOf({ rows: o.rows }) : null;
    } catch (_) {
      return null;
    }
  }
  const stored = () => {
    const t2 = get3(TAB_KEY);
    return TAB_IDS.includes(t2) ? t2 : null;
  };
  const remember2 = (tab) => set3(TAB_KEY, tab);
  function dataOf(tab) {
    if (memo.has(tab)) return memo.get(tab).data;
    const snap = readSnap(tab) || homeSeed(tab);
    if (snap) {
      memo.set(tab, { data: snap, whole: false });
      return snap;
    }
    return null;
  }
  const readKeys = () => {
    try {
      const a = JSON.parse(get3(RECENT_KEY) || "[]");
      return Array.isArray(a) ? a.filter((k) => typeof k === "string") : [];
    } catch (_) {
      return [];
    }
  };
  function notePlayed(ref) {
    try {
      const key = playedKey(ref);
      if (key === "") return;
      const keys = readKeys();
      if (keys[0] === key) return;
      set3(RECENT_KEY, JSON.stringify([key, ...keys.filter((k) => k !== key)].slice(0, RECENT_MAX)));
    } catch (_) {
    }
  }
  const slim = (c) => ({ id: c.id, ref: c.ref, title: c.title, kind: c.kind, ...c.poster ? { poster: c.poster } : {} });
  function readHistory() {
    try {
      const a = JSON.parse(get3(HIST_KEY) || "[]");
      return Array.isArray(a) ? a.filter((c) => c && typeof c.id === "string" && typeof c.ref === "string" && typeof c.title === "string").slice(0, HIST_MAX) : [];
    } catch (_) {
      return [];
    }
  }
  function rememberFound(cards) {
    try {
      const fresh = cards.filter((c) => c.adult !== true).slice(0, 12).map(slim);
      const ids = new Set(fresh.map((c) => c.id));
      set3(HIST_KEY, JSON.stringify([...fresh, ...readHistory().filter((c) => !ids.has(c.id))].slice(0, HIST_MAX)));
    } catch (_) {
    }
  }
  const CHANNELS_CAP = 60;
  let liveRow = null;
  let liveTilesList = null;
  let liveFound = null;
  const liveChannels2 = /* @__PURE__ */ new Map();
  const liveCards = (items) => (Array.isArray(items) ? items : []).filter((i) => i && typeof i.id === "string" && typeof i.ref === "string").slice(0, CHANNELS_CAP).map((i) => cardOf({ ...i, kind: "live" }));
  async function loadLiveTiles() {
    let tiles = [];
    try {
      tiles = live ? await live.categories() : [];
    } catch (_) {
      tiles = [];
    }
    liveTilesList = (Array.isArray(tiles) ? tiles : []).filter((t2) => t2 && typeof t2.id === "string" && typeof t2.title === "string").map((t2) => ({ ref: t2.id, title: t2.title }));
  }
  async function loadCategory(cat) {
    let page = null;
    try {
      page = await live.channels(cat);
    } catch (e) {
      log("live page", e && e.code || "error");
    }
    liveChannels2.set(cat, liveCards(page && page.items));
  }
  async function loadLiveRow() {
    try {
      if (!liveTilesList) await loadLiveTiles();
      liveRow = [];
      const t0 = Date.now();
      for (const tile of (liveTilesList || []).slice(0, 3)) {
        if (Date.now() - t0 > 6e3) break;
        if (!liveChannels2.has(tile.ref)) await loadCategory(tile.ref);
        const got = liveChannels2.get(tile.ref) || [];
        if (got.length > 0) {
          liveRow = got.slice(0, 20);
          break;
        }
      }
    } catch (e) {
      log("live row", e && e.code || "error");
      liveRow = [];
    }
  }
  let found = null;
  const tabFromArgs = (route2) => {
    const a = route2 && route2.args && typeof route2.args === "object" ? route2.args : {};
    return TAB_IDS.includes(a.tab) ? a.tab : null;
  };
  function needed(tab, device) {
    const order = [tab, ...TAB_IDS.filter((t2) => t2 !== tab)];
    return order.filter((t2, i) => (i === 0 || device !== "tv") && !(memo.get(t2) && memo.get(t2).whole));
  }
  function view(ctx) {
    const st = ctx.state && typeof ctx.state === "object" ? ctx.state : {};
    if (ctx.route && ctx.route.name === "settings") return settingsView({ sources: sources ? sources.list() : [] });
    if (ctx.route && ctx.route.name === "live") {
      const cat = typeof st.lcat === "string" ? st.lcat : liveTilesList && liveTilesList[0] ? liveTilesList[0].ref : null;
      const lq = typeof st.lq === "string" ? st.lq : "";
      if (lq !== "") {
        const done = liveFound && liveFound.q === lq;
        return liveView({ tiles: liveTilesList, cat, items: done ? liveFound.items : null, query: lq, searching: !done, device: ctx.device });
      }
      return liveView({ tiles: liveTilesList, cat, items: cat && liveChannels2.has(cat) ? liveChannels2.get(cat) : null, device: ctx.device });
    }
    if (ctx.route && ctx.route.name === "search") {
      const query = typeof st.sq === "string" ? st.sq : "";
      const items = found && found.q === query ? found.items : null;
      const status = query === "" ? "idle" : st.sstate === "fail" ? "fail" : items ? "done" : "loading";
      return searchView({ query, status, items, history: query === "" ? readHistory() : [], device: ctx.device });
    }
    const tab = TAB_IDS.includes(st.tab) ? st.tab : tabFromArgs(ctx.route) ?? stored() ?? TAB_IDS[0];
    const data = enrich2(dataOf(tab));
    const loaded = TAB_IDS.map((t2) => memo.get(t2)).filter(Boolean).map((m) => m.data);
    const pending = Array.isArray(st.pending) && st.pending.length > 0;
    return browseView({ tab, data, recent: uniform(meta.dress(recentOf(readKeys(), loaded))), live: liveRow || [], pending, failed: !!(st.failed && st.failed[tab]), device: ctx.device });
  }
  async function load(tab) {
    const page = await loadTab(tab);
    const data = tabOf(page);
    if (data) {
      memo.set(tab, { data, whole: true });
      writeSnap(tab, data);
    }
    return data !== null;
  }
  const loadTries = /* @__PURE__ */ new Map();
  function failLoad(tab, rest, failed) {
    const n = (loadTries.get(tab) || 0) + 1;
    loadTries.set(tab, n);
    if (n < MAX_LOAD_TRIES) rest.push(tab);
    else {
      failed[tab] = true;
      loadTries.delete(tab);
    }
  }
  const events = {
    open({ route: route2, state, device }) {
      const tab = tabFromArgs(route2) ?? (TAB_IDS.includes(state.tab) ? state.tab : stored() ?? TAB_IDS[0]);
      for (const t2 of TAB_IDS) dataOf(t2);
      const list = needed(tab, device);
      return { state: { tab, pending: live && liveRow === null ? [...list.slice(0, 1), "live", ...list.slice(1)] : list, failed: null } };
    },
    tab({ value, arg, state }) {
      const tab = TAB_IDS.includes(value) ? value : TAB_IDS.includes(arg) ? arg : null;
      if (!tab) return null;
      remember2(tab);
      dataOf(tab);
      const failed = { ...state.failed || {} };
      delete failed[tab];
      const pending = [tab, ...Array.isArray(state.pending) ? state.pending.filter((t2) => t2 !== tab) : []];
      return { state: { tab, pending: memo.get(tab) && memo.get(tab).whole ? pending.slice(1) : pending, failed } };
    },
    retry({ state, device }) {
      const tab = TAB_IDS.includes(state.tab) ? state.tab : TAB_IDS[0];
      return { state: { failed: null, pending: [tab, ...needed(tab, device).filter((t2) => t2 !== tab)] } };
    },
    async tick({ state }) {
      const pending = Array.isArray(state.pending) ? state.pending : [];
      if (pending.length === 0) return null;
      const [next, ...rest] = pending;
      const failed = { ...state.failed || {} };
      if (next.startsWith("meta:")) {
        const tabId = next.slice(5);
        const m = memo.get(tabId);
        if (!m) return { state: { pending: rest } };
        const cards = [...m.data.slides, ...m.data.rails.flatMap((r) => r.items.slice(0, 6)), ...m.data.rails.flatMap((r) => r.items.slice(6))];
        const asked = await meta.fill(cards.map(metaAsk), 12e3);
        if (warm) {
          const fresh = m.data.rails.flatMap((r) => r.items.slice(0, 3)).filter((c) => !warmed.has(c.id)).slice(0, 3);
          for (const c of fresh) warmed.add(c.id);
          try {
            await warm(fresh);
          } catch (_) {
          }
        }
        const made = slidesFrom(m.data.rails);
        if (made.length > m.data.slides.length) {
          m.data = { ...m.data, slides: made.map(({ logo: logo2, ...rest2 }) => rest2) };
          writeSnap(tabId, m.data);
        }
        const tries = (metaTries.get(tabId) || 0) + 1;
        metaTries.set(tabId, tries);
        if (asked > 0 && tries < MAX_META_TICKS && cards.some((c) => !meta.asked(c.id))) return { state: { pending: [next, ...rest] } };
        return { state: { pending: rest } };
      }
      if (next === "live") {
        await loadLiveRow();
        return { state: { pending: rest } };
      }
      try {
        const ok = await load(next);
        if (!ok) failLoad(next, rest, failed);
        else delete failed[next];
        if (ok && meta.usable()) rest.unshift("meta:" + next);
      } catch (e) {
        log("browse tab", e && e.code || "error");
        failLoad(next, rest, failed);
      }
      return { state: { pending: rest, failed } };
    },
    // The floating button: straight to the search page, empty and ready for the words.
    openSearch() {
      return { route: { push: "search" }, state: { sq: "", sstate: null } };
    },
    search({ value, route: route2 }) {
      const q = value && typeof value.q === "string" ? value.q.trim().slice(0, 100) : "";
      if (q === "") return null;
      const state = { sq: q, sstate: "loading" };
      return route2 && route2.name === "search" ? { state } : { route: { push: "search" }, state };
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
        log("browse search", e && e.code || "error");
        return { state: { sstate: "fail" } };
      }
    },
    sretry({ state }) {
      return typeof state.sq === "string" && state.sq !== "" ? { state: { sstate: "loading" } } : null;
    },
    // The live page's timer: the categories, then the picked one's channels, one load per tick.
    async ltick({ state }) {
      const lq = typeof state.lq === "string" ? state.lq : "";
      if (lq !== "") {
        if (!(liveFound && liveFound.q === lq)) {
          let out = null;
          try {
            out = live ? await live.search(lq) : null;
          } catch (e) {
            log("live search", e && e.code || "error");
          }
          liveFound = { q: lq, items: liveCards(out && out.items) };
        }
        return { state: { lq } };
      }
      if (!liveTilesList) {
        await loadLiveTiles();
        return { state: { lcat: typeof state.lcat === "string" ? state.lcat : null } };
      }
      const cat = typeof state.lcat === "string" ? state.lcat : liveTilesList[0] ? liveTilesList[0].ref : null;
      if (cat === null) {
        liveChannels2.set("", []);
        return { state: { lcat: null } };
      }
      if (!liveChannels2.has(cat)) await loadCategory(cat);
      return { state: { lcat: cat } };
    },
    lsearch({ value }) {
      const q = value && typeof value.lq === "string" ? value.lq.trim().slice(0, 100) : "";
      return { state: { lq: q === "" ? null : q } };
    },
    lcat({ value }) {
      return typeof value === "string" && value !== "" ? { state: { lcat: value } } : null;
    },
    // The settings form saved (the catalog mode may have changed): draw the switches again.
    settingsSaved({ state }) {
      return { state: { srcRev: (Number(state.srcRev) || 0) + 1 } };
    },
    // A switch of the sources page: picking one freezes what the others are now, and moves the mode to "custom".
    toggleSource({ arg, value, state }) {
      if (!sources || typeof arg !== "string") return null;
      if (!sources.toggle(arg, value !== false)) return { toast: both("brSrcNotSaved"), state: { srcRev: (Number(state.srcRev) || 0) + 1 } };
      return { config: { srcMode: "custom" }, state: { srcRev: (Number(state.srcRev) || 0) + 1 } };
    },
    // The gear: the plugin's settings are a page of their own, one Back away.
    go({ arg }) {
      if (arg === "live") return { route: { push: "live" }, state: { lcat: null } };
      return arg === "settings" ? { route: { push: "settings" }, state: { fromBrowse: true } } : null;
    },
    back({ state, route: route2 }) {
      if (route2 && route2.name === "settings" && !state.fromBrowse) return { close: true };
      return { route: { pop: true }, state: { sq: null, sstate: null, lq: null } };
    }
  };
  async function event(ev) {
    const handler = Object.hasOwn(events, ev.name) ? events[ev.name] : null;
    return handler ? await handler({ ...ev, state: ev.state || {} }) ?? null : null;
  }
  return { view, event, notePlayed };
}

// src/robust/budget.js
function makeBudget(ms) {
  const end = Date.now() + ms;
  return {
    end,
    /** Ms left (negative once over). */
    left: () => end - Date.now(),
    /** A request's timeout: at most [max], at most what is left less [reserve], never under [min]. */
    cap: (max, reserve = 0, min = 0) => Math.max(min, Math.min(max, end - Date.now() - reserve)),
    /** True when a request of at least [needed] ms no longer fits. */
    short: (needed) => end - Date.now() < needed
  };
}
async function withTime(ms, work) {
  if (ms < 1e3) return null;
  let timedOut = false;
  const stop = kino.sleep(ms).then(() => {
    timedOut = true;
    return null;
  });
  const out = await Promise.race([Promise.resolve(work).catch(() => null), stop]);
  return timedOut ? null : out;
}

// src/robust/store.js
var DAY_MS = 24 * 60 * 60 * 1e3;
var get = (k) => {
  try {
    return kino.storage.get(k);
  } catch {
    return null;
  }
};
var set = (k, v, opts) => {
  try {
    kino.storage.set(k, v, opts);
  } catch {
  }
};
var readObject = (k) => {
  try {
    const o = JSON.parse(get(k) || "{}");
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
};
var HEALTH_KEY = "rb_health";
var DOWN_AFTER = 3;
var readHealth = () => readObject(HEALTH_KEY);
function recordHealth(ok) {
  const prev = readHealth();
  const fails = ok ? 0 : (Number.isFinite(prev.fails) ? prev.fails : 0) + 1;
  set(HEALTH_KEY, JSON.stringify({ ok, fails, at: Date.now() }));
  try {
    if (fails === DOWN_AFTER) kino.log.report("cncverse:down", "server");
  } catch {
  }
}
var BREAKER_KEY = "rb_breaker";
var BREAKER_AFTER = 2;
var STEPS_MIN = [10, 30, 120, 360];
function readBreaker() {
  const out = {};
  for (const [k, v] of Object.entries(readObject(BREAKER_KEY))) if (v && Number.isFinite(v.n) && Number.isFinite(v.until)) out[k] = { n: v.n, until: v.until };
  return out;
}
function noteCatalog(id, ok, scope = "play") {
  if (!id) return;
  const key = scope + ":" + id;
  const all = readBreaker();
  if (ok) delete all[key];
  else {
    const n = (all[key] && all[key].n || 0) + 1;
    const step = STEPS_MIN[Math.min(Math.max(0, n - BREAKER_AFTER), STEPS_MIN.length - 1)];
    all[key] = { n, until: n >= BREAKER_AFTER ? Date.now() + step * 6e4 : 0 };
  }
  set(BREAKER_KEY, JSON.stringify(all), { ttlMs: DAY_MS });
}
function pausedFor(id, all, scope) {
  const br = all || readBreaker();
  let left = 0;
  for (const sc of scope ? [scope] : ["play", "search"]) {
    const e = br[sc + ":" + id];
    if (e && e.n >= BREAKER_AFTER && e.until > Date.now()) left = Math.max(left, e.until - Date.now());
  }
  return left;
}
var isPaused = (id, all, scope) => pausedFor(id, all, scope) > 0;
function resetBreaker() {
  try {
    kino.storage.remove(BREAKER_KEY);
  } catch {
  }
}
function healthyOnly(list, scope) {
  const br = readBreaker();
  const ok = list.filter((c) => !isPaused(c.id, br, scope));
  return ok.length ? ok : list;
}
var LAT_KEY = "rb_latency";
var LATENCY_UNKNOWN_MS = 5e3;
var readLatency = () => readObject(LAT_KEY);
function noteLatency(id, ms) {
  const all = readLatency();
  const prev = Number(all[id]);
  all[id] = Math.round(Number.isFinite(prev) && prev > 0 ? prev * 0.6 + ms * 0.4 : ms);
  set(LAT_KEY, JSON.stringify(all), { ttlMs: 7 * DAY_MS });
}
function byLatency(list) {
  const lat = readLatency();
  const ms = (c) => lat[c.id] || LATENCY_UNKNOWN_MS;
  return list.slice().sort((a, b) => ms(a) - ms(b));
}
var PICKS_KEY = "rb_picks";
function readPicks() {
  const out = {};
  for (const [k, v] of Object.entries(readObject(PICKS_KEY))) if (typeof v === "boolean") out[k] = v;
  return out;
}
function writePicks(map) {
  const text = JSON.stringify(map);
  set(PICKS_KEY, text);
  return get(PICKS_KEY) === text;
}
var sourceMode = () => String(kino.config.get("srcMode") || "all") === "custom" ? "custom" : "all";
function isOn(cat) {
  if (sourceMode() !== "custom") return true;
  const picks = readPicks();
  const ids = manifestIds();
  if (ids.length > 0 && ids.every((id) => picks[id] === false)) return true;
  return typeof picks[cat.id] === "boolean" ? picks[cat.id] : true;
}
var idsMemo = { raw: null, ids: [] };
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

// src/robust/index.js
var BATCH = 500;
var KEEP_MAX = 4e4;
var DATA_MAX = 3600;
var PRUNE_STEP = 500;
var available = () => typeof kino.catalog === "object" && kino.catalog !== null;
function clip(text, max) {
  let s = String(text).slice(0, max);
  if (/[\uD800-\uDBFF]$/.test(s)) s = s.slice(0, -1);
  return s;
}
function bytes(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 128) n += 1;
    else if (c < 2048) n += 2;
    else if (c >= 55296 && c <= 56319) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}
function rowOf(item, catId, now, before) {
  if (!item || !item.id || !item.ref || !item.title || item.kind === "live" || item.adult === true) return null;
  const cats = [catId, ...catsOf(before).filter((c) => c !== catId)].slice(0, 4);
  const data = { r: item.ref, k: item.kind === "series" ? "s" : "m", c: cats };
  if (item.poster) data.p = item.poster;
  if (item.year) data.y = item.year;
  if (bytes(JSON.stringify(data)) > DATA_MAX) return null;
  return { id: String(item.id).slice(0, 128), title: clip(item.title, 300), sort: now, data };
}
function catsOf(row) {
  const c = row && row.data && row.data.c;
  return Array.isArray(c) ? c.filter((x) => typeof x === "string") : typeof c === "string" ? [c] : [];
}
async function indexItems(items, catId) {
  if (!available() || !items.length) return;
  const now = Date.now();
  const write = async () => {
    for (let i = 0; i < items.length; i += BATCH) {
      const slice = items.slice(i, i + BATCH);
      const known = /* @__PURE__ */ new Map();
      for (const row of await kino.catalog.get(slice.map((it) => String(it.id).slice(0, 128)))) known.set(row.id, row);
      const rows = slice.map((it) => rowOf(it, catId, now, known.get(String(it.id).slice(0, 128)))).filter(Boolean);
      if (rows.length) await kino.catalog.upsert(rows);
    }
  };
  try {
    await write();
    if (Math.random() < 0.1) await prune(0);
  } catch (e) {
    if (e && e.code === "limit") {
      try {
        await prune(PRUNE_STEP * 2);
        await write();
      } catch (e2) {
        kino.log("index full and not freed: " + (e2 && e2.message));
      }
      return;
    }
    kino.log("index not written: " + (e && e.message));
  }
}
async function prune(atLeast) {
  const excess = Math.max(atLeast, await kino.catalog.count() - KEEP_MAX);
  for (let left = excess; left > 0; left -= 100) {
    const { items } = await kino.catalog.search({ order: "oldest", limit: Math.min(100, left) });
    if (!items.length) return;
    await kino.catalog.remove(items.map((r) => r.id));
  }
}
function itemOf(row) {
  const d = row.data || {};
  if (typeof d.r !== "string") return null;
  const item = { id: row.id, ref: d.r, title: row.title, kind: d.k === "s" ? "series" : "movie" };
  if (d.p) item.poster = d.p;
  if (d.y) item.year = d.y;
  return item;
}
async function searchIndex(q, { only, onKeys, limit = 60 } = {}) {
  if (!available()) return [];
  try {
    const out = [];
    for (let offset = 0; out.length < limit && offset < 400; offset += 100) {
      const page = await kino.catalog.search({ q: String(q).slice(0, 256), limit: 100, offset, order: "newest" });
      for (const row of page.items) {
        const cats = catsOf(row);
        const cat = only ? cats.find((c) => c === only) : onKeys ? cats.find((c) => onKeys.has(c)) : cats[0];
        if (!cat) continue;
        const it = itemOf(row);
        if (it) out.push({ item: it, cat, cats });
        if (out.length >= limit) break;
      }
      if (offset + page.items.length >= page.total) break;
    }
    return out;
  } catch (e) {
    kino.log("index not read: " + (e && e.message));
    return [];
  }
}
async function indexGet(id) {
  if (!available()) return null;
  try {
    const [row] = await kino.catalog.get([String(id).slice(0, 128)]);
    if (!row) return null;
    const d = row.data || {};
    return { title: row.title, cat: catsOf(row)[0] || "", kind: d.k === "s" ? "series" : "movie", year: Number(d.y) || 0 };
  } catch {
    return null;
  }
}
async function indexRemove(id) {
  if (!available()) return;
  try {
    await kino.catalog.remove([String(id).slice(0, 128)]);
  } catch {
  }
}
async function indexSize() {
  if (!available()) return 0;
  try {
    return await kino.catalog.count();
  } catch {
    return 0;
  }
}
async function clearIndex() {
  if (available()) await kino.catalog.clear();
}

// src/robust/rank.js
var get2 = (k) => {
  try {
    return kino.storage.get(k);
  } catch {
    return null;
  }
};
var set2 = (k, v, ttlMs) => {
  try {
    kino.storage.set(k, v, { ttlMs });
  } catch {
  }
};
function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}
var lineOf = (title, emoji) => {
  const l = String(title || "").split("\n").find((x) => x.startsWith(emoji));
  return l ? l.slice(emoji.length).trim() : "";
};
function describe(s) {
  const text = String(s.name || "") + " " + String(s.title || "");
  const q = /(2160|1440|1080|720|480|360)p/i.exec(text) || (/\b4k\b/i.test(text) ? [null, "2160"] : null);
  const size = /(\d+(?:\.\d+)?)\s*(GB|MB)\b/i.exec(lineOf(s.title, "\u{1F4BE}") || String(s.title || ""));
  return { quality: q ? parseInt(q[1], 10) : 0, gb: size ? parseFloat(size[1]) / (size[2].toUpperCase() === "MB" ? 1024 : 1) : 0 };
}
function qualityRank(q, pref) {
  if (pref === "max") return -q;
  const cap = pref === "720" ? 720 : 1080;
  const v = q || cap;
  return v <= cap ? cap - v : 1e5 + (v - cap);
}
function tierOf(url, prefer) {
  if (/^http:\/\//i.test(url)) return 3;
  const hlsFirst = prefer === "hls";
  if (/\.m3u8(\?|$)/i.test(url)) return hlsFirst ? 0 : 1;
  if (/\.(mkv|mp4|webm)(\?|$)/i.test(url)) return hlsFirst ? 1 : 0;
  return 2;
}
function fileKey(url) {
  const path = String(url).split("?")[0];
  return hostOf(url) + ":" + path.slice(path.lastIndexOf("/") + 1).slice(0, 40);
}
var SERVED_PREFIX = "rb_served:";
var BAD_KEY = "rb_bad";
var REOPEN_WINDOW_MS = 2 * 60 * 1e3;
var BAD_FOR_MS = 10 * 60 * 1e3;
var BAD_MAX = 40;
function readBad() {
  try {
    const raw = JSON.parse(get2(BAD_KEY) || "{}");
    const now = Date.now();
    const out = {};
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [k, until] of Object.entries(raw)) if (Number(until) > now) out[k] = Number(until);
    }
    return out;
  } catch {
    return {};
  }
}
function writeBad(bad) {
  const entries = Object.entries(bad).sort((a, b) => b[1] - a[1]).slice(0, BAD_MAX);
  set2(BAD_KEY, JSON.stringify(Object.fromEntries(entries)), BAD_FOR_MS);
}
function rank(usable, ref, options, hash2) {
  const pref = String(kino.config.get("quality") || "1080");
  const prefer = String(kino.config.get("prefer") || "file");
  const capGb = parseFloat(String(kino.config.get("maxSize") || "10")) || 0;
  const bad = readBad();
  const servedKey = SERVED_PREFIX + hash2(ref);
  let prev = null;
  try {
    prev = JSON.parse(get2(servedKey) || "null");
  } catch {
    prev = null;
  }
  const now = Date.now();
  const reopened = options && options.retry || prev && typeof prev.t === "number" && now - prev.t < REOPEN_WINDOW_MS;
  if (reopened && prev && prev.key) {
    bad[prev.key] = now + BAD_FOR_MS;
    writeBad(bad);
  }
  const scope = hash2(ref);
  const rows = usable.map((s, index) => ({ s, index, key: scope + "|" + fileKey(s.url), ...describe(s), tier: tierOf(s.url, prefer) }));
  const heavy = (x) => capGb > 0 && x.gb > capGb ? 1 : 0;
  rows.sort(
    (a, b) => (bad[a.key] ? 1 : 0) - (bad[b.key] ? 1 : 0) || heavy(a) - heavy(b) || qualityRank(a.quality, pref) - qualityRank(b.quality, pref) || a.tier - b.tier || (a.gb || 99) - (b.gb || 99) || a.index - b.index
  );
  if (rows.length) set2(servedKey, JSON.stringify({ t: now, key: rows[0].key }), BAD_FOR_MS);
  return rows.map((r) => r.s);
}

// src/plugin.js
var BASE = "https://cncverse.dpdns.org";
var TEXTS = {
  es: {
    timeout: "El servidor no responde. Int\xE9ntalo de nuevo en un momento.",
    network: "No se pudo conectar con el servidor.",
    server: "El servidor respondi\xF3 {status}.",
    notStremio: "El servidor no respondi\xF3 con el formato esperado.",
    noStreams: "Este t\xEDtulo no tiene fuentes disponibles ahora.",
    noChannel: "Este canal no est\xE1 disponible ahora.",
    drmOnly: "Este canal solo se ofrece con una protecci\xF3n que este reproductor no admite.",
    notYet: "Esta transmisi\xF3n todav\xEDa no empieza.",
    unknownRef: "Referencia desconocida.",
    ok: "Conectado: {catalogs} cat\xE1logos. Contenido y reproducci\xF3n comprobados.",
    stepManifest: "No se pudo leer el manifiesto del servidor: {detail}",
    stepCatalog: "El manifiesto est\xE1 bien, pero fall\xF3 un cat\xE1logo: {detail}",
    stepMeta: "Los cat\xE1logos est\xE1n bien, pero fall\xF3 la ficha de un t\xEDtulo: {detail}",
    stepStream: "La ficha est\xE1 bien, pero fall\xF3 la reproducci\xF3n de un t\xEDtulo: {detail}",
    unchecked: "Sin comprobar",
    offline: "Sin conexi\xF3n: {detail}",
    online: "Conectado: {catalogs} cat\xE1logos",
    movieEpisode: "Pel\xEDcula",
    warming: "El servidor est\xE1 preparando esta lista. Vuelve a abrirla en un momento.",
    warmingVideo: "El servidor est\xE1 buscando el video (puede tardar la primera vez). Vuelve a intentarlo en un momento.",
    revoked: "El servidor ya no atiende esta direcci\xF3n.",
    indexStatus: "{n} t\xEDtulos",
    sourcesStatus: "{on} activos de {all}, {paused} en pausa",
    resumed: "Listo: los cat\xE1logos en pausa vuelven a intentarse",
    indexCleared: "Listo: se vaci\xF3 el \xEDndice de b\xFAsqueda",
    cacheCleared: "Listo: se vaci\xF3 la cach\xE9"
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
    cacheCleared: "Done: the cache is empty"
  }
};
function t(key, vars) {
  const lang = String(kino.lang || "").toLowerCase().startsWith("es") ? "es" : "en";
  const tpl = TEXTS[lang][key] || TEXTS.es[key] || key;
  return vars ? tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] != null ? vars[k] : "")) : tpl;
}
function enc(s) {
  return encodeURIComponent(String(s));
}
function route(path) {
  return path.split("/").slice(0, 3).join("/");
}
var INFLIGHT = /* @__PURE__ */ new Map();
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
    r = await kino.fetch(BASE + path, { timeoutMs: timeoutMs || 12e3 });
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
async function pool(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      try {
        out[i] = await fn(list[i], i);
      } catch {
        out[i] = void 0;
      }
    }
  };
  const workers = [];
  for (let w = 0; w < Math.min(limit, list.length); w++) workers.push(worker());
  await Promise.all(workers);
  return out;
}
var MEM = /* @__PURE__ */ new Map();
var TTL_PAGE = 10 * 60 * 1e3;
var MANIFEST_KEY = "m2";
var TTL_MANIFEST = 60 * 60 * 1e3;
function normalizeManifest(m) {
  if (!m || typeof m !== "object" || !Array.isArray(m.catalogs)) throw kino.error("unavailable", "no catalogs", { userMessage: t("notStremio") });
  const resources = (m.resources || []).map((r) => typeof r === "string" ? r : r && r.name).filter(Boolean);
  const catalogs = [];
  for (const c of m.catalogs) {
    if (!c || !c.id || !c.type) continue;
    const extra = Array.isArray(c.extra) ? c.extra : [];
    const required = extra.filter((e) => e && e.isRequired).map((e) => e.name);
    const genreExtra = extra.find((e) => e && e.name === "genre");
    const genres = Array.isArray(genreExtra && genreExtra.options) ? genreExtra.options.filter((o) => typeof o === "string" && o.trim()).map((o) => o.trim().slice(0, 60)).slice(0, 24) : [];
    catalogs.push({
      id: String(c.id),
      type: String(c.type),
      name: String(c.name || c.id),
      search: extra.some((e) => e && e.name === "search"),
      genres,
      // A catalog that only answers with a required filter (a search-only one, say) cannot fill a row.
      browsable: required.length === 0
    });
  }
  return { resources, catalogs };
}
function staleManifest() {
  try {
    const raw = kino.storage.get(MANIFEST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function manifestNow() {
  const s = staleManifest();
  return s && s.v && Array.isArray(s.v.catalogs) ? s.v : null;
}
async function loadManifest(fresh, capMs) {
  const stale = staleManifest();
  if (!fresh && stale && Date.now() - stale.at < TTL_MANIFEST) return stale.v;
  try {
    const v = normalizeManifest(await getJson("/manifest.json", capMs || (stale && !fresh ? 6e3 : 12e3)));
    try {
      kino.storage.set(MANIFEST_KEY, JSON.stringify({ at: Date.now(), v }));
    } catch {
    }
    recordHealth(true);
    return v;
  } catch (e) {
    recordHealth(false);
    if (stale && !fresh) return stale.v;
    throw e;
  }
}
function isLiveType(type) {
  return type === "tv" || type === "channel";
}
var VISUAL = /[\u{1F000}-\u{1FFFF}☀-➿️‍]/gu;
var BLANK = /^[\s⠀​-‍﻿]*$/;
function catalogTitle(cat) {
  let name = cat.name.replace(VISUAL, "").replace(/\s+/g, " ").trim();
  const m = /\s*\(([^)]+)\)$/.exec(name);
  if (m && m[1].toLowerCase() === cat.type.toLowerCase()) name = name.slice(0, m.index).trim();
  return (name || cat.id).slice(0, 100);
}
var KINDS_KEY = "k1";
var MAX_KINDS = 1500;
var TTL_KINDS = 30 * 24 * 60 * 60 * 1e3;
var KINDS = null;
var KINDS_DIRTY = false;
function kinds() {
  if (!KINDS) {
    try {
      KINDS = JSON.parse(kino.storage.get(KINDS_KEY) || "{}");
    } catch {
      KINDS = {};
    }
    if (!KINDS || typeof KINDS !== "object") KINDS = {};
  }
  return KINDS;
}
function remember(key, name, isSeries, year2) {
  const k = kinds();
  delete k[key];
  k[key] = [String(name || "").slice(0, 120), isSeries ? 1 : 0, Number(year2) || 0];
  KINDS_DIRTY = true;
}
function flushKinds() {
  flushCats();
  if (!KINDS_DIRTY) return;
  const k = kinds();
  const keys = Object.keys(k);
  for (let i = 0; i < keys.length - MAX_KINDS; i++) delete k[keys[i]];
  try {
    kino.storage.set(KINDS_KEY, JSON.stringify(k), { ttlMs: TTL_KINDS });
  } catch {
  }
  KINDS_DIRTY = false;
}
var CATS_KEY = "rb_cats";
var MAX_CATS = 600;
var CATS = null;
var CATS_DIRTY = false;
function catsMemo() {
  if (!CATS) {
    try {
      CATS = JSON.parse(kino.storage.get(CATS_KEY) || "null");
    } catch {
      CATS = null;
    }
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
  try {
    kino.storage.set(CATS_KEY, JSON.stringify(memo), { ttlMs: TTL_KINDS });
  } catch {
  }
  CATS_DIRTY = false;
}
function hash(s) {
  let a = 2166136261;
  let b = 5381;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619) >>> 0;
    b = Math.imul(b, 33) + c >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}
function safeId(raw) {
  return String(raw).replace(/[^A-Za-z0-9._~-]/g, "-").slice(0, 120) || "x";
}
function makeRef(t_, i, extra) {
  return JSON.stringify(Object.assign({ t: t_, i }, extra || {}));
}
function parseRef(ref) {
  try {
    const r = JSON.parse(String(ref));
    if (r && typeof r.t === "string" && (typeof r.i === "string" || r.c && r.n)) return r;
  } catch {
  }
  throw kino.error("not_found", "bad ref", { userMessage: t("unknownRef") });
}
function httpUrl(v) {
  return typeof v === "string" && /^https?:\/\//.test(v) && v.length <= 2048 ? v : void 0;
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
  return r >= 0 && r <= 10 ? r : void 0;
}
function genresOf(meta) {
  const g = Array.isArray(meta.genres) ? meta.genres : [];
  const out = g.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim().slice(0, 30)).slice(0, 5);
  return out.length ? out : void 0;
}
function idsOf(meta) {
  const ids = {};
  const imdb = [meta.imdb_id, meta.id, (/\/(tt\d{5,10})\//.exec(String(meta.logo || "")) || [])[1]].find((x) => /^tt\d{5,10}$/.test(String(x || "")));
  if (imdb) ids.imdb = imdb;
  const tmdb = num(meta.moviedb_id || meta.tmdb_id);
  if (tmdb > 0) ids.tmdb = tmdb;
  return Object.keys(ids).length ? ids : void 0;
}
function seriesInfo(meta) {
  const runtime = num(meta.runtime);
  return {
    title: meta.name ? String(meta.name).slice(0, 200) : void 0,
    poster: httpUrl(meta.poster),
    backdrop: httpUrl(meta.background),
    overview: meta.description ? String(meta.description) : void 0,
    genres: genresOf(meta),
    year: year(meta) || void 0,
    rating: ratingOf(meta),
    ids: idsOf(meta),
    runtimeMinutes: runtime >= 1 && runtime <= 1e3 ? runtime : void 0
  };
}
var PAGE = 100;
var DEADLINE_MS = 9e3;
var HOME_BUDGET_MS = 15500;
var ENRICH_BUDGET = 24;
function catalogPath(cat, extras) {
  const e = extras ? "/" + extras : "";
  return `/catalog/${enc(cat.type)}/${enc(cat.id)}${e}.json`;
}
function extrasOf(o) {
  const parts = [];
  if (o.genre) parts.push("genre=" + enc(o.genre));
  if (o.search) parts.push("search=" + enc(o.search));
  if (o.skip) parts.push("skip=" + o.skip);
  return parts.join("&");
}
var ADULT = /\b(adult|18\s?\+|xxx|porn|erotic|hentai)\b/i;
function adultName(name) {
  return ADULT.test(String(name || ""));
}
function qualityOf(text) {
  const s = String(text || "");
  if (/\b(2160p|4k)\b/i.test(s)) return "4K";
  for (const q of ["1080p", "720p", "480p"]) if (s.toLowerCase().includes(q)) return q;
  return void 0;
}
var CM_PREFIX = "cm1:";
var CM_INDEX = "cm1idx";
var CM_ENTRY_MAX = 48 * 1024;
var CM_TOTAL_MAX = 130 * 1024;
var CM_STALE_MS = 24 * 3600 * 1e3;
function cmRead(key) {
  try {
    const o = JSON.parse(kino.storage.get(key) || "null");
    return o && typeof o.at === "number" && o.v ? o : null;
  } catch {
    return null;
  }
}
function cmWrite(key, v, path) {
  try {
    const text = JSON.stringify({ at: Date.now(), p: path, v });
    if (text.length > CM_ENTRY_MAX) return;
    let idx;
    try {
      idx = JSON.parse(kino.storage.get(CM_INDEX) || "[]");
    } catch {
      idx = [];
    }
    idx = (Array.isArray(idx) ? idx : []).filter((e) => e && e.k !== key && typeof e.k === "string");
    idx.push({ k: key, at: Date.now(), n: text.length });
    idx.sort((a, b) => a.at - b.at);
    let total = idx.reduce((n, e) => n + (e.n || 0), 0);
    while (idx.length > 1 && total > CM_TOTAL_MAX) {
      const old = idx.shift();
      total -= old.n || 0;
      try {
        kino.storage.set(old.k, "", { ttlMs: 1 });
      } catch {
      }
    }
    kino.storage.set(key, text, { ttlMs: CM_STALE_MS });
    kino.storage.set(CM_INDEX, JSON.stringify(idx), { ttlMs: CM_STALE_MS });
  } catch {
  }
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
    const v = await getJson(path, timeoutMs || 12e3);
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
function card(m, cat) {
  const type = String(m.type || cat.type);
  const key = "n" + hash(m.id);
  const known = kinds()[key];
  const name = !BLANK.test(String(m.name || "")) ? String(m.name) : known ? known[0] : "";
  noteCatOf(key, cat.id);
  return { m, type, key, name, series: known ? known[1] === 1 : void 0, overview: void 0, genres: void 0, cat: cat.id };
}
function needsMeta(c) {
  if (!c.name) return 2;
  if (c.type !== "movie" && c.type !== "series" && c.series === void 0) return 1;
  return 0;
}
async function enrich(cards, budget, deadline) {
  const todo = cards.filter(needsMeta).sort((a, b) => needsMeta(b) - needsMeta(a)).slice(0, budget);
  await pool(todo, 5, async (c) => {
    const room = deadline - Date.now();
    if (room < 1500) return;
    const meta = (await getJson(`/meta/${enc(c.type)}/${enc(c.m.id)}.json`, Math.min(8e3, room))).meta;
    if (!meta) return;
    const isSeries = Array.isArray(meta.videos) && meta.videos.length > 0;
    if (!c.name && !BLANK.test(String(meta.name || ""))) c.name = String(meta.name);
    c.series = isSeries;
    c.overview = meta.description ? String(meta.description) : void 0;
    c.genres = genresOf(meta);
    remember(c.key, c.name, isSeries, year(meta));
  });
}
function toItem(c) {
  if (!c.name) return null;
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
  if (rating !== void 0) item.rating = rating;
  const ids = idsOf(m);
  if (ids) item.ids = ids;
  return item;
}
async function itemsOf(metas, cat, budget, deadline, adult) {
  const cards = metas.map((m) => card(m, cat));
  await enrich(cards, budget, deadline);
  flushKinds();
  const seen = /* @__PURE__ */ new Set();
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
function shownCatalogs(manifest) {
  return healthyOnly(browseCatalogs(manifest), "play");
}
function rowsSetting() {
  const n = num(kino.config.get("homeRows"));
  return n > 0 && n <= 24 ? n : 4;
}
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
    if (adult) items.forEach((item) => {
      item.adult = true;
    });
    if (!items.length) continue;
    await indexItems(items, cat.id);
    rows.push({
      id: "r" + safeId(cat.id).slice(0, 80) + (genre ? "-" + hash(genre).slice(0, 8) : ""),
      title: (genre || catalogTitle(cat)).slice(0, 100),
      items,
      ref: makeRef(cat.type, cat.id, genre ? { c: cat.id, g: genre } : { c: cat.id })
    });
  }
  flushKinds();
  return rows;
}
async function homeRows(manifest, budget) {
  const cats = shownCatalogs(manifest).slice(0, rowsSetting());
  const b = budget || makeBudget(HOME_BUDGET_MS);
  const pages = await pool(cats, 5, async (cat) => b.short(2500) ? [] : (await catalogMetas(cat, "", b.cap(1e4, 200))).slice(0, 12));
  return buildRows(cats.map((cat, i) => ({ cat, genre: null, metas: pages[i] })), Math.min(b.end, Date.now() + DEADLINE_MS));
}
async function homeLiveRows(manifest, budget) {
  const b = budget || makeBudget(HOME_BUDGET_MS);
  const cats = (await playableLiveCatalogs(manifest, b)).slice(0, 2);
  const rows = await pool(cats, 2, async (cat) => {
    if (b.short(2500)) return null;
    const taken = /* @__PURE__ */ new Set();
    const items = (await catalogMetas(cat, "", b.cap(15e3, 200))).slice(0, 12).map((m) => channelOf(m, cat, safeId(cat.id), taken)).filter(Boolean).map((ch) => {
      const item = { id: ch.id, ref: ch.ref, title: ch.title, kind: "live" };
      if (ch.logo) item.poster = ch.logo;
      return item;
    });
    return items.length ? { id: "v" + safeId(cat.id).slice(0, 90), title: catalogTitle(cat), items } : null;
  });
  return rows.filter(Boolean);
}
var HOME_KEY2 = "home1";
var HOME_MAX = 60 * 1024;
var HOME_TTL_MS = 7 * 24 * 3600 * 1e3;
function saveHome(rows) {
  try {
    if (!rows.length) return;
    for (let per = 12; per >= 2; per -= 2) {
      const text = JSON.stringify({ at: Date.now(), rows: rows.map((r) => ({ ...r, items: r.items.slice(0, per) })) });
      if (text.length <= HOME_MAX) {
        kino.storage.set(HOME_KEY2, text, { ttlMs: HOME_TTL_MS });
        return;
      }
    }
  } catch {
  }
}
function savedHome() {
  try {
    const o = JSON.parse(kino.storage.get(HOME_KEY2) || "null");
    const rows = o && Array.isArray(o.rows) ? o.rows : [];
    const m = manifestNow();
    const on = m ? m.catalogs.filter(isOn).map((c) => "r" + safeId(c.id).slice(0, 80)) : null;
    const kept = on ? rows.filter((r) => typeof r.id === "string" && on.some((p) => r.id.startsWith(p))) : rows;
    return kept.length ? kept : null;
  } catch {
    return null;
  }
}
async function home() {
  let rows = [];
  let live = [];
  let failure = null;
  const budget = makeBudget(HOME_BUDGET_MS);
  try {
    const manifest = await loadManifest(false, 9e3);
    [live, rows] = await Promise.all([homeLiveRows(manifest, budget).catch(() => []), homeRows(manifest, budget)]);
  } catch (e) {
    failure = e;
  }
  if (rows.length) {
    saveHome(rows);
    return live.concat(rows);
  }
  const kept = savedHome();
  if (kept) return live.concat(kept);
  if (failure) throw failure;
  return live;
}
var SECTION_TABS = 8;
var SECTION_ROWS = 12;
function sectionCatalogs(manifest) {
  const page = Math.max(1, num(kino.config.get("sectionPage")) || 1);
  return shownCatalogs(manifest).slice((page - 1) * SECTION_TABS, page * SECTION_TABS);
}
async function section(arg) {
  const b = makeBudget(HOME_BUDGET_MS);
  const manifest = await loadManifest(false, 9e3);
  const cats = sectionCatalogs(manifest);
  if (!cats.length) return { rows: [] };
  const tabs = cats.map((c) => ({ id: safeId(c.id).slice(0, 100), label: catalogTitle(c).slice(0, 24) }));
  const index = Math.max(0, tabs.findIndex((x) => x.id === (arg && arg.tab)));
  const cat = cats[index];
  const genres = [null].concat(cat.genres.slice(0, SECTION_ROWS - 1));
  const pages = await pool(genres, 5, async (genre) => b.short(2500) ? [] : (await catalogMetas(cat, extrasOf({ genre }), b.cap(1e4, 200))).slice(0, 12));
  const rows = await buildRows(genres.map((genre, i) => ({ cat, genre, metas: pages[i] })), Math.min(b.end, Date.now() + DEADLINE_MS));
  return { tabs, tab: tabs[index].id, rows };
}
async function tabPage(tab) {
  const b = makeBudget(HOME_BUDGET_MS);
  const manifest = await loadManifest(false, 9e3);
  if (tab !== "catalogos") return { rows: await homeRows(manifest, b) };
  const cats = shownCatalogs(manifest).slice(rowsSetting(), rowsSetting() + SECTION_ROWS);
  const pages = await pool(cats, 5, async (cat) => b.short(2500) ? [] : (await catalogMetas(cat, "", b.cap(1e4, 200))).slice(0, 12));
  return { rows: await buildRows(cats.map((cat, i) => ({ cat, genre: null, metas: pages[i] })), Math.min(b.end, Date.now() + DEADLINE_MS)) };
}
var browseInstance = null;
var browseScreen = () => browseInstance ?? (browseInstance = makeBrowse({
  kino,
  loadTab: (tab) => tabPage(tab),
  searchTitles: async (q) => {
    const out = await search({ q });
    return Array.isArray(out) ? out : out && out.items ? out.items : [];
  },
  sources: { list: () => sourcesList(), toggle: (id, on) => toggleSource(id, on) },
  live: {
    categories: () => liveCategories(),
    channels: (categoryId) => liveChannels({ categoryId }),
    search: (q) => liveSearch({ query: q })
  }
}));
async function screen(ctx) {
  await null;
  return browseScreen().view(ctx && typeof ctx === "object" ? ctx : {});
}
async function screenEvent(ev) {
  await null;
  return browseScreen().event(ev && typeof ev === "object" ? ev : {});
}
var LAST_EPISODES_KEY = "lastEpisodes";
function rememberEpisodes(seriesRef, episodeRefs) {
  try {
    kino.storage.set(LAST_EPISODES_KEY, JSON.stringify({ series: seriesRef, eps: episodeRefs.slice(0, 300) }));
  } catch {
  }
}
function seriesOfEpisode(ref) {
  try {
    const o = JSON.parse(kino.storage.get(LAST_EPISODES_KEY) || "null");
    return o && Array.isArray(o.eps) && o.eps.includes(ref) ? o.series : "";
  } catch {
    return "";
  }
}
var ART_KEY = "a1";
var TTL_ART = 60 * 60 * 1e3;
async function categoryArt(cats) {
  let cached = null;
  try {
    cached = JSON.parse(kino.storage.get(ART_KEY) || "null");
  } catch {
  }
  if (cached && Date.now() - cached.at < TTL_ART) return cached.v;
  const deadline = Date.now() + DEADLINE_MS;
  const posters = await pool(cats, 5, async (cat) => {
    const room = deadline - Date.now();
    if (room < 2e3) return void 0;
    const metas = await catalogMetas(cat, "", Math.min(8e3, room));
    const first = metas.find((m) => httpUrl(m.poster));
    return first ? httpUrl(first.poster) : void 0;
  });
  const v = {};
  cats.forEach((cat, i) => {
    if (posters[i]) v[cat.id] = posters[i];
  });
  if (Object.keys(v).length) {
    try {
      kino.storage.set(ART_KEY, JSON.stringify({ at: Date.now(), v }));
    } catch {
    }
  }
  return v;
}
async function categories() {
  const manifest = await loadManifest(false, 6e3);
  const cats = browseCatalogs(manifest).slice(0, 24);
  const art = await categoryArt(cats);
  return cats.map((cat) => {
    const tile = {
      id: "g" + safeId(cat.id).slice(0, 100),
      title: catalogTitle(cat).slice(0, 40),
      ref: makeRef(cat.type, cat.id, { c: cat.id })
    };
    if (art[cat.id]) tile.art = art[cat.id];
    return tile;
  });
}
var SLICE = 24;
async function browse(ref, cursor) {
  const r = parseRef(ref);
  const b = makeBudget(17500);
  const manifest = await loadManifest(false, 6e3);
  const cat = manifest.catalogs.find((c) => c.id === r.c && c.type === r.t);
  if (!cat) throw kino.error("not_found", "no catalog", { userMessage: t("unknownRef") });
  const [skipText, offsetText] = String(cursor || "0,0").split(",");
  const skip = num(skipText);
  const offset = num(offsetText);
  const genre = typeof r.g === "string" && cat.genres.includes(r.g) ? r.g : null;
  const metas = await catalogMetas(cat, extrasOf({ genre, skip }), b.cap(13e3, 3500, 3e3));
  const slice = metas.slice(offset, offset + SLICE);
  const items = await itemsOf(slice, cat, ENRICH_BUDGET, b.end - 1e3, adultName(cat.name) || adultName(genre));
  let next;
  if (offset + SLICE < metas.length) next = `${skip},${offset + SLICE}`;
  else if (metas.length >= PAGE && skip + metas.length < 1e4) next = `${skip + metas.length},0`;
  return next ? { items, next } : { items };
}
var MAX_SEARCH_CATALOGS = 40;
var SEARCH_TOTAL_MS = 13500;
var SEARCH_BUDGET_MS = 11e3;
var SEARCH_BUDGET_LOCAL_MS = 6e3;
var CAP_MIN_MS = 3500;
var CAP_MAX_MS = 9e3;
var CAP_UNKNOWN_MS = 6e3;
var SCOPED_ENOUGH = 8;
var flat = (x) => String(x || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
var FAIR_MS = 3500;
var SKIPPED = Symbol("skipped");
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
    kino.log(`search ${safeId(cat.id).slice(0, 24)} failed after ${Date.now() - t0} ms: ${e && e.code || "error"}`);
    return null;
  }
}
function capFor(cat) {
  const ms = readLatency()[cat.id];
  return Math.round(Math.min(CAP_MAX_MS, Math.max(CAP_MIN_MS, ms ? ms * 1.6 : CAP_UNKNOWN_MS)));
}
async function askCatalogs(cats, q, budget, wantExact, targets) {
  const lists = /* @__PURE__ */ new Map();
  const failed = [];
  const fair = /* @__PURE__ */ new Set();
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
    if (await take(cat, capFor(cat)) === "failed") failed.push(cat);
  }
  if (lists.size === 0 && !done) {
    for (const cat of failed.slice(0, 2)) {
      if (budget.left() < FAIR_MS) break;
      if (await take(cat, budget.left()) === "ok") {
        failed.splice(failed.indexOf(cat), 1);
        fair.delete(cat.id);
        break;
      }
    }
  }
  for (const id of fair) noteCatalog(id, false, "search");
  return { lists, failed: failed.length, asked };
}
var rankItems = (items, titles) => typeof kino.rank === "object" && kino.rank && typeof kino.rank.sortBySimilarity === "function" ? kino.rank.sortBySimilarity(items, titles) : items;
async function search(query) {
  const total = makeBudget(SEARCH_TOTAL_MS);
  const q = String(query.q || "").trim().slice(0, 200);
  if (q.length < 2) return [];
  const manifest = await loadManifest(false, 4e3);
  const all = manifest.catalogs.filter((c) => c.search && !isLiveType(c.type) && isOn(c));
  let only = null;
  if (query.within) {
    let r;
    try {
      r = parseRef(query.within);
    } catch {
      return null;
    }
    only = all.find((c) => c.id === r.c && c.type === r.t) || null;
    if (!only) return null;
  }
  const titles = [query.q, query.originalTitle].concat(Array.isArray(query.altTitles) ? query.altTitles : []).filter((x) => typeof x === "string" && x.trim());
  const local = await searchIndex(q, { only: only && only.id, onKeys: only ? null : new Set(all.map((c) => c.id)), limit: 60 });
  const localItems = local.map((x) => x.item);
  if (only && local.length >= SCOPED_ENOUGH) return rankItems(localItems, titles);
  const pool_ = byLatency(only ? [only] : healthyOnly(all, "search")).slice(0, MAX_SEARCH_CATALOGS);
  const budget = makeBudget(Math.min(local.length >= 8 ? SEARCH_BUDGET_LOCAL_MS : SEARCH_BUDGET_MS, total.left()));
  const wantExact = (query.year > 0 || query.tmdbId > 0) && !only;
  const { lists, failed } = await askCatalogs(pool_, q, budget, wantExact, titles.map(baseTitle).filter(Boolean));
  if (lists.size === 0 && failed > 0 && !local.length) throw kino.error("unavailable", "no catalog answered the search", { userMessage: t("timeout") });
  const ordered = pool_.map((c) => lists.get(c.id) || []);
  const merged = [];
  for (let i = 0, longest = Math.max(0, ...ordered.map((l) => l.length)); i < longest; i++) for (const l of ordered) if (l[i]) merged.push(l[i]);
  const seen = /* @__PURE__ */ new Set();
  const cards = merged.filter((c) => !seen.has(c.key) && seen.add(c.key));
  const top = cards.slice(0, 60);
  await enrich(top, ENRICH_BUDGET, total.end - 1e3);
  flushKinds();
  const adultCats = new Set(all.filter((c) => adultName(c.name)).map((c) => c.id));
  const built = top.map((c) => ({ c, item: toItem(c) })).filter((x) => x.item);
  for (const x of built) if (adultCats.has(x.c.cat)) x.item.adult = true;
  const byCat = /* @__PURE__ */ new Map();
  for (const c of merged) {
    const item = c.name && !adultCats.has(c.cat) ? toItem(c) : null;
    if (item) byCat.set(c.cat, (byCat.get(c.cat) || []).concat(item));
  }
  for (const [id, items] of byCat) await indexItems(items, id);
  const names = /* @__PURE__ */ new Set();
  const out = built.map((x) => x.item).concat(localItems).filter((it) => {
    const k = flat(it.title);
    if (!k || names.has(k)) return false;
    names.add(k);
    return true;
  });
  return rankItems(out, titles);
}
function warming(userMessage) {
  const err = kino.error("unavailable", "the server is still preparing it", { userMessage });
  err.warming = true;
  return err;
}
var TITLE_BUDGET_MS = 19e3;
var EXTRAS_UNTIL_MS = 12e3;
async function getMeta(type, id, capMs) {
  let data;
  try {
    data = await getJson(`/meta/${enc(type)}/${enc(id)}.json`, capMs || 15e3);
  } catch (e) {
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
var SEARCH_NOISE = /\s*[\[(].*$/;
async function externalIds(isSeries, meta) {
  if (typeof kino.meta !== "function" || kino.meta.byTitle !== true) return void 0;
  const title = String(meta.name || "").replace(SEARCH_NOISE, "").trim().slice(0, 200);
  if (!title) return void 0;
  const query = { type: isSeries ? "series" : "movie", title };
  const y = year(meta);
  if (y >= 1870 && y <= 2100) query.year = y;
  try {
    const answer = await kino.meta(query);
    return answer && answer.ids ? answer.ids : void 0;
  } catch (e) {
    kino.log("kino.meta failed: " + (e && e.code));
    return void 0;
  }
}
async function withExternalIds(info, meta, isSeries, ms) {
  const ext = await withTime(ms, externalIds(isSeries, meta));
  if (!ext) return info;
  const ids = Object.assign({}, info.ids);
  for (const k of ["tmdb", "imdb", "mal", "anilist", "kitsu"]) if (ids[k] === void 0 && ext[k] !== void 0) ids[k] = ext[k];
  if (Object.keys(ids).length) info.ids = ids;
  return info;
}
async function catOfRef(r) {
  const key = "n" + hash(r.i || "");
  const seen = await indexGet(key);
  return seen && seen.cat || catOfKey(key);
}
async function details(ref) {
  const budget = makeBudget(TITLE_BUDGET_MS - 500);
  const r = parseRef(ref);
  const meta = await getMeta(r.t, r.i, budget.cap(17e3));
  learn(r.t, r.i, meta);
  const info = seriesInfo(meta);
  return budget.left() > 6e3 ? withExternalIds(info, meta, false, Math.min(4e3, budget.left() - 1500)) : info;
}
function numbered(rows) {
  const top = /* @__PURE__ */ new Map();
  for (const r of rows) if (r.number > 0) top.set(r.season, Math.max(top.get(r.season) || 0, r.number));
  for (const r of rows) {
    if (r.number > 0) continue;
    r.number = (top.get(r.season) || 0) + 1;
    top.set(r.season, r.number);
  }
  const seen = /* @__PURE__ */ new Set();
  return rows.sort((a, b) => a.season - b.season || a.number - b.number).filter((r) => {
    const k = r.season + ":" + r.number;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
async function episodes(ref) {
  const budget = makeBudget(TITLE_BUDGET_MS);
  const r = parseRef(ref);
  const own = await catOfRef(r);
  let meta;
  try {
    meta = await getMeta(r.t, r.i, budget.cap(17e3));
  } catch (e) {
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
  if (!list.length) list.push({ season: 1, number: 1, ref: makeRef(r.t, r.i), title: t("movieEpisode") });
  rememberEpisodes(ref, list.map((e) => e.ref));
  let series = seriesInfo(meta);
  if (TITLE_BUDGET_MS - budget.left() < EXTRAS_UNTIL_MS) series = await withExternalIds(series, meta, videos.length > 0, Math.min(4e3, budget.left() - 1500));
  return { series, episodes: list };
}
var LANGS = {
  eng: "en",
  spa: "es",
  por: "pt",
  fre: "fr",
  fra: "fr",
  ger: "de",
  deu: "de",
  ita: "it",
  hin: "hi",
  jpn: "ja",
  kor: "ko",
  chi: "zh",
  zho: "zh",
  ara: "ar",
  rus: "ru",
  tur: "tr",
  ind: "id",
  tam: "ta",
  tel: "te",
  ben: "bn",
  mal: "ml",
  kan: "kn"
};
function langOf(code) {
  const c = String(code || "").toLowerCase().trim();
  return (LANGS[c] || c || "und").slice(0, 16);
}
function trackFormat(url) {
  const decoded = decodeURIComponent(url.split("?")[0] + " " + (/[?&]url=([^&]+)/.exec(url) || [, ""])[1]);
  return /\.vtt\b/i.test(decoded) ? "vtt" : /\.srt\b/i.test(decoded) ? "srt" : void 0;
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
  return text || void 0;
}
function headersOf(s) {
  const h = s.behaviorHints && s.behaviorHints.proxyHeaders && s.behaviorHints.proxyHeaders.request;
  if (!h || typeof h !== "object") return void 0;
  const out = {};
  for (const k of Object.keys(h).slice(0, 20)) if (typeof h[k] === "string") out[k] = h[k];
  return Object.keys(out).length ? out : void 0;
}
function mimeOf(url) {
  return /\.m3u8(\b|$)/i.test(url.split("?")[0]) || /\.m3u8/i.test(url) ? "application/x-mpegURL" : void 0;
}
var PLACEHOLDER_HOSTS = ["no.link"];
function blockedBy(s) {
  if (s.clearkey || s.drm || /[?&]clearkey=/i.test(s.url)) return "drm";
  const host = /^https?:\/\/([^/:?#]+)/i.exec(s.url);
  if (host && PLACEHOLDER_HOSTS.includes(host[1].toLowerCase())) return "soon";
  return null;
}
function playable(s) {
  return !!s && typeof s.url === "string" && /^https?:\/\//.test(s.url) && !s.infoHash && !s.ytId && !blockedBy(s);
}
function streamFor(list, live) {
  const seen = /* @__PURE__ */ new Set();
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
  if (live) stream.expiresInSeconds = 1800;
  else {
    const subs = [];
    const urls = /* @__PURE__ */ new Set();
    for (const s of usable) for (const track of tracksOf(s.subtitles)) if (!urls.has(track.url) && urls.add(track.url)) subs.push(track);
    if (subs.length) stream.subtitles = subs.slice(0, 30);
  }
  const alternatives = [];
  const taken = /* @__PURE__ */ new Map();
  const unique = (text) => {
    if (!text) return text;
    const n = (taken.get(text) || 0) + 1;
    taken.set(text, n);
    return n === 1 ? text : `${text} \xB7 ${n}`.slice(0, 48);
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
var STREAM_CAP_MS = 17e3;
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
var RESOLVE_BUDGET_MS = 18500;
var MIN_CALL_MS = 2500;
async function streamsWithin(type, id, capMs, retry, budget) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const cap = Math.min(capMs || STREAM_CAP_MS, budget.left() - 500);
    if (cap < MIN_CALL_MS) return [];
    const tryStart = Date.now();
    const list = (await streamsOf(type, id, cap)).filter(playable);
    if (list.length) return list;
    if (retry !== false && attempt < 1 && Date.now() - tryStart < 6e3 && budget.left() - 800 > MIN_CALL_MS + 500) await kino.sleep(800);
    else break;
  }
  return [];
}
var XSRC_PREFIX = "rb_xsrc:";
var XSRC_FOR_MS = 6 * 60 * 60 * 1e3;
function baseTitle(title) {
  return String(title || "").toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s(?:\d{3,4}p\b|web-?dl|web-?rip|blu-?ray|brrip|hdrip|hdtc|hdcam|dual audio|\{).*$/i, " ").replace(/\(.*?\)|\[.*?\]|\{.*?\}/g, " ").replace(/\b(?:season|temporada)\s*\d+.*$/i, " ").replace(/\bs\d{1,2}\b.*$/i, " ").replace(/[^\p{L}\p{N}]+/gu, "");
}
function seasonOf(title) {
  const m = /\bseason\s*(\d+)|\btemporada\s*(\d+)|\bS(\d{1,2})\b/i.exec(String(title || ""));
  return m ? parseInt(m[1] || m[2] || m[3], 10) : null;
}
async function crossCatalog(title, ownCat, manifest, budget, wantType, wantYear) {
  const want = baseTitle(title);
  if (want.length < 2) return null;
  const wantSeason = seasonOf(title);
  const yearOf = (name) => {
    const m = /\((19|20)\d{2}\)/.exec(String(name || ""));
    return m ? parseInt(m[0].slice(1, 5), 10) : 0;
  };
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
  const words = String(title).replace(/\(.*?\)|\[.*?\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  const known = (await searchIndex(words, { onKeys: new Set(others.map((c) => c.id)), limit: 40 })).filter((x) => same(x.item.title, x.item.year));
  const rankOf = new Map(byLatency(others).map((c, i) => [c.id, i]));
  known.sort((a, b) => (rankOf.has(a.cat) ? rankOf.get(a.cat) : 99) - (rankOf.has(b.cat) ? rankOf.get(b.cat) : 99));
  for (const x of known.slice(0, 3)) {
    if (budget.left() < MIN_CALL_MS + 500) return null;
    let ref;
    try {
      ref = parseRef(x.item.ref);
    } catch {
      continue;
    }
    if (wantType && ref.t !== wantType) continue;
    try {
      const list = await streamsWithin(ref.t, ref.i, Math.min(8e3, budget.left() - 500), false, budget);
      if (list.length) return { list, ref: x.item.ref, label: titleOf(x.cat) };
    } catch {
    }
  }
  for (const cat of byLatency(others)) {
    if (budget.left() < 5500) return null;
    let metas = [];
    try {
      metas = await catalogMetas(cat, extrasOf({ search: words }), Math.min(5e3, budget.left() - 3500));
    } catch {
      continue;
    }
    const hit = metas.find((m) => m && typeof m.id === "string" && same(String(m.name || ""), year(m)) && (!wantType || String(m.type || cat.type) === wantType));
    if (!hit) continue;
    if (budget.left() < 3e3) return null;
    const type = String(hit.type || cat.type);
    try {
      const list = await streamsWithin(type, hit.id, Math.min(8e3, budget.left() - 500), false, budget);
      if (list.length) return { list, ref: makeRef(type, hit.id), label: catalogTitle(cat) };
    } catch {
    }
    getJson(`/stream/${enc(type)}/${enc(hit.id)}.json`, 1e3).catch(() => null);
    return null;
  }
  return null;
}
function whyNot(list, live) {
  const why = list.map((s) => s && typeof s.url === "string" ? blockedBy(s) : null).filter(Boolean);
  const key = why.includes("soon") && !why.includes("drm") ? "notYet" : why.includes("drm") ? "drmOnly" : live ? "noChannel" : "noStreams";
  return kino.error("unavailable", "no streams", { userMessage: t(key) });
}
async function resolveLive(r, budget) {
  let list = r.i ? await streamsOf(r.t, r.i, budget.cap(STREAM_CAP_MS, 500, MIN_CALL_MS)) : [];
  let stream = streamFor(list, true);
  if (!stream && r.c && r.n && budget.left() > 6e3) {
    const cat = (await loadManifest(false, 4e3)).catalogs.find((c) => c.id === r.c);
    const fresh = cat ? (await catalogMetas(cat, "", budget.cap(1e4, 4e3, MIN_CALL_MS))).find((m) => plainName(m.name) === r.n) : null;
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
  let own = seen && seen.cat || catOfKey(key);
  let title = seen ? seen.title : "";
  if (!title) {
    const seriesRef = seriesOfEpisode(ref);
    if (seriesRef) {
      try {
        const sk = "n" + hash(parseRef(seriesRef).i);
        const ss = await indexGet(sk);
        if (!own) own = ss && ss.cat || catOfKey(sk);
      } catch {
      }
    }
  }
  const canSwap = title.length > 1;
  const memKey = XSRC_PREFIX + hash(ref);
  const manifest = canSwap ? await loadManifest(false, 3e3).catch(() => null) : null;
  let list = [];
  let from = "";
  let failure = null;
  if (options && options.retry) {
    try {
      kino.storage.remove(memKey);
    } catch {
    }
  }
  if (canSwap) {
    try {
      const mem = JSON.parse(kino.storage.get(memKey) || "null");
      if (mem && typeof mem.t === "string" && typeof mem.i === "string") {
        list = await streamsWithin(mem.t, mem.i, 8e3, false, budget);
        if (list.length) from = String(mem.label || "");
      }
    } catch {
      list = [];
    }
  }
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
    } catch {
    }
  };
  if (pausedFirst) await cross();
  if (!list.length && (!pausedFirst || budget.left() > 6e3)) {
    try {
      list = await streamsWithin(r.t, r.i, pausedFirst ? budget.left() - 500 : canSwap ? 9e3 : STREAM_CAP_MS, !canSwap, budget);
    } catch (e) {
      failure = e;
    }
    if (!(failure && failure.warming)) noteCatalog(own, list.length > 0, "play");
  }
  if (!list.length && canSwap && !pausedFirst) await cross();
  if (!list.length) {
    if (failure) throw failure;
    await indexRemove(key);
    throw whyNot([], false);
  }
  const ranked = rank(list.filter(playable), ref, options, hash);
  const stream = streamFor(ranked, false);
  if (!stream) throw whyNot(list, false);
  if (from) {
    const mark = (s) => s.label ? { ...s, label: `${from} \xB7 ${s.label}`.slice(0, 48) } : { ...s, label: from.slice(0, 48) };
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
var LIVE_OK_KEY = "p1";
var TTL_LIVE_OK = 30 * 60 * 1e3;
async function playableLiveCatalogs(manifest, budget) {
  const cats = manifest.catalogs.filter((c) => c.browsable && isLiveType(c.type) && isOn(c));
  let cached = null;
  try {
    cached = JSON.parse(kino.storage.get(LIVE_OK_KEY) || "null");
  } catch {
  }
  if (cached && Date.now() - cached.at < TTL_LIVE_OK) return cats.filter((c) => cached.v[c.id] !== false);
  const b = budget && budget.left() < 12e3 ? budget : makeBudget(12e3);
  const verdicts = await pool(cats, 5, async (cat) => {
    if (b.short(3e3)) return void 0;
    const metas = (await catalogMetas(cat, "", b.cap(8e3, 200))).slice(0, 2);
    let asked = false;
    for (const m of metas) {
      if (b.short(2500)) break;
      try {
        const list = await streamsOf(cat.type, m.id, b.cap(8e3, 200));
        asked = true;
        if (list.some(playable)) return true;
      } catch {
      }
    }
    return asked ? false : void 0;
  });
  const v = {};
  cats.forEach((cat, i) => {
    if (verdicts[i] !== void 0) v[cat.id] = verdicts[i];
  });
  if (Object.keys(v).length) {
    try {
      kino.storage.set(LIVE_OK_KEY, JSON.stringify({ at: Date.now(), v }));
    } catch {
    }
  }
  return cats.filter((c) => v[c.id] !== false);
}
async function liveCategories() {
  const budget = makeBudget(18500);
  const manifest = await loadManifest(false, 6e3);
  return (await playableLiveCatalogs(manifest, budget)).map((c) => ({ id: safeId(c.id), title: catalogTitle(c) }));
}
function plainName(name) {
  return String(name || "").replace(VISUAL, "").replace(/\s+/g, " ").trim();
}
function channelOf(m, cat, categoryId, taken) {
  const name = BLANK.test(String(m.name || "")) ? "" : plainName(m.name);
  if (!name) return null;
  let id = "l" + hash(cat.id + "|" + name);
  if (taken.has(id)) id = "l" + hash(cat.id + "|" + name + "|" + m.id);
  taken.add(id);
  const withId = makeRef(cat.type, m.id, { c: cat.id, n: name });
  const channel = { id, title: String(m.name).trim().slice(0, 200), ref: withId.length <= 4e3 ? withId : makeRef(cat.type, "", { c: cat.id, n: name }), categoryId };
  const logo2 = httpUrl(m.poster) || httpUrl(m.logo);
  if (logo2) channel.logo = logo2;
  return channel;
}
var CHANNEL_PAGE = 500;
async function liveChannels(arg) {
  const budget = makeBudget(18500);
  const manifest = await loadManifest(false, 5e3);
  const cat = manifest.catalogs.find((c) => isLiveType(c.type) && safeId(c.id) === arg.categoryId);
  if (!cat) return { items: [] };
  const [skipText, offsetText] = String(arg.cursor || "0,0").split(",");
  const skip = num(skipText);
  const offset = num(offsetText);
  const metas = await catalogMetas(cat, extrasOf({ skip }), budget.cap(12e3, 4500, 3e3));
  const first = skip ? await catalogMetas(cat, "", budget.cap(12e3, 500, 2500)) : null;
  if (first && first.length && metas.length && first[0].id === metas[0].id) return { items: [] };
  const taken = /* @__PURE__ */ new Set();
  const items = metas.slice(offset, offset + CHANNEL_PAGE).map((m) => channelOf(m, cat, arg.categoryId, taken)).filter(Boolean);
  let next = null;
  if (offset + CHANNEL_PAGE < metas.length) next = `${skip},${offset + CHANNEL_PAGE}`;
  else if (metas.length >= PAGE && skip + metas.length < 1e4) next = `${skip + metas.length},0`;
  return { items, next };
}
var MAX_LIVE_SEARCH_CATALOGS = 12;
async function liveSearch(arg) {
  const q = String(arg.query || "").trim();
  if (q.length < 2) return { items: [] };
  const budget = makeBudget(13500);
  const manifest = await loadManifest(false, 4e3);
  const cats = (await playableLiveCatalogs(manifest, makeBudget(Math.min(5e3, budget.left() - 6e3)))).filter((c) => c.search).slice(0, MAX_LIVE_SEARCH_CATALOGS);
  const found = await pool(cats, Math.max(1, cats.length), async (cat) => {
    const taken = /* @__PURE__ */ new Set();
    return (await catalogMetas(cat, extrasOf({ search: q }), budget.cap(9e3, 500, 2e3))).slice(0, 40).map((m) => channelOf(m, cat, safeId(cat.id), taken)).filter(Boolean);
  });
  const seen = /* @__PURE__ */ new Set();
  const items = [];
  for (const list of found) for (const c of list || []) if (!seen.has(c.id) && seen.add(c.id)) items.push(c);
  return { items: items.slice(0, 100) };
}
async function subtitles(arg) {
  const manifest = await loadManifest(false, 5e3);
  if (!manifest.resources.includes("subtitles") || !arg.imdbId) return [];
  const series = arg.kind === "series";
  const id = series && arg.season && arg.episode ? `${arg.imdbId}:${arg.season}:${arg.episode}` : arg.imdbId;
  const data = await getJson(`/subtitles/${series ? "series" : "movie"}/${enc(id)}.json`, 9e3);
  return tracksOf(data && data.subtitles);
}
function detailOf(e) {
  return e && (e.userMessage || e.code) || "error";
}
function sourcesList() {
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
    pausedMin: Math.ceil(pausedFor(c.id, br) / 6e4),
    ms: lat[c.id] || 0
  }));
}
function toggleSource(id, on) {
  const m = manifestNow();
  if (!m || !m.catalogs.some((c) => c.id === id)) return false;
  const picks = Object.fromEntries(m.catalogs.map((c) => [c.id, isOn(c)]));
  picks[id] = on !== false;
  return writePicks({ ...readPicks(), ...picks });
}
async function settingsStatus() {
  const out = {};
  try {
    const manifest = await loadManifest(false, 6e3);
    out.serverStatus = t("online", { catalogs: manifest.catalogs.length });
    const list = sourcesList();
    out.sources = t("sourcesStatus", { on: list.filter((x) => x.on).length, all: list.length, paused: list.filter((x) => x.on && x.pausedMin > 0).length });
  } catch (e) {
    out.serverStatus = t("offline", { detail: detailOf(e) });
  }
  out.index = t("indexStatus", { n: await indexSize() });
  return out;
}
async function checkConnection() {
  const budget = makeBudget(27e3);
  let manifest;
  try {
    manifest = await loadManifest(true, 1e4);
  } catch (e) {
    return { message: t("stepManifest", { detail: detailOf(e) }) };
  }
  const cat = browseCatalogs(manifest)[0];
  if (!cat) return { message: t("stepCatalog", { detail: "0" }) };
  let metas;
  try {
    metas = await catalogMetas(cat, "", budget.cap(1e4, 9e3, 3e3));
    if (!metas.length) throw kino.error("unavailable", "empty");
  } catch (e) {
    return { message: t("stepCatalog", { detail: catalogTitle(cat) + ": " + detailOf(e) }) };
  }
  const sample = metas[0];
  const type = String(sample.type || cat.type);
  try {
    await getMeta(type, sample.id, budget.cap(15e3, 4e3, 3e3));
  } catch (e) {
    return { message: t("stepMeta", { detail: detailOf(e) }) };
  }
  try {
    if (!streamFor(await streamsOf(type, sample.id, budget.cap(STREAM_CAP_MS, 0, 3e3)), false)) throw kino.error("unavailable", "no streams");
  } catch (e) {
    return { message: t("stepStream", { detail: detailOf(e) }) };
  }
  return { message: t("ok", { catalogs: manifest.catalogs.length }) };
}
function clearCaches() {
  let idx = [];
  try {
    idx = JSON.parse(kino.storage.get(CM_INDEX) || "[]");
  } catch {
    idx = [];
  }
  for (const e of Array.isArray(idx) ? idx : []) if (e && typeof e.k === "string") {
    try {
      kino.storage.remove(e.k);
    } catch {
    }
  }
  for (const k of [CM_INDEX, MANIFEST_KEY, ART_KEY, LIVE_OK_KEY, HOME_KEY2]) {
    try {
      kino.storage.remove(k);
    } catch {
    }
  }
  MEM.clear();
}
async function action(key) {
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
async function resolve(ref, options) {
  const out = await resolveRef(ref, options);
  try {
    if (!isLiveType(parseRef(ref).t)) browseScreen().notePlayed(seriesOfEpisode(ref) || ref);
  } catch {
  }
  return out;
}
export {
  action,
  browse,
  categories,
  details,
  episodes,
  home,
  liveCategories,
  liveChannels,
  liveSearch,
  manifestNow,
  resolve,
  screen,
  screenEvent,
  search,
  section,
  settingsStatus,
  sourcesList,
  subtitles,
  toggleSource
};
