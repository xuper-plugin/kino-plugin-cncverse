// The browse screen's words, in Spanish (neutral, tuteo) and English. `twin` gives a node's `{ field, fieldEn }` pair.
const WORDS = {
  tabHome: ["Inicio", "Home"],
  tabCatalogs: ["Catálogos", "Catalogs"],
  brWatch: ["Ver", "Watch"],
  brInfo: ["Más información", "More info"],
  brRecent: ["Continuar viendo", "Continue watching"],
  brSearch: ["Buscar", "Search"],
  brSearchHint: ["Buscar en CNCVerse", "Search CNCVerse"],
  brSearchTitle: ["Buscar", "Search"],
  brSearchedBefore: ["Buscado recientemente", "Recently searched"],
  brNoResults: ["No encontramos nada con esas palabras.", "Nothing matched those words."],
  brSearchFailed: ["No se pudo buscar. Revisa tu conexión e inténtalo de nuevo.", "The search failed. Check your connection and try again."],
  brFailed: ["No se pudo cargar esta sección. Revisa tu conexión e inténtalo de nuevo.", "This section could not be loaded. Check your connection and try again."],
  brRetry: ["Reintentar", "Retry"],
  brEmpty: ["Aún no hay nada aquí.", "Nothing here yet."],
  brBack: ["Atrás", "Back"],
  brClose: ["Cerrar", "Close"],
  brSettings: ["Configuración", "Settings"],
  brLive: ["En vivo", "Live"],
  brLiveSearchHint: ["Buscar en los canales en vivo", "Search the live channels"],
  brLiveEmpty: ["No hay canales en vivo por ahora.", "No live channels right now."],
};

/** `key` in both languages: `{ es, en }`. */
export const both = (key) => ({ es: WORDS[key][0], en: WORDS[key][1] });

/** For tests: every key has both languages. */
export const KEYS = Object.keys(WORDS);
