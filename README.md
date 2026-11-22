# El Apuntado

Juego de cartas en linea para 2 a 6 jugadores, con salas por codigo, bots y dos modalidades (Clasica 4-3-3 y Apuntado a 101). Proyecto de la asignatura Arquitectura de Software (Entregable 3).

- **Cliente:** TypeScript sin framework, empaquetado con esbuild en `public/app.js`.
- **Servidor:** una funcion de Vercel (`api/index.ts`) que ejecuta el motor de juego en cada peticion.
- **Datos:** Supabase (PostgreSQL + Realtime). Guarda salas, buzones de mensajes, presencia, cuentas anonimas de skins y eventos de auditoria.
- **Decisiones de arquitectura:** `docs/adr/` (ADR-01 a ADR-14, numeracion del Entregable 2 adaptado).
- **Publicar:** sigue `GUIA_DESPLIEGUE.md` (GitHub, Supabase y Vercel, paso a paso).

## Probar en tu equipo

Requiere Node 22.

```bash
npm ci
npm run verify       # todas las puertas de gobernanza (tipos, dependencias, complejidad, métricas, pruebas y cobertura)
npm run build
npm run dev          # http://localhost:3000
```

Sin variables de Supabase usa un almacen en memoria (se borra al cerrar). Para jugar con varios a la vez en local, abre otra pestana en modo incognito y unete con el codigo de la sala.

## Como funciona sin un servidor encendido

Vercel no mantiene procesos ni WebSocket abiertos, asi que cada peticion hace todo el ciclo:

1. Lee la sala de la base de datos (con numero de version).
2. Reconstruye el motor de juego exactamente como quedo.
3. Aplica la presencia: quien no da senales en 30 s queda desconectado.
4. Aplica el mensaje del jugador (robar, descartar, cerrar...).
5. Pone el reloj al dia: vencen los turnos y juegan los bots, con un reloj virtual que conserva sus pausas.
6. Guarda la sala y los mensajes de cada jugador en una sola operacion atomica (`guardar_sala_atomica`), con control de version optimista: si otra peticion gano, se repite (ADR-07).

El navegador consulta cada 1,5 s; si Supabase Realtime esta activo, recibe un aviso al instante y consulta cada 9 s (ADR-12). Cada mensaje trae su hora, asi que las animaciones se ven al ritmo correcto.

## Seguridad y privacidad

