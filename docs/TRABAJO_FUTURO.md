# Trabajo futuro de El Apuntado

Reúne las mejoras planificadas del juego (parte 1) y lo que debe cambiar para pasar del MVP a un producto con cuentas y créditos reales (parte 2). Nada de este documento está implementado; cuando algo se implemente, se pasa a la guía que corresponda y se quita de aquí.

## Parte 1. Mejoras planificadas

Funciones y ajustes pendientes del juego. Cada punto indica qué se necesita para hacerlo. Ninguno está implementado todavía.

### 1. Ranking público de partidas ganadas

- **Qué:** una página pública con las partidas ganadas por cada jugador.
- **Qué se necesita:** guardar cada partida terminada y su ganador en una tabla nueva de Supabase, y un endpoint público de solo lectura para la página.
- **Pendiente decidir:** si el ranking cuenta solo a los usuarios de `ACCESO_USUARIOS` o también a las cuentas anónimas de skins, y si se muestran apodos o nombres de usuario.

### 2. Una sola sesión por usuario

- **Qué:** si alguien inicia sesión con un usuario, la sesión anterior de ese mismo usuario en otro equipo se cierra.
- **Qué se necesita:** hoy la sesión es una cookie firmada que el servidor no guarda. Hay que guardar en Supabase un identificador de sesión activa por usuario y validarlo en cada petición.
- **Relacionado:** el mismo mecanismo sirve para cerrar la sesión de un usuario baneado (punto 4).

### 3. Ahorro de recursos cuando no hay actividad

- **Estado actual:** el servidor no consume nada cuando no hay nadie. Vercel solo ejecuta código cuando llega una petición, y no hay procesos permanentes. Tampoco hay procesos que "despertar" o "dormir" en el servidor.
- **Dónde sí hay consumo:** cuando alguien tiene una sala abierta. Con Realtime activo, el navegador consulta al servidor unas dos veces por minuto (cada 6 latidos de 1,5 s, es decir, cada 9 s). Si Realtime no está disponible, consulta cada 1,5 s.
- **Mejora propuesta:** dejar de consultar al servidor cuando la pestaña está oculta o cuando el jugador lleva varios minutos sin actuar, y reanudar al volver. Así una pestaña olvidada abierta no genera peticiones.

### 4. Agrupar en una sola petición los clics acumulados

- **Qué:** cuando el jugador pulsa varias veces seguidas (por ejemplo, 5 veces "agregar bot" y después "iniciar"), el navegador hoy envía una petición por clic, una tras otra. Se podrían enviar juntas las que se acumulan mientras la anterior está en vuelo, y que el servidor las aplique en un solo intento y una sola escritura.
- **Qué se necesita:** que la petición acepte una lista de mensajes (cambio del contrato `openapi.yaml`), que el procesador los aplique en orden dentro del mismo intento y que la respuesta incluya los mensajes de todos.
- **Por qué no se hizo aún:** con la función en la misma región que la base de datos y los demás ajustes de la nota de corrección de ADR-12, cada comando ya responde en una fracción de segundo; conviene medir primero con usuarios reales.

### 5. Usuario administrador para banear jugadores

- **Qué:** un usuario con permisos para banear y desbanear a otros jugadores desde la web.
- **Forma de crear usuarios:** por ahora se sigue con el método actual, `herramientas/generar-acceso.html` y las variables de Vercel. Se revisará más adelante.
- **Qué se necesita:**
  - Una variable `ADMINISTRADORES` en Vercel con la lista de usuarios que tienen permisos de administrador.
  - Una tabla de baneados en Supabase.
  - Una página o panel en la web solo visible para administradores.
  - Que al banear se cierren las sesiones del usuario, usando el mecanismo del punto 2.

## Parte 2. Del MVP al sistema real

Este documento reúne **lo que hoy es una simulación** y **lo que debe cambiar** cuando el juego tenga cuentas reales, créditos de verdad y operación en producción. La idea es evitar "errores de rezago": que el juego ya tenga las costuras en el lugar correcto, de modo que reemplazar una pieza no obligue a reescribir las demás.

> Principio que ya se cumple y **no debe romperse**: el cliente nunca es fuente de verdad. Solo pide ("quiero comprar X", "quiero usar Y", "quiero reaccionar"); el servidor valida, decide y registra.

### 1. Qué es simulado hoy y cómo se reemplaza

