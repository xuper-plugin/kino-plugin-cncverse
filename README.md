# CNCVerse — plugin de Kino

Películas, series, anime, eventos deportivos y TV en vivo a partir de **CNCVerse Bridge**
([cncverse.dpdns.org](https://cncverse.dpdns.org)), el puente que expone proveedores de CloudStream como addon de
Stremio. Es un plugin nativo de Kino: habla directo con el puente, sin pasar por la conversión de addons de Stremio.

## Instalar

1. En Kino: **Plugins ▸ Agregar un plugin ▸ Kino**, y pega la dirección de este repositorio. Requiere Kino 0.9.55 o
   posterior.
2. En los ajustes del plugin pega **tu** dirección de CNCVerse Bridge (la URL de tu `manifest.json`, con tu código
   personal). Se guarda cifrada en el aparato y solo se envía a `cncverse.dpdns.org`.

## Qué trae

- **Películas, series y anime** de HDHub4U, 4K HDHUB, VegaMovies, Rogmovies, MultiMovies, Cinefreak, MovieBox IN, Movix,
  Kisskh, Dizilla y Re:ANIME: filas en el Inicio, una categoría por fuente, géneros de cada una, búsqueda en todas a la
  vez, episodios y ficha del título.
- **En vivo**: eventos deportivos (LivXow, PlayZTV, PlayFy, SportzX, SKTech) y JioTV por género.
- Elige la copia por calidad y tamaño máximo (ordenan, no ocultan); el resto queda en el menú de servidores. Si abres un
  título otra vez poco después porque no cargó, sirve otra copia.

## Notas

- Casi todo el contenido está en hindi o inglés; los subtítulos que trae el puente viajan por un proxy en http y Kino no
  los acepta, así que usa **Buscar subtítulos en línea** del reproductor.
- El puente rastrea los sitios al pedir un título: una ficha o una lista pueden tardar de 5 a 20 segundos.
- Se dejaron fuera Netflix, Prime Video, Hotstar, Disney, Marvel, Pixar y Star Wars del puente (sus tarjetas no traen
  título), RingZ y Castle TV. Los géneros "Adult" nunca se muestran.
- Kino pide tu aprobación al instalar («Puede reproducir video desde cualquier servidor»).
- No está afiliado con el puente, los sitios ni los canales que lista.