- **Entrada con usuario y contrasena** comunes que define quien administra el sitio. Solo el hash (PBKDF2-SHA256, 600 000 iteraciones) vive en una variable de entorno de Vercel; nunca en GitHub. Se genera con `herramientas/generar-acceso.html`, que funciona sin internet (ADR-10).
- La sesion es una cookie firmada, `HttpOnly`, `Secure` y `SameSite=Strict`, de 7 dias. Las peticiones POST exigen el mismo origen. Hay limite de intentos de acceso y de creacion de salas.
- **IPs ocultas:** los jugadores solo hablan con el servidor, nunca entre ellos. No se guarda ninguna IP; los limites usan un identificador anonimo que cambia cada dia.
- **Servidor autoritativo:** el cliente solo envia intenciones; cada jugador recibe unicamente su mano. Las claves secretas de Supabase solo existen en el servidor y las tablas tienen RLS activado sin politicas publicas.
- Cabeceras estrictas (CSP, HSTS, `X-Frame-Options`, `nosniff`) en `vercel.json`.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor local con el mismo código que corre en Vercel |
| `npm run build` | Empaqueta el cliente en `public/app.js` |
| `npm test` | Todas las pruebas (vitest): reglas, partida, servicio, servidor, esquema SQL y funciones de idoneidad |
| `npm run test:cov` | Pruebas con cobertura y umbrales (rules y scoring >= 95 % en líneas) |
| `npm run typecheck` | TypeScript estricto |
| `npm run deps` | dependency-cruiser: 15 reglas de capas, ciclos, brokers e interfaz aislada (FF-01 a FF-09, FF-27) |
| `npm run deps:sondas` | Comprueba que cada regla de dependencias detecta una violación inyectada |
| `npm run cc` | Complejidad ciclomática del núcleo (CC <= 10; CC <= 4 en `src/rules`), bloqueante (FF-10) |
| `npm run cc:ui` | Complejidad de la interfaz web y los extras (informativo) |
| `npm run aserciones` | Toda prueba tiene aserciones (FF-31) |
| `npm run metricas` | Ca, Ce, I, A y distancia D por módulo (FF-30) |
| `npm run latencia` | Latencia de validación de una mano de 11 cartas, p99 y peor caso (FF-16) |
| `npm run verify` | Todas las puertas bloqueantes de gobernanza (lo mismo que el pipeline de CI) |
| `npm run gobernanza:reporte` | Ejecuta todas las funciones de idoneidad y escribe `docs/gobernanza/REPORTE.md` |
| `npm run auditoria:reglas -- 20000` | Compara el validador de cierres con un oráculo independiente escrito desde las reglas (manos aleatorias) |
| `npm run simular:bots` | Juega partidas completas solo con bots (2, 4 y 6 jugadores) para detectar bloqueos y medir duración |
| `npm run test:e2e` | Protocolo HTTP real: acceso, salas compartidas, privacidad, bots, presencia, reconexión y revancha |
| `npm run test:ui` | Interfaz real en Chromium contra bots (requiere Chromium) |
| `npm run capturas` | Regenera `docs/mockups/*.png` (requiere Chromium) |
| `npm run assets:generate` | Regenera el arte vectorial y las fuentes de `public/` |
| `npm run bpmn:all` | Genera, valida y construye el simulador BPMN |
| `npm run bpmn:render` | Renderiza los BPMN a SVG y PNG (requiere Chromium) |
| `npm run uml:render` | Renderiza `docs/uml/*.puml` a SVG y PNG (requiere Java, Graphviz y `PLANTUML_JAR`) |

## Gobernanza arquitectónica (funciones de idoneidad)

El pipeline `.github/workflows/fitness-functions.yml` ejecuta en cada push y pull request las funciones de idoneidad del Entregable 2 adaptado (Anexo E.1), todas bloqueantes salvo la complejidad de la interfaz web y los extras (ADR-14):

| Regla | Qué se verifica | Dónde |
|---|---|---|
| G1 | Solo `persistence` usa el cliente de base de datos; la interfaz web no alcanza el servidor ni el almacenamiento; privacidad de la mano; identidad por sesión | `.dependency-cruiser.cjs`, `tests/idoneidad-servidor.test.ts` |
| G2 | Reglas, mazo, jugadores, puntuación y persistencia no dependen del orquestador; estrategias aisladas; solo el registro las conoce | `.dependency-cruiser.cjs` |
| G3 | CC <= 10 en el núcleo y CC <= 4 en `src/rules` | `eslint.config.js` |
| G4 | Capas dirigidas, sin ciclos (archivos y módulos), D <= 0,5 | `.dependency-cruiser.cjs`, `tools/metricas-modulos.mjs` |
| G5 | Sin buses de eventos ni brokers en el dominio; persistir y luego notificar; serialización por sala; contratos AsyncAPI/OpenAPI | `.dependency-cruiser.cjs`, `tests/idoneidad-servidor.test.ts`, `tests/contratos.test.ts` |
| G6 | Una modalidad nueva se agrega sin tocar el núcleo; suite contractual común; aislamiento entre partidas | `tests/idoneidad-reglas.test.ts`, `tests/registro.test.ts` |
| G7 | Cobertura >= 95 % en rules y scoring; aserciones reales; latencia < 100 ms | `vitest.config.ts`, `tools/verificar-aserciones.mjs`, `tools/medir-latencia.ts` |
| G8 | Un solo cierre por ronda; escritura atómica; recuperación tras caída; acumulado coherente | `tests/esquema.test.ts`, `tests/idoneidad-servidor.test.ts`, `tests/idoneidad-reglas.test.ts` |

