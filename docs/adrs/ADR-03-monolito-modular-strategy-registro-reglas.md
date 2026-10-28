# ADR-03: MONOLITO MODULAR CON STRATEGY Y REGISTRO DE REGLAS COMO MECANISMO DE EXTENSIBILIDAD

**TÍTULO:** ADR-03: Consolidar el Monolito Modular con Strategy y RegistroReglas como Mecanismo de Extensibilidad de Reglas (vs. Microkernel, Service-Based o Condicionales)

**ESTADO:** Accepted

**CONTEXTO:**

ADR-01 adoptó el Monolito Modular (particionamiento vertical por dominio) y ADR-02 el Strategy Pattern (***IReglaJuego***) para aislar la variabilidad de reglas. El Entregable 2 exige ahora cuantificar esa elección frente a los estilos candidatos y precisar cómo se agrega una variante nueva (p. ej., Continental, comodines/Joker o "Fusión") sin alterar el orquestador. La Sección 1 compara tres estilos con los drivers del Entregable 1:

- **Drivers y pesos:** Extensibility (30 %), Testability (25 %), Responsiveness (20 %), Feasibility (15 %) y Security (10 %).
- **Resultado (Tabla 1.1.1):** Monolito Modular 4.35, Microkernel 4.05, Service-Based 3.00.
- **Presupuestos de tiempo:** validación < 100 ms (ADR-02) y notificación < 300 ms con 6 jugadores.
- **Restricciones:** una unidad de despliegue, una base de datos, equipo de 5 personas y < 100 usuarios simultáneos (ADR-01).

La Sección 2 agrega un requisito que ADR-02 no resolvía: la modalidad ahora es un dato persistido (tabla `modalidad`, referenciada por cada partida). Quedan tres preguntas abiertas: (a) cómo se descubren las estrategias disponibles, (b) cómo viaja la configuración de cada modalidad (acumulación, umbral, valor del As, reparto, mazo) y (c) qué significa "cambio de modalidad en runtime" cuando la partida persiste su modalidad.

**Problema operacional:** si el descubrimiento de reglas es manual (un `switch` o un mapa mantenido a mano) o la configuración está dispersa en constantes, una modalidad nueva obliga a editar el motor, el registro o el orquestador, y el beneficio de ADR-02 se pierde en la práctica.

**DECISIÓN:**

Se mantiene el Monolito Modular (1 quantum) y se refina ADR-02 con cuatro mecanismos, porque es la opción que mejor equilibra Extensibility con Responsiveness y Feasibility (4.35 frente a 4.05 del Microkernel, cuya ventaja de extensibilidad no compensa el costo de infraestructura de plug-ins que ADR-02 ya descartó):

1. **Contrato Strategy único.** Cada modalidad implementa ***IReglaJuego*** (`validarVictoria`, `calcularPuntos`, `parametros`, `getModalidad`). El orquestador solo conoce ***IValidadorCierre***; `scoring` solo conoce ***ICalculadorPuntos***. Ninguno conoce reglas concretas.
2. **RegistroReglas con descubrimiento automático.** Descubre por inyección de dependencias todas las implementaciones de ***IReglaJuego*** y las indexa por `CodigoModalidad`, un identificador abierto (no un `enum`). `MotorReglas` resuelve la regla consultando el registro. Agregar una modalidad no obliga a modificar ni el motor ni el registro.
3. **La modalidad es un dato.** Cada modalidad tiene una fila en `modalidad` y un objeto `ParametrosModalidad` en el Shared Kernel: `acumulativa`, `umbralEliminacion`, `valorAs`, y, nuevos en esta fase, `cartasPorJugador`, `cartaExtraInicial`, `numeroBarajas` y `comodines`. `DeckManagement` construye y reparte el mazo a partir de ellos. El cambio en el kernel es aditivo.
4. **Modalidad fija por partida.** El anfitrión la fija al crear la sala (`ISala.fijarModalidad`) y es inmutable durante la partida: `partida.codigo_modalidad` es una FK única, y el acumulado de penalizaciones de Apuntado no tiene equivalente en Clásica. La selección de la estrategia sigue ocurriendo en tiempo de ejecución, por partida, y varias partidas de modalidades distintas conviven en el mismo proceso. **Esto enmienda un punto de ADR-02:** el escenario "cambiar de Clásica a Apuntado en la ronda 2" deja de ser un requisito.

**Estructura:**

