# Modelos BPMN 2.0 - El Apuntado

Cinco diagramas **BPMN 2.0 estándar** (XML con `bpmndi`, listos para abrir, editar y simular):

| Archivo | Qué modela | Enfoque (P05) |
|---|---|---|
| `01_as_is.bpmn` | Partida presencial actual, con los 5 puntos de dolor del Entregable 1 marcados | **As-Is** |
| `02_to_be.bpmn` | Proceso digital completo: sala -> reparto -> turnos -> cierre -> liquidación -> podio | **To-Be** (cada tarea "BRECHA CERRADA" enlaza con el As-Is) |
| `03_turno.bpmn` | Subproceso del turno: robar, organizar, descartar/cerrar, timeout y autopiloto | To-Be detallado |
| `04_cierre_liquidacion.bpmn` | Cierre por modalidad (Strategy), liquidación, eliminaciones, fin de partida | To-Be detallado |
| `05_colaboracion.bpmn` | Colaboración con 3 pools (Jugador - Servidor - Supabase) y flujos de mensaje | Interacción |

Cada tarea lleva en `<bpmn:documentation>` sus requisitos (RF01-RF19), el componente lógico y la clase/método que la implementa. La tabla completa está en [`../TRAZABILIDAD_BPMN.md`](../TRAZABILIDAD_BPMN.md).

## Cómo abrirlos y simularlos

**Opción recomendada - simulador incluido (sin instalar nada, funciona sin internet)**

1. Con el servidor en marcha abre <http://localhost:3000/docs/bpmn/simulador.html> (también funciona haciendo doble clic en `docs/bpmn/simulador.html`).
2. Elige el diagrama en las pestañas de la barra superior (01 ... 05). Ahí también puedes **Descargar .bpmn** o abrir "¿Cómo simular?".
3. Pulsa **Token Simulation** (interruptor en la esquina superior izquierda del lienzo, o la tecla `T`).
4. Haz clic en el evento de inicio (o en *Play*) para lanzar una ficha (*token*). En las compuertas con "X" elige la rama; los eventos de tiempo y mensaje se disparan con un clic en su icono. Espacio = pausa, `R` = reiniciar.

El simulador es [bpmn.io](https://bpmn.io) *bpmn-js* + *bpmn-js-token-simulation* empaquetados localmente (`npm run bpmn:sim`).

**Alternativas**

- **Camunda Modeler** (escritorio, gratuito): *File -> Open* cualquier `.bpmn`; se abre y se puede simular con el botón de token simulation.
- **demo.bpmn.io**: arrastra el `.bpmn` a la página.
- **Bizagi Modeler / Signavio / draw.io**: importan BPMN 2.0 XML.

## ¿BPMN, BPMS o motor de ejecución?

| Herramienta | Para qué sirve aquí | Recomendación |
|---|---|---|
| **bpmn.io + token simulation** | Validar el flujo con el equipo, recorrer caminos, mostrar en clase | ✅ **Usar** (incluido) |
| **Camunda Modeler** | Edición cómoda y exportación | ✅ Opcional |
| **BPMS/motor** (Camunda 8/Zeebe, Flowable) | Ejecutar procesos *macro* de negocio con tareas humanas y SLA | ⚠️ No para el bucle de turnos: es tiempo real de baja latencia y vive en código (`PartidaEnCurso`) |

Los `.bpmn` son **modelo y contrato de comportamiento**, no un flujo que el servidor interprete: un motor BPMN sería una dependencia pesada para un bucle de turnos en milisegundos. El proceso *macro* (crear sala -> jugar -> liquidar -> revancha) sí podría delegarse a un motor en una fase posterior.

## Regenerar y validar

Los diagramas se generan desde una DSL (`tools/bpmn/diagramas.mjs`) con enrutado ortogonal y posicionamiento automático:

```bash
npm run bpmn:generate   # escribe docs/bpmn/*.bpmn y docs/TRAZABILIDAD_BPMN.md
npm run bpmn:validate   # estructura, geometría (DI) y simulación de tokens (sin bloqueos)
npm run bpmn:sim        # reempaqueta el simulador offline
npm run bpmn:render     # (opcional) PNG/SVG en docs/bpmn/img con Chromium
```
Editar el `.bpmn` a mano en Camunda Modeler también es válido, pero se perderá al regenerar: para cambios permanentes modifica la DSL.
