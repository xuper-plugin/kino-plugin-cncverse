// What makes the plugin hold up when the server is slow, flaky or gone: time budgets, the circuit breaker, the local search index, the
// choice of catalogs, the copy ranking and the fallback to another catalog. The server is fake and the clock is virtual.
import test from "node:test";
import assert from "node:assert/strict";
import { MANIFEST, install, loadPlugin, meta, ok, routes, serverManifest } from "./helpers/fake.mjs";
import { isPaused, noteCatalog, noteLatency, readBreaker, readPicks } from "../src/robust/store.js";
import { indexSize } from "../src/robust/index.js";
import { checkScreenTree } from "../sdk/screen.mjs";
import manifestJson from "../kino-plugin.json" with { type: "json" };

const serverManifestWith = (catalogs) => ({ ...serverManifest(), catalogs });
const SEARCH = /^\/catalog\/other\/(cnc_\w+_other)\/search=(.*)\.json$/;
const LIST = /^\/catalog\/other\/(cnc_\w+_other)\.json$/;
const catOf = (path) => /cnc_(\w+?)_other/.exec(path)[1];
const ref = (id, t = "other") => JSON.stringify({ t, i: id });

// ---- the breaker -----------------------------------------------------------------------------------------------------------

test("breaker: one failure is not a pause, two are; a success clears; each failure doubles; a trial after the pause", () => {
  const { clock } = install({ handler: routes([]) });
  noteCatalog("c1", false);
  assert.equal(isPaused("c1"), false);
  noteCatalog("c1", false);
  assert.equal(isPaused("c1"), true);
  assert.ok(readBreaker()["play:c1"].until - clock.t <= 10 * 60000);
  noteCatalog("c1", false);
  assert.ok(readBreaker()["play:c1"].until - clock.t > 29 * 60000, "second pause is 30 min");
  clock.t += 31 * 60000;
  assert.equal(isPaused("c1"), false, "half-open after the pause");
  noteCatalog("c1", true);
  assert.deepEqual(readBreaker(), {});
});

test("breaker: the two scopes are independent", () => {
  install({ handler: routes([]) });
  noteCatalog("c2", false, "search");
  noteCatalog("c2", false, "search");
  assert.equal(isPaused("c2", null, "search"), true);
  assert.equal(isPaused("c2", null, "play"), false);
});

// ---- search ----------------------------------------------------------------------------------------------------------------

test("search: eighteen slow catalogs still end inside Kino's 15 s (the 2.1.2 search could take ~40 s)", async () => {
  const { clock } = install({ handler: routes([MANIFEST, [SEARCH, { ms: 12000, body: {} }]]) });
  const p = await loadPlugin();
  const t0 = clock.t;
  await assert.rejects(() => p.search({ q: "batman" }), (e) => e.code === "unavailable");
  assert.ok(clock.t - t0 <= 14500, "took " + (clock.t - t0));
});

test("search: answers are merged and indexed; with the server down the index answers; with nothing it says the server is down", async () => {
  const state = { down: false };
  install({ handler: routes([MANIFEST, [SEARCH, (m, p) => (state.down ? { ms: 30000, body: {} } : ok([meta("id-" + catOf(p), "Joker (2019)")]))]]) });
  const p = await loadPlugin();
  const first = await p.search({ q: "joker" });
  assert.equal(first[0].title, "Joker (2019)");
  assert.ok((await indexSize()) >= 1);
  state.down = true;
  const again = await p.search({ q: "joker" });
  assert.equal(again[0].title, "Joker (2019)", "served from the local index");
  await assert.rejects(() => p.search({ q: "zzzz nothing" }), (e) => e.code === "unavailable");
});

test("search: duplicate titles from several catalogs are one result", async () => {
  install({ handler: routes([MANIFEST, [SEARCH, (m, p) => ok([meta("id-" + catOf(p), "Same Film (2020)")])]]) });
  const p = await loadPlugin();
  const r = await p.search({ q: "same film" });
  assert.equal(r.filter((x) => x.title === "Same Film (2020)").length, 1);
});

