# Changelog

## 2.1.2

- Faster opening: Home keeps its rows (7 days) and answers with them when the server is slow or down; the browse screen's Inicio is drawn at once from those rows, and a tab's kept copy is shown for up to 7 days (refreshed behind).
- Catalog pages are also kept in storage (fresh 10 min, the old copy serves up to 24 h if the network fails), so a restarted plugin does not go back to the network for every row.
