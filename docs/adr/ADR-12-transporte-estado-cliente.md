# ADR-12: TRANSPORTE DEL ESTADO AL CLIENTE: CONSULTA PERIÓDICA CON AVISO DE SUPABASE REALTIME

**ESTADO:** Accepted (nuevo en el Entregable 3)

**CONTEXTO:**

El Entregable 2 suponía WebSockets con un gateway propio (`GatewayTiempoReal`). En Vercel no hay procesos que mantengan conexiones abiertas (ADR-06), y las funciones tienen un límite de 30 s por petición, así que un WebSocket propio no es viable. Los clientes deben ver los cambios de la sala con retraso acotado.

**DECISIÓN:**

1. El cliente consulta el estado de la sala al servidor cada 1,5 s.
2. Cuando Supabase Realtime está disponible, el servidor publica un aviso al cambiar la sala y el cliente reduce la consulta a cada 9 s (6 latidos). Si el aviso no llega, la consulta periódica sigue funcionando.
3. Cada mensaje lleva su hora, para que las animaciones se muestren al ritmo correcto. El estado y los eventos se muestran en orden (las jugadas de los bots conservan su ritmo); las reacciones de los bots se muestran a su hora pero en paralelo, y los mensajes de cuenta, validación y error se muestran al llegar.
4. El estado que se entrega a cada jugador es una vista proyectada (`ProyectorVistaJugador`): cada jugador solo recibe su propia mano.
5. **Respuesta visual inmediata.** Mientras una jugada viaja al servidor, el botón, el mazo o el pozo pulsado queda al 50 % de saturación, y recupera su color al llegar la respuesta. La carta descartada se dibuja de inmediato sobre el pozo, desaturada; si el servidor la rechaza, vuelve a la mano. La carta robada arrastrándola hasta la mano queda en la posición donde se soltó, con la misma guía de inserción que al reordenar.
6. **Abandonar.** La salida viaja con el código y el token de la sala; el cliente vacía su fila de peticiones y descarta lo que llegue de esa sala después de salir.
7. **Eco propio.** Cada pestaña envía un identificador aleatorio (`origen`) con sus peticiones; el aviso de Realtime lo incluye y la pestaña que provocó el cambio no vuelve a pedir nada, porque su respuesta ya trajo sus mensajes.

**ALTERNATIVAS RECHAZADAS:**

- **WebSocket propio en Vercel:** no hay proceso persistente que lo sostenga.
- **Server-Sent Events:** sufre el mismo límite de duración por petición.
- **Solo Realtime con cambios completos:** expondría manos ajenas si el aviso incluyera el estado; además, obliga a una suscripción por jugador.

**CONSECUENCIAS:**

**Positivas:** funciona sin procesos persistentes; la privacidad de las manos se mantiene en el servidor.

**Negativas:** el tráfico de consultas es constante mientras hay una sala abierta (ver docs/TRABAJO_FUTURO.md, parte 1, punto 3); la latencia percibida sube a 1,5 s o 9 s.

**NOTA DE CORRECCIÓN (23/11/2026), evidencia del proceso de búsqueda de errores.** En el primer despliegue los botones respondían con varios segundos de retraso (5 clics en "agregar bot" se aplicaban uno cada 1 o 2 s, y "crear sala" tardaba segundos). Las métricas de latencia en la base de datos (ADR-09, punto 5) mostraron 389 a 800 ms de proceso en el servidor y 570 a 670 ms de ida y vuelta por comando. La revisión encontró cuatro causas acumuladas, ninguna de la base de datos en sí:

1. La función de Vercel corría en `iad1` (Washington) y la base de datos en `us-west-2` (Oregón): cada una de las 6 a 9 consultas secuenciales de un comando cruzaba el país (~70 ms). Corrección: `vercel.json` fija la región `pdx1` (Oregón), la misma de Supabase (ADR-06).
2. El procesador hacía en serie lecturas independientes y esperaba el latido propio y el aviso de Realtime antes de responder. Corrección: sala, presencias y cuenta se leen en paralelo; el latido, el aviso y la limpieza de salas viejas se completan después de responder, con `waitUntil` (ADR-07).
3. El saludo de un bot (demora al azar de 0,7 a 2,4 s) adelantaba el reloj virtual guardado y además bloqueaba la fila de reproducción del navegador: el siguiente cambio de la sala esperaba detrás del saludo. Corrección: las tareas cosméticas no adelantan el reloj de la sala y las reacciones se reproducen en paralelo (punto 3).
4. Cada escritura provocaba un aviso de Realtime que la misma pestaña recibía y convertía en una consulta extra, intercalada en su fila. Corrección: punto 7.
5. Las jugadas de los bots se calculaban en cadena dentro de la misma petición, adelantando el estado varios segundos (y sin fin si un humano estaba en automático). Todo lo que un humano hiciera fuera de su turno (reaccionar, retomar el control, abandonar) quedaba programado detrás de esas jugadas futuras y parecía no funcionar. Corrección: el estado ya no se adelanta; cada bot juega a su hora con un ritmo natural (ADR-13, punto 4).

Las pruebas `tests/presencia.test.ts` cubren el reloj de las reacciones, las tareas en segundo plano y el origen del aviso. La idea de agrupar en una sola petición varios clics acumulados queda como trabajo futuro (docs/TRABAJO_FUTURO.md).

**CUMPLIMIENTO:** prueba de privacidad de la vista del jugador (FF-28) en `tests/`; la latencia real (servidor y navegador) se registra en cada jugada y se resume por partida en `partida_registro` (ADR-09, punto 5); los valores con usuarios reales se reportan en el Entregable 03, sección 3.3.

**REFERENCIAS:** ADR-05 v2; ADR-06; Richards & Ford (2025), Cap. 6 (medidas operativas).
