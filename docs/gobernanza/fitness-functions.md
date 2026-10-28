# Sección 5 - Gobernanza y fitness functions

Fuente: Entregable 2, Sección 5 (Richards & Ford, Cap. 6; P09). Ejecutar con `mvn verify` (ver `README.md`).

Una fitness function es cualquier mecanismo que entrega una evaluación objetiva de la integridad de una característica arquitectónica (Cap. 6). Por eso aquí hay pruebas ArchUnit, pruebas JUnit, métricas (Checkstyle, JaCoCo) y un monitor de producción especificado.

## Drivers descompuestos en medidas objetivas

| Driver (E1) | Tipo de medida (Cap. 6) | Medida concreta | Fitness functions |
|---|---|---|---|
| Extensibility | Estructural y de proceso | Una modalidad nueva es una clase en su subpaquete y una fila de datos; no se toca main; contrato común en verde | FF-07, FF-09, FF-11 a FF-13 |
| Testability | Estructural y de proceso | CC ≤ 10 (evaluadores < 5); cobertura ≥ 95 % en rules y scoring; toda prueba con aserción; módulos puros probables en memoria | FF-10, FF-15, FF-31 |
| Responsiveness | Operacional | Validación + cálculo de una mano de 11 cartas < 100 ms en el percentil 99 y en el peor caso (el promedio oculta los atípicos); notificación < 300 ms | FF-16, FF-22, FF-32 |
| Modularidad (implícita) | Estructural | Dependencias dirigidas, sin ciclos, solo por interfaces y distancia a la secuencia principal D ≤ 0,5 | FF-01 a FF-05, FF-30 |
| Security / integridad | Estructural y operacional | Persistencia aislada; vista proyectada por jugador; identidad ligada a la conexión; un solo cierre válido por ronda | G1, FF-06, FF-27, FF-28, FF-29, FF-17 |

## Reglas de gobernanza

| Regla | Política | Origen | Verificación |
|---|---|---|---|
| G1 Aislamiento de capas y módulos | La presentación (cliente, que entra por `infra`) no accede a `persistence`; JDBC/ORM solo en `persistence`; las entidades no salen de `persistence` | Guía 5.1; 2.1; 2.3; ADR-04 | G1, FF-06, FF-27 |
| G2 Independencia de las reglas de juego | Una estrategia por subpaquete de `rules.strategy`; sin dependencias entre ellas ni ciclos; solo `rules.strategy` conoce las implementaciones; game y scoring no conocen el contrato Strategy | Guía 5.1; ADR-02; ADR-03 | FF-07, FF-09 |
| G3 Complejidad ciclomática | Ningún método con CC > 10; los evaluadores de combinaciones de `rules` con CC < 5 (valor que recomienda el Cap. 6) | Guía 5.1 y 5.3; Cap. 6 | FF-10 |
| G4 Dependencias dirigidas y sin ciclos | Tabla 1.2.1: kernel -> nadie; infra -> kernel; rules, deck, player, persistence -> kernel; scoring -> rules, kernel; game -> todos, solo por interfaces; cada módulo con D = abs(A + I - 1) ≤ 0,5, salvo kernel (estable por diseño, I = 0) | 1.2; ADR-01; ADR-03; Cap. 6 | FF-01 a FF-05, FF-30 |
| G5 Comunicación síncrona por mediador | Sin bus de eventos ni broker; nadie llama a game; persistir y luego notificar; un comando a la vez por partida | ADR-05; 2.4 | FF-08, FF-23, FF-24, FF-25 |
| G6 Extensibilidad por contrato | Toda modalidad es una clase `IReglaJuego` descubierta automáticamente, con su fila en `modalidad`, que cumple la suite de contrato | ADR-03 | FF-11 a FF-14 |
| G7 Calidad medible | Cobertura ≥ 95 % en rules y scoring sin engañar la métrica (toda prueba con aserción); validación + cálculo < 100 ms en p99 y en el peor caso | ADR-02; ADR-03; Cap. 6 | FF-15, FF-16, FF-31 |
| G8 Integridad del cierre | Un cierre válido por ronda; acumulado = suma de penalizaciones; recuperación consistente | 2.4; ADR-04 | FF-17 a FF-22 |

**Responsables y excepciones:**