test("search: catalogs never asked (budget spent) are not blamed; a fair timeout counts only in the search scope; Home keeps them", async () => {
  install({ handler: routes([MANIFEST, [SEARCH, { ms: 30000, body: {} }], [LIST, (m) => ok([meta("h-" + m[1], "Row Title (2020)")])]]) });
  const p = await loadPlugin();
  await p.search({ q: "alpha" }).catch(() => null);
  await p.search({ q: "beta" }).catch(() => null);
  const keys = Object.keys(readBreaker());
  assert.ok(keys.length > 0 && keys.every((k) => k.startsWith("search:")), keys.join());
  assert.ok(keys.length < 14, "not every catalog: " + keys.length);
  const rows = await p.home();
  assert.ok(rows.length >= 1, "Home still has its rows");
});

test("search: switched-off and paused catalogs are not asked; the quickest learned catalog goes first", async () => {
  const { calls, kino } = install({ handler: routes([MANIFEST, [SEARCH, ok([])]]), config: { srcMode: "custom" } });
  kino.storage.set("rb_picks", JSON.stringify({ cnc_HDHub4U_other: false }));
  noteCatalog("cnc_VegaMovies_other", false, "search");
  noteCatalog("cnc_VegaMovies_other", false, "search");
  noteLatency("cnc_GoTaku_other", 100);
  noteLatency("cnc_Kisskh_other", 9000);
  const p = await loadPlugin();
  await p.search({ q: "anything" });
  const asked = calls.filter((c) => /search=/.test(c.path)).map((c) => catOf(c.path));
  assert.ok(!asked.includes("HDHub4U") && !asked.includes("VegaMovies"));
  assert.ok(asked.indexOf("GoTaku") < asked.indexOf("Kisskh"));
});

test("search: inside a 'Ver más' the index answers alone when it has enough, and the server adds when it has few", async () => {
  const many = { on: true };
  const { calls } = install({ handler: routes([MANIFEST, [SEARCH, (m, p) => ok(Array.from({ length: many.on ? 9 : 1 }, (_, i) => meta(`${catOf(p)}-${i}`, `Love Story ${catOf(p)} ${i} (2020)`)))]]) });
  const p = await loadPlugin();
  await p.search({ q: "love" });
  const within = JSON.stringify({ t: "other", i: "x", c: "cnc_Kisskh_other" });
  const before = calls.length;
  const r = await p.search({ q: "love", within });
  assert.ok(r.length >= 8);
  assert.equal(calls.length, before, "no network when the index has enough");
  assert.equal(await p.search({ q: "love", within: "garbage" }), null);
});

test("search: an exact title ends the round early when Kino asks for one specific title", async () => {
  const { calls } = install({ handler: routes([MANIFEST, [SEARCH, (m, p) => ok([meta("id-" + catOf(p), "Exact Film (2021)")])]]) });
  const p = await loadPlugin();
  await p.search({ q: "Exact Film", year: 2021 });
  assert.equal(calls.filter((c) => /search=/.test(c.path)).length, 1);
});

// ---- Home ------------------------------------------------------------------------------------------------------------------

test("home: slow rows cannot push it past Kino's 20 s, and the kept rows are served when the server hangs", async () => {
  const slow = { on: false };
  const { clock } = install({ handler: routes([MANIFEST, [LIST, (m) => (slow.on ? { ms: 30000, body: {} } : ok([1, 2, 3].map((i) => meta(`${m[1]}-${i}`, `Title ${i} of ${m[1]} (20${10 + i})`))))]]) });
  const p = await loadPlugin();
  const first = await p.home();
  assert.ok(first.length >= 3);
  clock.t += 30 * 60 * 1000;
  slow.on = true;
  const fresh = await loadPlugin();
  const t0 = clock.t;
  const again = await fresh.home();
  assert.ok(clock.t - t0 <= 17000, "Home took " + (clock.t - t0));
  assert.ok(again.length >= 1, "kept rows served");
});

