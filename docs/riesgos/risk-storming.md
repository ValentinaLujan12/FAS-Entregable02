# Sección 4 - Análisis de riesgo arquitectónico y Risk Storming

Fuente: Entregable 2, Sección 4 (Richards & Ford, Cap. 22; taller P08). Versión editable de las tablas del documento.

## 4.1 Matriz de riesgo 3 x 3 (valoración inicial)

Puntaje = Impacto x Probabilidad: 1-2 bajo (verde), 3-4 medio (amarillo), 6-9 alto (rojo).

| Impacto \ Probabilidad | 1 (Low) | 2 (Med) | 3 (High) |
|---|---|---|---|
| **3 (High)** | Amarillo 3: R9, R10, R14 | Rojo 6: R1, R3, R4, R7, R15, R17 | Rojo 9: R5 |
| **2 (Med)** | Verde 2: R2 | Amarillo 4: R8, R11, R12, R16 | Rojo 6: R6 |
| **1 (Low)** | Verde 1: - | Verde 2: R13 | Amarillo 3: - |

## 4.2 Riesgos consolidados (Fase 2)

| # | Área / componente | Qué falla y qué efecto produce | I | P | Total | Clasificación y criterio |
|---|---|---|---|---|---|---|
| R1 | HandEvaluator / estrategias (rules) | La validación combinatoria da un falso positivo o negativo (cuarta + 2 ternas; 3 ternas + sobrante < 5; As alto/bajo) -> se cierra una ronda indebidamente o se penaliza de forma injusta. | 3 | 2 | Rojo 6 | Alto (Falla combinatoria; afecta el resultado de la partida) |
| R2 | HandEvaluator (rules) | La búsqueda de agrupaciones crece y supera el presupuesto de 100 ms -> el cierre se siente lento. | 2 | 1 | Verde 2 | Bajo (La mano está acotada a 11 cartas) |
| R3 | TurnOrchestrator + StateRepository | Dos jugadores cierran a la vez, o un cierre compite con el timeout -> dos cierres válidos o estado corrupto de la ronda. | 3 | 2 | Rojo 6 | Alto (Concurrencia real con 6 jugadores y temporizador) |
| R4 | RoundScoring + StateRepository (101) | Se persisten penalizaciones parciales o el acumulado no coincide con la suma de rondas -> eliminación injusta al llegar a 101. | 3 | 2 | Rojo 6 | Alto (Inconsistencia en la acumulación) |
| R5 | GatewayTiempoReal + StateRepository | El jugador refresca el navegador, pierde la conexión o el proceso se reinicia -> se pierde la partida en curso. | 3 | 3 | Rojo 9 | Alto (Casi seguro en uso real (móvil, Wi-Fi)) |
| R6 | TurnOrchestrator (mediador) | El orquestador acumula lógica de reglas y casos especiales -> se vuelve un "god object" y cada cambio es costoso y riesgoso. | 2 | 3 | Rojo 6 | Alto (Degradación estructural progresiva) |
| R7 | Cliente <-> GatewayTiempoReal | El cliente decide jugadas, duplica reglas o recibe información privada (manos o cartas robadas ajenas) -> trampa o divergencia de reglas. | 3 | 2 | Rojo 6 | Alto (Acoplamiento UI-motor y fuga de información) |
| R8 | GatewayTiempoReal | Un cliente lento o 6 conexiones simultáneas -> notificación de más de 300 ms o mesa bloqueada. | 2 | 2 | Amarillo 4 | Medio (Afecta Responsiveness, no el resultado) |
| R9 | RegistroReglas + tabla modalidad | Existe una fila de modalidad sin estrategia (o al revés) -> partida imposible de jugar. | 3 | 1 | Amarillo 3 | Medio (Error de despliegue poco frecuente) |
| R10 | Despliegue (1 quantum) | La caída del proceso detiene todas las partidas; no hay escalado horizontal. | 3 | 1 | Amarillo 3 | Medio (Alcance < 100 usuarios (ADR-01)) |
| R11 | TemporizadorTurno | Un jugador abandona su turno -> la partida queda bloqueada. | 2 | 2 | Amarillo 4 | Medio (Abandono de turno) |
| R12 | Contrato IReglaJuego | Un cambio del contrato obliga a modificar todas las estrategias a la vez. | 2 | 2 | Amarillo 4 | Medio (Riesgo de evolución (ADR-02)) |
| R13 | turno_jugada (persistence) | La tabla crece sin límite -> las consultas de historial se vuelven lentas. | 1 | 2 | Verde 2 | Bajo (Volumen bajo a esta escala) |
| R14 | DeckManagement (barajado) | La semilla del barajado es predecible o llega al cliente -> un jugador anticipa el orden del mazo (trampa). | 3 | 1 | Amarillo 3 | Medio (Equidad del juego; exige un ataque deliberado) |
| R15 | GatewayTiempoReal (identidad) | Un cliente envía comandos a nombre de otro jugador (suplantación) -> roba, descarta o cierra la ronda de otro. | 3 | 2 | Rojo 6 | Alto (Driver Security; el WebSocket es la única puerta de entrada) |
| R16 | persistence (migraciones) | Un despliegue cambia el esquema con partidas en curso -> partidas que no se pueden recuperar o datos inconsistentes. | 2 | 2 | Amarillo 4 | Medio (Cada modalidad nueva exige una migración (ADR-03)) |
| R17 | BuscadorCombinaciones (evaluador compartido) | Un cambio en el evaluador compartido para soportar una variante nueva altera el resultado de Clásica o Apuntado -> regresión en las reglas vigentes. | 3 | 2 | Rojo 6 | Alto (Efecto colateral de la extensibilidad) |

