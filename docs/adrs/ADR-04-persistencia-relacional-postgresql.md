# ADR-04: PERSISTENCIA RELACIONAL CENTRALIZADA CON POSTGRESQL

**TÍTULO:** ADR-04: Adoptar PostgreSQL como Persistencia Relacional Centralizada para Partidas, Manos y Marcador Acumulativo (vs. SQLite Embebida o Base Documental)

**ESTADO:** Accepted

**CONTEXTO:**

ADR-01 definió el PersistenceDomain con "transacciones ACID, historial de rondas y persistencia de estado de partida", pero no fijó el motor ni el modelo de datos. El Entregable 2 exige elegir entre un enfoque relacional (modelo E-R) y uno documental (JSON Schema) para registrar las partidas, las manos y el marcador acumulativo de 101 puntos. El sistema debe persistir:

- Sesiones y salas, jugadores y su orden de turno.
- Manos y ubicación de cada carta (mazo, pozo o mano).
- Robos, descartes y cierres (trazabilidad de cada jugada).
- Estados de ronda y penalizaciones acumuladas por jugador.

**Fuerzas en juego:**

- **Atomicidad del cierre de ronda:** cierre, puntajes, eliminaciones y fin de partida deben confirmarse juntos. No puede haber penalizaciones parciales ni dos cierres simultáneos.
- **Una sola estructura para dos modalidades:** Clásica (ronda única, sin acumulado) y Apuntado (múltiples rondas, acumulado y umbral de 101).
- **Recuperación:** una caída no puede dejar una partida en un estado intermedio (driver de Reliability).
- **Escala:** < 100 usuarios simultáneos y 6 jugadores por partida (ADR-01).
- **Tensión de fondo:** consistencia frente a simplicidad operativa.

**DECISIÓN:**

Se adopta una **topología monolítica centralizada con PostgreSQL**: una sola base de datos y un solo esquema, coherente con el Monolito Modular de 1 quantum. Se elige frente a SQLite y a MongoDB porque obtuvo el mayor puntaje ponderado (4.80, 3.60 y 3.30; Tabla 2.1.1) y es la única que ofrece a la vez transacciones multitabla, restricciones declarativas y bloqueo por fila:

- **Modelo relacional en 3FN con 10 tablas** (Figuras 2.2.1 y 2.2.2): `modalidad`, `jugador`, `partida`, `partida_jugador`, `ronda`, `mano_jugador`, `carta`, `ronda_carta`, `turno_jugada` y `puntaje_acumulado`. La relación Partida–Ronda es 1:N, y Jugador–Partida (N:M) se resuelve con `partida_jugador`.
- **La integridad vive en el esquema, no solo en la aplicación:** PK/FK, CHECK, el índice parcial `ux_cierre_valido` (un solo cierre válido por ronda) y dos triggers (no admitir jugadas en una ronda que no esté `EN_CURSO` y exigir que la participación pertenezca a la partida de la ronda).
- **La modalidad es un dato:** la tabla `modalidad` con JSONB únicamente para sus parámetros. Una modalidad nueva no cambia el esquema (ADR-03).
- **Una sola desnormalización controlada:** `puntaje_acumulado.acumulado_tras_ronda`, escrito una sola vez dentro de la transacción de cierre, para evaluar el umbral de 101 sin recalcular el historial.
- **Estrategia de concurrencia (Sección 2.4):** serialización por partida en el orquestador, una sola transacción ACID con `READ COMMITTED` y bloqueo explícito (`SELECT … FOR UPDATE`) de la fila de la ronda, y control optimista con `ronda.version`. Toda escritura sobre la ronda toma ese mismo bloqueo.
- **Acceso único:** solo el módulo `persistence` abre conexiones y toca el esquema; el resto usa ***IRepositorioPartida***.
- **Evolución controlada:** el esquema se gestiona con migraciones versionadas (p. ej., Flyway), y su diagrama se actualiza con cada migración.

**ALTERNATIVAS RECHAZADAS:**

**Opción B (SQLite embebida):**
- Es ACID y no requiere servidor, pero admite un solo escritor a la vez, a nivel de archivo. Eso sacrifica la concurrencia entre salas y el bloqueo por fila que necesita el cierre de ronda.
- Ofrece menos tipos y restricciones que PostgreSQL (puntaje de consistencia 4 frente a 5).
- El ahorro de operar un servidor no compensa la pérdida de la concurrencia multi-jugador (2 frente a 5).

**Opción C (Base documental, p. ej. MongoDB):**
- Con la partida como documento único, el cierre sería atómico. Pero ese documento crece con cada jugada, sin cota.
- Con documentos separados (ronda, puntajes, participantes), el cierre exige transacciones multidocumento, perdiendo la simplicidad que justificaba el modelo.
- No ofrece FK ni CHECK: la integridad (cartas únicas por ronda, un solo cierre válido, umbral coherente) recaería solo en la aplicación.
- El historial por jugador y el marcador entre partidas exigen agregaciones sobre colecciones, más incómodas que un `JOIN`.
- Introduce un segundo modelo de datos para el equipo, sin ventaja compensatoria a esta escala (simplicidad 3, consistencia 3).