- El equipo de arquitectura define las reglas en los ADRs.
- Se explica antes de imponer (Cap. 6): cada fitness function declara su propósito y origen (`because(...)` en ArchUnit y el mensaje de cada aserción).
- Quien abre un pull request ejecuta `mvn verify`, y la CI bloquea la integración si algo falla.
- Una excepción requiere:
  - un issue con la etiqueta `excepcion-arquitectura` o un ADR en estado *Proposed*;
  - la aprobación de dos integrantes;
  - una fecha de vencimiento.
- Al cierre de cada entregable se revisa si las reglas siguen siendo pertinentes.

## Catálogo

| ID | Verifica | Tipo (Cap. 6; P09) | Herramienta | Estado |
|---|---|---|---|---|
| FF-01 | kernel no depende de nadie; infra solo de kernel | Estructural; estática, atómica, continua | ArchUnit | Implementada |
| FF-02 | rules, deck, player, persistence solo dependen de kernel | Estructural; estática, atómica, continua | ArchUnit | Implementada |
| FF-03 | scoring solo depende de rules y kernel | Estructural; estática, atómica, continua | ArchUnit | Implementada |
| FF-04 | game usa los demás módulos solo por interfaces | Estructural; estática, atómica, continua | ArchUnit | Implementada |
| FF-05 | Sin ciclos entre módulos | Estructural; estática, atómica, continua | ArchUnit | Implementada |
| G1 | infra (presentación) no accede a persistence | Estructural; estática, atómica, continua | ArchUnit | Implementada |
| FF-06 | Solo persistence usa JDBC/ORM | Estructural; estática, atómica, continua | ArchUnit | Implementada |
| FF-07 | Implementaciones de IReglaJuego solo en rules.strategy y solo referenciadas allí | Estructural; estática, atómica, continua | ArchUnit | Implementada |
| FF-08 | Sin bus de eventos ni mensajería; nadie llama a game | Estructural; estática, atómica, continua | ArchUnit | Implementada |
| FF-09 | Las estrategias no dependen entre sí; sin ciclos en rules | Estructural; estática, atómica, continua | ArchUnit | Implementada |
| FF-10 | CC ≤ 10 en todo el código y < 5 en los evaluadores de rules | Estructural; estática, atómica, continua | Checkstyle | Implementada |
| FF-11 | Modalidad nueva solo en pruebas recorre sala -> partida -> cierre -> puntaje; descubrimiento también empaquetado en jar | Estructural y de proceso; dinámica, holística, continua | JUnit 5 | Implementada |
| FF-12 | Suite de contrato común de IReglaJuego + casos propios | De proceso; dinámica, atómica, continua | JUnit 5 | Implementada |
| FF-13 | Filas de `modalidad` (migración) = estrategias registradas | Estructural; dinámica, holística, continua | JUnit 5 | Implementada |
| FF-14 | Partidas Clásica y Apuntado simultáneas no se contaminan | Operacional; dinámica, holística, continua | JUnit 5 | Implementada |
| FF-15 | Cobertura ≥ 95 % en rules y scoring | De proceso; dinámica, atómica, continua | JaCoCo | Implementada |
| FF-16 | Validación + cálculo < 100 ms en p99 y en el peor caso, en memoria | Operacional; dinámica, atómica, continua | JUnit 5 | Implementada |
| FF-17 | El esquema rechaza 2.º cierre válido, jugada tardía y participación ajena | Operacional; dinámica, holística, continua | Testcontainers | Especificada (E3) |
| FF-18 | 2 a 6 hilos cierran la misma ronda -> 1 cierre válido | Operacional; dinámica, holística, continua | Testcontainers | Especificada (E3) |
| FF-19 | Consulta de auditoría: 0 filas inconsistentes | Operacional; dinámica, holística, continua | SQL | Especificada (E3) |
| FF-20 | acumulado_tras_ronda = previo + penalización (al menos 50 rondas simuladas) | Operacional; dinámica, atómica, continua | JUnit 5 (en memoria) / SQL | Implementada en memoria |
| FF-21 | Recuperación tras una caída durante el cierre | Operacional; dinámica, holística, continua | Testcontainers | Especificada (E3) |
| FF-22 | Cierre con 6 jugadores ≤ 100 ms | Operacional; dinámica, holística, continua | Testcontainers | Especificada (E3) |
| FF-23 | difundir solo después del commit y en orden | Operacional; dinámica, holística, continua | JUnit 5 con dobles | Implementada |
| FF-24 | Si difundir falla, el estado queda confirmado | Operacional; dinámica, holística, continua | JUnit 5 con dobles | Implementada |
| FF-25 | Serialización por partida; paralelismo entre partidas | Operacional; dinámica, holística, continua | JUnit 5 | Implementada |
| FF-26 | Contrato AsyncAPI validado en CI | Estructural; estática, atómica, continua | AsyncAPI CLI | Especificada (E3) |
| FF-27 | Las entidades no salen de persistence | Estructural; estática, atómica, continua | ArchUnit | Implementada |
| FF-28 | La carta robada del mazo solo la ve quien roba (riesgo R7) | Operacional; dinámica, holística, continua | JUnit 5 | Implementada |
| FF-29 | El jugador de cada comando lo fija la conexión autenticada, no el mensaje (riesgo R15) | Estructural y operacional; dinámica, atómica, continua | JUnit 5 | Especificada (E3) |
| FF-30 | Distancia a la secuencia principal D = abs(A + I - 1) ≤ 0,5 por módulo (Ejemplo 6-3); kernel con I = 0 | Estructural; estática, holística, continua | ArchUnit + JUnit 5 | Implementada |
| FF-31 | Toda prueba tiene al menos una aserción y ninguna está deshabilitada (evita engañar la cobertura) | De proceso; estática, atómica, continua | JUnit 5 | Implementada |
| FF-32 | Monitor en producción: p99 y máximo de validación, cálculo y notificación, con alerta si salen del modelo estadístico de la línea base | Operacional; dinámica, holística, periódica | Monitores (métricas del servidor) | Especificada (E3) |

