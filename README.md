# CNCVerse — plugin de Kino

Películas, series, anime, eventos deportivos y TV en vivo a partir de **CNCVerse Bridge**
([cncverse.dpdns.org](https://cncverse.dpdns.org)), el puente que expone proveedores de CloudStream como addon de
Stremio. Es un plugin nativo de Kino: habla directo con el puente, sin pasar por la conversión de addons de Stremio.

## Instalar

En Kino: **Plugins ▸ Agregar un plugin ▸ Kino**, y pega la dirección de este repositorio (sin `@rama`: el código del
perfil va sellado en el manifiesto y solo se abre al instalar desde la rama principal). Requiere Kino 0.9.55 o posterior.
No hay nada que configurar.

Si prefieres usar tu propio perfil de CNCVerse Bridge, pega la URL de tu `manifest.json` en el ajuste **Tu propio perfil
(opcional)**; reemplaza al perfil incluido y se guarda cifrada en el aparato.

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
- El perfil incluido es compartido por todas las personas que instalan el plugin; el sellado es ofuscación, no un
  secreto. Si el puente lo revoca, el plugin deja de funcionar hasta publicar uno nuevo (o hasta que pegues el tuyo).
- No está afiliado con el puente, los sitios ni los canales que lista.
