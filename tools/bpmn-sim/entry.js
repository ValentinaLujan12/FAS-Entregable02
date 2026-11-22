// Punto de entrada del simulador offline (se empaqueta con esbuild -> docs/bpmn/sim/simulador.js)
import BpmnModeler from 'bpmn-js/lib/Modeler';
import TokenSimulationModule from 'bpmn-js-token-simulation/lib/modeler';

const diagramas = window.DIAGRAMAS ?? [];
const $ = (s) => document.querySelector(s);

const modeler = new BpmnModeler({
  container: '#canvas',
  additionalModules: [TokenSimulationModule],
  keyboard: { bindTo: document },
});
window.__modeler = modeler;

const tabs = $('#tabs');
let actual = null;
const xmlActual = () => modeler.saveXML({ format: true }).then((r) => r.xml);

async function abrir(i) {
  const d = diagramas[i];
  actual = i;
  for (const [j, b] of [...tabs.children].entries()) b.classList.toggle('activa', j === i);
  $('#titulo').textContent = d.titulo;
  $('#resumen').textContent = d.resumen;
  try {
    const { warnings } = await modeler.importXML(d.xml);
    modeler.get('canvas').zoom('fit-viewport', 'auto');
    $('#estado').textContent = warnings.length ? `Importado con ${warnings.length} advertencias` : 'Diagrama cargado sin advertencias';
    window.__ultimoImport = { archivo: d.archivo, warnings: warnings.map((w) => w.message) };
  } catch (e) {
    $('#estado').textContent = `Error al importar: ${e.message}`;
    window.__ultimoImport = { archivo: d.archivo, error: String(e) };
  }
}

diagramas.forEach((d, i) => {
  const b = document.createElement('button');
  b.textContent = d.archivo.replace(/_/g, ' ').replace(/^(\d+)/, '$1 -');
  b.title = d.titulo;
  b.onclick = () => abrir(i);
  tabs.append(b);
});

$('#descargar').onclick = async () => {
  const xml = await xmlActual();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
  a.download = `${diagramas[actual].archivo}.bpmn`;
  a.click();
};
$('#ajustar').onclick = () => modeler.get('canvas').zoom('fit-viewport', 'auto');
$('#guia-btn').onclick = () => $('#guia').classList.toggle('abierta');
window.__abrir = abrir;
window.__exportarSVG = async () => (await modeler.saveSVG()).svg;

abrir(0);