El último reporte está en `docs/gobernanza/REPORTE.md` (con las métricas en `metricas-modulos.json` y `latencia.json`).

## Controles

| Accion | Raton | Teclado |
|---|---|---|
| Robar | clic en mazo o pozo, o arrastrar el mazo o la carta del pozo hasta la mano | `M` mazo, `P` pozo |
| Reordenar la mano | arrastrar una carta; una guia marca donde caera | - |
| Seleccionar | clic, `Mayus/Ctrl` + clic o recuadro sobre varias cartas | `Izq` `Der` mueven el cursor, `Arriba` selecciona, `Abajo` quita, `Espacio` alterna |
| Descartar | boton flotante Descartar o arrastrar la carta al centro de la mesa | `D`, o mantener `Espacio` 3 s |
| Agrupar | boton flotante Agrupar (3 o mas cartas) | `G` |
| Ordenar mano | Orden / Pinta | `O` |
| Cerrar ronda | mantener pulsado "Cerrar ronda" 2 s | mantener `C` 2 s |
| Limpiar seleccion | clic en el fondo | `Esc` |

## Modalidades

| Modalidad | Cierre de ronda | Fin de partida |
|---|---|---|
| Clasica 4-3-3 | 1 cuarta + 2 ternas + 1 carta de descarte | Primero en ganar N rondas (3 por defecto) |
| Apuntado a 101 | 3 ternas y sobrante menor a 5. Configurable en la sala: si una cuarta o quinta cuenta como terna (`cuartaCuentaComoTerna`, por defecto no: exactamente 3 ternas, como la guía) o exigir cuarta + 2 ternas + descarte (`permitirCierreConSobrante = false`) | Los demas suman sus sueltas; con 101 o mas quedan eliminados; gana el ultimo en pie |

El anfitrion configura antes de repartir: tiempo de turno, comodines (0/2/4), valor del As (1/10/11), As alto/bajo/ambos, robo del pozo, mazos y umbrales.

## Supuestos de reglas (confirmar con el equipo)

1. Grupo = 3 o mas del mismo valor; escalera = 3 o mas consecutivas de la misma pinta; no se da la vuelta (K-A-2 no vale).
2. Sueltas: 2-10 su numero, J/Q/K 10, As segun parametro, comodin 0.
3. Mano de 10 cartas; quien inicia la ronda parte con 11 y se cierra con 11 en la fase de descartar.
4. 1 mazo hasta 4 jugadores, 2 mazos con 5-6. Si el mazo se agota, el pozo (menos la superior) se baraja y vuelve; tras 2 reciclajes la ronda queda en tablas.
5. La carta tomada del pozo no puede devolverse en el mismo turno.
6. Al vencer el turno se roba y descarta por el jugador; 2 vencidos seguidos = "piloto" (solo una etiqueta: su turno espera el reloj completo y se juega solo, sin robo anticipado); mas de 3 saltados = "automatico" sin votacion; si sigue ausente, cualquiera puede abrir la votacion de expulsion (mayoria simple de los activos) (ADR-13).
7. Los turnos giran en sentido antihorario.

## Estructura

