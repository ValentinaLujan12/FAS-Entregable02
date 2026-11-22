# ADR-12: TRANSPORTE DEL ESTADO AL CLIENTE: CONSULTA PERIÓDICA CON AVISO DE SUPABASE REALTIME

**ESTADO:** Accepted (nuevo en el Entregable 3)

**CONTEXTO:**

El Entregable 2 suponía WebSockets con un gateway propio (`GatewayTiempoReal`). En Vercel no hay procesos que mantengan conexiones abiertas (ADR-06), y las funciones tienen un límite de 30 s por petición, así que un WebSocket propio no es viable. Los clientes deben ver los cambios de la sala con retraso acotado.

**DECISIÓN:**

1. El cliente consulta el estado de la sala al servidor cada 1,5 s.
2. Cuando Supabase Realtime está disponible, el servidor publica un aviso al cambiar la sala y el cliente reduce la consulta a cada 9 s (6 latidos). Si el aviso no llega, la consulta periódica sigue funcionando.
3. Cada mensaje lleva su hora, para que las animaciones se muestren al ritmo correcto.
4. El estado que se entrega a cada jugador es una vista proyectada (`ProyectorVistaJugador`): cada jugador solo recibe su propia mano.

**ALTERNATIVAS RECHAZADAS:**

- **WebSocket propio en Vercel:** no hay proceso persistente que lo sostenga.
- **Server-Sent Events:** sufre el mismo límite de duración por petición.
- **Solo Realtime con cambios completos:** expondría manos ajenas si el aviso incluyera el estado; además, obliga a una suscripción por jugador.

**CONSECUENCIAS:**

**Positivas:** funciona sin procesos persistentes; la privacidad de las manos se mantiene en el servidor.

**Negativas:** el tráfico de consultas es constante mientras hay una sala abierta (ver docs/TRABAJO_FUTURO.md, parte 1, punto 3); la latencia percibida sube a 1,5 s o 9 s.

**CUMPLIMIENTO:** prueba de privacidad de la vista del jugador (FF-28) en `tests/`; la latencia real (servidor y navegador) se registra en cada jugada y se resume por partida en `partida_registro` (ADR-09, punto 5); los valores con usuarios reales se reportan en el Entregable 03, sección 3.3.

**REFERENCIAS:** ADR-05 v2; ADR-06; Richards & Ford (2025), Cap. 6 (medidas operativas).
