# Especificación de casos de uso CU-01 a CU-05

Estas fichas parten de las del Entregable 1 (§2.4, Tablas 2.4.1 a 2.4.5) y se actualizaron al sistema construido en el
Entregable 3. El diagrama es `docs/uml/01_casos_uso.puml`. Los procesos BPMN son `docs/bpmn/03_turno.bpmn` (CU-05) y
`docs/bpmn/04_cierre_liquidacion.bpmn` (CU-01 a CU-03). La correspondencia con el código está en
`docs/TRAZABILIDAD_BPMN.md`. Las extensiones EXT-1 a EXT-10 del diagrama son funciones que se agregaron al construir el
juego y no tienen ficha propia.

**Camino común de un comando.** El navegador envía `POST /api/juego` con el código de sala, el token de sesión y el
mensaje del jugador. Luego:

1. El `Procesador` lee la sala desde `IAlmacen` y aplica los vencimientos pendientes con `ProgramadorVirtual` (ADR-13).
2. `TurnOrchestrator` delega en `PartidaEnCurso`.
3. Los cambios y los eventos se guardan en una sola escritura con `guardarAtomico` (versión optimista, ADR-07).
4. Solo después de guardar se avisa por `ICanalTiempoReal` (Supabase Realtime, aviso sin datos).
5. Cada cliente vuelve a pedir su vista. `ProyectorVistaJugador` oculta las manos ajenas (ADR-12).

Ninguna jugada se aplica a medias: si la escritura falla o choca con otra, el comando se reintenta sobre el estado nuevo.

---

## CU-01 Ejecutar cierre de ronda Clásica (4-3-3)

| Campo | Descripción |
|---|---|
| Actor principal | Jugador con el turno (humano o bot). |
| Actores secundarios | Motor de reglas: `IValidadorCierre`, implementado por `ReglaClasicaCuartaTerna`. Componente de puntaje: CU-03. |
| Requisitos | RF09, RF11, RF14, RF16, RF17, RF18, RF19. |
| Disparador | El jugador pulsa "Cerrar" (mensaje `{ t: 'cerrar' }`). |
| Precondiciones | 1. Partida en curso en modalidad Clásica. 2. Es el turno del jugador y está en la fase de descartar: ya robó, o abre la ronda con 11 cartas. 3. Tiene 11 cartas. |
| Flujo principal | 1. El orquestador comprueba el turno y la fase. 2. `ReglaClasicaCuartaTerna.validarVictoria` busca una partición exacta de la mano: 1 cuarta + 2 ternas + 1 carta de descarte. También valen quinta + 2 ternas y cuarta + cuarta + terna. 3. Se registra `CIERRE_ACEPTADO` con el número de partida y de ronda. 4. Se ejecuta CU-03: en Clásica nadie suma puntos y el ganador suma una ronda ganada. 5. Se guarda y se avisa a todos (RF18); la mesa muestra el cierre y la liquidación. |
| Flujos alternos | **A1, combinación inválida (RF11):** si no existe la partición, se registra `CIERRE_RECHAZADO` con motivo `SIN_COMBINACION_VALIDA`. El estado de la mano no cambia y el jugador conserva el turno, con un mensaje que dice qué se exige. **A1b, mano incompleta:** si no tiene 11 cartas, el motivo es `MANO_INCOMPLETA`. **A2, desconexión durante la validación:** el cierre se valida y se guarda en la misma petición, así que no queda un estado intermedio; al reconectar (EXT-5), el jugador recibe el estado ya guardado. **A3, dos cierres a la vez:** la base de datos admite un solo `CIERRE_ACEPTADO` por ronda de cada partida (índice `ux_evento_cierre_partida_ronda`, FF-17); el segundo comando se rechaza. |
| Postcondiciones | Ronda cerrada con ganador registrado en `evento`. Marcador actualizado. La sala queda en liquidación hasta la siguiente ronda o hasta el fin de la partida. |
| Cambios frente al Entregable 1 | La sala no se "congela": la exclusión mutua la dan la escritura atómica y la versión optimista. La carta extra de la siguiente ronda se asigna al iniciarla (CU-04, paso 5). |
| Pruebas | `tests/reglas.test.ts` (Clásica), `tests/partida.test.ts` (CU-01 Cierre Clásica), `tests/idoneidad-servidor.test.ts` (FF-17 y FF-19). |

## CU-02 Declarar cierre por Apuntado (sobrante < 5)

