# ADR-09: REGISTRO DE EVENTOS DE AUDITORÍA PARA EVIDENCIA DE PRUEBAS CON USUARIOS

**ESTADO:** Accepted (nuevo en el Entregable 3). Tabla y escritura desde el procesador implementadas en `supabase/esquema.sql` y `src/serverless/Procesador.ts`.

**CONTEXTO:**

La guía del Entregable 3 pide, como evidencia de las pruebas con usuarios reales, logs de auditoría generados durante la sesión. El juego no registraba eventos de forma persistente.

**DECISIÓN:**

1. Tabla `evento` en Supabase, con: identificador de sala, tipo de evento (los tipos de juego, por ejemplo `CARTA_ROBADA`, `CIERRE_ACEPTADO`, `RONDA_LIQUIDADA`, `JUGADOR_ELIMINADO`), marca de tiempo y datos mínimos en `detalle` (secuencia, ronda y datos del evento). Sin direcciones IP ni datos personales; el jugador se identifica con el identificador anónimo de la partida.
2. El registro se escribe dentro de la misma función atómica de ADR-07 (`guardar_sala_atomica`, parámetro `p_eventos`). El procesador recoge los eventos de cada petición y los guarda junto con la sala.
3. Un cierre aceptado por ronda de cada partida: un índice único parcial impide registrar dos `CIERRE_ACEPTADO` de la misma ronda de una partida (ver ADR-07). El evento lleva el número de partida (`partida`) porque las revanchas reinician las rondas.
4. La exportación de los registros de una sesión de prueba se hace con una consulta documentada en el protocolo de validación (`docs/evidencias/protocolo-validacion.md`).
5. **Métricas de experiencia (extra, `src/extras/metricas`, 22/11/2026):** cada evento lleva su número de partida y cada jugada deja una muestra `METRICA_LATENCIA` (proceso en el servidor y la ida y vuelta medida por el navegador). Al registrar `PARTIDA_FINALIZADA`, un disparador resume la partida en `partida_registro` (turnos, tiempo promedio por turno con y sin bots, cierres, turnos vencidos y latencias p50 y p95), que no depende de `sala` y conserva las últimas 100 partidas, con el detalle por jugador en `partida_jugador_registro` (se borra en cascada con su partida). La vista `v_metricas_partidas` agrega por modalidad. El disparador es de mejor esfuerzo: si falla, no impide guardar el fin de la partida.

**ALTERNATIVAS RECHAZADAS:**

- **Logs de la plataforma de Vercel:** temporales, sin estructura y ajenos al evento de juego.
- **Grabación de pantalla únicamente:** no permite medir tiempos ni conflictos.

**CONSECUENCIAS:**

**Positivas:** insumo directo para el análisis de resultados (sección 3.3 de la guía).

**Negativas:** crecimiento de la tabla `evento` mientras la sala existe (se borra con la sala); el histórico resumido se limita a 100 partidas.

**CUMPLIMIENTO:** `tests/esquema.test.ts` comprueba que los eventos se guardan con la sala, que no hay dos cierres por ronda de una partida y que la consulta de auditoría no encuentra duplicados. FF-19 (`tests/idoneidad-servidor.test.ts`): en partidas jugadas por el procesador, incluida una revancha, cada ronda liquidada tiene exactamente un cierre aceptado. `tests/metricas.test.ts`: resumen de la partida, retención de 100 partidas y muestras de latencia sin envío a los clientes.

**REFERENCIAS:** Guía del Entregable 3, sección 3.2 (registro de evidencias); ADR-07.
