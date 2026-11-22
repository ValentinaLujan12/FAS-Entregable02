# Guía de despliegue (GitHub + Supabase + Vercel) - Repositorio FAS-Entregable03

Todo es gratis y no pide tarjeta. Tiempo aproximado: 20 minutos.

El proyecto está en la carpeta `Entregable 03\Repositorio FAS-Entregable03` (ahí están `package.json`, `vercel.json` y esta guía). Necesitas Node 22 solo si quieres probarlo antes en tu equipo (`npm ci`, `npm run build`, `npm run dev`).

## ¿La base de datos cuesta?

No. El plan **Free** de Supabase incluye la base de datos PostgreSQL, el editor SQL y Realtime sin pagar. Límites que importan aquí:

- 2 proyectos gratis y 500 MB de base de datos por proyecto (el juego usa muy poco: las salas viejas se borran solas).
- Realtime: 200 conexiones simultáneas y 2 millones de mensajes al mes.
- Si el proyecto pasa una semana sin uso, Supabase lo **pausa**. No se pierde nada: se reactiva con **Restore project**.

Vercel también es gratis (plan Hobby) para un proyecto personal o de curso.

## Antes de desplegar: verificación local

Ejecuta esto en la carpeta del repositorio (requiere Node 22). Debe terminar sin errores:

```bash
npm ci
npm run verify
```

`npm run verify` ejecuta las funciones de idoneidad del pipeline: tipos, reglas de dependencias con sus sondas, complejidad del núcleo, aserciones, métricas de modularidad y pruebas con cobertura (ver `ADR-14`). La complejidad de la interfaz web y de los extras se mide aparte con `npm run cc:ui` y no bloquea.

**En Windows:** si la carpeta trae `node_modules` instalado en otro sistema operativo, `npm ci` lo borra y lo reinstala para Windows desde `package-lock.json`. Sin ese paso, `npm run dev`, `npm test` y `npm run verify` fallan por los binarios nativos (esbuild y Rollup). `node_modules` no se sube a GitHub.

## 1. Subir a GitHub

1. Crea una cuenta en <https://github.com> y un repositorio vacío (sin README), por ejemplo `el-apuntado`. Puede ser público, o privado invitando al profesor como colaborador (**Settings > Collaborators**), porque el enlace va en el Entregable 03.
2. Abre una terminal en la carpeta del repositorio (`Repositorio FAS-Entregable03`) y ejecuta:

```bash
git init
git add .
git commit -m "El Apuntado"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/el-apuntado.git
git push -u origin main
```

Sin terminal: GitHub Desktop, **Add an existing repository**, elegir la carpeta `Repositorio FAS-Entregable03` y **Publish repository**.

En el repositorio no hay contraseñas ni claves: se ponen en Vercel (paso 4).

## 2. Crear la base de datos en Supabase

> **Si ya desplegaste una versión anterior:** vuelve a ejecutar `supabase/esquema.sql` completo. Agrega la función `guardar_sala_atomica` (escritura atómica, ADR-07), la tabla `evento` (registro de auditoría, ADR-09), el índice de cierre único `ux_evento_cierre_partida_ronda` (incluye el número de partida, para que la revancha pueda cerrar su primera ronda) y el histórico de métricas: las tablas `partida_registro` (últimas 100 partidas, con latencias p50, p95 y p99) y `partida_jugador_registro`, el disparador `tr_registrar_partida` y la vista `v_metricas_partidas` (ADR-09, punto 5). Es seguro repetirlo.

1. Entra en <https://supabase.com>, crea una cuenta (puede ser con GitHub) y pulsa **New project**. Elige una región cercana (por ejemplo São Paulo). La contraseña de la base de datos que pide no la usa el juego; guárdala igual.
2. Ve a **SQL Editor**, pulsa **New query**, pega todo el contenido de `supabase/esquema.sql` y pulsa **Run**. Debe terminar sin errores (se puede repetir sin problema).
3. Copia tres valores (guárdalos en un bloc de notas mientras terminas):
   - **Project URL** (`https://xxxx.supabase.co`): pulsa el botón verde **Connect** (arriba). En la pestaña **Framework**, en el recuadro `.env.local`, copia solo lo que va después de `NEXT_PUBLIC_SUPABASE_URL=`. Ignora el resto de esa ventana (es para proyectos Next.js; aquí no hay que instalar nada). También puedes armarla: es `https://` + el código que aparece en la barra de direcciones después de `/project/` + `.supabase.co`.
   - **Publishable key**: menú de engranaje **Project Settings > API Keys**, sección **Publishable key**, botón de copiar junto a `sb_publishable_...`. Es pública.
   - **Secret key**: en la misma página, sección **Secret keys**, botón de copiar junto a `sb_secret_...` (el ojo solo la muestra). Es secreta: solo va en Vercel, nunca en GitHub ni en el chat.

   No uses "View legacy API keys": el juego usa las claves nuevas.
