/**
 * Reporte de gobernanza (evidencia para el Entregable 3, sección 4): ejecuta las funciones de idoneidad y guarda la
 * salida de cada una en docs/gobernanza/REPORTE.md, con métricas en JSON junto al reporte.
 *   npm run gobernanza:reporte
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const destino = join(raiz, 'docs', 'gobernanza');
mkdirSync(destino, { recursive: true });

const PASOS = [
  ['Tipos estrictos', 'npm run typecheck'],
  ['FF-01 a FF-09, FF-27: reglas de dependencias', 'npm run deps'],
  ['Sondas de las reglas de dependencias', 'npm run deps:sondas'],
  ['FF-10: complejidad ciclomática del núcleo', 'npm run cc'],
  ['FF-31: aserciones en todas las pruebas', 'npm run aserciones'],
  ['FF-30: métricas de modularidad', `npm run metricas -- --json docs/gobernanza/metricas-modulos.json`],
  ['FF-16: latencia de validación', `npm run latencia -- --json docs/gobernanza/latencia.json`],
  ['Pruebas y cobertura (FF-11 a FF-29, FF-15)', 'npm run test:cov -- --coverage.reporter=text-summary'],
  ['Protocolo HTTP de punta a punta', 'npm run test:e2e'],
  ['Complejidad de la interfaz web y los extras (informativo)', 'npm run cc:ui'],
];

const limpiar = (s) => s.replace(/\x1b\[[0-9;]*m/g, '').replace(/^> .*$/gm, '').trim();
const secciones = [];
let fallos = 0;
for (const [titulo, comando] of PASOS) {
  const r = spawnSync(comando, { cwd: raiz, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const ok = r.status === 0;
  const informativo = titulo.includes('informativo');
  if (!ok && !informativo) fallos++;
  const salida = limpiar(`${r.stdout}\n${r.stderr}`).split('\n').slice(-40).join('\n');
  secciones.push(`## ${titulo}\n\nComando: \`${comando}\` - resultado: **${ok ? 'OK' : informativo ? 'con avisos (no bloquea)' : 'FALLA'}**\n\n\`\`\`text\n${salida}\n\`\`\``);
  console.log(`${ok ? 'OK   ' : informativo ? 'AVISO' : 'FALLA'}  ${titulo}`);
}
const md = `# Reporte de gobernanza arquitectónica\n\nGenerado: ${new Date().toISOString()} con \`npm run gobernanza:reporte\`.\nResultado global: **${fallos ? `${fallos} función(es) incumplida(s)` : 'todas las funciones bloqueantes se cumplen'}**.\n\n${secciones.join('\n\n')}\n`;
writeFileSync(join(destino, 'REPORTE.md'), md);
console.log(`\nReporte en docs/gobernanza/REPORTE.md (${fallos ? 'con fallos' : 'sin fallos'})`);
process.exit(fallos ? 1 : 0);