```
game.TurnOrchestratorComponent ──(IValidadorCierre)──► rules.MotorReglas
scoring.RoundScoringComponent  ──(ICalculadorPuntos)──► rules.MotorReglas
                                                            │  IRegistroReglas.obtener(CodigoModalidad)
                                                            ▼
                                                    rules.RegistroReglas ──(descubre por DI)──► «IReglaJuego»
                                                                                                    ▲
                                          ReglaClasicaCuartaTerna ──────────────────────────────────┤
                                          ReglaApuntado101Puntos ───────────────────────────────────┤
                                          ReglaFusion (futura) ─────────────────────────────────────┘
```

**Procedimiento para agregar una variante:**

1. Crear una clase en `.rules.strategy` que implemente ***IReglaJuego***.
2. Insertar su fila en `modalidad` mediante una migración, con sus `ParametrosModalidad`.
3. Escribir sus pruebas unitarias en memoria (suite de contrato común más casos propios).
4. Construir y desplegar la unidad.

`RegistroReglas` la descubre sola. No se edita código existente de `game`, `scoring`, `persistence`, `MotorReglas`, `RegistroReglas` ni de las demás estrategias.

**Alcance real de la extensibilidad:**

- **Variantes con baraja de 52 cartas y flujo robar–descartar–cerrar** (p. ej., otra variante de Rummy): estrategia + fila en `modalidad`. Sin cambios en el kernel, el esquema ni el orquestador.
- **Continental (2 barajas + comodines) y Joker:** lo anterior, más parámetros de mazo y una migración aditiva del esquema (columna `copia` en `ronda_carta`, y filas de comodines en `carta` con los CHECK de palo y rango relajados). El orquestador sigue intacto. La respuesta a la Pregunta de Brooks del Taller 01 ("¿cuántas partes hay que reescribir si agregamos un Joker?") es: las reglas, los parámetros del mazo y una migración de datos, pero no el orquestador.
- **Póker con apuestas:** requiere un flujo de turno distinto. Queda fuera de alcance; exigiría extraer el flujo de turno como estrategia (nuevo ADR).
- **Sobre "sin recompilar":** la extensión ocurre en tiempo de compilación, no de ejecución. La unidad se reempaqueta y se redespliega, coherente con ADR-02 ("las modalidades se conocen en tiempo de compilación"). Exigir carga en caliente equivale a adoptar el Microkernel.

**ALTERNATIVAS RECHAZADAS:**

**Opción A (Microkernel / Plug-in):**
- Obtuvo 4.05 (Tabla 1.1.1): es la mejor en extensibilidad (5), pero pierde en Feasibility (3) por la infraestructura de carga de plug-ins y la gestión de versiones del contrato.
- Añade una búsqueda en el registro y un costo de carga al arrancar (Responsiveness 4 frente a 5).
- Los plug-ins ejecutan dentro de la frontera del núcleo, por lo que no mejoran la seguridad (Security 3).
- No hay un requisito de carga en caliente que justifique esa complejidad en esta escala.

**Opción C (Service-Based):**
- Obtuvo 3.00. Una regla nueva implica versionar el contrato de red y redesplegar un servicio.
- Cada cierre de ronda cruzaría varios límites de red, con riesgo para el presupuesto de validación y notificación.
- Varios despliegues y operación distribuida son excesivos para un equipo de 5 personas.

**Opción D (condicionales por modalidad en el orquestador):**
- Viola el principio abierto/cerrado y el Single Responsibility Principle (argumentos ya recogidos en ADR-02).
- Sin Strategy, la extensibilidad cae a 3 en la Tabla 1.1.2.

**CONSECUENCIAS:**

**Positivas:**
- **Una variante nueva = una clase y una fila de datos:** se mantiene la métrica de ADR-02 (≤ 1-2 clases nuevas) y se agrega la verificación de que el diff de la variante no toca código existente.
- **Testabilidad:** `rules` y `scoring` son puros y se prueban en memoria, sin base de datos ni red.
- **Responsiveness:** todo es invocación en proceso, sin saltos de red, lo que sostiene validación < 100 ms y notificación < 300 ms.
- **Configuración centralizada:** los parámetros de una modalidad viven en un único lugar (`ParametrosModalidad`) y no en constantes dispersas.
- **Partidas aisladas:** al ser la modalidad fija por partida, dos partidas simultáneas en modalidades distintas no comparten estado.
- **Reversibilidad:** ***IReglaJuego*** ya es el contrato de un plug-in. Migrar a Microkernel solo cambiaría cómo `RegistroReglas` descubre las implementaciones.