| Campo | Descripción |
|---|---|
| Actor principal | Jugador con el turno (humano o bot). |
| Actores secundarios | Motor de reglas: `IValidadorCierre`, implementado por `ReglaApuntado101Puntos`. Componente de puntaje: CU-03. |
| Requisitos | RF10, RF11, RF13, RF18. |
| Disparador | El jugador pulsa "Cerrar" (`{ t: 'cerrar' }`). |
| Precondiciones | 1. Partida en curso en modalidad Apuntado. 2. Es el turno del jugador y está en la fase de descartar. 3. Tiene 11 cartas. |
| Flujo principal | 1. El orquestador comprueba el turno y la fase. 2. `ReglaApuntado101Puntos.validarVictoria` busca 3 ternas que dejen el menor sobrante. Por defecto se exigen exactamente 3 ternas, como dice la guía del curso; el valor del As es 1 por defecto. 3. Suma el valor de las cartas sobrantes y confirma que es estrictamente menor a 5 (`sobranteMaxApuntado`). 4. Se registra `CIERRE_ACEPTADO` y se ejecuta CU-03. 5. Se guarda y se avisa a todos (RF18). |
| Flujos alternos | **A1, ternas incompletas (RF11):** sin 3 ternas válidas, se registra `CIERRE_RECHAZADO` con motivo `SIN_COMBINACION_VALIDA`; la mano no cambia y el jugador sigue en su turno. **A2, sobrante ≥ 5:** si las ternas son válidas pero el sobrante suma 5 o más, el motivo es `SOBRANTE_EXCEDE_LIMITE` y el mensaje muestra el sobrante calculado, para distinguirlo de A1. **A3, variantes de la sala:** con `cuartaCuentaComoTerna` activado, una cuarta o quinta cuenta como una de las 3 combinaciones (3-3-3, 4-3-3, 4-4-3, 5-3-3). Con `permitirCierreConSobrante` desactivado, se exige 1 cuarta + 2 ternas + 1 descarte, como en la Clásica. |
| Postcondiciones | Si el cierre es válido, se ejecuta CU-03. Si no, la partida sigue sin cambios y el rechazo queda en el historial (sirve como métrica de errores de regla). |
| Cambios frente al Entregable 1 | Las dos variantes de cierre son parámetros de la sala (ADR-02), no estrategias distintas. |
| Pruebas | `tests/reglas.test.ts` (Apuntado, parámetros de cierre), `tests/idoneidad-reglas.test.ts` (FF-12, contrato común de las estrategias), `tools/auditoria-reglas.ts` (oráculo independiente). |

## CU-03 Liquidar puntos de ronda y evaluar umbral 101

| Campo | Descripción |
|---|---|
| Actor principal | Sistema: componente de puntaje `RoundScoring` (`IServicioPuntaje`). |
| Actores secundarios | Estrategia de la modalidad (`ICalculadorPuntos`). Temporizador de la pausa de liquidación. |
| Requisitos | RF13, RF14, RF15, RF16, RF17, RF19. |
| Disparador | Un cierre aceptado (CU-01 o CU-02). |
| Precondiciones | Se registró `CIERRE_ACEPTADO` en la ronda en curso. |
| Flujo principal | 1. Para cada jugador activo, la estrategia calcula su mejor partición. El ganador conserva la del cierre. 2. Cada perdedor suma el valor de sus cartas sueltas (RF13): 2 a 10 su número, J/Q/K 10, As según el parámetro. En Clásica nadie suma puntos. 3. `RoundScoring` actualiza el marcador acumulado (RF14) y la estrategia evalúa la partida: en Apuntado, quien llega al umbral queda eliminado (RF15); en Clásica, se cuentan las rondas ganadas. 4. Se registra `RONDA_LIQUIDADA` con el detalle por jugador y la sala pasa a liquidación. 5. Termina la pausa de liquidación o alguien pulsa "Continuar" (`{ t: 'continuar' }`). Entonces empieza la siguiente ronda y el ganador la abre con la carta extra (RF17). |
| Flujos alternos | **A1, umbral alcanzado:** se registra `JUGADOR_ELIMINADO` por cada jugador que llegue al umbral (101 por defecto; se puede configurar en 51, 71, 101 o 151). **A2, un solo activo restante:** se registra `PARTIDA_FINALIZADA` con ganador y posiciones (RF16), y se muestra el podio. Si todos los activos llegan al umbral a la vez, gana el de menor puntaje. En Clásica la partida termina cuando alguien alcanza las rondas ganadas objetivo (3 por defecto). **A3, revancha (EXT-6):** al terminar, el anfitrión puede iniciar otra partida en la misma sala; el número de partida separa los cierres y las métricas. |
| Postcondiciones | Marcador persistido en el documento de la sala y liquidación auditable en la tabla `evento` (RF19). Al terminar la partida, `partida_registro` y `partida_jugador_registro` guardan su resumen (métricas, ADR-09). |
| Cambios frente al Entregable 1 | La pausa de liquidación es un plazo guardado en la sala, no un temporizador en memoria (ADR-13). |
| Pruebas | `tests/puntuacion.test.ts`, `tests/partida.test.ts` (CU-02 / CU-03), `tests/reglas.test.ts` (liquidación y eliminación), `tests/metricas.test.ts`. |

## CU-04 Iniciar partida (barajar y repartir)

