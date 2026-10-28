# ADR-02: STRATEGY PATTERN PARA VARIABILIDAD DE REGLAS DE VICTORIA

**TÍTULO:** ADR-02: Implementar Strategy Pattern para Variabilidad de Reglas de Victoria

**ESTADO:** Accepted - Enmendado parcialmente por ADR-03 (29/10/2026): la modalidad se fija al crear la partida y es inmutable durante ella; el escenario de cambio de modalidad en tiempo de ejecución (p. ej., de Clásica a Apuntado en la ronda 2) deja de ser requisito. El resto de la decisión (Strategy con ***IReglaJuego***) sigue vigente.

**CONTEXTO:**

El juego soporta dos modalidades con reglas de victoria fundamentalmente distintas:

**Modalidad Clásica (4-3-3):**
- **Condición de victoria:** el jugador completa 1 Cuarta + 2 Ternas + 1 Carta de Descarte.
- **Validación:** reconocer escaleras (4 cartas del mismo palo en secuencia) y tríos (3 cartas del mismo valor).
- **Resultado:** victoria inmediata; la ronda finaliza y comienza la siguiente.

**Modalidad Apuntado (101 puntos):**
- **Condición de victoria:** el jugador completa 3 Ternas + cartas sobrantes con valor numérico estrictamente menor a 5 puntos.
- **Validación:** reconocer tríos, contar valor residual (A = 1 pto, 2-9 = valor nominal, J/Q/K = 10 ptos).
- **Resultado:** cierre de ronda (no victoria inmediata); los puntos de los perdedores se acumulan en el histórico; el jugador que alcanza o supera 101 puntos queda eliminado; gana el último en pie.

La lógica de validación es incompatible: una escalera (4 cartas ordenadas por palo) no es válida en Apuntado. El conteo de puntos residuales no aplica en Clásica. Mezclar ambas lógicas en el motor principal (mediante if-statements o flags) genera complejidad exponencial y riesgo de regresión. A futuro existe posibilidad de nuevas reglas y modos de juego o modificaciones.

**Problema operacional:** Si nueva modalidad se añade mediante if-statements, el MotorReglas debe cambiar. Modificación en rama nueva puede romper rama vieja inadvertidamente. ADR-01 ya aisló esta variabilidad estructuralmente en RulesDomain, pero aún se necesita una estrategia de código dentro de ese dominio.

**DECISIÓN:**

Dentro del Monolito Modular definido en ADR-01 (específicamente dentro de RulesDomain), se implementa el Strategy Pattern mediante la interfaz ***IReglaJuego***, en lugar de condicionales (Opción A) o una arquitectura de Microkernel/Plug-in (Opción C), porque es la única alternativa que permite agregar una modalidad nueva como una clase adicional, sin tocar MotorReglas ni las modalidades vigentes, sin el costo operacional de un sistema de plugins que esta escala académica no necesita. Cada modalidad implementa el contrato completo; MotorReglas es agnóstico a los detalles de cada una.

**Estructura:**



**ALTERNATIVAS RECHAZADAS:**

**Opción A (if-statements / flags / hardcoding):**
- **Viola el Single Responsibility Principle:** MotorReglas contendría lógica de dos dominios de reglas incompatibles.
- La complejidad de código crece exponencialmente; una tercera modalidad requiere refactorizar la rama if-else existente.
- **Testabilidad degradada:** es difícil probar en aislamiento una rama específica sin ejecutar las demás.
- Alto acoplamiento entre lógicas incompatibles; un bug en la rama Clásica puede afectar inadvertidamente la rama Apuntado.

**Opción C (Microkernel / Plugin Architecture):**
- **Sobre-ingeniería:** no se requiere pluginabilidad dinámica en runtime; las modalidades se conocen en tiempo de compilación.
- Complejidad de ClassLoader / carga dinámica innecesaria; aumenta la curva de aprendizaje.
- Dificultaría el testing reproducible y determinista; la carga dinámica puede introducir mutación de estado entre pruebas.
- Overhead operacional (loading, unloading, restarting de plugins) innecesario para escala académica.

**CONSECUENCIAS:**

