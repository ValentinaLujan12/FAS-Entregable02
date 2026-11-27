# ADR-13: RELOJ DE TURNO Y PRESENCIA SIN PROCESOS PERSISTENTES

**ESTADO:** Accepted (nuevo en el Entregable 3). Sustituye la implementación de `TemporizadorTurno` del Entregable 2 (temporizador en memoria).

**CONTEXTO:**

El Entregable 2 define `TemporizadorTurno` como un temporizador que notifica al orquestador cuando vence un turno. En una función serverless no hay temporizadores que sobrevivan entre peticiones. Además, un jugador que se desconecta debe quedar marcado como ausente sin que el servidor lo sondee.

**DECISIÓN:**

1. El vencimiento del turno se guarda en la sala (`proximo_en`, en milisegundos). Cualquier petición a la sala aplica primero los vencimientos pendientes, mediante `ProgramadorVirtual`, y después procesa el comando del jugador.
2. La presencia se registra en la tabla `presencia` con la hora de la última señal. Quien no da señales en 30 s queda desconectado al aplicarse la siguiente petición.
3. Un turno vencido se resuelve robando y descartando por el jugador. Dos turnos vencidos seguidos activan el piloto automático del jugador; más de tres turnos saltados lo pasan a modo automático sin votación. Si el jugador sigue ausente, cualquier jugador puede abrir una votación de expulsión (mayoría simple de los activos).
4. El estado nunca va por delante de la hora real: los plazos y las jugadas de los bots se aplican en la primera petición que llega después de su hora (si llega tarde, se aplican en orden todas las que ya tocaban). La hora de la jugada de un bot se ancla al inicio de la fase con una espera natural y determinista (`ritmoBot`): entre 0,5 y 2 s para robar y entre 1 y 3 s para descartar, lognormal con la moda cerca de 0,9 s y 1,5 s. El cliente vuelve a llamar a esa hora (`proximoEn`). Así una reacción, un "Retomar el control" o un "Abandonar" de un humano se aplica en el momento, aunque no sea su turno. Las reacciones de los bots se emiten a su hora sin adelantar el reloj de la sala.
5. **Pausa sin humanos conectados.** Si ningún humano da señales, la partida no avanza entre bots: queda en pausa. Si un humano vuelve antes de 5 minutos, todos los plazos (turno, votación, liquidación) se corren lo que duró la pausa y la partida sigue donde estaba. Si nadie vuelve en 5 minutos, la partida termina por abandono (`PARTIDA_FINALIZADA` con `abandono: true`), y queda registrada en `partida_registro` con ese motivo. Las salas en esa situación se revisan al crear otra sala, en segundo plano. Con otro humano conectado no hay pausa: al ausente se le aplica lo del punto 3.
6. **Salir.** Si sale el último humano de una partida en curso, la partida termina por abandono en ese momento (no sigue entre bots) y queda registrada igual que en el punto 5.
7. **Liquidación.** La pantalla de puntajes de cada ronda dura hasta 60 s (`pausaLiquidacionSeg`). Cada humano pulsa "Continuar"; los bots, y los humanos en automático o desconectados, no se esperan. Cuando votan todos los humanos conectados, la siguiente ronda empieza de inmediato.
8. **Revancha.** Tras el podio, cualquier humano de la sala pide la revancha y todos vuelven a la misma sala con la configuración anterior. Si el anfitrión ya salió, quien pide la revancha pasa a ser el anfitrión. La sala se borra cuando salen todos.

**ALTERNATIVAS RECHAZADAS:**

- **Temporizador en memoria:** se pierde al terminar la función.
- **Trabajo programado (cron) cada minuto:** introduce latencia y consumo aunque no haya partidas.
- **Cola de mensajes con retraso:** requiere un servicio adicional sin beneficio para el alcance.

**CONSECUENCIAS:**

**Positivas:** no hay consumo cuando no hay actividad; el estado es reproducible en pruebas (reloj inyectado).

**Negativas:** un turno vencido se resuelve solo cuando alguien hace una petición a la sala; si nadie consulta, el turno queda pendiente hasta la siguiente consulta. Una partida abandonada por todos se cierra cuando alguien vuelve o cuando se crea otra sala, no exactamente a los 5 minutos.

**CUMPLIMIENTO:** pruebas de expiración de turno y de presencia en `tests/partida.test.ts` y `tests/servicio.test.ts`; pausa sin humanos, reanudación con plazos corridos, fin por abandono (al volver, por barrido y al salir el último humano), votación de "Continuar", ritmo de los bots, acciones fuera de turno y revancha en `tests/presencia.test.ts`.

**REFERENCIAS:** ADR-05 v2; ADR-07; Richards & Ford (2025), Cap. 21.