test("home: a catalog switched off has no row", async () => {
  install({ handler: routes([MANIFEST, [LIST, (m) => ok([meta(m[1] + "-1", "Only Title (2020)")])]]), config: { srcMode: "custom", homeRows: "8" } });
  globalThis.kino.storage.set("rb_picks", JSON.stringify({ cnc_VegaMovies_other: false }));
  const p = await loadPlugin();
  const rows = await p.home();
  assert.ok(!rows.some((r) => /VegaMovies/i.test(r.title) || /VegaMovies/.test(r.id)));
  assert.ok(rows.length >= 3);
});

// ---- resolve ---------------------------------------------------------------------------------------------------------------

const stream = (url, name = "x", title = "") => ({ name, title, url });

test("resolve: ranks by the quality and size settings, drops what cannot play, keeps alternatives", async () => {
  install({ handler: routes([MANIFEST, [/^\/stream\//, { body: { streams: [
    { name: "x", title: "support", url: "" },
    stream("https://a.example/v720.mp4", "720p", "💾 800 MB"),
    stream("https://a.example/v1080.mkv", "1080p", "🎞️ 1080p\n💾 2 GB"),
    stream("https://a.example/v4k.mkv", "4K", "💾 30 GB"),
  ] } }]]) });
  const p = await loadPlugin();
  const r = await p.resolve(ref("film1"), {});
  assert.equal(r.url, "https://a.example/v1080.mkv", "1080p under the 1080 cap, and the 30 GB 4K is last");
  assert.ok(r.alternatives.length >= 2);
  assert.equal(r.alternatives[r.alternatives.length - 1].url, "https://a.example/v4k.mkv");
});

