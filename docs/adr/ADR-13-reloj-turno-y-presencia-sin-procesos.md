# ADR-13: RELOJ DE TURNO Y PRESENCIA SIN PROCESOS PERSISTENTES

**ESTADO:** Accepted (nuevo en el Entregable 3). Sustituye la implementación de `TemporizadorTurno` del Entregable 2 (temporizador en memoria).

**CONTEXTO:**

El Entregable 2 define `TemporizadorTurno` como un temporizador que notifica al orquestador cuando vence un turno. En una función serverless no hay temporizadores que sobrevivan entre peticiones. Además, un jugador que se desconecta debe quedar marcado como ausente sin que el servidor lo sondee.

**DECISIÓN:**

1. El vencimiento del turno se guarda en la sala (`proximo_en`, en milisegundos). Cualquier petición a la sala aplica primero los vencimientos pendientes, mediante `ProgramadorVirtual`, y después procesa el comando del jugador.
2. La presencia se registra en la tabla `presencia` con la hora de la última señal. Quien no da señales en 30 s queda desconectado al aplicarse la siguiente petición.
3. Un turno vencido se resuelve robando y descartando por el jugador. Dos turnos vencidos seguidos activan el piloto automático del jugador; más de tres turnos saltados lo pasan a modo automático sin votación. Si el jugador sigue ausente, cualquier jugador puede abrir una votación de expulsión (mayoría simple de los activos).
4. El reloj es virtual: conserva las pausas (por ejemplo, durante una votación de expulsión).

**ALTERNATIVAS RECHAZADAS:**

- **Temporizador en memoria:** se pierde al terminar la función.
- **Trabajo programado (cron) cada minuto:** introduce latencia y consumo aunque no haya partidas.
- **Cola de mensajes con retraso:** requiere un servicio adicional sin beneficio para el alcance.

**CONSECUENCIAS:**

**Positivas:** no hay consumo cuando no hay actividad; el estado es reproducible en pruebas (reloj inyectado).

**Negativas:** un turno vencido se resuelve solo cuando alguien hace una petición a la sala; si nadie consulta, el turno queda pendiente hasta la siguiente consulta.

**CUMPLIMIENTO:** pruebas de expiración de turno y de presencia en `tests/partida.test.ts` y `tests/servicio.test.ts` (180 pruebas pasan en CI).

**REFERENCIAS:** ADR-05 v2; ADR-07; Richards & Ford (2025), Cap. 21.