4. Ve a **Realtime > Settings** y confirma que están activados **Enable Realtime service** y **Allow public access to channels** (vienen activados por defecto).

## 3. Crear el usuario y la contraseña de entrada

1. Abre `herramientas/generar-acceso.html` con doble clic (funciona sin internet).
2. Escribe un usuario y una contraseña de al menos 10 caracteres (puedes agregar varios usuarios).
3. Pulsa **Generar** y copia los dos valores: `ACCESO_USUARIOS` y `SECRETO_SESION`.

A tus compañeros les compartes el usuario y la contraseña, no los valores generados.

## 4. Publicar en Vercel

1. Entra en <https://vercel.com> con tu cuenta de GitHub, pulsa **Add New > Project** e importa el repositorio.
2. En **Framework Preset** elige **Other**. No cambies los comandos (los toma de `vercel.json`).
3. Abre **Environment Variables** y agrega estas cinco:

| Nombre | Valor |
|---|---|
| `ACCESO_USUARIOS` | valor generado en el paso 3 |
| `SECRETO_SESION` | valor generado en el paso 3 |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SECRET_KEY` | Secret key |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key |

4. Pulsa **Deploy**. Si después aparece una pantalla **Optional Integrations** que ofrece **Supabase** con un botón **Add**, **no lo pulses**: esa integración crea o enlaza otro proyecto de Supabase y agrega variables con otros nombres que el juego no usa. Las cinco variables que pusiste ya conectan con tu proyecto. Pulsa directamente **Deploy**.
5. Espera a que termine (1 o 2 minutos) y abre la URL que te da (`https://tu-proyecto.vercel.app`).

Si cambias una variable después, hay que volver a desplegar: **Deployments > ... > Redeploy**.

## 5. Verificaciones (hazlas en este orden)

| # | Qué abrir | Resultado esperado | Si falla |
|---|---|---|---|
| 1 | `https://tu-proyecto.vercel.app/api/salud` | `"estado":"ok"`, `"baseDatos":"supabase"`, `"tiempoReal":true` | `configuracion-incompleta`: el texto de `detalle` dice qué variable falta. `"baseDatos":"memoria"`: faltan `SUPABASE_URL` o `SUPABASE_SECRET_KEY`. `"tiempoReal":false`: falta `SUPABASE_PUBLISHABLE_KEY`. Corrige y haz Redeploy |
| 2 | La misma dirección da 404 o una página de Vercel | Debe responder JSON | La ruta de la API no se reescribió: confirma que `vercel.json` está en la raíz del repositorio con su bloque `rewrites` y que **Framework Preset** es **Other** |
| 3 | `https://tu-proyecto.vercel.app` | Pantalla de acceso; entras con tu usuario y contraseña | "Usuario o contraseña incorrectos": vuelve a generar `ACCESO_USUARIOS`, cópialo completo y haz Redeploy |
| 4 | Ya dentro, en la misma pestaña: `https://tu-proyecto.vercel.app/api/config?prueba=1` | `"prueba":"ok"` | `sin-configurar`: faltan variables de Supabase. `error`: revisa la Secret key y que **Enable Realtime service** esté activo |
| 5 | Crea una sala | Debajo del nombre de la modalidad aparece **Conexión: en vivo** (puede tardar 2 o 3 s) | Si dice **Conexión: consulta cada 1,5 s**: revisa `SUPABASE_PUBLISHABLE_KEY` y **Allow public access to channels**. El juego funciona igual, solo un poco más lento |
| 6 | Abre el juego en otro navegador o en una ventana de incógnito, entra y únete con el código | Ambos ven a los dos jugadores; al agregar un bot, el otro lo ve casi al instante | Si tarda más de 2 s con "en vivo", recarga ambas páginas |
| 7 | En Supabase, **Table Editor > sala** | Aparece una fila con el código de tu sala | Si no aparece, el paso 1 no dice `"baseDatos":"supabase"` |
| 8 | Juega una partida completa (con un bot basta) y, en Supabase, **SQL Editor**: `select * from partida_registro order by fin desc limit 1;` y `select * from partida_jugador_registro order by id desc limit 6;` | Una fila con turnos, tiempos y latencias de la partida, y una fila por jugador | Si no hay filas, el esquema no se ejecutó completo: vuelve a ejecutarlo y juega otra partida |
| 9 | Arma esta dirección reemplazando las dos partes en mayúsculas por tus valores (los muestra la verificación 4): `https://TU_ID.supabase.co/rest/v1/sala?select=*&apikey=TU_PUBLISHABLE_KEY`. Comprueba que la clave pública no lee datos | `[]`, con o sin salas creadas | `Invalid API key`: quedó el texto de ejemplo o la clave está incompleta. Si muestra filas, vuelve a ejecutar `supabase/esquema.sql` (activa RLS) |