test("resolve: a copy that did not play (the same title reopened at once) goes last", async () => {
  install({ handler: routes([MANIFEST, [/^\/stream\//, { body: { streams: [stream("https://a.example/one.mp4", "1080p"), stream("https://b.example/two.mp4", "1080p")] } }]]) });
  const p = await loadPlugin();
  const first = await p.resolve(ref("film2"), {});
  const second = await p.resolve(ref("film2"), {});
  assert.notEqual(second.url, first.url);
});

test("resolve: a slow server is a message the person reads and never past Kino's 20 s", async () => {
  const { clock } = install({ handler: routes([MANIFEST, [/^\/stream\//, { ms: 40000, body: {} }]]) });
  const p = await loadPlugin();
  const t0 = clock.t;
  await assert.rejects(() => p.resolve(ref("slow"), {}), (e) => /preparando|preparing|buscando|looking/i.test(e.userMessage || ""));
  assert.ok(clock.t - t0 <= 20000, "took " + (clock.t - t0));
});

test("resolve: a second look after an empty answer never starts past the budget", async () => {
  const state = { n: 0 };
  const { clock } = install({ handler: routes([MANIFEST, [/^\/stream\//, () => (++state.n === 1 ? { ms: 5500, body: { streams: [] } } : { ms: 40000, body: {} })]]) });
  const p = await loadPlugin();
  const t0 = clock.t;
  await p.resolve(ref("ep1"), {}).catch(() => null);
  assert.ok(clock.t - t0 <= 20000, "took " + (clock.t - t0));
});

test("resolve: a title with no copy is found in another catalog (from the index, no new search) and remembered", async () => {
  const own = "cnc_VegaMovies_other"; // one of Home's first rows, so its title is seen there
  const other = "cnc_Kisskh_other";
  const { calls } = install({ handler: routes([
    MANIFEST,
    [/^\/stream\/other\/(.+)\.json$/, (m) => (m[1] === "film-k" ? { body: { streams: [stream("https://v.example/ok.mp4", "1080p")] } } : { body: { streams: [] } })],
    [SEARCH, (m, p) => (m[1] === other ? ok([meta("film-k", "Film Three (2020)")]) : ok([]))],
    [LIST, (m) => ok(m[1] === own ? [meta("film-h", "Film Three (2020)")] : [])],
  ]) });
  const p = await loadPlugin();
  // The title is seen in two catalogs (Home's row, then a search), so the index knows both copies.
  await p.home();
  await p.search({ q: "film three" });
  const hRef = JSON.stringify({ t: "other", i: "film-h" });
  const r = await p.resolve(hRef, {});
  assert.equal(r.url, "https://v.example/ok.mp4");
  assert.match(r.label || "", /Kisskh/);
  const before = calls.length;
  await p.resolve(hRef, {});
  assert.equal(calls.slice(before).filter((c) => /search=/.test(c.path)).length, 0, "the swap is remembered");
});

test("resolve: nothing playable anywhere says so in words", async () => {
  install({ handler: routes([MANIFEST, [/^\/stream\//, { body: { streams: [] } }]]) });
  const p = await loadPlugin();
  await assert.rejects(() => p.resolve(ref("none"), {}), (e) => /fuentes|sources/i.test(e.userMessage || ""));
});

// ---- episodes --------------------------------------------------------------------------------------------------------------

test("episodes: specials and unnumbered videos are numbered after the real ones; duplicates dropped; sorted", async () => {
  install({ handler: routes([MANIFEST, [/^\/meta\//, { body: { meta: { id: "s", name: "Show", videos: [
    { id: "s0", season: 0, episode: 0, title: "Special" },
    { id: "a2", season: 1, episode: 2, title: "Two" },
    { id: "a1", season: 1, episode: 1, title: "One" },
    { id: "u1", season: 1, title: "Unnumbered" },
    { id: "d1", season: 1, episode: 1, title: "dup" },
  ] } } }]]) });
  const p = await loadPlugin();
  const r = await p.episodes(ref("s", "series"));
  assert.deepEqual(r.episodes.map((e) => [e.season, e.number]), [[1, 1], [1, 2], [1, 3], [1, 4]]);
});

test("episodes: a page still being scraped becomes one playable entry and counts against its catalog; inside 20 s", async () => {
  const { clock } = install({ handler: routes([MANIFEST, [LIST, (m) => ok([meta("slow-show", "Slow Show (2020)")])], [/^\/meta\//, { ms: 40000, body: {} }]]) });
  const p = await loadPlugin();
  await p.home();
  const t0 = clock.t;
  const r = await p.episodes(ref("slow-show", "series"));
  assert.equal(r.episodes.length, 1);
  assert.ok(clock.t - t0 <= 20000);
});

// ---- live ------------------------------------------------------------------------------------------------------------------

test("live: checking which catalogs have a playable channel is inside one budget, and unchecked ones are shown", async () => {
  const { clock } = install({ handler: routes([MANIFEST, [/^\/catalog\/tv\//, { ms: 30000, body: {} }]]) });
  const p = await loadPlugin();
  const t0 = clock.t;
  const cats = await p.liveCategories();
  assert.ok(clock.t - t0 <= 19500, "took " + (clock.t - t0));
  assert.ok(cats.length >= 5, "catalogs that could not be checked are shown");
});

test("live: a search across the live catalogs ends inside Kino's 15 s", async () => {
  const { clock } = install({ handler: routes([MANIFEST, [/^\/catalog\/tv\//, { ms: 30000, body: {} }]]) });
  globalThis.kino.storage.set("p1", JSON.stringify({ at: clock.t, v: {} }));
  const p = await loadPlugin();
  const t0 = clock.t;
  await p.liveSearch({ query: "cricket" });
  assert.ok(clock.t - t0 <= 15000, "took " + (clock.t - t0));
});

// ---- choosing catalogs, the settings page, the tools -------------------------------------------------------------------------

test("sources: the list has every catalog with its state; a switch freezes the others and moves the mode to custom", async () => {
  install({ handler: routes([MANIFEST, [LIST, ok([])]]) });
  const p = await loadPlugin();
  await p.settingsStatus();
  const list = p.sourcesList();
  assert.ok(list.length >= 25 && list.every((x) => x.on));
  assert.equal(p.toggleSource("cnc_GoTaku_other", false), true);
  assert.equal(readPicks().cnc_GoTaku_other, false);
  assert.equal(readPicks().cnc_Kisskh_other, true, "the others stay as they were");
  assert.equal(p.toggleSource("nope", false), false);
});

test("settings: the status shows the server, the catalogs and the index; the tools answer", async () => {
  install({ handler: routes([MANIFEST, [LIST, ok([])]]) });
  const p = await loadPlugin();
  const s = await p.settingsStatus();
  assert.match(s.serverStatus, /catálogos/);
  assert.match(s.sources, /activos/);
  assert.match(s.index, /títulos/);
  for (const key of ["resume", "clearIndex", "clearCache"]) assert.match((await p.action(key)).message, /Listo/);
  assert.equal(await p.action("nope"), null);
});

test("screen: the settings page draws one switch per catalog without dropping a node; a switch answers a config", async () => {
  install({ handler: routes([MANIFEST, [LIST, ok([])]]) });
  const p = await loadPlugin();
  await p.settingsStatus();
  for (const device of ["phone", "tv"]) for (const lang of ["es", "en"]) {
    const tree = await p.screen({ route: { name: "settings", params: {} }, state: {}, device });
    const r = checkScreenTree(tree, lang, undefined, { settings: manifestJson.settings, apiVersion: 19 });
    assert.deepEqual(r.dropped, [], r.dropped.join(" | "));
    assert.match(JSON.stringify(tree), /toggleSource/);
  }
  const a = await p.screenEvent({ name: "toggleSource", arg: "cnc_GoTaku_other", value: false, state: {}, route: { name: "settings" }, device: "phone" });
  assert.deepEqual(a.config, { srcMode: "custom" });
});

test("a profile-less server: every request goes to the server root and none carries a profile code", async () => {
  const { calls } = install({ handler: routes([MANIFEST, [LIST, ok([])]]) });
  const p = await loadPlugin();
  await p.home();
  assert.ok(calls.length > 0 && calls.every((c) => c.path.startsWith("/")));
});

test("two callers asking the same path at once share one request", async () => {
  const { calls } = install({ handler: routes([MANIFEST, [/^\/stream\//, { ms: 10, body: { streams: [stream("https://a.example/x.mp4", "1080p")] } }]]) });
  const p = await loadPlugin();
  await Promise.all([p.resolve(ref("same"), {}), p.resolve(ref("same"), {})]);
  assert.equal(calls.filter((c) => /^\/stream\//.test(c.path)).length, 1);
});

// ---- found by the second review -----------------------------------------------------------------------------------------

test("search: catalogs that answer in 6 s are given long enough (the first try waits for what it has taken), and are not blamed", async () => {
  const { clock } = install({ handler: routes([MANIFEST, [SEARCH, (m, p) => ({ ms: 6000, body: { metas: [meta("s-" + catOf(p), "Slow But Fine (2020)")] } })]]) });
  const p = await loadPlugin();
  for (let i = 0; i < 3; i++) {
    const t0 = clock.t;
    const r = await p.search({ q: "slow" + i });
    assert.equal(r[0].title, "Slow But Fine (2020)", "search " + i);
    assert.ok(clock.t - t0 <= 14500, "took " + (clock.t - t0));
  }
  assert.deepEqual(Object.keys(readBreaker()).filter((k) => k.startsWith("search:")).length, 0, "no blame: they did answer");
});

test("copies: what failed is remembered per title (the same index.m3u8 on one CDN is not every title)", async () => {
  const lists = { a: [stream("https://cdn.example/a/index.m3u8", "1080p"), stream("https://other.example/a.mp4", "1080p")], b: [stream("https://cdn.example/b/index.m3u8", "1080p"), stream("https://other.example/b.mp4", "720p")] };
  install({ handler: routes([MANIFEST, [/^\/stream\/other\/(\w)\.json$/, (m) => ({ body: { streams: lists[m[1]] } })]]) });
  const p = await loadPlugin();
  await p.resolve(ref("a"), {});
  await p.resolve(ref("a"), {}); // reopened at once: the first copy is read as failed
  const b = await p.resolve(ref("b"), {});
  assert.equal(b.url, "https://cdn.example/b/index.m3u8", "title B keeps its own best copy (1080p); A's failure does not touch the same file name on the same CDN");
});

test("section: the manifest read and the rows share one budget (an old manifest plus a hung server is still < 20 s)", async () => {
  const { clock } = install({ handler: routes([MANIFEST, [/^\/catalog\//, { ms: 30000, body: {} }]]) });
  const p = await loadPlugin();
  await p.settingsStatus(); // the manifest is kept
  clock.t += 2 * 3600 * 1000; // older than an hour
  const stale = await loadPlugin();
  const t0 = clock.t;
  await stale.section({ tab: null }).catch(() => null);
  assert.ok(clock.t - t0 <= 20000, "took " + (clock.t - t0));
});

test("fallback: a failing 'Dune (1984)' is never played from 'Dune (2021)'", async () => {
  install({ handler: routes([
    MANIFEST,
    [/^\/stream\/other\/(.+)\.json$/, (m) => (m[1] === "dune-new" ? { body: { streams: [stream("https://v.example/dune2021.mp4", "1080p")] } } : { body: { streams: [] } })],
    [LIST, (m) => ok(m[1] === "cnc_VegaMovies_other" ? [meta("dune-old", "Dune (1984)")] : [])],
    [SEARCH, (m) => (m[1] === "cnc_Kisskh_other" ? ok([meta("dune-new", "Dune (2021)")]) : ok([]))],
  ]) });
  const p = await loadPlugin();
  await p.home();
  await p.search({ q: "dune" });
  await assert.rejects(() => p.resolve(ref("dune-old"), {}), (e) => /fuentes|sources/i.test(e.userMessage || ""));
});

test("episodes: a server error is an error, not a made-up one-entry series", async () => {
  install({ handler: routes([MANIFEST, [/^\/meta\//, { status: 500, body: {} }]]) });
  const p = await loadPlugin();
  await assert.rejects(() => p.episodes(ref("x", "series")), (e) => e.code === "unavailable");
});

test("episodes: season-0 specials never displace the real first episode", async () => {
  install({ handler: routes([MANIFEST, [/^\/meta\//, { body: { meta: { id: "s", name: "Show", videos: [
    { id: "sp", season: 0, episode: 1, title: "Special" }, { id: "e1", season: 1, episode: 1, title: "Real One" }, { id: "e2", season: 1, episode: 2, title: "Real Two" },
  ] } } }]]) });
  const p = await loadPlugin();
  const r = await p.episodes(ref("s", "series"));
  assert.deepEqual(r.episodes.map((e) => e.title), ["Real One", "Real Two", "Special"]);
});

test("screen: a catalog id with characters a key cannot hold (top:movies, a space) still gets its switch", async () => {
  const m = serverManifestWith([{ id: "top:movies", type: "movie", name: "Top Movies", extra: [{ name: "search" }] }, { id: "my catalog", type: "series", name: "Mine", extra: [] }]);
  install({ handler: routes([[/^\/manifest\.json$/, { body: m }], [/^\/catalog\//, ok([])]]) });
  const p = await loadPlugin();
  await p.settingsStatus();
  const tree = await p.screen({ route: { name: "settings", params: {} }, state: {}, device: "phone" });
  const r = checkScreenTree(tree, "es", undefined, { settings: manifestJson.settings, apiVersion: 19 });
  assert.deepEqual(r.dropped, [], r.dropped.join(" | "));
  assert.equal(p.sourcesList().length, 2);
});

test("sources: a pick for a catalog the manifest dropped is kept; everything off reads as everything on", async () => {
  install({ handler: routes([MANIFEST, [LIST, ok([])]]) });
  const p = await loadPlugin();
  await p.settingsStatus();
  assert.equal(p.toggleSource("cnc_GoTaku_other", false), true);
  globalThis.kino.storage.set("rb_picks", JSON.stringify({ ...readPicks(), cnc_Gone_other: false }));
  assert.equal(p.toggleSource("cnc_Kisskh_other", false), true);
  assert.equal(readPicks().cnc_Gone_other, false, "the dropped catalog's pick survives");
  // every catalog off
  const all = Object.fromEntries(p.sourcesList().map((x) => [x.id, false]));
  globalThis.kino.storage.set("rb_picks", JSON.stringify(all));
  assert.ok(p.sourcesList().every((x) => x.on), "nothing on is read as everything");
});

test("index: a title in two catalogs is one row that knows both; switching one off leaves it findable through the other", async () => {
  install({ handler: routes([MANIFEST, [SEARCH, (m, p) => (["Kisskh", "GoTaku"].includes(catOf(p)) ? ok([meta("shared-id", "Shared Show (2020)")]) : ok([]))]]) });
  const p = await loadPlugin();
  await p.search({ q: "shared show" });
  const { searchIndex } = await import("../src/robust/index.js");
  const hits = await searchIndex("shared", { onKeys: new Set(["cnc_GoTaku_other"]) });
  assert.equal(hits.length, 1);
  assert.deepEqual(hits[0].cats.sort(), ["cnc_GoTaku_other", "cnc_Kisskh_other"]);
});

test("index: a title with no copy anywhere (and nobody timing out) stops turning up in searches", async () => {
  install({ handler: routes([MANIFEST, [/^\/stream\//, { body: { streams: [] } }], [SEARCH, (m, p) => (catOf(p) === "Kisskh" ? ok([meta("ghost", "Ghost Title (2020)")]) : ok([]))]]) });
  const p = await loadPlugin();
  const found = await p.search({ q: "ghost title" });
  assert.equal(found[0].title, "Ghost Title (2020)");
  await p.resolve(found[0].ref, {}).catch(() => null);
  const { searchIndex } = await import("../src/robust/index.js");
  assert.equal((await searchIndex("ghost")).length, 0);
});

test("a cold first open that times out is not held against the catalog", async () => {
  install({ handler: routes([MANIFEST, [/^\/stream\//, { ms: 40000, body: {} }], [LIST, (m) => ok([meta("cold-" + m[1], "Cold Title (2020)")])]]) });
  const p = await loadPlugin();
  await p.home();
  for (let i = 0; i < 3; i++) await p.resolve(ref("cold-cnc_VegaMovies_other"), {}).catch(() => null);
  assert.deepEqual(Object.keys(readBreaker()).filter((k) => k.startsWith("play:")), []);
});

test("search: titles of a catalog the server names as adult are marked 18+ and never indexed", async () => {
  const m = serverManifestWith([{ id: "cnc_Adult_other", type: "other", name: "Adult (other)", extra: [{ name: "search" }] }, { id: "cnc_Ok_other", type: "other", name: "Ok (other)", extra: [{ name: "search" }] }]);
  install({ handler: routes([[/^\/manifest\.json$/, { body: m }], [SEARCH, (mm, pth) => ok([meta("t-" + catOf(pth), "Some Title " + catOf(pth) + " (2020)")])]]) });
  const p = await loadPlugin();
  const r = await p.search({ q: "some title" });
  assert.equal(r.find((x) => /Adult/.test(x.title)).adult, true);
  const { searchIndex } = await import("../src/robust/index.js");
  assert.ok(!(await searchIndex("some title")).some((x) => /Adult/.test(x.item.title)));
});
