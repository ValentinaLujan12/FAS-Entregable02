// Compila los modelos de diagramas.mjs -> docs/bpmn/*.bpmn  (+ docs/TRAZABILIDAD_BPMN.md)
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { DIAGRAMAS } from './diagramas.mjs';
import { generarBpmn } from './generador.mjs';

const OUT = fileURLToPath(new URL('../../docs/bpmn/', import.meta.url));
mkdirSync(OUT, { recursive: true });
let fallos = 0;
const filas = [];
for (const d of DIAGRAMAS) {
  const { xml, errores, geom } = generarBpmn(d.modelo);
  if (errores.length) {
    fallos += errores.length;
    console.error(`FALLO ${d.archivo}:`, errores);
  }
  writeFileSync(`${OUT}${d.archivo}.bpmn`, xml);
  console.log(`ok ${d.archivo}.bpmn (${geom.todosLosNodos.length} elementos)`);
  for (const n of geom.todosLosNodos) {
    if ((n.rf || n.comp || n.impl) && n.tipo !== 'nota') {
      filas.push({ dia: d.archivo, id: n.id, nombre: n.nombre, rf: n.rf ?? '', comp: n.comp ?? '', impl: n.impl ?? '' });
    }
  }
}
const md = [
  '# Trazabilidad BPMN -> requisitos -> código',
  '',
  'Generada automáticamente por `npm run bpmn:generate` desde `tools/bpmn/diagramas.mjs`. Cada tarea del BPMN lleva esta misma información en su `<bpmn:documentation>`.',
  '',
  '| Diagrama | Tarea | Requisitos | Componente lógico | Implementación |',
  '|---|---|---|---|---|',
  ...filas.map((f) => `| ${f.dia} | ${f.nombre.replace(/\|/g, '/')} | ${f.rf} | ${f.comp} | ${f.impl.replace(/\|/g, '/')} |`),
  '',
].join('\n');
writeFileSync(fileURLToPath(new URL('../../docs/TRAZABILIDAD_BPMN.md', import.meta.url)), md);
if (fallos) process.exit(1);
