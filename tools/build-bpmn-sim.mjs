/**
 * Construye el simulador offline de procesos: docs/bpmn/simulador.html (+ docs/bpmn/sim/*).
 *  - bpmn-js (Modeler) + bpmn-js-token-simulation empaquetados con esbuild (sin CDN, funciona por file://).
 *  - Los .bpmn se incrustan en sim/diagramas.js para no depender de fetch().
 * Uso: npm run bpmn:generate && npm run bpmn:sim
 */
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { DIAGRAMAS } from './bpmn/diagramas.mjs';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const OUT = `${raiz}docs/bpmn/`;
const SIM = `${OUT}sim/`;
mkdirSync(SIM, { recursive: true });

await build({
  entryPoints: [`${raiz}tools/bpmn-sim/entry.js`],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  outfile: `${SIM}simulador.js`,
  logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"production"' },
});

// CSS + fuentes de bpmn-js / diagram-js / token simulation (rutas relativas preservadas)
const nm = `${raiz}node_modules/`;
mkdirSync(`${SIM}assets`, { recursive: true });
cpSync(`${nm}bpmn-js/dist/assets/bpmn-font`, `${SIM}assets/bpmn-font`, { recursive: true });
for (const f of ['diagram-js.css', 'bpmn-js.css']) cpSync(`${nm}bpmn-js/dist/assets/${f}`, `${SIM}assets/${f}`);
cpSync(`${nm}bpmn-js-token-simulation/assets/css/bpmn-js-token-simulation.css`, `${SIM}assets/bpmn-js-token-simulation.css`);

const datos = DIAGRAMAS.map((d) => ({
  archivo: d.archivo,
  titulo: d.titulo,
  resumen: d.resumen,
  xml: readFileSync(`${OUT}${d.archivo}.bpmn`, 'utf8'),
}));
writeFileSync(`${SIM}diagramas.js`, `window.DIAGRAMAS = ${JSON.stringify(datos)};\n`);

writeFileSync(
  `${OUT}simulador.html`,
  `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Simulador BPMN - El Apuntado</title>
<link rel="stylesheet" href="sim/assets/diagram-js.css" />
<link rel="stylesheet" href="sim/assets/bpmn-js.css" />
<link rel="stylesheet" href="sim/assets/bpmn-font/css/bpmn.css" />
<link rel="stylesheet" href="sim/assets/bpmn-js-token-simulation.css" />
<style>
  :root { --oro:#f5c04a; --fondo:#0b1f24; --panel:#123640; --crema:#f4f1e6; }
  html,body { margin:0; height:100%; font-family: system-ui, 'Segoe UI', Roboto, sans-serif; background:#fff; color:#12262b; }
  header { display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:8px 14px; background:var(--fondo); color:var(--crema); }
  header h1 { margin:0; font: 700 18px Georgia, serif; color:var(--oro); margin-right:8px; }
  #tabs { display:flex; flex-wrap:wrap; gap:6px; }
  button { font:600 13px system-ui; padding:6px 12px; border-radius:8px; border:1px solid rgba(245,192,74,.5); background:var(--panel); color:var(--crema); cursor:pointer; }
  button:hover { filter:brightness(1.2); } button.activa { background:var(--oro); color:#2a1b03; }
  #barra { display:flex; align-items:center; gap:12px; padding:6px 14px; background:#eef3f3; border-bottom:1px solid #cfdcdc; font-size:13px; }
  #barra b { font-size:14px; } #resumen { color:#48646a; flex:1; } #estado { color:#48646a; font-style:italic; }
  main { position:relative; height: calc(100% - 98px); }
  #canvas { position:absolute; inset:0; }
  #guia { position:absolute; right:12px; top:12px; width:340px; max-height:88%; overflow:auto; background:#fffffff2; border:1px solid #b9cbcb; border-radius:12px; padding:12px 16px; font-size:13px; line-height:1.45; display:none; z-index:20; box-shadow:0 8px 24px #0003; }
  #guia.abierta { display:block; } #guia h3 { margin:6px 0; font-size:15px; }
  #guia code { background:#eef3f3; padding:0 4px; border-radius:4px; }
</style>
</head>
<body>
<header>
  <h1>El Apuntado - Simulador BPMN</h1>
  <div id="tabs"></div>
  <span style="flex:1"></span>
  <button id="ajustar" title="Ajustar al tamaño de la ventana">Ajustar vista</button>
  <button id="descargar" title="Descargar el .bpmn tal como está en pantalla">Descargar .bpmn</button>
  <button id="guia-btn">¿Cómo simular?</button>
</header>
<div id="barra"><b id="titulo"></b><span id="resumen"></span><span id="estado"></span></div>
<main>
  <div id="canvas"></div>
  <aside id="guia">
    <h3>Cómo simular (token simulation)</h3>
    <ol>
      <li>Pulsa el botón <b>"Toggle simulation"</b> (icono de reproducción) en la esquina superior izquierda del lienzo.</li>
      <li>Haz clic en el icono de <b>evento de inicio</b> (o en "Play") para lanzar una ficha (token).</li>
      <li>En las <b>decisiones (rombos con X)</b> aparece un menú: elige la rama que quieres recorrer.</li>
      <li>Los <b>eventos de tiempo</b> (reloj) y de <b>mensaje</b> se disparan haciendo clic en su icono.</li>
      <li>El botón de <b>pausa/reinicio</b> detiene o reinicia la simulación; la rueda de velocidad ajusta la animación.</li>
    </ol>
    <p>Los diagramas 01 y 05 son colaboraciones con piscinas; el 05 espeja el protocolo HTTP con buzones (<code>docs/contracts/asyncapi.yaml</code>).</p>
    <p>Los archivos <code>.bpmn</code> también abren en Camunda Modeler, bpmn.io, Signavio o Bizagi Modeler.</p>
  </aside>
</main>
<script src="sim/diagramas.js"></script>
<script src="sim/simulador.js"></script>
</body>
</html>
`,
);
console.log(`Simulador generado en docs/bpmn/simulador.html (${readdirSync(SIM).length} archivos en sim/)`);
