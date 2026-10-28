# ADR-05: COMUNICACIÓN SÍNCRONA EN MEMORIA CON MEDIADOR Y NOTIFICACIÓN POSTERIOR AL COMMIT

**TÍTULO:** ADR-05: Adoptar Comunicación Síncrona en Memoria mediante Interfaces y Mediador, con Notificación Posterior al COMMIT (vs. Bus de Eventos Local o Broker Externo)

**ESTADO:** Accepted

**CONTEXTO:**

Cada jugada (robo, descarte, cambio de turno, cierre) modifica el estado de la partida y debe notificarse a los 6 clientes. ADR-01 separó el sistema en dominios con "interfaces claramente definidas" y advirtió el riesgo de ciclos (GameDomain → ScoringDomain → GameDomain). El Entregable 2 exige justificar cómo se comunican los componentes y cómo se notifican el descarte de cartas y los cambios de turno, eligiendo entre llamadas síncronas en memoria con interfaces y eventos locales desacoplados.

**Fuerzas en juego:**

- **Orden estricto por partida:** robar → descartar → cambio de turno → eventual cierre. Un desorden produce estados inválidos.
- **Un único escritor de estado:** el `TurnOrchestratorComponent` (Sección 1.2).
- **Notificar solo estado confirmado:** los clientes no deben ver estados que luego se revierten (ADR-04). Por eso la notificación va después del `COMMIT`.
- **Responsiveness:** notificación < 300 ms con 6 jugadores y validación < 100 ms (ADR-02).
- **Testability:** el flujo completo debe poder probarse en memoria, de forma determinista.
- **Un solo consumidor hoy:** el gateway de tiempo real (WebSockets, InfraDomain) es el único destinatario de las notificaciones.

**DECISIÓN:**

Se adopta comunicación **síncrona en memoria por interfaces, con el orquestador como mediador**, y notificación a través de un único puerto de salida, emitida solo después del `COMMIT`. Se elige porque garantiza el orden y la semántica "persistir y luego notificar" con la menor complejidad que cumple los drivers:

1. **Comandos.** Cada partida tiene una cola de entrada: el orquestador procesa un comando a la vez. Dentro de cada comando, las llamadas a ***IMazo***, ***IJugadores***, ***IValidadorCierre***, ***IServicioPuntaje*** e ***IRepositorioPartida*** son **síncronas, en memoria y por interfaz**. Ningún módulo de negocio llama a otro: todo pasa por el mediador.
2. **Notificaciones.** Durante el procesamiento el orquestador construye el `EventoJuego` (snapshot inmutable del Shared Kernel) del descarte, del cambio de turno o del resultado del cierre. Lo persiste dentro de la transacción (`registrarEvento`) y, **solo después del `COMMIT`**, lo entrega por ***ICanalTiempoReal***`.difundir(evento)`. No hay un bus de eventos con suscriptores en esta fase.
3. **Temporizador.** ***ITemporizadorTurno*** invoca ***IComandosJuego***`.alExpirarTurno`, que entra a la misma cola que cualquier otro comando.
4. **Aislamiento de fallos.** Si `difundir` falla, el estado ya confirmado no se revierte; el cliente se resincroniza al reconectar con el estado persistido. `difundir` no bloquea la cola de la partida: encola en el búfer de cada conexión, dentro de `infra`.
5. **Contrato hacia los clientes.** Los eventos que viajan por WebSocket se documentan en AsyncAPI, como ya exige el cumplimiento de ADR-01.

**Condición de revisión:** si aparece más de un consumidor de eventos (p. ej., jugadores controlados por IA, estadísticas o auditoría en vivo), se introduce un publicador local síncrono posterior al `COMMIT`, detrás del mismo puerto, de modo que el orquestador no vuelva a cambiar.

**ALTERNATIVAS RECHAZADAS:**

**Opción B (Bus de eventos local síncrono, tipo publicar/suscribir):**
- El orden depende del orden de los suscriptores, y el flujo de control se vuelve implícito: difícil de seguir y de depurar.
- Facilita ciclos ocultos: un suscriptor que llama de vuelta a `game` reproduce el ciclo que ADR-01 quiso evitar.
- La garantía "después del `COMMIT`" habría que forzarla con mecanismos adicionales.
- Con un solo consumidor, añade indirección sin beneficio.

**Opción C (Bus local asíncrono: colas o hilos por suscriptor):**
- Hay que reconstruir el orden por partida que la cola del orquestador ya garantiza.
- Introduce carreras, reintentos y contrapresión, y las pruebas dejan de ser deterministas.
- Un descarte podría notificarse antes o después que el cambio de turno, y el cliente vería un estado inconsistente.