**Positivas:**
- **Extensibilidad comprobada:** una nueva modalidad (p. ej. "Fusión") requiere solo 1 clase nueva ReglaFusion implements ***IReglaJuego***. Métrica: ≤ 2-3 horas de implementación, ≤ 1-2 clases nuevas.
- La estrategia se selecciona en tiempo de ejecución, por partida: varias partidas de modalidades distintas conviven en el mismo proceso, y la modalidad permanece fija dentro de cada partida (ADR-03).
- **Cada estrategia tiene ciclo de vida independiente:** ReglaClasicaCuartaTerna puede probarse, depurarse y mejorarse sin tocar ReglaApuntado101Puntos.
- **Código predecible y auto-documentado:** la interfaz ***IReglaJuego*** es un contrato explícito y los implementadores no pueden olvidar métodos críticos.
- **Facilita el debugging de disputas:** si Clásica falla, Apuntado no se ve afectado (aislamiento de fallos).

**Negativas:**
- **Overhead de polimorfismo virtual:** invocación de método virtual de ~5-10 nanosegundos vs. 0 ns con hardcoding; imperceptible frente al presupuesto de validación de 100 ms (Sección 3.2).
- Más archivos (una implementación + su suite de pruebas por modalidad), aunque la estructura resultante es más organizada.
- Requiere coordinación entre el equipo si la interfaz ***IReglaJuego*** cambia; un nuevo método en el contrato obliga a actualizar todas las implementaciones.
- **Falsa sensación de simplicidad:** si la lógica de una modalidad crece mucho, su clase puede volverse grande; el patrón mitiga pero no elimina la complejidad inherente.

**CUMPLIMIENTO (COMPLIANCE):**

- **Unit tests al 100% para cada implementación de ***IReglaJuego***:** la suite de ***ReglaClasicaCuartaTerna*** valida todas las combinaciones de cuarta y ternas, el descarte y edge cases (cartas no ordenadas, valores repetidos); la de ***ReglaApuntado101Puntos*** valida ternas válidas, residual < 5, residual ≥ 5 y acumulación histórica.
- **Integration test de aislamiento entre modalidades:** dos partidas simultáneas, una Clásica y una Apuntado, sin contaminación de estado, historial ni puntajes (ADR-03).
- **Benchmark de latencia total (validación + cálculo):** resultado esperado < 100 ms para una mano de 11 cartas.
- **Código auditado sin Entity Trap:** cada implementación de ***IReglaJuego*** es cohesiva; no existe una clase "***UtilRegla***" que acumule lógica genérica.

**REFERENCIAS:**

- Gang of Four (1994). *Design Patterns: Elements of Reusable Object-Oriented Software*. Addison-Wesley. Strategy Pattern.
- Richards, M. & Ford, N. (2025). *Fundamentals of Software Architecture* (2.ª ed.). O'Reilly. Cap. 13, "Event-Driven & Microkernel Architecture".
- Martin, R. C. (2000). *Design Principles and Design Patterns*. www.objectmentor.com. SOLID Principles: Single Responsibility, Open/Closed.
- Fowler, M. (2018). *Refactoring: Improving the Design of Existing Code* (2.ª ed.). Addison-Wesley. "Replace Conditional with Polymorphism".
- Freeman, S. & Pryce, N. (2009). *Growing Object-Oriented Software, Guided by Tests*. Addison-Wesley. Strategy pattern with TDD.

**NOTAS:**

- **Autor / decisión aprobada por:** Equipo de Arquitectura del Proyecto (Valentina Luján Robledo, Alejandro Giraldo Quiceno, Jhofred Jahat Camacho Gomez, Laura Ladino Gallego, Luis José Mejía Restrepo).
- **Fecha de aprobación (interna del equipo):** 29 de septiembre de 2026.
- **Revisores:** autoevaluado por el equipo de arquitectura; pendiente de revisión formal por el docente (Fernán Alonso Villa Garzón) en sustentación.
- **Estado de madurez:** Accepted (Aprobado como Línea Base Arquitectónica). Enmendado parcialmente por ADR-03 (Entregable 2) en lo relativo al cambio de modalidad en tiempo de ejecución.
- **Validación previa:** este patrón fue acordado en el Taller Presencial 01 como respuesta a la Pregunta de Brooks sobre extensibilidad del motor de reglas ("¿Cuántas partes hay que reescribir si agregamos un Joker?"); la respuesta esperada: "sólo el módulo de reglas", lleva a este patrón estratégico.
