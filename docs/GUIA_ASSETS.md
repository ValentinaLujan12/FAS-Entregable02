# Guía de assets - cómo cambiar el arte

Todo el arte es **SVG vectorial generado por código** (`npm run assets:generate`, archivo `tools/generate-assets.ts`) con la estética pastel del viejo oeste. El cliente **no tiene tamaños ni rutas fijas en el código**: lee `public/assets/manifest.json`. Para reemplazar una imagen:

1. Exporta tu arte **con el mismo nombre de archivo y las mismas dimensiones en píxeles** de la tabla.
2. Colócalo en la misma carpeta (`public/assets/...`).
3. Si cambiaste el formato (p. ej. de `svg` a `png` o `webp`), edita la clave `"ext"` de esa sección en `manifest.json`.
4. Recarga el navegador (Ctrl/Cmd+Shift+R). No hay que recompilar.

> Todas las imágenes de personajes/UI se exportan al **doble (@2x)** del tamaño en que se muestran, para verse nítidas en pantallas de alta densidad. El escenario lógico es **1920x1080 (16:9)** y se escala con *letterbox* a cualquier ventana.

## Tabla de tamaños

| Elemento | Carpeta / archivo | Tamaño de archivo (px) | Se muestra a (px) | Formato recomendado | Notas |
|---|---|---|---|---|---|
| **Escenario (lienzo lógico)** | - | 1920 x 1080 | escalado | - | Todas las coordenadas del juego están en este espacio |
| **Cartas** (52 + comodín) | `cards/{valor}{pinta}.*` p. ej. `AH`, `10S`, `KD`, `JOKER` | **280 x 392** | 140 x 196 | PNG/WebP con transparencia | Esquinas redondeadas (radio 24 px) transparentes. Proporción 5:7 |
| **Reverso** | `cards/back.*` | 280 x 392 | 140 x 196 | PNG/WebP | Se usa en mazo y en las manos rivales |
| **Mesa (paño)** | `board/mesa.*` | **1640 x 800** | 1640 x 800 | PNG/WebP | Centro en (960, 470) del escenario |
| **Hueco del mazo** | `board/slot_mazo.*` | 280 x 392 | 140 x 196 | PNG/WebP | Centro en (855, 440) |
| **Hueco del pozo** | `board/slot_pozo.*` | 280 x 392 | 140 x 196 | PNG/WebP | Centro en (1065, 440) |
| **Marcador de turno** | `board/marcador_turno.*` | 256 x 256 | 128 x 128 | PNG/WebP | Aro/halo que rodea al jugador con el turno |
| **Placa de jugador** | `board/placa_jugador.*` | **480 x 120** | 360 x 90 | PNG/WebP | Fondo de nombre + puntos + cartas |
| **Fondo lejano** | `bg/bg_far.*` | 1920 x 1080 | 1920 x 1080 | JPG/WebP/PNG | Capa 1 (paralaje 0.012). Opaca |
| **Fondo medio** | `bg/bg_mid.*` | 1920 x 1080 | 1920 x 1080 | PNG/WebP con alfa | Capa 2 (paralaje 0.028) |
| **Fondo cercano** | `bg/bg_near.*` | 1920 x 1080 | 1920 x 1080 | PNG/WebP con alfa | Capa 3 (paralaje 0.05); deja libre el centro |
| **Avatares** (8) | `avatars/avatar_0...7.*` | **256 x 256** | 128 x 128 | PNG/WebP | Se recortan en círculo por CSS |
| **Logo** | `ui/logo.*` | **1280 x 512** | 640 x 256 | PNG/WebP con alfa | Pantalla de inicio. Deja margen lateral: el rótulo no debe tocar los bordes |
| **Iconos** (16) | `ui/icon_{turno,reloj,corona,bot,desconectado,ajustes,ronda,eliminado,mazo,pozo,ayuda,copiar,mesa,sonido,paleta,salir}.*` | **96 x 96** | 48 x 48 | PNG/WebP con alfa o SVG | Monocromos en color tinta (#5a4636) |
| **Favicon** | `ui/favicon.svg` | 64 x 64 | 32 x 32 | SVG | Estrella de sheriff |

El mapa exacto (coordenadas, capas, factores de paralaje) está en `public/assets/manifest.json`.

## Nombres de las cartas

`{valor}{pinta}` con valor ∈ `A 2 3 4 5 6 7 8 9 10 J Q K` y pinta ∈ `H` (corazones) `D` (diamantes) `C` (tréboles) `S` (picas). Ejemplos: `AH`, `10S`, `KD`. Comodín: `JOKER`. Reverso: `back`.

## Fondo animado (no es un asset)

Las partículas (motas de luz, polvo del desierto, rayos de sol) las dibuja `src/extras/web/fondo.ts` en un `<canvas>`; las 3 capas `bg_*` solo dan la profundidad estática con paralaje. Al cambiar el arte, mantén el **centro despejado** (la mesa ocupa ≈ 1640x800 en el centro). Niveles en el botón **Efectos** del juego: auto, alto, medio, bajo, apagado; se respeta `prefers-reduced-motion`.

## Skins (cartas, mesas y ambientes)

El catálogo está en **`src/extras/skins/catalogo.ts`** (lo leen cliente y servidor). Cada entrada: `id`, `nombre`, `descripcion`, `premium`, `precio` (≤ 999; 0 si es básica) y `diseno` (parámetros con los que el generador pinta el arte). Saldo inicial gratuito: `saldoInicial` (99, suficiente para una skin de entrada). Botón temporal "Recargar tokens": objeto `recarga` (`activa`, `tokens` = 999); ponlo en `activa: false` o bórralo cuando exista "Comprar monedas".

**Cartas premium con tinta** (`diseno.tinta`): `metal` (lámina plata/oro con degradado y grano), `neon` (trazo fluorescente con doble halo), `marmol` (tinta marmolada con `paleta` de 3 colores), `salpicado` (salpicaduras con `paleta`) y `holo` (iridiscente). Son brillos de **tinta**, no reflejos de luz. El marco de la carta usa `marco.tinta` = `metal` o `neon`. Motivos del reverso: `cuerda`, `herraduras`, `sarape`, `cactus`, `estrellas`, `dunas`, `repujado`, `liso`. Mesas: `diseno.efecto` = `tachas` | `neon` | `vetas`. Ambientes: `estilo` = `desierto` | `pradera` | `canon` | `saloon` | `pueblo` y `variante` = `noche` | `faroles`.

| Tipo | Archivo | Tamaño (px) | Se muestra a |
|---|---|---|---|
| Reverso de carta | `skins/cards/back_{id}.*` | 280 x 392 | 140 x 196 (el frente de las cartas es común; la skin añade reverso y un marco opcional, `diseno.marco`) |
| Mesa (con perspectiva: borde fino arriba, grueso abajo) | `skins/tables/{id}.*` | 1640 x 800 | 1640 x 800 |
| Ambiente (3 capas de paralaje) | `skins/ambients/{id}_{far,mid,near}.*` | 1920 x 1080 | 1920 x 1080 (igual que `bg/`) |

**Añadir una skin:** (1) agrega la entrada al catálogo (o reemplaza el arte con el mismo nombre de archivo y tamaño); (2) `npm run assets:generate`; (3) `npm run build`. Las skins *premium* deben llevar `"premium": true` y `precio` entre 1 y 999. Las **mesas premium** son las únicas que se comparten entre jugadores (bisel con el dueño); las demás skins de mesa y los ambientes son locales.

## Celebraciones de victoria (skins de celebración)

Son **código + catálogo**, no imágenes. En `skins.catalogo.ts` -> `celebraciones`: `id`, `nombre`, `descripcion`, `premium`, `precio` y `diseno` = `{ efecto, colores[], musica }`.

- **`efecto`** debe existir en el registro `EFECTOS` de `src/extras/web/celebracion/efectos.ts` (`serpentinas`, `estrellas`, `tinta`, `disco`, `fuegos`). Para crear uno nuevo: escribe una función `(params) => { paso(dt, g, t): boolean }` y regístrala con `registrarEfecto('mi_efecto', fabrica)`; el efecto recibe `modo` (`pantalla` = pantalla completa si gana quien juega; `asiento` = en el puesto del ganador, en cono hacia arriba), `origen`, `colores`, `duracion`, `intensidad` y `alSonar(id, volumen)`.
- **`musica`** es el id de una receta de `RECETAS_CELEBRACION` en `src/extras/web/musica.ts` (`fanfarria`, `campanas`, `disco`, `synthwave`).
- **Quitar una skin:** borra su entrada del catálogo (los jugadores que la tengan vuelven a la básica). **Añadir:** entrada nueva + efecto/música (o reutiliza los existentes). No se toca ninguna pantalla.

## Modo daltónico

Las caras alternativas están en `public/assets/cards-cb/` (misma nomenclatura que `cards/`, paleta Okabe-Ito: naranja, azul, verde y negro). `npm run assets:generate` las regenera. Para arte real, sustituye los archivos manteniendo nombres y tamaño.

## Música

La música de fondo se **compone en el navegador** a partir de recetas (`src/extras/web/musica.ts`): 3 de sala y 5 por modalidad. Para añadir una, agrega un objeto a `RECETAS` con su `contexto` (`sala`, `CLASICA` o `APUNTADO`); se reproducirá en el sorteo de cada ronda/partida.

## Sonido y fuentes

Los sonidos **se sintetizan en el navegador** (`src/extras/web/sonido.ts`, WebAudio; incluye los de las reacciones `rx_*`): no hay archivos de audio. Para usar audio propio, reemplaza `Sonido.sintetizar` por la reproducción de tus `.mp3/.ogg` (el servidor ya los sirve desde `public/`) conservando los identificadores (`robar`, `descartar`, `turno`, `error`, `cerrar`, `aviso`, `arrastrar`, `soltar`, `seleccionar`, `deseleccionar`, `agrupar`, `clic`). Tipografías (licencia OFL, `public/fonts/OFL.txt`):

- **Interfaz:** Rye (títulos) y Nunito (texto). Sus `.woff2` están en `public/fonts/` y las carga `public/styles.css` (la CSP solo permite fuentes del propio sitio).
- **Arte:** Zilla Slab (números de las cartas), Rye y Nunito se usan solo al generar el arte: `tools/generate-assets.ts` las lee de `node_modules/@fontsource/*` y convierte el texto en trazados con `opentype.js`. Por eso Zilla Slab no aparece en el CSS y esos paquetes son dependencias de desarrollo aunque ningún archivo del juego los importe.

## Comprobación rápida

```bash
npm run test:ui     # e2e de interfaz: verifica que carga y renderiza con los assets actuales
npm run capturas    # regenera docs/mockups/*.png para comparar antes/después
```
