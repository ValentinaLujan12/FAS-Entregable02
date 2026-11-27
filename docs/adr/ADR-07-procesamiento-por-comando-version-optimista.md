# ADR-07: PROCESAMIENTO POR COMANDO CON CONTROL DE VERSIÓN OPTIMISTA Y PERSISTENCIA ATÓMICA

**ESTADO:** Accepted (nuevo en el Entregable 3). Reemplaza la estrategia de concurrencia de la sección 2.4 del Entregable 2 (bloqueo en memoria y transacción Java). Implementado y verificado.

**CONTEXTO:**

Sin proceso persistente, dos peticiones pueden procesar comandos de la misma sala a la vez. Supabase, desde el cliente JavaScript, no ofrece transacciones de varias sentencias. El cierre de ronda debe guardar, de forma indivisible, el estado de la sala, los eventos generados y los mensajes de cada jugador.

**DECISIÓN:**

1. **Versión por sala.** Cada sala tiene una columna `version` (entero). Un comando lee la sala con su versión y, al persistir, exige que la versión siga siendo la misma (`UPDATE ... WHERE version = esperada`). Si no coincide, el comando se reintenta sobre el estado nuevo, hasta un máximo de intentos.
2. **Escritura atómica por función SQL.** La escritura del estado, los eventos y los mensajes del buzón se hace en una sola función PL/pgSQL invocada por RPC. Así, la base de datos aplica todo o nada. Esta función es la adaptación de la "transacción de cierre" del Entregable 2 (sección 2.4) al nivel de Supabase.
3. **Defensa en la base de datos.** Además del dominio, la base de datos rechaza un segundo cierre de la misma ronda (punto 5), la misma idea que `ux_cierre_valido` del Entregable 2. Las demás reglas de juego (turno, fase, cartas) las decide el dominio, porque el estado de la partida se guarda como documento JSON (`sala.datos`).
4. **Hueco resuelto en la adaptación.** En el juego original, la sala y el buzón se escribían en dos llamadas separadas. En el repositorio del Entregable 3, el procesador calcula los mensajes antes de escribir y los guarda con la sala en una sola llamada (`guardarAtomico`, que en Supabase invoca `guardar_sala_atomica`). La creación de una sala también es atómica: la versión 0 significa "crear" y deja la sala en versión 1.
5. **Un solo cierre por ronda.** Un índice único parcial sobre `evento` (`ux_evento_cierre_partida_ronda`, clave: sala, partida y ronda) impide dos eventos `CIERRE_ACEPTADO` de la misma ronda de una partida. Si se repite, la función devuelve `false`, deshace la escritura y el comando se reintenta sobre el estado nuevo. La partida forma parte de la clave porque la revancha en la misma sala reinicia las rondas: la primera versión del índice, por (sala, ronda), rechazaba el primer cierre de cada revancha (defecto corregido el 22/11/2026 y cubierto por una prueba).
6. **Viajes a la base de datos.** Las lecturas independientes de un comando (sala, presencias y cuenta) se hacen en paralelo, y lo que no cambia la respuesta (latido propio, aviso por Realtime, limpieza de salas) se completa después de responder, con `waitUntil` de Vercel. Un comando típico queda en tres viajes secuenciales: lectura, escritura atómica y buzón (ver la nota de corrección de ADR-12).
7. **Verificación.** `tests/esquema.test.ts` ejecuta el esquema real (`supabase/esquema.sql`) sobre PostgreSQL en memoria (PGlite) y comprueba: creación con versión 0 y rechazo de una segunda creación, escritura con versión correcta, rechazo con versión vieja, reversión completa cuando falla un mensaje, registro de eventos en la misma transacción y rechazo de un segundo cierre de ronda. `tests/almacen.test.ts` comprueba las mismas reglas en el almacén en memoria.

**ALTERNATIVAS RECHAZADAS:**

- **Bloqueo pesimista `SELECT ... FOR UPDATE` desde la aplicación:** requiere una conexión directa con transacción, que el cliente de Supabase no expone de forma directa en funciones serverless.
- **Cola de comandos en memoria:** no sobrevive entre peticiones (ADR-05 v2).
- **Sin control de versión:** permite que dos comandos sobrescriban el estado del otro.

**CONSECUENCIAS:**

**Positivas:** la integridad del cierre y de los eventos no depende del orden de llegada de las peticiones; los conflictos son visibles y se reintentan.

**Negativas:** bajo mucha contención, un comando puede reintentarse varias veces; hay que mantener la lógica SQL además de la de TypeScript.

**CUMPLIMIENTO:**

- FF-17: dos cierres simultáneos de la misma ronda a través del procesador: uno gana y el otro recibe un rechazo (`tests/idoneidad-servidor.test.ts`); cuatro escrituras simultáneas sobre la misma versión en PostgreSQL: se confirma una (`tests/esquema.test.ts`).
- Atomicidad sobre el esquema real (PGlite): creación con versión 0, versión vieja, reversión completa, eventos en la misma transacción, cierre único y revancha (`tests/esquema.test.ts`, 10 pruebas).
- FF-21 y FF-22: una caída durante la escritura no deja estado parcial y la siguiente petición continúa desde el último estado consistente.
- FF-20: el acumulado de cada jugador es igual a la suma de las penalizaciones de cada ronda (partidas completas con bots).

**REFERENCIAS:**

- Richards, M. & Ford, N. (2025). Cap. 6 (fitness functions de consistencia).
- ADR-04, ADR-05 v2 y ADR-06.