**CONSECUENCIAS:**

**Positivas:**
- **Cierre de ronda todo o nada:** cierre, puntajes, eliminaciones y fin de partida se confirman en una sola transacción.
- **Integridad defendida en profundidad:** aunque falle el orquestador, el esquema impide el segundo cierre válido, las jugadas tardías y las participaciones ajenas.
- **Auditoría y reproducibilidad:** `turno_jugada` registra cada acción y `semilla_barajado` permite reproducir el barajado.
- **Un solo esquema para ambas modalidades** y para las variantes futuras que no cambien la estructura de datos.
- **Historial y marcador por consulta:** vistas (`v_marcador`, `v_ronda_ganador`) y `JOIN` en lugar de agregaciones ad hoc.

**Negativas:**
- **Operar un servidor de base de datos.** Se mitiga con un contenedor de desarrollo y migraciones versionadas.
- **Escalado vertical:** suficiente para < 100 usuarios simultáneos, pero no horizontal.
- **Acoplamiento al motor:** triggers PL/pgSQL, índices parciales y JSONB limitan la portabilidad a otro motor.
- **Variantes con estructura de datos nueva** (p. ej., varias barajas o comodines) exigen una migración (ADR-03).
- **Crecimiento de `turno_jugada`:** sin límite natural; si el volumen lo exige, se aplicará retención o particionado.
- **Coherencia garantizada por la transacción, no por el esquema:** que "ronda `CERRADA` ⇔ existe un cierre válido" depende de la atomicidad, por lo que se audita.

**CUMPLIMIENTO (COMPLIANCE):**

- **Acceso único (ArchUnit):** ninguna clase fuera de `persistence` importa el paquete JDBC ni el ORM. 0 violaciones en cada build.
- **Restricciones del esquema (Testcontainers sobre PostgreSQL real, no H2):** se prueba que se rechazan un segundo cierre válido, una jugada en ronda cerrada y una participación de otra partida. Los índices parciales y los triggers son específicos del motor, por eso no se admite un sustituto en memoria.
- **Concurrencia:** de 2 a 6 hilos cierran la misma ronda; debe quedar exactamente un cierre válido y ninguna penalización parcial.
- **Consulta de auditoría:** no debe haber rondas `CERRADA` sin cierre válido ni cierres válidos en rondas `EN_CURSO` (0 filas).
- **Suma de penalizaciones:** `acumulado_tras_ronda` es igual al acumulado previo más `penalizacion_ronda` en todas las filas.
- **Recuperación:** la caída del proceso durante el cierre deja un estado consistente y, si la partida no terminó, la recuperación crea la ronda siguiente (sin duplicarla por `UQ(id_partida, numero_ronda)`).
- **Desempeño:** la transacción de cierre con 6 jugadores simulados cumple el objetivo de diseño de ≤ 100 ms (el E1 fija ese presupuesto para la validación; aquí se adopta como objetivo para el cierre).
- **Control del esquema:** todo cambio pasa por una migración versionada y actualiza las Figuras 2.2.1 y 2.2.2; revisión obligatoria en PR.

**REFERENCIAS:**

- Richards, M. & Ford, N. (2025). *Fundamentals of Software Architecture* (2.ª ed.). O'Reilly. Cap. 10, 11, 14 y 26 (topologías y datos) y Cap. 21 (decisiones arquitectónicas).
- Kleppmann, M. (2017). *Designing Data-Intensive Applications*. O'Reilly. Cap. 7, "Transactions".
- PostgreSQL Global Development Group. *Transaction Isolation* y *Explicit Locking*. https://www.postgresql.org/docs/current/.
- Fowler, M. (2002). *Patterns of Enterprise Application Architecture*. Addison-Wesley. Optimistic Offline Lock.
- Ford, N., Parsons, R. & Kua, P. (2017). *Building Evolutionary Architectures*. O'Reilly. Fitness functions.
- ADR-01 (PersistenceDomain), Entregable 1.
- Entregable 2: Sección 2 (Tablas 2.1.1, 2.2.2, 2.2.3 y 2.4.1; Figuras 2.2.1, 2.2.2 y 2.3.1).

**NOTAS:**

- **Autor / decisión aprobada por:** Equipo de Arquitectura del Proyecto (Valentina Luján Robledo, Alejandro Giraldo Quiceno, Jhofred Jahat Camacho Gomez, Laura Ladino Gallego, Luis José Mejía Restrepo).
- **Fecha de aprobación (interna del equipo):** 29/10/2026.
- **Revisores:** autoevaluado por el equipo de arquitectura; pendiente de revisión formal por el docente (Fernán Alonso Villa Garzón) en sustentación.
- **Estado de madurez:** Accepted (Aprobado como Línea Base Arquitectónica del Entregable 2). Conformidad pendiente de implementación y de verificación con las fitness functions de la sección de gobernanza.
- **Relación con otras decisiones:** concreta el PersistenceDomain de ADR-01; apoya a ADR-03 (la modalidad como dato) y condiciona a ADR-05 (la notificación se emite solo después del `COMMIT`).
