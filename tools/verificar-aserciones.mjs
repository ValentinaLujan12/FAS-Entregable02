/**
 * FF-31 (G7): toda prueba contiene al menos una aserción real. Recorre el árbol sintáctico de tests/*.test.ts y, para
 * cada `it(...)` o `test(...)`, exige que su cuerpo llame a `expect(...)` (o `expect.*`, `assert*`), directamente o
 * a través de una función auxiliar del mismo archivo que a su vez la llame. Evita que pruebas vacías inflen la cobertura.
 *   node tools/verificar-aserciones.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const dir = fileURLToPath(new URL('../tests', import.meta.url));
const ASERCION = /^(expect|assert[A-Za-z]*)$/;

/** Nombre de la función llamada: expect, expect.soft, assert.equal, foo... */
function nombreLlamada(n) {
  const e = n.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) {
    let base = e.expression;
    while (ts.isPropertyAccessExpression(base) || ts.isCallExpression(base)) base = ts.isCallExpression(base) ? base.expression : base.expression;
    return ts.isIdentifier(base) ? base.text : null;
  }
  return null;
}

/** Nombres de las funciones que una porción del árbol llama. */
function llamadas(nodo) {
  const out = new Set();
  const visitar = (n) => {
    if (ts.isCallExpression(n)) {
      const nombre = nombreLlamada(n);
      if (nombre) out.add(nombre);
    }
    ts.forEachChild(n, visitar);
  };
  visitar(nodo);
  return out;
}

let pruebas = 0;
const sinAsercion = [];
for (const archivo of readdirSync(dir).filter((f) => f.endsWith('.test.ts')).sort()) {
  const sf = ts.createSourceFile(archivo, readFileSync(join(dir, archivo), 'utf8'), ts.ScriptTarget.ES2022, true);
  // Funciones auxiliares del archivo (declaraciones y constantes con función) y lo que llaman.
  const auxiliares = new Map();
  const recoger = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name && n.body) auxiliares.set(n.name.text, llamadas(n.body));
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) auxiliares.set(n.name.text, llamadas(n.initializer));
    ts.forEachChild(n, recoger);
  };
  recoger(sf);
  const afirma = (nombres, vistos = new Set()) =>
    [...nombres].some((x) => ASERCION.test(x) || (auxiliares.has(x) && !vistos.has(x) && afirma(auxiliares.get(x), new Set([...vistos, x]))));

  const visitar = (n) => {
    if (ts.isCallExpression(n) && ['it', 'test'].includes(nombreLlamada(n) ?? '') && n.arguments.length >= 2) {
      const cuerpo = n.arguments.find((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
      if (cuerpo) {
        pruebas++;
        if (!afirma(llamadas(cuerpo))) {
          const titulo = ts.isStringLiteralLike(n.arguments[0]) ? n.arguments[0].text : n.arguments[0].getText(sf);
          const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
          sinAsercion.push(`${archivo}:${line + 1}  ${titulo}`);
        }
      }
    }
    ts.forEachChild(n, visitar);
  };
  visitar(sf);
}

if (sinAsercion.length) {
  console.error(`FF-31: ${sinAsercion.length} prueba(s) sin aserción:\n  ${sinAsercion.join('\n  ')}`);
  process.exit(1);
}
console.log(`FF-31 OK: ${pruebas} bloques it/test, todos con al menos una aserción`);
