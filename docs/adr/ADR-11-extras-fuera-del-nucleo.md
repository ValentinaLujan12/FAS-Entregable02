# ADR-11: LOS EXTRAS (BOTS, CUENTAS, SKINS, SONIDO, MÚSICA, REACCIONES, CELEBRACIÓN) VIVEN FUERA DEL NÚCLEO

**ESTADO:** Accepted e implementado (nuevo en el Entregable 3)

**CONTEXTO:**

El juego incorpora funciones que no están en el Entregable 2: bots, cuentas anónimas con créditos, skins, reacciones, sonido, música y celebraciones. El Entregable 2 define un núcleo de dominios (kernel, game, deck, player, rules, scoring, persistence, infra) con dependencias dirigidas (ADR-01). Los extras no deben alterar ese núcleo.

**DECISIÓN:**

1. Todo lo que no pertenece al núcleo vive en `src/extras/`.
2. Ningún módulo del núcleo (`kernel`, `estado`, `rules`, `deck`, `player`, `scoring`, `persistence`, `game`, `infra`) depende de `src/extras/`.
3. El núcleo declara lo que necesita de los extras como puertos (`src/game/puertos.ts`: `IServicioCuentas`, `IEstilos`, `IReaccionesPolitica`, `IPlanificadorReacciones`, `IEstrategiaBot`, agrupados en `IExtrasJuego`). Los extras los implementan y se componen en `src/extras/composicion.ts`.
4. El único punto de la capa serverless que importa los extras es el manejador (`src/serverless/manejador.ts`, raíz de composición). El procesador y el orquestador los reciben por inyección.

**ESTADO (medido el 22/11/2026):** cumple. 0 dependencias del núcleo hacia `extras`; la capa serverless solo los compone en `manejador.ts`. Ambas reglas se verifican en CI y tienen sonda (`npm run deps:sondas`).

**ALTERNATIVAS RECHAZADAS:**

- **Incluir los extras en el núcleo:** aumenta el acoplamiento y dificulta separar el entregable básico de las funciones adicionales.
- **Publicar los extras como paquete aparte:** excesivo para un único repositorio de estudiantes.

**CONSECUENCIAS:**

**Positivas:** el núcleo de reglas y persistencia se prueba sin los extras; los extras pueden desactivarse.

**Negativas:** desactivar un extra exige editar la composición en `src/extras/composicion.ts`, no el núcleo.

**CUMPLIMIENTO:** `.dependency-cruiser.cjs`, reglas `nucleo-no-depende-de-extras` y `serverless-solo-compone-extras-en-manejador`, en el pipeline de CI.

**REFERENCIAS:** ADR-01; ADR-06; Richards & Ford (2025), Cap. 11 (monolito modular).
