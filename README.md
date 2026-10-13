# CNCVerse — plugin de Kino

> **Archivado.** Para ver películas y series usa [Latino](https://github.com/xuper-plugin/kino-plugin-latino) (2.1.0 en
> adelante): trae CNCVerse como fuente de respaldo de reproducción, sin la búsqueda ni las listas del puente, que eran
> lentas y poco fiables. Este plugin ya no recibe cambios.


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
- **Sección propia «CNCVerse»** con pestañas Inicio, Películas, Series y anime y Resúmenes, y una portada del día; tema
  de color propio.
- **En vivo**: eventos deportivos (LivXow, PlayZTV, PlayFy, SportzX, SKTech) y JioTV por género (país IN).
- **Solo español e inglés** por defecto: se ocultan las fuentes y estantes que el puente nombra en otro idioma (Dizilla, MovieBox IN,
  Movix, «Hindi Dubbed», «Bangla»…) y los idiomas de JioTV que no son inglés. El ajuste **Mostrar otros idiomas** los
  devuelve.
- **JioTV por idioma** (English por defecto; el resto con «otros idiomas») además de por género; los eventos próximos (`🔜`) se ocultan
  por defecto.
- **Resúmenes deportivos** (LivXow, PlayFy, SportzX): partidos ya jugados, para ver bajo demanda.
- **Búsqueda dentro de una página** («Ver más») acotada a esa fuente.
- Ajustes: fuentes de video, buscar en todas o solo las principales, preferir archivo directo o HLS, ocultar eventos
  próximos e idiomas de JioTV.
- Elige la copia por calidad y tamaño máximo (ordenan, no ocultan); el resto queda en el menú de servidores. Si abres un
  título otra vez poco después porque no cargó, sirve otra copia.

## Notas

- Casi todo el contenido está en hindi o inglés. Los subtítulos del puente que son https se pasan al reproductor; los que
  viajan por su proxy en http no los acepta Kino. Para español usa **Buscar subtítulos en línea**: las fichas llevan los
  ids de IMDb/TMDB (buscados por título) para que acierte.
- La búsqueda pregunta a las fuentes una por una, las más rápidas primero (el puente atiende las búsquedas casi en serie:
  preguntar a todas a la vez las hacía fallar a todas). Si ninguna responde, el plugin dice que el puente no responde en
  lugar de «no se encontró».
- El puente rastrea los sitios al pedir un título: una ficha o una lista pueden tardar de 5 a 20 segundos. Un anime largo
  (Bleach: 366 capítulos) puede pasar los 20 s que Kino da a una lista la primera vez: el puente sigue trabajando y al
  abrirlo otra vez responde. Re:ANIME lista los capítulos pero hoy casi no entrega video; otras fuentes sí.
- **Respaldo entre fuentes**: si la fuente de un título (una película o un paquete de temporada) no entrega video, el
  plugin busca el mismo título en las demás, de la más rápida a la más lenta, y reproduce el de la primera que lo tiene; la
  copia lleva el nombre de esa fuente y se recuerda 6 horas para ese título. Dura lo que Kino da a una reproducción (20 s),
  así que funciona mejor con fuentes ya «calientes». No cubre un capítulo suelto de otra fuente.
- Cada título lleva una etiqueta con su fuente. El puente trata cada fuente distinto: unas responden en segundos y otras
  (HDHub4U sobre todo) se quedan sin video o tardan 35 s o más. El plugin recuerda 6 horas qué fuentes fallaron y las pone
  al final de las búsquedas. Si una fuente no entrega video, prueba el mismo título en otra (otra etiqueta); el puente
  también guarda lo que alcanzó a buscar, así que reabrir la ficha a los pocos segundos suele funcionar.
- Una lista que el puente aún está armando se abre como una sola entrada «Ver» con los videos del título.
- Se dejaron fuera Netflix, Prime Video, Hotstar, Disney, Marvel, Pixar y Star Wars del puente (sus tarjetas no traen
  título), RingZ y Castle TV. Los géneros "Adult" nunca se muestran.
- Kino pide tu aprobación al instalar («Puede reproducir video desde cualquier servidor»).
- El perfil incluido es compartido por todas las personas que instalan el plugin; el sellado es ofuscación, no un
  secreto. Si el puente lo revoca, el plugin deja de funcionar hasta publicar uno nuevo (o hasta que pegues el tuyo).
- No está afiliado con el puente, los sitios ni los canales que lista.
