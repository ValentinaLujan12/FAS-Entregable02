/**
 * Renderiza los diagramas con bpmn-js real (Chromium headless) desde el simulador OFFLINE (file://):
 *  - comprueba que cada .bpmn importa sin advertencias,
 *  - exporta SVG y PNG a docs/bpmn/img/,
 *  - prueba el modo simulación (token simulation) sin errores de consola.
 * Uso: npm run bpmn:sim && npm run bpmn:render
 */
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const IMG = `${raiz}docs/bpmn/img/`;
mkdirSync(IMG, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
const errores = [];
page.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
page.on('pageerror', (e) => errores.push(String(e)));
await page.goto(`file://${raiz}docs/bpmn/simulador.html`);
await page.waitForFunction(() => window.__modeler && window.DIAGRAMAS?.length);
const n = await page.evaluate(() => window.DIAGRAMAS.length);
let fallos = 0;
for (let i = 0; i < n; i++) {
  await page.evaluate((k) => window.__abrir(k), i);
  await page.waitForTimeout(400);
  const info = await page.evaluate(() => window.__ultimoImport);
  const ok = !info.error && info.warnings.length === 0;
  if (!ok) fallos++;
  console.log(`${ok ? 'ok' : 'FALLO'} ${info.archivo}: importación ${ok ? 'limpia' : JSON.stringify(info)}`);
  await page.screenshot({ path: `${IMG}${info.archivo}_pantalla.png` });
  const svg = await page.evaluate(() => window.__exportarSVG());
  writeFileSync(`${IMG}${info.archivo}.svg`, svg);
  // PNG a tamaño natural del SVG
  const dim = /width="([\d.]+)" height="([\d.]+)"/.exec(svg);
  const w = Math.ceil(Number(dim[1])), h = Math.ceil(Number(dim[2]));
  const p2 = await browser.newPage({ viewport: { width: Math.min(w, 6000), height: Math.min(h, 3000) } });
  await p2.setContent(`<body style="margin:0;background:#fff">${svg}</body>`);
  await p2.screenshot({ path: `${IMG}${info.archivo}.png` });
  await p2.close();
}
// Simulación: activar el modo, lanzar la ficha del inicio y verificar que hay fichas animadas
await page.evaluate(() => window.__abrir(2));
await page.waitForTimeout(500);
const antes = errores.length;
await page.click('.bts-toggle-mode');
await page.waitForTimeout(600);
const activo = await page.evaluate(() => !!document.querySelector('.bts-toggle-mode.active') || document.body.classList.contains('bts-simulation') || !!document.querySelector('.bts-set-animation-speed'));
console.log(`${activo ? 'ok' : 'FALLO'} el modo simulación se activa`);
if (!activo) fallos++;
const starts = await page.$$('.bts-trigger-event, .bts-context-pad-entry');
console.log(`  ${starts.length} controles de simulación visibles`);
await page.screenshot({ path: `${IMG}03_turno_simulacion.png` });
if (errores.length > antes) { fallos++; console.log('FALLO errores de consola durante la simulación:', errores.slice(antes)); }
console.log(errores.length ? `errores de consola: ${errores.join(' | ')}` : 'ok sin errores de consola');
await browser.close();
process.exit(fallos ? 1 : 0);
