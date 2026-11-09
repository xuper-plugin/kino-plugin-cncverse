# Changelog

## 2.2.0

Robustness, with no source names written in the plugin (everything is keyed by the catalog ids of the server's manifest).

- **apiVersion 19** (Kino 0.9.81 or later): the screen is now part of the manifest instead of an `enhancement`, and `catalog` (the local
  search index) needs 13. Older Kinos are no longer offered this plugin.
- **Time budgets everywhere.** The 2.1.2 search could take ~40 s (up to 18 catalogs, five at a time, 10 s each) against Kino's 15 s,
  a play could wait 25 s against 20 s, and Home, the live checks and a catalog page had no shared limit. Each now shares one budget and cuts
  every request to what is left; a play that runs out says the server is still preparing the video.
- **Local search index** (`kino.catalog`): every title seen is kept; search answers from it at once and the server only adds what is
  new (a shorter round when the index already has results); a "Ver más" search is answered from the index when it has enough; with the
  server down the index still answers, and only an empty index plus a silent server is an error.
- **Search asks one catalog at a time, the quickest first** (the server answers searches almost serially), two passes, learned speed.
- **Circuit breaker per catalog** with two scopes (search / play), 10 min, 30 min, 2 h, 6 h, half-open trial. A catalog never asked for lack of
  time is not blamed.
- **Choose your catalogs:** setting "Qué catálogos usar" and a Fuentes list on the settings page (a switch per catalog with its state).
- **Copies are ranked** (quality, size, file kind, settings "Calidad preferida", "Tamaño máximo", "Preferir"); a copy that failed goes last; a
  title with no copy is looked for in the other catalogs (index first), remembered 6 h.
- **Episodes:** specials and unnumbered videos are numbered after the real ones (they used to merge into episode 1); a page still being
  scraped plays as one entry.
- Same request asked twice at once is sent once; the manifest read is capped (6 s with an older copy, 12 s without); tools: resume paused
  catalogs, clear the search index, clear the cache; status lines for catalogs and the index.
- 26 tests with a fake server and a virtual clock.

## 2.1.2

- Faster opening: Home keeps its rows (7 days) and answers with them when the server is slow or down; the browse screen's Inicio is drawn at once from those rows, and a tab's kept copy is shown for up to 7 days (refreshed behind).
- Catalog pages are also kept in storage (fresh 10 min, the old copy serves up to 24 h if the network fails), so a restarted plugin does not go back to the network for every row.
