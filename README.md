# CNCVerse plugin for Kino

A Kino plugin that bridges Kino to a CNCVerse server
(`cncverse.dpdns.org`), which speaks the Stremio addon protocol.

**The server owns everything that changes.** Catalogs, sources, scrapers, tokens and their upkeep live there.
This plugin only translates what the server answers into Kino's plugin API. It has no catalog ids, source
names or site rules written in it: catalogs, sections, search support and resources are read from the
server's `manifest.json` on every run (cached for an hour). If the server adds, renames or removes a
catalog, Kino shows it without a new release of this plugin. It needs an update only when Kino's plugin
SDK moves on, or when the server leaves the Stremio protocol.

> Not affiliated with CNCVerse. The plugin never hosts or stores any content: it shows what the server
> returns, and the server decides what that is. As with any community plugin, what you watch through it is
> your responsibility.

## Install

In Kino: Ajustes ▸ Plugins ▸ Agregar ▸ type `xuper-plugin/kino-plugin-cncverse`.
Kino shows the consent sheet (it reaches `cncverse.dpdns.org`, plays video from any server the catalog
points to, and shares error reports with Kino) before anything is installed.

## What it uses from Kino's API

| Kino | From the server |
| --- | --- |
| `home` | The first catalogs as rows (2, 4 or 8, a setting), plus a row of live channels for each live catalog that has something Kino can play. |
| `section` | One tab per catalog (8 at a time, a setting) with one row per section the server lists for it (the Stremio `genre` extra). |
| `browse` and `categories` | "Ver más" with `skip` paging, a tile per catalog (the art is its first poster) and a row's own section. |
| `search`, `scopedSearch` | `search` on every catalog that supports it; inside a "Ver más" page, only that page's catalog. |
| `episodes`, `details` | The `meta` resource: description, cast, genres, seasons, thumbnails. Ids come from the server, and `kino.meta` by title fills in the rest (TMDB, IMDb, AniList…) so Kino's info page, subtitles and skip marks work. |
| `resolve` | The `stream` resource: the first playable stream, the others as labelled copies in the player's "Servidor" menu, with the stream's own subtitles and request headers. |
| `channels`, `liveSearch` | Catalogs of type `tv`; live search by name across them. |
| `subtitles` | The `subtitles` resource, by IMDb id. |
| `download` | Offline copies of whatever `resolve` returns (progressive files and HLS VOD). |
| settings | Rows on Home, section tabs, and a connection check that names the first step that fails (manifest, catalog, title page or stream). |

## What it deliberately leaves out

- Torrent streams (`infoHash`), YouTube ids and "open in browser" links are dropped.
- Streams that carry ClearKey keys (CENC over HLS, `SAMPLE-AES-CTR`) are dropped: Kino's player cannot decrypt
  them. A live catalog made only of those is not listed, and a channel that is only offered that way says so.
  They come back by themselves if the server offers something playable.
- A stream whose address is a stand-in (`no.link`, an event that has not started) says "not started yet".
- Entries whose section name says adult (`Adult`, `18+`, `XXX`…) are marked 18+ and only show while the
  person's 18+ code is unlocked.

## Checking it

```
node sdk/validate.mjs <this folder>                      # from Kino's plugin kit
node sdk/run.mjs <this folder>/plugin.js home
node sdk/run.mjs <this folder> section
node sdk/run.mjs <this folder> live categories
node sdk/run.mjs <this folder> action checkConn
```

## License

Apache-2.0. The icon is CNCVerse's own logo, used only to identify the server this plugin talks to.