**Opción D (Broker externo: Kafka, RabbitMQ):**
- Contradice el 1 quantum y el rechazo de la complejidad operacional por escala (< 100 usuarios simultáneos) de ADR-01.
- Añade infraestructura y consistencia eventual para un problema de un solo proceso.

**CONSECUENCIAS:**

**Positivas:**
- **Orden determinista** y semántica clara "persistir y luego notificar": ningún cliente ve un estado que se revierta.
- **Menor latencia:** sin colas intermedias entre componentes.
- **Pruebas en memoria:** el flujo completo se prueba con dobles de ***ICanalTiempoReal*** e ***IRepositorioPartida*** que registran el orden de las llamadas.
- **Flujo trazable:** una pila de llamadas explica qué ocurrió, lo que facilita el análisis de disputas.
- **Un solo punto de extensión** para notificaciones (***ICanalTiempoReal***), con una ruta de evolución definida.

**Negativas:**
- **El orquestador conoce todos los pasos del flujo:** riesgo de concentrar complejidad. Se mitiga manteniéndolo como coordinador puro, con la lógica en `rules` y `scoring`.
- **Agregar un consumidor nuevo** obliga a tocar el orquestador o a introducir el publicador (condición de revisión).
- **Latencia acoplada:** el tiempo de un comando incluye el de la persistencia.
- **Un cliente lento** podría bloquear la partida; se mitiga con el búfer por conexión.
- **Notificación perdida:** el cliente queda desactualizado hasta que reconecte y se resincronice.

**CUMPLIMIENTO (COMPLIANCE):**

- **Sin dependencias directas entre módulos de negocio (ArchUnit):** `deck`, `player`, `rules`, `scoring` y `persistence` no dependen de `game` ni entre sí, salvo `scoring` → `rules` (Sección 1.2). 0 violaciones.
- **`game` depende solo de interfaces:** no referencia clases concretas de los demás módulos.
- **Sin bus de eventos ni mensajería en módulos de negocio (ArchUnit):** ninguna dependencia a paquetes como `org.springframework.context.event`, `com.google.common.eventbus`, `org.apache.kafka` o `com.rabbitmq`.
- **Orden de notificación (prueba con dobles):** `difundir` se invoca solo después de que ***IRepositorioPartida*** confirmó, y los eventos salen en el orden en que se procesaron los comandos.
- **Aislamiento de fallos:** si `difundir` lanza una excepción, el comando termina correctamente y el estado queda confirmado.
- **Serialización por partida:** comandos concurrentes de una misma partida nunca se procesan en paralelo (sonda de concurrencia), mientras que partidas distintas sí corren en paralelo.
- **Latencia de notificación:** un descarte llega a los 6 clientes simulados en < 300 ms (prueba de carga).
- **Contrato de eventos:** el esquema AsyncAPI de los eventos hacia el cliente se valida en CI.

**REFERENCIAS:**

- Gamma, E., Helm, R., Johnson, R. & Vlissides, J. (1994). *Design Patterns: Elements of Reusable Object-Oriented Software*. Addison-Wesley. Mediator y Observer.
- Richards, M. & Ford, N. (2025). *Fundamentals of Software Architecture* (2.ª ed.). O'Reilly. Cap. 11 (Monolito Modular) y Cap. 21 (decisiones arquitectónicas).
- Martin, R. C. (2000). *Design Principles and Design Patterns*. SOLID Principles: Dependency Inversion.
- Ford, N., Parsons, R. & Kua, P. (2017). *Building Evolutionary Architectures*. O'Reilly. Fitness functions.
- ADR-01 (Particionamiento Vertical por Dominio), ADR-02 (Strategy), ADR-03 y ADR-04.
- Entregable 2: Sección 1.2 (mecanismo de comunicación: Mediador), Tabla 1.3.1 (interfaces y puertos) y Sección 2.4 (Tabla 2.4.1).

**NOTAS:**

- **Autor / decisión aprobada por:** Equipo de Arquitectura del Proyecto (Valentina Luján Robledo, Alejandro Giraldo Quiceno, Jhofred Jahat Camacho Gomez, Laura Ladino Gallego, Luis José Mejía Restrepo).
- **Fecha de aprobación (interna del equipo):** 29/10/2026.
- **Revisores:** autoevaluado por el equipo de arquitectura; pendiente de revisión formal por el docente (Fernán Alonso Villa Garzón) en sustentación.
- **Estado de madurez:** Accepted (Aprobado como Línea Base Arquitectónica del Entregable 2). Conformidad pendiente de implementación y de verificación con las fitness functions de la sección de gobernanza.
- **Relación con otras decisiones:** se apoya en ADR-03 (el orquestador solo conoce interfaces) y en ADR-04 (la notificación se emite tras el `COMMIT`); concreta el aislamiento por dominios de ADR-01.