## 4.3 Plan de mitigación (zona roja)

| Riesgo | Mecanismo arquitectónico | Dónde queda | Verificación | Residual |
|---|---|---|---|---|
| R1 (6) | Evaluador puro y determinista tras `IValidadorCierre`; búsqueda exhaustiva de agrupaciones (`BuscadorCombinaciones`); validación solo en el servidor | 1.2, ADR-02, ADR-03 | FF-10, FF-12, FF-16, FF-31 | Amarillo 3 |
| R3 (6) | Serialización por partida + transacción ACID con `SELECT ... FOR UPDATE`, compare-and-set, `ux_cierre_valido`, `trg_turno_ronda_abierta` | 2.4, ADR-04, ADR-05 | FF-17, FF-18, FF-25 | Amarillo 3 |
| R4 (6) | Liquidación pura en scoring; cierre, puntajes, eliminaciones y fin de partida en la misma transacción; acumulado inmutable | 2.2.3, 2.4, ADR-04 | FF-19, FF-20 | Amarillo 3 |
| R5 (9) | Servidor autoritativo con estado persistido por comando; persistir y luego notificar; `recuperar()` y resincronización; cierre idempotente | 2.4, ADR-04, ADR-05 | FF-21, FF-23, FF-24 | Amarillo 3 |
| R6 (6) | Mediador como coordinador puro; dependencias solo por interfaces; reglas de dependencia, distancia a la secuencia principal y CC automatizadas en CI | 1.2, ADR-05, Sección 5 | FF-04, FF-05, FF-10, FF-30 | Verde 2 |
| R15 (6) | Identidad ligada a la conexión: el gateway fija el JugadorId de cada comando a partir de la sesión autenticada; el orquestador rechaza comandos fuera de turno | infra (GatewayTiempoReal) | FF-29 | Amarillo 3 |
| R17 (6) | Evaluador compartido cerrado a modificación: solo primitivas genéricas; lo propio de cada variante en su subpaquete; cambiar una primitiva exige ADR; suite de contrato de todas las modalidades en cada build | rules.strategy, ADR-03 | FF-09, FF-10, FF-12, FF-15 | Amarillo 3 |
| R7 (6) | Servidor autoritativo (`cerrarRonda` no recibe la mano) + `ProyectorVistaJugador` en infra (la carta robada del mazo solo la ve quien roba) | Nuevo componente en infra | FF-28, G1 | Amarillo 3 |

Riesgos medios aceptados con un mecanismo existente:

- **R8:** búfer por conexión (ADR-05); en producción, monitor del p99 y del máximo de la notificación (FF-32).
- **R9:** FF-13.
- **R10:** recuperación desde la base de datos y, si se agregan instancias, enrutamiento por partida (2.4).
- **R11:** el timeout entra a la cola de comandos y produce un `DESCARTE_AUTO`.
- **R12:** segregación de interfaces y suite de contrato (FF-12).
- **R14:** semilla con `SecureRandom`, solo en el servidor.
- **R16:** migraciones versionadas y solo aditivas.

Riesgos bajos aceptados: R2 (vigilado por FF-16: p99 y peor caso < 100 ms) y R13 (retención o particionado previstos en ADR-04).
