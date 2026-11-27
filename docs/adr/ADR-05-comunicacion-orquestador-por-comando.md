# ADR-05 (v2): COMUNICACIÓN POR ORQUESTADOR POR COMANDO CON NOTIFICACIÓN POSTERIOR AL COMMIT

**Versión:** 2.0 (Entregable 3, adaptación a TypeScript sobre Vercel y Supabase)
**Sustituye:** ADR-05 v1 (`Entregable 02/.../ADR-05-comunicacion-sincrona-mediador.md`) en los puntos marcados como "Cambio". Lo no marcado se mantiene.
**ESTADO:** Accepted (adaptación del Entregable 3)

**CONTEXTO:**

Cada jugada (robar, descartar, cambiar de turno, cerrar ronda) modifica el estado de la partida y debe notificarse a los jugadores de la sala. La versión 1 suponía un proceso persistente con un mediador en memoria y una cola de comandos por partida. El despliegue real del juego en Vercel ejecuta una función sin estado por petición: no hay proceso que conserve memoria entre comandos ni cola en memoria. Las fuerzas de ADR-05 v1 (orden estricto, único escritor, notificar solo estado confirmado, pruebas deterministas) siguen vigentes.

**Fuerzas en juego:**

- **Orden estricto por partida:** robar, descartar, cambio de turno y cierre no pueden intercalarse.
- **Un único escritor lógico de estado:** el orquestador.
- **Notificar solo estado confirmado.**
- **Sin estado en proceso:** cada comando debe reconstruir la partida desde la base de datos.
- **Pruebas deterministas** con dobles de repositorio y de canal.

**DECISIÓN:**

1. **Cambio: orquestador por comando.** Cada comando del jugador (o el vencimiento de un turno) se procesa en una sola ejecución: carga la sala desde Supabase con su versión, aplica el comando mediante el orquestador, y persiste el resultado con ***IAlmacen.guardarAtomico*** (función SQL `guardar_sala_atomica`). El orquestador sigue siendo el único módulo que coordina `deck`, `player`, `rules`, `scoring` y `persistence`; ningún módulo de negocio llama a otro.
2. **Cambio: serialización por versión, no por cola en memoria.** El orden de los comandos de una sala lo garantiza el control de versión optimista (ADR-07). Si dos comandos compiten, el segundo falla con conflicto y se reintenta sobre el estado nuevo.
3. **Cambio: persistencia y eventos en la misma escritura.** Los eventos del comando (`EventoJuego`, snapshot inmutable del Shared Kernel) se guardan en la misma llamada de base de datos que el estado (ADR-07). Los mensajes de cada jugador (estado y eventos filtrados por `ProyectorVistaJugador`) también se guardan en esa escritura, en su buzón. Solo después de que la escritura confirma, y ya respondida la petición, se llama a ***ICanalTiempoReal***.avisarCambio(codigo, origen): el aviso no lleva datos del juego, cada cliente recoge su buzón y la pestaña que provocó el cambio no vuelve a pedir nada (ADR-12).
4. **Sin cambio: temporizador.** ***ITemporizadorTurno*** no conserva estado propio: el próximo plazo (fin de turno, votación, pausa o jugada de un bot) se guarda en la sala (`proximo_en`) y lo procesa el mismo flujo de comandos al llegar una petición o un latido, sin adelantarse a la hora real (ADR-13).
5. **Sin cambio: aislamiento de fallos.** Si la difusión falla, el estado ya confirmado no se revierte; el cliente se resincroniza al consultar el estado persistido.
6. **Cambio: transporte hacia los clientes.** Los clientes reciben el estado por consulta periódica al servidor (cada 1,5 s; cada 9 s cuando Supabase Realtime avisa de cambios). Ya no hay conexiones WebSocket propias. El contrato de eventos se documenta como OpenAPI (peticiones) y AsyncAPI (eventos de Realtime).

**Condición de revisión:** si aparece un segundo consumidor de eventos con latencia crítica, se evalúa un publicador local posterior al commit detrás del mismo puerto.

**ALTERNATIVAS RECHAZADAS:**

- **Bus de eventos local síncrono (v1, opción B):** en Vercel no hay proceso que mantenga suscriptores entre peticiones. Sigue siendo rechazado por el flujo implícito.
- **Cola de comandos en memoria por partida:** no sobrevive entre peticiones de una función sin estado.
- **Broker externo (Kafka, RabbitMQ):** infraestructura adicional que el alcance (menos de 100 jugadores simultáneos por sala) no justifica.

**CONSECUENCIAS:**

**Positivas:** el estado y los eventos son coherentes entre sí; las pruebas siguen siendo deterministas porque el orquestador recibe sus dependencias por interfaz; el juego corre sin servidor persistente.

**Negativas:** cada comando paga una lectura (sala, presencias y cuenta en paralelo) y una escritura en base de datos; la latencia percibida depende de la distancia a Supabase, por eso la función corre en la misma región (ADR-06); el cliente ve los cambios con retraso de hasta 9 s si Realtime falla.

**CUMPLIMIENTO (COMPLIANCE):**

- **Dependencias de módulos (dependency-cruiser):** `deck`, `player`, `rules`, `scoring` y `persistence` no dependen de `game`. Excepción documentada: `scoring` depende de `rules`.
- **Orquestador solo con interfaces:** `game` importa interfaces de `persistence` e `infra`, no implementaciones.
- **Notificación posterior a la escritura (prueba con dobles, FF-23 y FF-24 en `tests/idoneidad-servidor.test.ts`):** `avisarCambio` solo se invoca si `guardarAtomico` devolvió éxito; si la escritura falla no hay aviso ni mensajes en los buzones.
- **Serialización por versión (prueba de concurrencia):** dos comandos sobre la misma versión producen un solo cambio y un conflicto.

**REFERENCIAS:**

- Gamma, E., et al. (1994). *Design Patterns*. Mediator y Observer.
- Richards, M. & Ford, N. (2025). *Fundamentals of Software Architecture* (2.ª ed.). Cap. 11 y 21.
- ADR-01, ADR-03, ADR-04, ADR-06 y ADR-07.

**NOTAS:**

- Cambio aprobado para el Entregable 3 por decisión del equipo (D08 del registro interno).
- Motivo principal del cambio: el despliegue en Vercel con Supabase (ADR-06), que no mantiene procesos ni memoria entre peticiones.