**Negativas:**
- **Recompilar y redesplegar** para agregar una variante; no hay carga en caliente.
- **Alcance acotado:** solo cubre variantes que comparten el flujo robar–descartar–cerrar. Las que cambian el mazo exigen una migración aditiva, y las que cambian el flujo exigen otro ADR.
- **Cambios de contrato costosos:** modificar ***IReglaJuego*** (como al incorporar `parametros()`) obliga a actualizar todas las implementaciones, consecuencia ya anticipada en ADR-02.
- **Desalineación datos–código:** puede existir una fila en `modalidad` sin estrategia o una estrategia sin fila. Se mitiga con una verificación al arrancar.
- **Enmienda a ADR-02:** se pierde la posibilidad de cambiar de modalidad dentro de una misma partida.

**CUMPLIMIENTO (COMPLIANCE):**

- **Reglas de dependencia como fitness function estática (ArchUnit):** `kernel` no depende de otros módulos e `infra` depende solo de `kernel` (usa sus tipos compartidos, p. ej. `EventoJuego` en `ICanalTiempoReal.difundir`); `rules`, `deck`, `player` y `persistence` dependen solo de `kernel`; `scoring` depende solo de `rules` y `kernel`; sin ciclos entre módulos. Automatiza la revisión manual del Acyclic Dependency Principle de ADR-01.
- **Ninguna referencia a reglas concretas:** solo `rules.strategy` puede referenciar clases que implementen ***IReglaJuego***. 0 violaciones en cada build.
- **Prueba de extensibilidad:** una estrategia de prueba (`ReglaPrueba`, solo en el código de test) con un `CodigoModalidad` nuevo recorre sala → partida → cierre → puntaje sin modificar ninguna clase de `main`.
- **Control del alcance del cambio en CI:** el pull request que agrega una modalidad solo puede modificar `rules/strategy`, las migraciones y los tests.
- **Consistencia datos–código al arrancar:** cada fila de `modalidad` tiene exactamente una estrategia registrada y viceversa; si no, el arranque falla.
- **Suite de contrato común:** toda implementación de ***IReglaJuego*** hereda las mismas pruebas (p. ej., `umbral` solo si `acumulativa`, coherente con el CHECK del esquema) además de sus unit tests al 100 % de combinaciones, como exige ADR-02.
- **Aislamiento entre modalidades:** dos partidas simultáneas, una Clásica y una Apuntado, no se contaminan en estado, historial ni puntajes (reemplaza el integration test de cambio de modalidad en la ronda 2 de ADR-02).
- **Testabilidad:** cobertura ≥ 95 % en `rules` y `scoring`, con la suite unitaria en < 30 s.
- **Benchmark de latencia:** validación + cálculo < 100 ms para una mano de 11 cartas (ADR-02) y notificación < 300 ms con 6 jugadores simulados.
- **Revisión de arquitectura en sustentación:** demostración de que agregar `ReglaFusion` toca únicamente `rules.strategy` y una migración.

**REFERENCIAS:**

- Richards, M. & Ford, N. (2025). *Fundamentals of Software Architecture* (2.ª ed.). O'Reilly. Cap. 11, 13, 14 y 19 (estilos y selección de estilo) y Cap. 21 (decisiones arquitectónicas).
- Gamma, E., Helm, R., Johnson, R. & Vlissides, J. (1994). *Design Patterns: Elements of Reusable Object-Oriented Software*. Addison-Wesley. Strategy Pattern.
- Martin, R. C. (2000). *Design Principles and Design Patterns*. SOLID Principles: Open/Closed.
- Ford, N., Parsons, R. & Kua, P. (2017). *Building Evolutionary Architectures*. O'Reilly. Fitness functions.
- Nygard, M. (2011). *Documenting Architecture Decisions*. https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions.
- ADR-01 (Particionamiento Vertical por Dominio) y ADR-02 (Strategy Pattern), Entregable 1.
- Entregable 2: Sección 1 (Tablas 1.1.1, 1.1.2, 1.2.1 y 1.3.1) y Sección 2 (Tabla 2.2.3).

**NOTAS:**

- **Autor / decisión aprobada por:** Equipo de Arquitectura del Proyecto (Valentina Luján Robledo, Alejandro Giraldo Quiceno, Jhofred Jahat Camacho Gomez, Laura Ladino Gallego, Luis José Mejía Restrepo).
- **Fecha de aprobación (interna del equipo):** 29/10/2026.
- **Revisores:** autoevaluado por el equipo de arquitectura; pendiente de revisión formal por el docente (Fernán Alonso Villa Garzón) en sustentación.
- **Estado de madurez:** Accepted (Aprobado como Línea Base Arquitectónica del Entregable 2). Conformidad pendiente de implementación y de verificación con las fitness functions de la sección de gobernanza.
- **Relación con otras decisiones:** desarrolla ADR-01 y refina ADR-02; enmienda su escenario de cambio de modalidad en tiempo de ejecución. Condiciona ADR-04 (la modalidad como dato) y ADR-05 (el orquestador solo conoce interfaces).