### Consultas de auditoría (FF-19 y FF-20 sobre la base de datos)

```sql
-- FF-19: rondas CERRADA sin cierre válido o cierres válidos en rondas EN_CURSO (debe devolver 0 filas)
SELECT r.id_ronda, r.estado FROM ronda r
LEFT JOIN v_ronda_ganador g ON g.id_ronda = r.id_ronda
WHERE (r.estado = 'CERRADA' AND g.id_ronda IS NULL) OR (r.estado = 'EN_CURSO' AND g.id_ronda IS NOT NULL);

-- FF-20: acumulado_tras_ronda = acumulado de la ronda anterior + penalización (debe devolver 0 filas)
SELECT pa.* FROM puntaje_acumulado pa JOIN ronda r ON r.id_ronda = pa.id_ronda
WHERE pa.acumulado_tras_ronda <> pa.penalizacion_ronda + COALESCE((
  SELECT p2.acumulado_tras_ronda FROM puntaje_acumulado p2 JOIN ronda r2 ON r2.id_ronda = p2.id_ronda
  WHERE p2.id_participacion = pa.id_participacion AND r2.id_partida = r.id_partida
    AND r2.numero_ronda < r.numero_ronda ORDER BY r2.numero_ronda DESC LIMIT 1), 0);
```

## Límites de la métrica de complejidad

La CC (McCabe: CC = E - N + 2) no distingue la complejidad esencial del problema de la accidental y puede crecer en silencio, sobre todo en código generado. Por eso se combina con la cobertura, como Crap4J: CC baja (FF-10), cobertura ≥ 95 % (FF-15) y pruebas con aserciones reales (FF-31).

## Resultados medidos (28/10/2026)

- 52 pruebas JUnit 5 en verde: fitness functions dinámicas, FF-10 y FF-31.
- Las dependencias entre módulos, extraídas del bytecode, cumplen G1, G2 y G4.
- Distancia a la secuencia principal: máximo 0,45 (infra); rules 0,22; kernel con I = 0.
- CC máxima: 4 en los evaluadores y 7 en todo el código; 0 de 246 métodos superan CC = 10.
- Cobertura: rules 98-100 % y scoring 100 %.
- Validación + cálculo: p99 de 0,15 ms (Clásica) y 0,36 ms (Apuntado); peor caso 4,1 ms y 3,4 ms.
- El esquema y la transacción de cierre se verificaron sobre PostgreSQL 16.