| Tema | Hoy | Sistema real | Dónde tocar |
|---|---|---|---|
| **Identidad** | Cuenta **anónima temporal**: el servidor crea el perfil la primera vez; el navegador guarda una `clave` aleatoria (`localStorage: apuntado.clave`); el servidor guarda solo su SHA-256. Sin registro, correo ni contraseña. | Registro e inicio de sesión (correo + contraseña con hash fuerte, y/o OAuth). La `clave` deja de ser la identidad y pasa a ser un **token de sesión** (JWT corto + refresh, cookie `HttpOnly`/`SameSite`). Recuperación de cuenta, verificación de correo, cierre de sesión en otros dispositivos. | `cuenta_abrir` en `src/game/TurnOrchestrator.ts`, `src/extras/cuentas/ServicioCuentas.ts`, `Cuenta.claveHash` (`IRepositorioCuentas`), tabla `cuenta` (`supabase/esquema.sql`), `src/web/estilo.ts` (manejo de la clave). |
| **Moneda** | "Tokens" enteros en `cuenta.saldo`, saldo inicial de 99 y botón temporal "Recargar tokens" (+999). | **Créditos** (otro tipo de crédito, ya decidido): se compran con dinero real o se ganan. Un `saldo` mutable no basta: ver §2 (libro mayor). | `SALDO_INICIAL` y `RECARGA` en `skins.catalogo.ts`; `ServicioCuentas.recargar()`; bloque marcado `TEMPORAL` en `overlays.ts`; `Estilo.pedirRecarga()`. |
| **Recarga temporal** | Existe solo para pruebas y está marcada `TEMPORAL`. | Se **elimina** y se sustituye por "Comprar créditos" (pasarela de pago, ver §3). | Pon `recarga.activa = false` (o borra el objeto); el servidor responde `RECARGA_NO_DISPONIBLE`. Quita `pedirRecarga`, `recargar` y el botón. |
| **Catálogo de skins** | Catálogo compartido (`src/extras/skins/catalogo.ts`): ids, precios y diseño. | Catálogo en base de datos (o servicio de catálogo) con versión, vigencia, descuentos, regalos, packs y **moneda por producto**. El catálogo puede seguir existiendo como semilla/caché para el cliente. | `src/extras/skins/skins.ts` (lectura), `ServicioCuentas` (precio y validación). |
| **Inventario** | Lista de ids premium dentro de la cuenta (`inventario` JSONB). | Tabla de *derechos* (`cuenta_id`, `producto_id`, origen: compra/regalo/evento, fecha, estado), con posibilidad de reembolso/revocación. | `Cuenta.inventario`, `supabase/esquema.sql`. |
| **Skins elegidas** | `cuenta.elegidas` (carta, mesa, ambiente, celebración); se copian al asiento de la sala solo **fuera de la partida en curso**. | Igual, más preferencias persistentes (tonos pastel, modo daltónico, volúmenes, silencios). | `estiloDeCuenta()` en `TurnOrchestrator`; `src/web/visual.ts` y `sonido.ts` hoy guardan sus ajustes en `localStorage`. |
| **Reacciones y silencios** | Catálogo cerrado de reacciones (sin texto libre), antirrebote de 1,2 s, silencio individual y colectivo (⌈activos/2⌉) **solo en memoria** de la sala. | Silencios/bloqueos persistentes por cuenta, **reportes** y panel de moderación, sanciones reincidentes. Si algún día se añade texto libre: filtros, rate-limit y registro. | `TurnOrchestrator` (silencio), `src/extras/reacciones/reacciones.ts`. |
| **Expulsión por inactividad** | Votación sin consecuencias fuera de la sala. | Puntuación de conducta o penalización por abandono (afecta emparejamiento, ranking o recompensas), reconexión con ventana de gracia configurable. | `PartidaEnCurso` (votación), `VOTACION` en `src/kernel/config.ts`. |
| **Bots** | Hay bots que reaccionan por probabilidad (saludan, presumen, se quejan). | Mantenerlos claramente identificados como bots; ajustar probabilidades con telemetría. | `src/extras/bots/ReaccionesBot.ts`. |
| **Arte y audio** | Mockups SVG; sonido y música **sintetizados** (WebAudio). | Arte real (`docs/GUIA_ASSETS.md`) y, si se desea, audio grabado. El motor de música por recetas se puede conservar como respaldo o para variedad infinita. | `public/assets`, `src/extras/web/sonido.ts`, `src/extras/web/musica.ts`. |

### 2. Créditos: lo que un `saldo` mutable no resuelve