```
api/index.ts                 función única de Vercel
src/kernel/                  cartas, mano, marcador, configuración (MODALIDADES), protocolo
src/estado/                  contratos del estado serializable de la sala y la partida
src/rules/                   IReglaJuego, IValidadorCierre, ICalculadorPuntos, IRegistroReglas; RegistroReglas;
                             ReglaBase y una estrategia por modalidad; HandEvaluator (combinaciones)
src/deck/                    IMazo, DeckManagement, Baraja (barajado con semilla inyectable); index.ts = API pública
src/player/                  IJugadores, PlayerRegistry (orden de turno, eliminados, conexión); index.ts = API pública
src/scoring/                 IServicioPuntaje, RoundScoring (liquidación y posiciones); index.ts = API pública
src/game/                    TurnOrchestrator (IComandosJuego), PartidaEnCurso, LobbyManager, puertos de los extras
src/persistence/             IRepositorioPartida, IAlmacen, IRepositorioCuentas; SupabaseStateRepository, AlmacenMemoria,
                             MemoryStateRepository
src/infra/                   ITemporizadorTurno (Programador), GatewayTiempoReal (ICanalTiempoReal),
                             ProyectorVistaJugador (vista por jugador), validación de mensajes
src/serverless/              raíz de composición: manejador HTTP, Procesador (un comando por petición), acceso,
                             ProgramadorVirtual
src/extras/                  bots, cuentas, skins, reacciones, métricas de latencia y web (música, sonido,
                             celebración, fondo) (ADR-11)
src/web/                     cliente: pantallas, mesa, red, estilos
public/                      index.html, estilos, fuentes y arte
supabase/esquema.sql         tablas, RLS, guardar_sala_atomica, evento con cierre único y partida_registro
                             (histórico de las últimas 100 partidas con tiempos por turno y latencias)
tests/                       pruebas (vitest), funciones de idoneidad y esquema SQL sobre PostgreSQL en memoria (PGlite)
tools/                       gobernanza (sondas, métricas, aserciones, latencia, reporte), e2e, BPMN, UML, arte, capturas
docs/                        ADR, BPMN, UML, contratos, gobernanza, evidencias, notas y capturas
herramientas/                generador sin conexión del acceso (usuarios y hashes)
```

Añadir una modalidad: una clase que extienda `ReglaBase` (o implemente `IReglaJuego`) en `src/rules/`, registrarla en `crearRegistroReglas()` (`src/rules/RegistroReglas.ts`, ADR-08) y añadir su ficha en `MODALIDADES` (`src/kernel/config.ts`). La suite contractual común (`tests/idoneidad-reglas.test.ts`) la prueba al agregarla a la lista de estrategias.

## Documentacion

| Que | Donde |
|---|---|
| Decisiones de arquitectura (ADR-01 a ADR-14) | `docs/adr/` |
| BPMN (As-Is, To-Be, turno, cierre, colaboracion) con simulador | `docs/bpmn/` (abre `simulador.html`) |
| Trazabilidad BPMN - requisitos - codigo | `docs/TRAZABILIDAD_BPMN.md` |
| UML (casos de uso, componentes, clases, estados, secuencias, despliegue, ER) | `docs/uml/` y `docs/uml/render/` |
| Especificacion de los casos de uso CU-01 a CU-05 | `docs/casos-de-uso.md` |
| Contratos HTTP y de mensajes | `docs/contracts/openapi.yaml`, `docs/contracts/asyncapi.yaml` |
| Trabajo futuro: mejoras planificadas y paso a un sistema comercial | `docs/TRABAJO_FUTURO.md` |
| Como cambiar el arte | `docs/GUIA_ASSETS.md` |
| Reporte de gobernanza | `docs/gobernanza/REPORTE.md` |
| Protocolo y evidencias de las pruebas con usuarios | `docs/evidencias/` |
| Capturas de la interfaz | `docs/mockups/` |
| Administracion (usuarios, contrasenas, secreto de sesion) | `GUIA_ADMINISTRACION.md` |

## Limitaciones conocidas

- La interfaz web y los extras tienen 28 funciones por encima de CC 10; se miden en un job informativo que no bloquea (ADR-14).
- FF-32 (alerta si el p99 de la latencia en producción sale de la línea base de 300 ms) se ejecuta a mano con `npm run ff32` después de las sesiones con usuarios; no está en el pipeline porque necesita datos de producción.
- El adaptador `SupabaseStateRepository` no tiene pruebas unitarias (habla con la API de Supabase); su lógica SQL sí se prueba en `tests/esquema.test.ts` y el flujo completo con `npm run test:e2e`.
- Las pruebas con usuarios reales se registran en `docs/evidencias/` cuando se realicen.

Fuentes Rye, Nunito y Zilla Slab: licencia SIL Open Font License (`public/fonts/OFL.txt`).
