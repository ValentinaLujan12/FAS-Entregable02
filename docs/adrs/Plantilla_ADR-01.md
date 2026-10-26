# ADR-01: PARTICIONAMIENTO VERTICAL POR DOMINIO

**TÍTULO:** ADR-01: Adoptar Particionamiento Vertical por Dominio (vs. Capas Técnicas o Microservicios)

**ESTADO:** Accepted

**CONTEXTO:**

Existe la posible necesidad futura de incorporar nuevas variantes regionales, comodines y reglas dinámicas sin tener que reescribir el núcleo de la aplicación. La arquitectura del sistema puede organizarse siguiendo tres estrategias de particionamiento superior:

- **Opción A (Capas Técnicas):** Presentación → Lógica → Persistencia. Acoplamiento horizontal; cualquier cambio de regla requiere modificación en todas las capas. Cambio de modalidad (Clásica a Apuntado) impacta UI, motor de validación, y esquema de datos simultáneamente.
- **Opción B (Particionamiento Vertical por Dominio):** Separación por áreas de negocio: GameDomain (orquestación), RulesDomain (evaluación de combinaciones), ScoringDomain (puntuación), PersistenceDomain (acceso a datos), InfraDomain (timers, comunicación). Cambios de regla quedan contenidos en 1-2 dominios.
- **Opción C (Microservicios):** Cada dominio como servicio independiente con su propia base de datos. Escalabilidad horizontal, pero requiere orquestación distribuida, eventual consistency, y complejidad operacional.

Para este proyecto, la presión arquitectónica es la extensibilidad: nuevas modalidades, comodines, apuestas dinámicas deben añadirse sin reescribir el núcleo. Opción A (capas) es frágil ante evolución. Opción C es overkill para <100 usuarios simultáneos y ámbito académico.

**DECISIÓN:**

Se adopta el Particionamiento Vertical por Dominio (Opción B) como un Monolito Modular, porque es la única de las tres opciones que satisface simultáneamente el driver de Extensibility (aislando el impacto de un cambio de regla) sin incurrir en el costo operacional de la Opción C, ni el acoplamiento horizontal de la Opción A que el propio reto arquitectónico del caso de estudio advierte como riesgo de "romper el flujo del juego" (enfoque TOGAF, Domain Partitioning). La arquitectura se organiza en cinco dominios independientes en responsabilidad:

- **GameDomain:** Orquestación de flujo de partidas, secuenciación de turnos, distribución de cartas iniciales.
- **RulesDomain:** Evaluación de combinaciones (escaleras, tríos), validación de victoria según modalidad, implementación de *IReglaJuego*.
- **ScoringDomain:** Cálculo de penalizaciones de cartas sueltas, evaluación del umbral de 101 puntos, liquidación de rondas.
- **PersistenceDomain:** Acceso a datos, transacciones ACID, historial de rondas, persistencia de estado de partida.
- **InfraDomain:** Gestión de timers por turno, comunicación en tiempo real (WebSockets), sincronización de estado.

Cada dominio expone interfaces claramente definidas hacia otros dominios, minimizando dependencias bidireccionales.

**ALTERNATIVAS RECHAZADAS:**

**Opción A (Capas Técnicas):**
- Cambios de regla requieren toque sincronizado en Presentación (UI), Lógica (motor) y Persistencia (esquema).
- Acoplamiento horizontal dificulta el testing aislado de la lógica de evaluación de manos.
- **Alto riesgo de regresión:** una modificación en la capa de lógica impacta inesperadamente la capa de presentación.
- Viola Separation of Concerns; la capa de Lógica se convierte en "basurero" de responsabilidades heterogéneas.

**Opción C (Microservicios):**
- **Complejidad operacional innecesaria:** orquestación de servicios, circuit breakers, distributed tracing, message queues.
- Sobre-ingeniería para escala académica (<100 conexiones simultáneas esperadas).
- Eventual consistency introduce ambigüedad en reglas de negocio (¿cuál es la fuente de verdad del puntaje global?).
- Distrae del aprendizaje de una arquitectura monolítica limpia con problemáticas distribuidas fuera de alcance.

**CONSECUENCIAS:**

**Positivas:**
- Cambios de reglas localizados a 1-2 dominios; reducción del blast radius (impacto de cambio) de O(5) a O(1-2).
- **Los equipos pueden trabajar en paralelo sin conflicto:** GameDomain y RulesDomain pueden desarrollarse simultáneamente.
- **Testabilidad mejorada:** RulesDomain puede probarse sin dependencia de base de datos ni componentes de UI.
- **Potencial de migración futura a microservicios:** los límites de dominio ya están claros.
- Responsabilidades claramente definidas; la arquitectura evita el Entity Trap (managers genéricos que acumulan lógica).

**Negativas:**
- Requiere disciplina rigurosa en mantener límites; sin code reviews severos pueden introducirse dependencias cíclicas (GameDomain → ScoringDomain → GameDomain).
- Mayor número de archivos y puntos de integración; requiere documentación explícita de contratos entre dominios.
- **Overhead inicial de diseño:** requiere anticipar los límites correctos antes de codificar.

**CUMPLIMIENTO (COMPLIANCE):**

- Code reviews obligatorios para PRs que cruzan límites de dominio; verificación manual del Acyclic Dependency Principle.
- Linting rules en SonarQube para detectar dependencias cíclicas; configuración de Maven/Gradle para aislar el classpath por dominio.
- Cobertura de pruebas mínima del 80% por dominio, verificable en el pipeline CI/CD.
- Documentación de interfaces entre dominios en formato OpenAPI/AsyncAPI para contratos claros.
- **Revisión de arquitectura en sustentación:** demostración de que un cambio de modalidad requiere tocar únicamente RulesDomain.

**REFERENCIAS:**

- Richards, M. & Ford, N. (2025). *Fundamentals of Software Architecture* (2.ª ed.). O'Reilly. Cap. 9, "Modularity Patterns & Deployment Topologies".
- TOGAF v9.2. The Open Group Architecture Framework. "Domain Partitioning & Architecture Patterns".
- Martin, R. C. (2017). *Clean Architecture: A Craftsman's Guide to Software Structure and Design*. Prentice Hall. Cap. 17, "Crossing Boundaries".
- Acyclic Dependency Principle. https://en.wikipedia.org/wiki/Acyclic_dependencies_principle.
- Fowler, M. (2015). Microservices. https://martinfowler.com/articles/microservices.html. ("When NOT to use Microservices").

**NOTAS:**

- **Autor / decisión aprobada por:** Equipo de Arquitectura del Proyecto (Valentina Luján Robledo, Alejandro Giraldo Quiceno, Jhofred Jahat Camacho Gomez, Laura Ladino Gallego, Luis José Mejía Restrepo).
- **Fecha de aprobación (interna del equipo):** 29 de septiembre de 2026.
- **Revisores:** autoevaluado por el equipo de arquitectura; pendiente de revisión formal por el docente (Fernán Alonso Villa Garzón) en sustentación.
- **Estado de madurez:** Accepted (Aprobado como Línea Base Arquitectónica).
- **Validación previa:** la decisión de particionamiento fue discutida en el Taller Presencial 01 como respuesta a la encapsulación de variabilidad (Pregunta de Brooks).