1. **Libro mayor inmutable** (`movimiento_credito`): cada compra, recarga, regalo o reembolso es una fila con tipo, monto, saldo resultante y referencia externa. El saldo es un resultado derivado (o una columna materializada protegida por transacción). Hoy `saldo` se actualiza directamente.
2. **Atomicidad e idempotencia**: comprar una skin = una sola transacción (verifica saldo, descuenta, otorga derecho, registra movimiento). Cada petición lleva un `idempotency_key` para que un reintento de red no cobre dos veces.
3. **Tipos de crédito**: si habrá más de uno (comprados vs. ganados, con vencimiento), el saldo pasa a ser por *cartera* y cada producto declara qué cartera acepta.
4. **Reembolsos y contracargos**: definir qué pasa con los derechos si el pago se revierte (revocar skin, saldo negativo, bloqueo de la cuenta).
5. **Auditoría**: quién, cuándo, desde qué IP/dispositivo. Los logs de compra no se borran.

### 3. Pagos (cuando exista "Comprar créditos")

- Usar una pasarela con **checkout alojado** (el juego nunca ve datos de tarjeta). Confirmación por **webhook firmado**, nunca por redirección del navegador.
- El cliente solo pide "iniciar compra del paquete N"; el servidor crea la orden, y los créditos se acreditan **solo** cuando el webhook confirma.
- Impuestos, facturación y términos de venta según el país de operación; precios por región.
- Entorno de pruebas (sandbox) separado y datos de prueba nunca mezclados con producción.

### 4. Seguridad y privacidad

- **Autenticación**: sustituir la `clave` por sesión autenticada; proteger las peticiones con la sesión autenticada y renovarla; revocar sesiones.
- **Autorización**: toda operación sobre una cuenta se resuelve por la identidad de la conexión, nunca por un id enviado por el cliente (ya es así para compras y activación).
- **Límites de uso**: ya hay antirrebote de mensajes y de reacciones; añadir límites por IP/cuenta en compras, creación de salas y registro.
- **Orígenes y HTTPS**: `ALLOWED_ORIGINS` y TLS obligatorios; cookies seguras si se usan.
- **Datos personales**: definir qué se guarda (correo, nombre visible, historial de partidas y compras), base legal, retención y borrado de cuenta bajo la normativa de protección de datos del país (en Colombia, la Ley 1581 de 2012 y normas complementarias; conviene confirmarlo con el área jurídica).
- **Menores de edad**: si el público incluye menores, reglas de consentimiento y de compras dentro de la app.
- **Moderación**: nombres visibles (filtro de palabras), reportes, bloqueo.

### 5. Arquitectura y operación

- **Persistencia**: cuentas y créditos en PostgreSQL con migraciones versionadas (hoy `supabase/esquema.sql` es un único script idempotente). Respaldos y pruebas de restauración.
- **Escalado**: hoy cada petición es una función serverless sin estado y la sala vive en Supabase (ADR-06, ADR-07), así que el cómputo escala solo; el límite está en la base de datos y en la consulta periódica de respaldo. Para escalar más: notificación con datos por canal privado (sin consulta periódica) y partición de las salas por código (ver la retrospectiva del Entregable 3, sección 5.3).
- **Observabilidad**: métricas (salas activas, latencia de turno, compras, errores por código), logs estructurados, alertas.
- **Pruebas**: mantener `npm test`, `npm run test:e2e` y `npm run test:ui`; añadir pruebas de carga de /api/juego y de concurrencia en compras (dos compras simultáneas con el mismo saldo).
- **Contratos**: `docs/contracts/asyncapi.yaml` ya describe los mensajes `cuenta_*`, `reaccion`, `silenciar` e `iniciar_expulsion`; al cambiar la autenticación se versiona el protocolo.

### 6. Interfaz y experiencia

- Persistir en la cuenta (no solo en el navegador) los ajustes de sonido, tonos pastel y modo daltónico.
- El modo daltónico usa una baraja alternativa de cuatro colores (paleta Okabe-Ito) y más contraste; validarlo con usuarios reales y complementarlo con modo de alto contraste y tamaño de texto.
- Internacionalización: todos los textos están en español dentro del código del cliente; extraerlos a un catálogo de mensajes antes de traducir.
- Accesibilidad por teclado: ya existen atajos para la mano y las acciones; falta cubrir los menús (reacciones, silencio, expulsión) con navegación completa y lectores de pantalla.

### 7. Orden sugerido de migración

1. **Cuentas reales + sesión** (sustituir la `clave`; mantener `IRepositorioCuentas`).
2. **Libro mayor de créditos** y renombrar "tokens" a "créditos" (textos, catálogo, base de datos).
3. **Comprar créditos** con pasarela y webhook; **retirar** la recarga temporal.
4. **Catálogo en base de datos** y derechos de inventario con reembolso.
5. **Persistencia de preferencias** (visual, sonido, silencios) en la cuenta.
6. **Moderación** (reportes, sanciones) y reputación por abandono.
7. **Arte y audio finales**, i18n y accesibilidad.
8. **Escalado horizontal** si la demanda lo exige.
