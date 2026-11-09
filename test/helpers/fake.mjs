// A fake server + the kit's kino, with a virtual clock: a request that "takes" 12 s moves Date.now() by 12 s at once, so the time
// budgets can be tested without waiting. Calls started together run together (the clock goes to the latest end, not the sum).
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createKino } from "../../sdk/kino-shim.mjs";

const manifest = JSON.parse(readFileSync(new URL("../../kino-plugin.json", import.meta.url)));
export const serverManifest = () => JSON.parse(readFileSync(new URL("../fixtures/manifest.json", import.meta.url)));

export const meta = (id, name, extra = {}) => ({ id, type: "other", name, poster: "https://img.example/" + id.replace(/[^a-z0-9]/gi, "").slice(0, 10) + ".jpg", ...extra });
export const ok = (metas) => ({ body: { metas } });
export const MANIFEST = [/^\/manifest\.json$/, { body: serverManifest() }];

let n = 0;
/** A fresh copy of the plugin's module state (its in-memory caches) for each test. */
export const loadPlugin = () => import("../../src/plugin.js?t=" + ++n);

/**
 * Install a fake kino as the global. [handler](path, opts, ctx) answers `{ status?, body, ms? }` (ms = how long it "takes") or throws.
 * `path` is what follows the server's address.
 */
export function install({ handler, config = {}, lang = "es-CO", extra = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "cnc-"));
  const { kino } = createKino(manifest, { storageFile: join(dir, "s.json"), cookiesFile: join(dir, "c.json"), config, lang, env: {} });
  const clock = { t: 1_800_000_000_000 };
  const realNow = Date.now;
  Date.now = () => clock.t;
  const calls = [];
  const fake = {
    ...kino,
    config: { get: (k) => (k in config ? config[k] : kino.config.get(k)), all: () => ({ ...config }) },
    fetch: async (url, opts = {}) => {
      const start = clock.t;
      const rel = decodeURIComponent(url.replace(/^https:\/\/cncverse\.dpdns\.org/, ""));
      calls.push({ path: rel, opts, at: clock.t });
      const out = await handler(rel, opts, { clock });
      const ms = out.ms || 0;
      if (opts.timeoutMs && ms > opts.timeoutMs) {
        clock.t = Math.max(clock.t, start + opts.timeoutMs);
        throw Object.assign(new Error("took too long"), { code: "timeout" });
      }
      clock.t = Math.max(clock.t, start + ms);
      const status = out.status || 200;
      const body = typeof out.body === "string" ? out.body : JSON.stringify(out.body ?? {});
      return { ok: status < 300, status, url, headers: {}, text: () => body, json: () => JSON.parse(body) };
    },
    // a real (short) wait, so a race against a sleep behaves as in Kino: work that is ready wins, a stuck one loses
    sleep: (ms) => new Promise((r) => setTimeout(() => { clock.t += ms; r(); }, Math.min(ms, 30))),
    ...extra,
  };
  globalThis.kino = Object.freeze(fake);
  return { kino: globalThis.kino, calls, clock, restore: () => { Date.now = realNow; } };
}

/** Routes `[regex, answer | fn]` as a handler; 404 when nothing matches. */
export function routes(list) {
  return async (path, opts, ctx) => {
    for (const [re, a] of list) {
      const m = re.exec(path);
      if (m) return typeof a === "function" ? a(m, path, ctx) : a;
    }
    return { status: 404, body: {} };
  };
}