| Campo | Descripción |
|---|---|
| Actor principal | Administrador de sala (anfitrión). |
| Actores secundarios | Sistema: `LobbyManager`, `DeckManagement` (`IMazo`), `PlayerRegistry` (`IJugadores`). |
| Requisitos | RF01, RF03, RF04, RF17, RF19. |
| Disparador | El anfitrión pulsa "Iniciar partida" (`{ t: 'iniciar' }`). |
| Precondiciones | 1. Sala creada con modalidad y parámetros elegidos (EXT-1 y EXT-2). 2. La sala está en espera. 3. Ningún jugador tiene cartas. |
| Flujo principal | 1. `LobbyManager` verifica que quien inicia es el anfitrión. 2. `PartidaEnCurso.iniciar` valida que haya entre 2 y 6 jugadores (humanos y bots) y que el mazo alcance: 1 mazo hasta 4 jugadores, 2 mazos con 5 o 6 (RF03). 3. Se baraja el mazo con el generador aleatorio inyectado (RF04). 4. Se reparten 10 cartas a cada jugador y se voltea la primera carta del pozo. 5. Una carta extra va a un jugador al azar en la primera ronda; en las siguientes, al ganador de la anterior (RF17). 6. Ese jugador recibe el turno en la fase de descartar, con 11 cartas. Se registran `PARTIDA_INICIADA`, `RONDA_INICIADA` y `TURNO_INICIADO`, y se avisa a todos. |
| Flujos alternos | **A1, jugadores insuficientes o de más:** error `PARAMETROS_INVALIDOS` con cuántos jugadores faltan; no se baraja. **A1b, mazo insuficiente:** error `MAZO_INSUFICIENTE`. **A1c, no es el anfitrión:** el inicio se rechaza. **A2, caída durante el reparto:** el reparto completo y sus eventos se guardan en una sola escritura atómica. Si la función se interrumpe antes, no queda nada a medias y el comando se puede repetir. Si ya se guardó, al reconectar cada jugador recibe el estado guardado sin volver a barajar (FF-21 y FF-22). |
| Postcondiciones | Manos, mazo, pozo y turno inicial guardados. La sala pasa de espera a en curso. |
| Cambios frente al Entregable 1 | La recuperación no reintenta notificaciones desde un proceso: el estado guardado es la fuente de verdad y cada cliente lo vuelve a pedir. |
| Pruebas | `tests/partida.test.ts` (CU-04), `tests/idoneidad-servidor.test.ts` (FF-21 y FF-22). |

## CU-05 Ejecutar turno (robar y descartar)

| Campo | Descripción |
|---|---|
| Actor principal | Jugador con el turno (humano o bot). |
| Actores secundarios | Temporizador de turno: `ITemporizadorTurno`, implementado por `ProgramadorVirtual` (RF08). `DeckManagement`. |
| Requisitos | RF05, RF06, RF07, RF08, RF18. |
| Disparador | `TURNO_INICIADO` para el jugador. |
| Precondiciones | 1. Partida en curso. 2. Es el turno del jugador según el orden de los asientos. 3. El plazo del turno está vigente (60 s por defecto, configurable entre 10 y 300). |
| Flujo principal | 1. La mesa resalta el turno y muestra el reloj. 2. El jugador roba del mazo o del pozo (`{ t: 'robar', origen }`, RF05). El robo del mazo solo lo ve quien roba; el del pozo lo ven todos. 3. Opcionalmente reordena o agrupa cartas en la mano: es solo presentación (RF06); la validación de un grupo es EXT-4. 4. Descarta una carta (`{ t: 'descartar', cartaId }`, RF07) o cierra (CU-01 o CU-02). 5. El turno pasa al siguiente jugador activo y se reinicia el plazo; todos ven el nuevo tope del pozo. |
| Flujos alternos | **A1, tiempo agotado (RF08):** la siguiente petición a la sala aplica el vencimiento. Se registra `TURNO_EXPIRADO`, se roba del mazo si faltaba robar y se descarta la carta de mayor costo; nunca se descarta la recién tomada del pozo. Dos vencimientos seguidos activan el piloto; más de tres turnos saltados, el modo automático (EXT-3 y EXT-8). **A2, restricción del pozo:** la carta tomada del pozo no se puede devolver en el mismo turno (`DEVOLUCION_PROHIBIDA`); la sala puede prohibir robar del pozo (`permitirRoboPozo`). **A3, mazo agotado:** el pozo, salvo su carta superior, se baraja y vuelve al mazo (`MAZO_RECICLADO`, hasta 2 veces); después la ronda termina en tablas (`RONDA_TABLAS`, sin puntos). **A4, jugada fuera de turno o de fase:** error `NO_ES_TU_TURNO` o `FASE_INVALIDA`, sin cambios. **A5, jugador desconectado:** su turno dura `tiempoTurnoDesconectadoSeg` para no bloquear la mesa. |
| Postcondiciones | El jugador queda con 10 cartas, el pozo actualizado y el turno en el siguiente jugador. Todo queda en `evento`, incluida la muestra de latencia `METRICA_LATENCIA`. |
| Cambios frente al Entregable 1 | El temporizador es virtual, sin procesos (ADR-13). El "descarte automático o penalización configurable" se implementó como robo y descarte automáticos, con piloto y modo automático para los ausentes. |
| Pruebas | `tests/partida.test.ts` (CU-05 y RF08), `tests/votaciones.test.ts`, `tests/idoneidad-servidor.test.ts` (FF-18 y FF-25), `tools/e2e-http.ts` y `tools/e2e-ui.mjs`. |
