# ADR-14: GOBERNANZA ARQUITECTÓNICA EN TYPESCRIPT: FUNCIONES DE IDONEIDAD Y PUERTAS DE CI

**ESTADO:** Accepted (nuevo en el Entregable 3; revisado el 22/11/2026 al implementar el catálogo de funciones de idoneidad). Adapta a TypeScript las funciones de idoneidad del Entregable 2 (Anexo E.1, reglas G1 a G8), escritas originalmente para ArchUnit, JUnit, Checkstyle y JaCoCo.

**CONTEXTO:**

El Entregable 2 especificó 32 funciones de idoneidad (FF-01 a FF-32) y 8 reglas de gobernanza (G1 a G8) para Java 17. El código del juego está en TypeScript (ADR-06), y la guía del Entregable 3 exige ejecutarlas en un pipeline de integración continua: aislamiento de capas, ausencia de ciclos, límite de complejidad y métricas de modularidad.

**DECISIÓN:**

| Entregable 2 (Java) | Entregable 3 (TypeScript) | Comando | Puerta de CI |
|---|---|---|---|
| ArchUnit: capas, ciclos, aislamiento (FF-01 a FF-09, FF-27) | dependency-cruiser, 15 reglas | `npm run deps` | Bloqueante |
| (sin equivalente) | Sondas: cada regla debe detectar una violación inyectada | `npm run deps:sondas` | Bloqueante |
| Checkstyle CC ≤ 10; CC < 5 en evaluadores (FF-10) | ESLint `complexity`: ≤ 10 en el núcleo, ≤ 4 en `src/rules` | `npm run cc` | Bloqueante |
| JDepend: distancia a la secuencia principal (FF-30) | `tools/metricas-modulos.mjs` (Ca, Ce, I, A, D) | `npm run metricas` | Bloqueante |
| Sensor de aserciones (FF-31) | `tools/verificar-aserciones.mjs` (árbol sintáctico de las pruebas) | `npm run aserciones` | Bloqueante |
| JUnit + JaCoCo ≥ 95 % en rules y scoring (FF-15) | vitest + v8 con umbral por carpeta | `npm run test:cov` | Bloqueante |
| JUnit, Testcontainers (FF-11 a FF-29) | vitest y PGlite (PostgreSQL en WebAssembly) | `npm run test:cov` | Bloqueante |
| Monitoreo de latencia en producción (FF-32) | `tools/ff32-latencia-produccion.ts`: p99 por partida de `partida_registro` frente a la línea base de 300 ms | `npm run ff32` | Manual, tras las sesiones con usuarios |
| `mvn verify` | `npm run verify` | — | — |

**Alcance de la regla de complejidad.** El núcleo arquitectónico (`kernel`, `estado`, `rules`, `deck`, `player`, `scoring`, `persistence`, `game`, `infra`, `serverless` y `api`) debe cumplir sin excepciones y bloquea el pipeline. La interfaz web (`src/web`) y los extras (`src/extras`, ADR-11) no forman parte del núcleo: se miden en un job informativo (`npm run cc:ui`) que no bloquea. Motivo: son código de presentación (animación, sonido, arrastre de cartas) cuyo riesgo no es el que protege la regla G3, y refactorizarlo sin pruebas de interfaz completas arriesga regresiones visuales.

**Definición de la métrica de abstracción (FF-30).** A = abstractos / (abstractos + concretos), donde abstractos son las interfaces con comportamiento (declaran al menos un método) y las clases abstractas exportadas, y concretos son las clases concretas y las funciones exportadas. Las interfaces de solo datos y los alias de tipo no cuentan (son datos, no abstracciones). El umbral D ≤ 0,5 bloquea en los módulos del núcleo. Los módulos de **base estable** (I ≤ 0,25: `kernel`, `deck`, `player`, `rules`) se reportan sin bloquear: son estables y concretos por diseño (cartas, baraja, turnos y reglas no son volátiles) y los demás los consumen por sus interfaces. Es la excepción de la "zona de dolor" que Martin admite para módulos estables y no volátiles.

**MEDICIÓN (22/11/2026, código de este repositorio; reporte completo en `docs/gobernanza/REPORTE.md`):**

- Reglas de dependencias: 15 reglas, 0 violaciones; las 15 detectan su sonda. Sin ciclos entre archivos ni entre módulos.
- Complejidad del núcleo: 0 funciones por encima del umbral (antes 34; la mayor era `Procesador.intentar` con CC 68). Interfaz web y extras: 28 avisos informativos (18 en `src/web`, 10 en `src/extras`).
- Cobertura de líneas: `src/rules` 98,1 % y `src/scoring` 100 % (umbral 95 %).
- Pruebas: 224 en 18 archivos, todas con aserciones; protocolo HTTP de punta a punta: 18 verificaciones.
- Latencia de validación y cómputo de una mano de 11 cartas (FF-16): en todas las corridas, el p99 y el peor caso de cada escenario quedaron por debajo de 25 ms (presupuesto: 100 ms). La cifra varía con la carga de la máquina; la última medición está en `docs/gobernanza/latencia.json`.
- Distancia a la secuencia principal: todos los módulos del núcleo con D ≤ 0,5; base estable reportada (`kernel` D = 1,00, `player` 0,67, `deck` 0,53, `rules` 0,42).

**CONSECUENCIAS:**

**Positivas:** la arquitectura del Entregable 2 queda protegida de forma automática en cada push; las reglas de dependencias se prueban a sí mismas, de modo que una regla mal escrita hace fallar el pipeline; la complejidad del núcleo ya no puede crecer sin que el pipeline lo detecte.

**Negativas:** la interfaz web y los extras quedan fuera de la puerta de complejidad (28 avisos informativos); FF-32 (monitoreo de latencia en producción) se ejecuta a mano y no en el pipeline, porque necesita datos de producción y las credenciales de Supabase; la métrica A depende de la definición adoptada arriba, distinta de la de Java por las diferencias del lenguaje.

**REFERENCIAS:** Richards & Ford (2025), Cap. 3 (métricas de modularidad) y Cap. 6 (funciones de idoneidad); Martin, R. C. (2002), *Agile Software Development*, métricas de paquetes; ADR-01, ADR-03, ADR-05, ADR-07, ADR-11; `.github/workflows/fitness-functions.yml`.
