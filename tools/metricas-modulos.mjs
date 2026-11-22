/**
 * FF-30 (G4): métricas de modularidad de Robert C. Martin por módulo (carpeta de primer nivel de src/).
 *   Ca  = módulos distintos que dependen del módulo (acoplamiento aferente)
 *   Ce  = módulos distintos de los que depende (acoplamiento eferente)
 *   I   = Ce / (Ca + Ce)                         (inestabilidad; 0 si no tiene dependencias)
 *   A   = abstractos / (abstractos + concretos)  (abstracción)
 *         abstractos: interfaces con comportamiento (declaran al menos un método) y clases abstractas exportadas;
 *         concretos: clases concretas y funciones exportadas. Las interfaces de solo datos (DTO) y los alias de tipo
 *         son datos, no abstracciones, y no cuentan.
 *   D   = |A + I - 1|                            (distancia a la secuencia principal)
 * Umbral (bloqueante en CI): D <= 0,5 en los módulos del núcleo que no son base estable.
 * Base estable (I <= 0,25: kernel, deck, player): estables y concretos por diseño (cartas, baraja y turnos no son
 * volátiles) y consumidos por interfaces; su zona (de dolor) se reporta pero no bloquea (ADR-14, criterio de Martin).
 * La interfaz web y los extras se reportan como informativos.
 *   node tools/metricas-modulos.mjs [--json archivo]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const UMBRAL_D = 0.5;
const INFORMATIVOS = new Set(['web', 'extras']);
const I_BASE_ESTABLE = 0.25;

const bin = join(raiz, 'node_modules', '.bin', process.platform === 'win32' ? 'depcruise.cmd' : 'depcruise');
const grafo = JSON.parse(execFileSync(bin, ['src', '--config', '.dependency-cruiser.cjs', '--output-type', 'json'], { cwd: raiz, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' }));

const moduloDe = (ruta) => ruta.replace(/^src\//, '').split('/')[0];
const esFuente = (ruta) => /^src\/[^/]+\//.test(ruta);

const ce = new Map();
const ca = new Map();
for (const m of grafo.modules) {
  if (!esFuente(m.source)) continue;
  const a = moduloDe(m.source);
  if (!ce.has(a)) ce.set(a, new Set());
  for (const d of m.dependencies) {
    if (!esFuente(d.resolved)) continue;
    const b = moduloDe(d.resolved);
    if (b !== a) ce.get(a).add(b);
  }
}
for (const [a, destinos] of ce) for (const b of destinos) (ca.get(b) ?? ca.set(b, new Set()).get(b)).add(a);

function archivosTs(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivosTs(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const exportado = (n) => ts.getCombinedModifierFlags(n) & ts.ModifierFlags.Export;
/** Interfaz con comportamiento: declara al menos un método (o una propiedad cuyo tipo es una función). */
const conComportamiento = (n) => n.members.some((m) => ts.isMethodSignature(m) || ts.isCallSignatureDeclaration(m) || (ts.isPropertySignature(m) && m.type && ts.isFunctionTypeNode(m.type)));
const abstracta = (n) => ts.getCombinedModifierFlags(n) & ts.ModifierFlags.Abstract;

function contarTipos(archivo) {
  const sf = ts.createSourceFile(archivo, readFileSync(archivo, 'utf8'), ts.ScriptTarget.ES2022, true);
  let abstractos = 0;
  let concretos = 0;
  for (const n of sf.statements) {
    if (!exportado(n)) continue;
    if (ts.isInterfaceDeclaration(n)) abstractos += conComportamiento(n) ? 1 : 0;
    else if (ts.isClassDeclaration(n)) abstracta(n) ? abstractos++ : concretos++;
    else if (ts.isFunctionDeclaration(n)) concretos++;
    else if (ts.isVariableStatement(n)) concretos += n.declarationList.declarations.filter((d) => d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))).length;
  }
  return { abstractos, concretos };
}

const filas = [];
for (const modulo of readdirSync(join(raiz, 'src')).filter((n) => statSync(join(raiz, 'src', n)).isDirectory()).sort()) {
  let abstractos = 0;
  let concretos = 0;
  const archivos = archivosTs(join(raiz, 'src', modulo));
  for (const a of archivos) {
    const c = contarTipos(a);
    abstractos += c.abstractos;
    concretos += c.concretos;
  }
  const nCa = ca.get(modulo)?.size ?? 0;
  const nCe = ce.get(modulo)?.size ?? 0;
  const I = nCa + nCe === 0 ? 0 : nCe / (nCa + nCe);
  const A = abstractos + concretos === 0 ? 0 : abstractos / (abstractos + concretos);
  const D = Math.abs(A + I - 1);
  const tipo = INFORMATIVOS.has(modulo) ? 'informativo' : I <= I_BASE_ESTABLE ? 'base estable' : 'núcleo';
  const cumple = tipo !== 'núcleo' || D <= UMBRAL_D;
  filas.push({ modulo, archivos: archivos.length, ca: nCa, ce: nCe, abstractos, concretos, I, A, D, tipo, cumple, dependeDe: [...(ce.get(modulo) ?? [])].sort() });
}

const f2 = (x) => x.toFixed(2);
console.log('Módulo        Arch  Ca  Ce   I     A     D     Tipo          Estado');
for (const r of filas) {
  console.log(`${r.modulo.padEnd(13)} ${String(r.archivos).padStart(4)} ${String(r.ca).padStart(3)} ${String(r.ce).padStart(3)}  ${f2(r.I)}  ${f2(r.A)}  ${f2(r.D)}  ${r.tipo.padEnd(12)}  ${r.cumple ? 'cumple' : 'NO CUMPLE'}`);
}

// Aciclicidad entre módulos (complementa FF-05, que es por archivo): orden topológico del grafo de carpetas.
const nucleo = filas.filter((r) => r.tipo !== 'informativo').map((r) => r.modulo);
const visitado = new Map();
let ciclo = null;
const dfs = (m, camino) => {
  if (visitado.get(m) === 1) return void (ciclo ??= [...camino, m]);
  if (visitado.get(m) === 2) return;
  visitado.set(m, 1);
  for (const d of ce.get(m) ?? []) if (nucleo.includes(d)) dfs(d, [...camino, m]);
  visitado.set(m, 2);
};
for (const m of nucleo) dfs(m, []);
console.log(ciclo ? `\nCICLO entre módulos: ${ciclo.join(' -> ')}` : '\nSin ciclos entre módulos del núcleo.');

const i = process.argv.indexOf('--json');
if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify({ fecha: new Date().toISOString(), umbralD: UMBRAL_D, modulos: filas, cicloEntreModulos: ciclo }, null, 2));

const fallos = filas.filter((r) => !r.cumple);
if (fallos.length || ciclo) {
  console.error(`\nFF-30: ${fallos.map((r) => r.modulo).join(', ') || 'ciclo entre módulos'} fuera del umbral`);
  process.exit(1);
}
console.log(`FF-30 OK: D <= ${UMBRAL_D} en los módulos del núcleo; base estable reportada (${filas.filter((r) => r.tipo === 'base estable').map((r) => r.modulo).join(', ')})`);
