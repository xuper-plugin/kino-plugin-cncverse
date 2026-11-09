// The local index: every title the plugin has seen (a Home row, a catalog page, a search answer) is kept in kino.catalog, a SQLite file
// Kino owns and searches. The server answers a search in 2-20 s per catalog, one at a time, so a search that begins with the index
// answers at once with everything seen before and lets the server only add what is new. It fills itself from use, it is a cache and may
// be empty (a new device, a restore): nothing depends on it.
const BATCH = 500;
const KEEP_MAX = 40000; // well under Kino's 100,000 and 64 MiB; the oldest seen go first
const DATA_MAX = 3600; // Kino refuses a batch with one `data` over 4,096 BYTES of JSON: an over-long ref is simply not indexed
const PRUNE_STEP = 500;

const available = () => typeof kino.catalog === "object" && kino.catalog !== null;

function clip(text, max) {
  let s = String(text).slice(0, max);
  if (/[\uD800-\uDBFF]$/.test(s)) s = s.slice(0, -1);
  return s;
}

/** The UTF-8 size of a string (the limit is in bytes; a JS string counts UTF-16 units). */
export function bytes(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

/** The catalog row of a Kino item that came from catalog [catId], or null when it cannot be kept. Channels are not indexed. */
function rowOf(item, catId, now, before) {
  if (!item || !item.id || !item.ref || !item.title || item.kind === "live" || item.adult === true) return null;
  // The same title is often in several catalogs (the item id comes from the server's id): the row keeps the catalogs that have it,
  // the one that just showed it first, so a catalog switched off or paused does not take the title away from the others.
  const cats = [catId, ...catsOf(before).filter((c) => c !== catId)].slice(0, 4);
  const data = { r: item.ref, k: item.kind === "series" ? "s" : "m", c: cats };
  if (item.poster) data.p = item.poster;
  if (item.year) data.y = item.year;
  if (bytes(JSON.stringify(data)) > DATA_MAX) return null;
  return { id: String(item.id).slice(0, 128), title: clip(item.title, 300), sort: now, data };
}

/** The catalogs a row says have the title (a row of an older shape held one id as a string). */
function catsOf(row) {
  const c = row && row.data && row.data.c;
  return Array.isArray(c) ? c.filter((x) => typeof x === "string") : typeof c === "string" ? [c] : [];
}

/** Keep these items (they came from catalog [catId]). Never fails the call it rides on. */
export async function indexItems(items, catId) {
  if (!available() || !items.length) return;
  const now = Date.now();
  const write = async () => {
    for (let i = 0; i < items.length; i += BATCH) {
      const slice = items.slice(i, i + BATCH);
      const known = new Map();
      for (const row of await kino.catalog.get(slice.map((it) => String(it.id).slice(0, 128)))) known.set(row.id, row);
      const rows = slice.map((it) => rowOf(it, catId, now, known.get(String(it.id).slice(0, 128)))).filter(Boolean);
      if (rows.length) await kino.catalog.upsert(rows);
    }
  };
  try {
    await write();
    if (Math.random() < 0.1) await prune(0);
  } catch (e) {
    // A full catalog (100,000 rows or 64 MiB) refuses every write: make room and try once more, or the index would stay frozen.
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

/** Drop the oldest-seen rows: everything over KEEP_MAX, and at least [atLeast]. */
async function prune(atLeast) {
  const excess = Math.max(atLeast, (await kino.catalog.count()) - KEEP_MAX);
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

/** `{ item, cat, cats }` for each title of the index that matches [q] (every word, in any order); optionally only of catalog [only] or of [onKeys] (`cat` is then one of those); at most [limit]. */
export async function searchIndex(q, { only, onKeys, limit = 60 } = {}) {
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

/** `{ title, cat, kind }` of the item with this id (a card key), or null when it was never seen or the index is empty. */
export async function indexGet(id) {
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

/** Forget a title (it has no copy anywhere): it stops turning up in searches. */
export async function indexRemove(id) {
  if (!available()) return;
  try {
    await kino.catalog.remove([String(id).slice(0, 128)]);
  } catch {
    // it ages out with the rest
  }
}

export async function indexSize() {
  if (!available()) return 0;
  try {
    return await kino.catalog.count();
  } catch {
    return 0;
  }
}

export async function clearIndex() {
  if (available()) await kino.catalog.clear();
}
