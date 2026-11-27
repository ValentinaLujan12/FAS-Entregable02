# Trazabilidad BPMN -> requisitos -> código

Generada automáticamente por `npm run bpmn:generate` desde `tools/bpmn/diagramas.mjs`. Cada tarea del BPMN lleva esta misma información en su `<bpmn:documentation>`.

| Diagrama | Tarea | Requisitos | Componente lógico | Implementación |
|---|---|---|---|---|
| 02_to_be | Crear sala y elegir modalidad y parámetros | RF01 | LobbyManager | TurnOrchestrator.crearSala - LobbyManager.crearSala |
| 02_to_be | Generar el código único de la sala | RF01, RF02 | LobbyManager | LobbyManager (códigos de 5 caracteres sin ambigüedad) |
| 02_to_be | Los jugadores se unen con el código (o se agregan bots) | RF02 | LobbyManager | unirse - agregarBot |
| 02_to_be | ¿Sala válida (2-6) y lista? | RF03 | LobbyManager |  |
| 02_to_be | Barajar (1 o 2 mazos), repartir 10 cartas (+1 al inicial) y voltear el pozo | RF04 | DeckManagement | DeckManagement.repartir - Baraja.barajar (RNG inyectable) |
| 02_to_be | Iniciar turno: fase, cronómetro y difusión del estado | RF08, RF18 | TurnOrchestrator | PartidaEnCurso.turnoIniciado - Programador |
| 02_to_be | Ejecutar el turno del jugador (ver 03 - Turno) | RF05, RF06, RF07 | TurnOrchestrator | PartidaEnCurso.robar/descartar |
| 02_to_be | Tiempo agotado | RF08 |  |  |
| 02_to_be | Jugada automática: robar y descartar por el jugador | RF08 | TurnOrchestrator | PartidaEnCurso.expirarTurno - AnalisisMano.elegirDescarte (2 timeouts -> autopiloto) |
| 02_to_be | Pasar el turno al siguiente jugador activo | RF07 | TurnOrchestrator | PartidaEnCurso.pasarTurno |
| 02_to_be | Evaluar el cierre según la modalidad | RF09, RF10, RF12 | HandEvaluator | IReglaJuego.validarVictoria (Strategy) |
| 02_to_be | ¿Cierre válido? | RF11 |  |  |
| 02_to_be | Notificar el rechazo y reanudar el turno | RF11 | TurnOrchestrator | evento CIERRE_RECHAZADO |
| 02_to_be | Revelar manos y calcular la liquidación de la ronda | RF13, RF17 | RoundScoring | RoundScoring.liquidar (función pura) |
| 02_to_be | Actualizar el marcador y guardar la sala (versión optimista) | RF14, RF19 | StateRepository | IAlmacen.guardarAtomico -> guardar_sala_atomica (Supabase) |
| 02_to_be | ¿Fin de partida? | RF15, RF16 | HandEvaluator | IReglaJuego.evaluarPartida |
| 02_to_be | Pausa de liquidación (60 s o todos votan continuar) y nueva ronda | RF17 | TurnOrchestrator | PartidaEnCurso.votarContinuar / continuar |
| 02_to_be | Declarar al ganador y armar el podio | RF16 | RoundScoring | IReglaJuego.evaluarPartida -> FinalVista |
| 02_to_be | Ver el podio; el anfitrión decide la revancha | RF18 | Cliente web |  |
| 03_turno | Fijar la fase y el cronómetro; difundir el estado | RF08, RF18 | TurnOrchestrator | PartidaEnCurso.turnoIniciado (tiempoTurnoMs; 8 s si el jugador está desconectado) |
| 03_turno | Elegir el robo: mazo o pozo | RF05 | Cliente web | POST /api/juego {t: "robar"} |
| 03_turno | Tiempo agotado | RF08 |  |  |
| 03_turno | Robar del mazo (reciclar el pozo si se agotó) | RF05 | DeckManagement | DeckManagement.robarDelMazo (maxReciclajes) |
| 03_turno | Tomar la carta visible del pozo | RF05 | DeckManagement | DeckManagement.robarDelPozo (si permitirRoboPozo) |
| 03_turno | Declarar tablas: se agotó el mazo |  | TurnOrchestrator | PartidaEnCurso.declararTablas |
| 03_turno | Registrar el robo y difundir (la carta es privada) | RF05, RF18 | TurnOrchestrator | evento CARTA_ROBADA (clave _privado solo para auditoría) |
| 03_turno | Organizar la mano y elegir: descartar o cerrar | RF06, RF07 | Cliente web | arrastrar/agrupar (validar) - "descartar" - "cerrar" |
| 03_turno | Tiempo agotado | RF08 |  |  |
| 03_turno | Solicitar la evaluación del cierre | RF09, RF10 | TurnOrchestrator | PartidaEnCurso.cerrar |
| 03_turno | Validar la carta: está en la mano y no es la robada del pozo | RF07 | DeckManagement | PartidaEnCurso.descartar (CARTA_NO_ENCONTRADA, DEVOLUCION_PROHIBIDA) |
| 03_turno | Depositar la carta en el pozo y difundir | RF07, RF18 | DeckManagement | DeckManagement.descartar - evento CARTA_DESCARTADA |
| 03_turno | Rechazar la acción y avisar al jugador | RF11 | TurnOrchestrator | ResultadoAccion {ok:false, codigo, mensaje} |
| 03_turno | Pasar el turno al siguiente jugador activo | RF07 | TurnOrchestrator | PartidaEnCurso.pasarTurno (salta eliminados) |
| 03_turno | Jugada automática: robar si falta y descartar la carta de mayor costo | RF08 | TurnOrchestrator | PartidaEnCurso.expirarTurno - AnalisisMano.elegirDescarte |
| 03_turno | Contar el timeout y pasar el turno (2 seguidos = autopiloto) | RF08 | TurnOrchestrator | timeouts consecutivos ≥ 2 -> autopiloto (bot toma el control) |
| 04_cierre_liquidacion | Pausar la mesa: bloquear acciones y temporizador |  | TurnOrchestrator | PartidaEnCurso.cerrar (valida turno y fase DESCARTAR) |
| 04_cierre_liquidacion | ¿Modalidad? |  | RegistroReglas | RegistroReglas.obtener(modalidad) - registro Open/Closed |
| 04_cierre_liquidacion | Validar 1 cuarta + 2 ternas + 1 carta de descarte | RF09 | ReglaClasicaCuartaTerna | validarVictoria -> buscarParticionExacta([4x1, 3x2]) |
| 04_cierre_liquidacion | Validar 3 ternas y sobrante menor que el umbral (5) | RF10 | ReglaApuntado101Puntos | validarVictoria -> buscarParticionExacta([3x3]) y sobrante < 5 |
| 04_cierre_liquidacion | ¿Cierre válido? | RF11 |  |  |
| 04_cierre_liquidacion | Notificar el rechazo y reanudar el turno | RF11 | TurnOrchestrator | evento CIERRE_RECHAZADO {motivo, detalle} |
| 04_cierre_liquidacion | Revelar las manos de todos los jugadores | RF13, RF18 | RoundScoring | LiquidacionVista (sobrantes y combinaciones por jugador) |
| 04_cierre_liquidacion | El ganador suma una victoria de ronda | RF13 | ReglaClasicaCuartaTerna | liquidarRonda -> victorias[ganador]++ |
| 04_cierre_liquidacion | Los perdedores suman los puntos de sus cartas sueltas (As configurable) | RF13 | ReglaApuntado101Puntos | liquidarRonda -> valoracion.puntosCarta (valorAs) |
| 04_cierre_liquidacion | Declarar tablas: la ronda no suma puntos |  | TurnOrchestrator | PartidaEnCurso.declararTablas |
| 04_cierre_liquidacion | Guardar liquidación, marcador y manos iniciales (versión optimista) | RF14, RF19 | StateRepository | IAlmacen.guardarAtomico -> guardar_sala_atomica / memoria |
| 04_cierre_liquidacion | Difundir el resultado a todos (buzones + aviso Realtime) | RF18 | TurnOrchestrator | difundirEstado - vistaMesa por jugador en su buzón |
| 04_cierre_liquidacion | Aplicar eliminaciones por umbral y evaluar el fin de partida | RF15, RF16 | HandEvaluator | IReglaJuego.evaluarPartida |
| 04_cierre_liquidacion | Pausa de liquidación: 60 s o voto "Continuar" de todos los humanos | RF17 | TurnOrchestrator | pausaLiquidacionSeg - PartidaEnCurso.votarContinuar / continuar |
| 04_cierre_liquidacion | Preparar la nueva ronda: el ganador inicia con 11 cartas | RF17 | DeckManagement | PartidaEnCurso.iniciarRonda (siguienteIniciaId) |
| 04_cierre_liquidacion | Determinar posiciones y declarar al ganador | RF16 | RoundScoring | FinalVista.posiciones |
| 04_cierre_liquidacion | Difundir el podio y habilitar la revancha | RF16, RF18 | TurnOrchestrator | evento PARTIDA_FINALIZADA - nueva_partida |
| 05_colaboracion | Crear la sala y el código único |  | LobbyManager |  |
| 05_colaboracion | Persistir la sala |  | StateRepository |  |
| 05_colaboracion | Validar 2-6 jugadores, barajar y repartir |  | DeckManagement |  |
| 05_colaboracion | Validar el turno y robar (mazo o pozo) |  | DeckManagement |  |