La URL de Supabase y la Publishable key que muestran `/api/config` y el navegador son públicas por diseño: el navegador las necesita para el aviso en tiempo real y no dan acceso a ninguna tabla. La Secret key nunca sale del servidor.

Cuando todo esté bien, comparte la URL, el usuario y la contraseña.

## 6. Pipeline de gobernanza en GitHub (evidencia para el Entregable 3)

1. En GitHub, abre la pestaña **Actions** del repositorio. El workflow **fitness-functions** corre solo en cada push.
2. Abre la última ejecución: el job **Gobernanza arquitectónica (bloqueante)** debe quedar en verde con todos sus pasos (reglas de dependencias, sondas, complejidad, aserciones, métricas, pruebas con cobertura, protocolo HTTP y compilación). El job **informativo** puede mostrar avisos sin fallar.
3. Toma una captura de esa pantalla para la sección 4.1 del Entregable 3.
4. En local, `npm run gobernanza:reporte` regenera `docs/gobernanza/REPORTE.md` con todas las mediciones.

## 7. Latencia en producción (FF-32)

Después de cada sesión de pruebas con usuarios, desde la carpeta del repositorio y con las mismas variables de Vercel:

```bash
SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SECRET_KEY=sb_secret_... npm run ff32
```

En PowerShell: `$env:SUPABASE_URL="https://xxxx.supabase.co"; $env:SUPABASE_SECRET_KEY="sb_secret_..."; npm run ff32`.
Resultado `CUMPLE`, `ALERTA` (la mediana de los p99 por partida pasa de 300 ms) o `SIN_DATOS` (menos de 20 jugadas
medidas). Guarda la salida en `docs/evidencias/sesion-AAAA-MM-DD/ff32.txt`. No pegues la Secret key en archivos del
repositorio.

## Mantenimiento

- **Actualizar el juego:** cada `git push` a `main` vuelve a desplegar solo.
- **Cambiar contraseñas:** genera valores nuevos, reemplaza `ACCESO_USUARIOS` en Vercel y haz Redeploy. Cambiar `SECRETO_SESION` cierra todas las sesiones abiertas.
- **Proyecto pausado:** si el juego no carga salas tras días sin uso, entra en Supabase y pulsa **Restore project**.

## Notas técnicas

- Se mantiene TypeScript: Vercel compila la función y esbuild empaqueta el cliente. No hace falta Next.js ni pasar a JavaScript.
- Sí se necesita base de datos: Vercel no guarda nada entre peticiones; Supabase guarda las salas para que existan de verdad y varias personas jueguen a la vez.
- Las IP de los jugadores no se comparten ni se guardan: todos hablan solo con el servidor. Para los límites de intentos se usa una huella anónima que cambia cada día, calculada con las cabeceras que pone Vercel (`x-vercel-forwarded-for` o `x-real-ip`), que el cliente no puede falsificar.

## Borrar todo

1. Vercel: proyecto > **Settings > Advanced > Delete Project**.
2. Supabase: **Project Settings > General > Delete project**.
3. GitHub: repositorio > **Settings > Delete this repository**.
