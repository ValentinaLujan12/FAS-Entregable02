#!/usr/bin/env node
/**
 * Renderiza docs/uml/*.puml -> docs/uml/render/*.svg y *.png con PlantUML + Graphviz.
 * Requiere: Java 11+, Graphviz (dot) y plantuml.jar.
 *   PLANTUML_JAR=/ruta/plantuml.jar node tools/render-uml.mjs [--formatos=svg,png]
 * Descarga del jar: https://github.com/plantuml/plantuml/releases (plantuml-*.jar)
 * Alternativa sin instalar nada: pegar cualquier .puml en https://www.plantuml.com/plantuml
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dirUml = join(raiz, 'docs', 'uml');
const salida = join(dirUml, 'render');
const formatos = (process.argv.find((a) => a.startsWith('--formatos='))?.split('=')[1] ?? 'svg,png').split(',');
const jar = [process.env.PLANTUML_JAR, join(raiz, 'tools', 'plantuml.jar')].find((p) => p && existsSync(p));
if (!jar) {
  console.error('No se encontró plantuml.jar. Define PLANTUML_JAR=/ruta/plantuml.jar (ver cabecera de este archivo).');
  process.exit(1);
}
mkdirSync(salida, { recursive: true });
const fuentes = readdirSync(dirUml).filter((f) => f.endsWith('.puml')).sort();
let fallos = 0;
for (const fmt of formatos) {
  const r = spawnSync('java', ['-Djava.awt.headless=true', '-jar', jar, `-t${fmt}`, '-charset', 'UTF-8', '-o', salida, ...fuentes.map((f) => join(dirUml, f))], { encoding: 'utf8' });
  const salidaTxt = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  if (r.status !== 0 || /Error|Syntax/i.test(salidaTxt)) {
    fallos++;
    console.error(`FALLO formato ${fmt}:\n${salidaTxt}`);
  } else {
    console.log(`ok ${fuentes.length} diagramas -> docs/uml/render/*.${fmt}`);
  }
}
process.exit(fallos ? 1 : 0);
