/**
 * Validador de los diagramas BPMN (docs/bpmn/*.bpmn). Uso: npm run bpmn:validate
 *  1. XML válido según bpmn-moddle (sin advertencias de importación).
 *  2. Estructura: inicios/finales, alcanzabilidad, compuertas, etiquetas de decisiones, ids únicos.
 *  3. Geometría (BPMNDI): sin solapes, elementos dentro de su carril, líneas que no atraviesan elementos, texto que cabe.
 *  4. Simulación tipo "token game" (300 corridas aleatorias por diagrama): todo diagrama termina sin bloqueos ni fichas perdidas
 *     y cada elemento se recorre al menos una vez (cobertura).
 */
import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync } from 'node:fs';
import BpmnModdle from 'bpmn-moddle';

const DIR = fileURLToPath(new URL('../docs/bpmn/', import.meta.url));
const archivos = readdirSync(DIR).filter((f) => f.endsWith('.bpmn')).sort();
const moddle = new BpmnModdle();
let totalErrores = 0;
let totalAvisos = 0;

const tipoDe = (e) => e.$type.replace('bpmn:', '');
const esTarea = (e) => ['Task', 'UserTask', 'ServiceTask', 'ManualTask', 'BusinessRuleTask', 'SendTask', 'ReceiveTask', 'ScriptTask', 'CallActivity', 'SubProcess'].includes(tipoDe(e));
const esGateway = (e) => tipoDe(e).endsWith('Gateway');

function recolectar(definitions) {
  const procesos = definitions.rootElements.filter((r) => r.$type === 'bpmn:Process');
  const colab = definitions.rootElements.find((r) => r.$type === 'bpmn:Collaboration');
  const nodos = new Map();
  const flujos = [];
  for (const p of procesos) {
    for (const fe of p.flowElements ?? []) {
      if (fe.$type === 'bpmn:SequenceFlow') flujos.push(fe);
      else nodos.set(fe.id, { el: fe, proceso: p });
    }
    for (const a of p.artifacts ?? []) nodos.set(a.id, { el: a, proceso: p });
  }
  const mensajes = colab?.messageFlows ?? [];
  return { procesos, colab, nodos, flujos, mensajes };
}

/* ------------- 2. estructura ------------- */
function estructura(nombre, def, info, err, aviso) {
  const { nodos, flujos, mensajes } = info;
  const ids = new Set();
  const dup = (id) => (ids.has(id) ? err(`id duplicado ${id}`) : ids.add(id));
  for (const [id] of nodos) dup(id);
  const entrantes = new Map();
  const salientes = new Map();
  for (const f of flujos) {
    if (!nodos.has(f.sourceRef?.id) || !nodos.has(f.targetRef?.id)) { err(`flujo ${f.id} con extremos inexistentes`); continue; }
    if (f.sourceRef.$parent !== f.targetRef.$parent) err(`flujo ${f.id} cruza procesos (debería ser un flujo de mensaje)`);
    (salientes.get(f.sourceRef.id) ?? salientes.set(f.sourceRef.id, []).get(f.sourceRef.id)).push(f);
    (entrantes.get(f.targetRef.id) ?? entrantes.set(f.targetRef.id, []).get(f.targetRef.id)).push(f);
  }
  const msgIn = new Map();
  const msgOut = new Map();
  for (const m of mensajes) {
    if (m.sourceRef.$parent === m.targetRef.$parent) err(`flujo de mensaje ${m.id} dentro del mismo proceso`);
    (msgOut.get(m.sourceRef.id) ?? msgOut.set(m.sourceRef.id, []).get(m.sourceRef.id)).push(m);
    (msgIn.get(m.targetRef.id) ?? msgIn.set(m.targetRef.id, []).get(m.targetRef.id)).push(m);
  }
  for (const [id, { el }] of nodos) {
    const t = tipoDe(el);
    if (['TextAnnotation', 'Association', 'DataStoreReference'].includes(t)) continue;
    const ent = entrantes.get(id)?.length ?? 0;
    const sal = salientes.get(id)?.length ?? 0;
    const conMsgEntrada = (msgIn.get(id)?.length ?? 0) > 0;
    if (t === 'StartEvent') {
      if (ent) err(`${id}: un evento de inicio no debe tener flujos entrantes`);
      if (!sal) err(`${id}: inicio sin salida`);
      if (el.eventDefinitions?.some((d) => d.$type === 'bpmn:MessageEventDefinition') && !conMsgEntrada) err(`${id}: inicio por mensaje sin flujo de mensaje entrante`);
    } else if (t === 'EndEvent') {
      if (sal) err(`${id}: un fin no debe tener salida`);
      if (!ent) err(`${id}: fin sin entrada`);
    } else if (t === 'BoundaryEvent') {
      if (!sal) err(`${id}: evento de borde sin salida`);
      if (ent) err(`${id}: evento de borde con entrada`);
    } else {
      if (!ent) err(`${id}: sin flujo entrante (inalcanzable)`);
      if (!sal) err(`${id}: sin flujo saliente (proceso bloqueado)`);
    }
    if (t === 'ExclusiveGateway' && sal > 1) {
      for (const f of salientes.get(id)) if (!f.name) err(`${id}: la salida ${f.id} de una decisión debe tener etiqueta`);
      if (!el.name) aviso(`${id}: la decisión no tiene pregunta`);
    }
    if (esTarea(el) && sal > 1) aviso(`${id}: la tarea tiene ${sal} salidas (división implícita)`);
    if (esTarea(el) && ent > 1) aviso(`${id}: la tarea tiene ${ent} entradas (mezcla implícita; usa una compuerta)`);
    if (t === 'ReceiveTask' || t === 'SendTask') {
      if (t === 'ReceiveTask' && !conMsgEntrada) aviso(`${id}: tarea de recepción sin mensaje entrante`);
      if (t === 'SendTask' && !(msgOut.get(id)?.length)) aviso(`${id}: tarea de envío sin mensaje saliente`);
    }
    if (!el.name && !esGateway(el) && !['StartEvent', 'EndEvent'].includes(t) && t !== 'IntermediateCatchEvent') aviso(`${id}: sin nombre`);
    if (['UserTask', 'ServiceTask', 'BusinessRuleTask'].includes(t) && !(el.documentation?.length)) aviso(`${id}: sin documentación (trazabilidad)`);
  }
  // alcanzabilidad desde inicios y hacia finales
  const arrancan = [...nodos.values()].filter(({ el }) => tipoDe(el) === 'StartEvent').map(({ el }) => el.id);
  const alcanza = new Set(arrancan);
  const cola = [...arrancan];
  const adj = new Map();
  for (const f of flujos) (adj.get(f.sourceRef.id) ?? adj.set(f.sourceRef.id, []).get(f.sourceRef.id)).push(f.targetRef.id);
  for (const [id, { el }] of nodos) if (tipoDe(el) === 'BoundaryEvent') (adj.get(el.attachedToRef.id) ?? adj.set(el.attachedToRef.id, []).get(el.attachedToRef.id)).push(id);
  for (const m of mensajes) (adj.get(m.sourceRef.id) ?? adj.set(m.sourceRef.id, []).get(m.sourceRef.id)).push(m.targetRef.id);
  while (cola.length) {
    const x = cola.pop();
    for (const y of adj.get(x) ?? []) if (!alcanza.has(y)) { alcanza.add(y); cola.push(y); }
  }
  for (const [id, { el }] of nodos) if (!['TextAnnotation', 'Association'].includes(tipoDe(el)) && !alcanza.has(id)) err(`${id}: inalcanzable desde un inicio`);
  const ends = [...nodos.values()].filter(({ el }) => tipoDe(el) === 'EndEvent').map(({ el }) => el.id);
  const radj = new Map();
  for (const [a, bs] of adj) for (const b of bs) (radj.get(b) ?? radj.set(b, []).get(b)).push(a);
  const llega = new Set(ends);
  const c2 = [...ends];
  while (c2.length) {
    const x = c2.pop();
    for (const y of radj.get(x) ?? []) if (!llega.has(y)) { llega.add(y); c2.push(y); }
  }
  for (const [id, { el }] of nodos) if (!['TextAnnotation', 'Association'].includes(tipoDe(el)) && !llega.has(id)) err(`${id}: no conduce a ningún fin`);
  return { adj, salientes, entrantes, msgIn, msgOut };
}

/* ------------- 3. geometría ------------- */
function geometria(nombre, def, info, err, aviso) {
  const plane = def.diagrams[0].plane;
  const formas = new Map();
  const aristas = [];
  for (const pe of plane.planeElement) {
    if (pe.$type === 'bpmndi:BPMNShape') formas.set(pe.bpmnElement.id, { ...pe.bounds, id: pe.bpmnElement.id, el: pe.bpmnElement });
    else if (pe.$type === 'bpmndi:BPMNEdge') aristas.push({ id: pe.bpmnElement.id, el: pe.bpmnElement, pts: pe.waypoint });
  }
  const caja = (b, m = 0) => ({ x0: b.x - m, y0: b.y - m, x1: b.x + b.width + m, y1: b.y + b.height + m });
  const inter = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  const contenedores = new Set(['bpmn:Participant', 'bpmn:Lane']);
  const elementos = [...formas.values()].filter((f) => !contenedores.has(f.el.$type));
  // sin faltantes
  for (const [id, { el }] of info.nodos) if (!formas.has(id) && el.$type !== 'bpmn:Association') err(`${id}: sin forma BPMNDI`);
  for (const f of info.flujos) if (!aristas.some((a) => a.id === f.id)) err(`${f.id}: sin arista BPMNDI`);
  // solapes entre elementos
  for (let i = 0; i < elementos.length; i++) {
    for (let j = i + 1; j < elementos.length; j++) {
      const a = elementos[i];
      const b = elementos[j];
      const bordeAdj = (x, y) => x.el.$type === 'bpmn:BoundaryEvent' && x.el.attachedToRef.id === y.id;
      if (bordeAdj(a, b) || bordeAdj(b, a)) continue;
      if (inter(caja(a, 0), caja(b, 0))) err(`solape entre ${a.id} y ${b.id}`);
    }
  }
  // carriles: cada elemento dentro de su carril (los eventos de borde pueden sobresalir hasta 18px de su tarea)
  const lanes = [...formas.values()].filter((f) => f.el.$type === 'bpmn:Lane');
  for (const l of lanes) {
    for (const ref of l.el.flowNodeRef ?? []) {
      const f = formas.get(ref.id);
      if (!f) continue;
      if (f.y < l.y || f.y + f.height > l.y + l.height || f.x < l.x) err(`${ref.id} sale del carril "${l.el.name}"`);
    }
  }
  for (const p of [...formas.values()].filter((f) => f.el.$type === 'bpmn:Participant')) {
    for (const f of elementos) {
      if (f.el.$parent && info.nodos.get(f.id)?.proceso && p.el.processRef === info.nodos.get(f.id).proceso) {
        if (f.x < p.x + 30 || f.x + f.width > p.x + p.width || f.y < p.y || f.y + f.height > p.y + p.height) err(`${f.id} sale de la piscina "${p.el.name}"`);
      }
    }
  }
  // líneas vs elementos
  const cruza = (p1, p2, c) => {
    const x0 = Math.min(p1.x, p2.x), x1 = Math.max(p1.x, p2.x), y0 = Math.min(p1.y, p2.y), y1 = Math.max(p1.y, p2.y);
    return x0 < c.x1 && x1 > c.x0 && y0 < c.y1 && y1 > c.y0;
  };
  for (const a of aristas) {
    const src = a.el.sourceRef?.id;
    const dst = a.el.targetRef?.id;
    for (let i = 0; i < a.pts.length - 1; i++) {
      const p1 = a.pts[i], p2 = a.pts[i + 1];
      if (p1.x !== p2.x && p1.y !== p2.y) aviso(`${a.id}: tramo diagonal (${p1.x},${p1.y})->(${p2.x},${p2.y})`);
      for (const f of elementos) {
        if (f.id === src || f.id === dst) continue;
        if (a.el.$type === 'bpmn:SequenceFlow' && a.el.sourceRef.$type === 'bpmn:BoundaryEvent' && a.el.sourceRef.attachedToRef.id === f.id) continue;
        if (f.el.$type === 'bpmn:TextAnnotation' && a.el.$type !== 'bpmn:SequenceFlow') continue;
        if (cruza(p1, p2, caja(f, -1))) err(`${a.id} atraviesa ${f.id} (tramo ${i + 1})`);
      }
    }
    // extremos sobre el borde de los elementos
    const s = formas.get(src);
    const d = formas.get(dst);
    const toca = (pt, b) => b && pt.x >= b.x - 2 && pt.x <= b.x + b.width + 2 && pt.y >= b.y - 2 && pt.y <= b.y + b.height + 2;
    if (a.el.$type !== 'bpmn:Association') {
      if (!toca(a.pts[0], s)) err(`${a.id}: el inicio de la línea no toca ${src}`);
      if (!toca(a.pts[a.pts.length - 1], d)) err(`${a.id}: el final de la línea no toca ${dst}`);
    }
  }
  // texto que cabe en tareas
  for (const f of elementos) {
    if (!esTarea(f.el) || !f.el.name) continue;
    const palabras = f.el.name.split(/\s+/);
    const ancho = Math.floor((f.width - 14) / 6.3);
    let lineas = 1, actual = 0;
    for (const w of palabras) {
      if (actual && actual + 1 + w.length > ancho) { lineas++; actual = w.length; } else actual += (actual ? 1 : 0) + w.length;
    }
    const max = Math.floor((f.height - 10) / 14.5);
    if (lineas > max) err(`${f.id}: el texto necesita ${lineas} líneas y solo caben ${max} (aumenta h/w)`);
  }
  for (const f of elementos) {
    if (f.el.$type === 'bpmn:TextAnnotation') {
      const t = f.el.text ?? '';
      const ancho = Math.floor((f.width - 12) / 6.3);
      const lineas = Math.ceil(t.length / (ancho * 0.92));
      const max = Math.floor((f.height - 8) / 14.5);
      if (lineas > max) err(`${f.id}: la nota necesita ~${lineas} líneas y solo caben ${max}`);
    }
  }
}

/* ------------- 4. simulación ------------- */
function simular(nombre, def, info, err, aviso, corridas = 300) {
  const { nodos, flujos, mensajes } = info;
  const sal = new Map(), ent = new Map();
  for (const f of flujos) {
    (sal.get(f.sourceRef.id) ?? sal.set(f.sourceRef.id, []).get(f.sourceRef.id)).push(f);
    (ent.get(f.targetRef.id) ?? ent.set(f.targetRef.id, []).get(f.targetRef.id)).push(f);
  }
  const msgSal = new Map(), msgEnt = new Map();
  for (const m of mensajes) {
    (msgSal.get(m.sourceRef.id) ?? msgSal.set(m.sourceRef.id, []).get(m.sourceRef.id)).push(m);
    (msgEnt.get(m.targetRef.id) ?? msgEnt.set(m.targetRef.id, []).get(m.targetRef.id)).push(m);
  }
  const bordes = new Map();
  for (const [id, { el }] of nodos) if (tipoDe(el) === 'BoundaryEvent') (bordes.get(el.attachedToRef.id) ?? bordes.set(el.attachedToRef.id, []).get(el.attachedToRef.id)).push(id);
  // distancia a un fin (para sesgar las decisiones hacia la terminación)
  const dist = new Map();
  const ends = [...nodos.values()].filter(({ el }) => tipoDe(el) === 'EndEvent').map(({ el }) => el.id);
  const radj = new Map();
  for (const f of flujos) (radj.get(f.targetRef.id) ?? radj.set(f.targetRef.id, []).get(f.targetRef.id)).push(f.sourceRef.id);
  for (const [id, { el }] of nodos) if (tipoDe(el) === 'BoundaryEvent') (radj.get(id) ?? radj.set(id, []).get(id)).push(el.attachedToRef.id);
  const q = [...ends];
  ends.forEach((e) => dist.set(e, 0));
  while (q.length) {
    const x = q.shift();
    for (const y of radj.get(x) ?? []) if (!dist.has(y)) { dist.set(y, dist.get(x) + 1); q.push(y); }
  }
  const visitados = new Set();
  const flujosTomados = new Set();
  let ok = 0;
  let semilla = 12345;
  const rnd = () => ((semilla = (semilla * 1664525 + 1013904223) >>> 0) / 4294967296);

  for (let run = 0; run < corridas; run++) {
    // fichas en aristas: id de flujo -> cantidad; fichas "en curso" en tareas/eventos: nodo -> cantidad
    const enFlujo = new Map();
    const enNodo = new Map();
    const buzon = new Map(); // id de flujo de mensaje -> cantidad
    const muertos = new Set();
    const terminados = new Set();
    const add = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
    for (const [id, { el }] of nodos) {
      if (tipoDe(el) === 'StartEvent' && !(el.eventDefinitions?.length)) add(enNodo, id);
    }
    let pasos = 0;
    const llegarA = (fid) => add(enFlujo, fid);
    const salirPor = (id, fs) => fs.forEach((f) => llegarA(f.id));
    const sesgo = 0.55 + (run % 5) * 0.1; // probabilidad de elegir la salida más cercana a un fin
    while (pasos++ < 2000) {
      const acciones = [];
      // fichas en flujos -> activan nodos destino
      for (const [fid, n] of enFlujo) {
        if (n <= 0) continue;
        const f = flujos.find((x) => x.id === fid);
        const dst = f.targetRef;
        const t = tipoDe(dst);
        if (t === 'ParallelGateway') {
          const entradas = ent.get(dst.id) ?? [];
          if (entradas.every((e) => (enFlujo.get(e.id) ?? 0) > 0)) acciones.push({ tipo: 'join', nodo: dst.id, entradas });
        } else {
          acciones.push({ tipo: 'entrar', flujo: fid, nodo: dst.id });
        }
      }
      for (const [id, n] of enNodo) if (n > 0) acciones.push({ tipo: 'nodo', nodo: id });
      for (const m of mensajes) {
        // mensaje pendiente que arranca un proceso (inicio por mensaje)
        const dst = m.targetRef;
        if (tipoDe(dst) === 'StartEvent' && (buzon.get(m.id) ?? 0) > 0) acciones.push({ tipo: 'inicioMsg', msg: m.id, nodo: dst.id });
      }
      if (!acciones.length) break;
      // preferir acciones que no sean "nodo" bloqueado por mensaje (se filtran abajo)
      const habilitadas = [];
      for (const a of acciones) {
        if (a.tipo === 'nodo') {
          const el = nodos.get(a.nodo).el;
          const t = tipoDe(el);
          const espera = t === 'ReceiveTask' || (t === 'IntermediateCatchEvent' && el.eventDefinitions?.[0]?.$type === 'bpmn:MessageEventDefinition');
          if (espera) {
            const ms = msgEnt.get(a.nodo) ?? [];
            if (!ms.some((m) => (buzon.get(m.id) ?? 0) > 0)) continue;
          }
          if (t === 'EventBasedGateway') {
            const opciones = (sal.get(a.nodo) ?? []).filter((f) => {
              const d = f.targetRef;
              if (d.eventDefinitions?.[0]?.$type === 'bpmn:MessageEventDefinition') return (msgEnt.get(d.id) ?? []).some((m) => (buzon.get(m.id) ?? 0) > 0);
              return true;
            });
            if (!opciones.length) continue;
          }
        }
        habilitadas.push(a);
      }
      if (!habilitadas.length) break;
      const a = habilitadas[Math.floor(rnd() * habilitadas.length)];
      if (a.tipo === 'entrar') {
        enFlujo.set(a.flujo, enFlujo.get(a.flujo) - 1);
        add(enNodo, a.nodo);
      } else if (a.tipo === 'join') {
        for (const e of a.entradas) enFlujo.set(e.id, enFlujo.get(e.id) - 1);
        add(enNodo, a.nodo);
      } else if (a.tipo === 'inicioMsg') {
        buzon.set(a.msg, buzon.get(a.msg) - 1);
        add(enNodo, a.nodo);
      } else {
        const id = a.nodo;
        const el = nodos.get(id).el;
        const t = tipoDe(el);
        visitados.add(id);
        // temporizador de borde: puede disparar en lugar de completar la tarea
        const bs = bordes.get(id) ?? [];
        let disparo = null;
        if (bs.length && rnd() < 0.3) disparo = bs[Math.floor(rnd() * bs.length)];
        if (disparo) {
          enNodo.set(id, enNodo.get(id) - 1);
          visitados.add(disparo);
          salirPor(disparo, sal.get(disparo) ?? []);
          continue;
        }
        enNodo.set(id, enNodo.get(id) - 1);
        // mensajes de salida
        for (const m of msgSal.get(id) ?? []) add(buzon, m.id);
        // consumir mensaje de entrada
        if (t === 'ReceiveTask' || (t === 'IntermediateCatchEvent' && el.eventDefinitions?.[0]?.$type === 'bpmn:MessageEventDefinition') || t === 'StartEvent') {
          const ms = (msgEnt.get(id) ?? []).filter((m) => (buzon.get(m.id) ?? 0) > 0);
          if (ms.length) buzon.set(ms[0].id, buzon.get(ms[0].id) - 1);
        }
        const salidas = sal.get(id) ?? [];
        if (t === 'EndEvent') {
          terminados.add(id);
          if (el.eventDefinitions?.some((d) => d.$type === 'bpmn:TerminateEventDefinition')) {
            for (const k of [...enNodo.keys()]) enNodo.set(k, 0);
            for (const k of [...enFlujo.keys()]) enFlujo.set(k, 0);
          }
        } else if (t === 'ExclusiveGateway') {
          if (!salidas.length) continue;
          let elegido;
          const nuevas = salidas.filter((f) => !flujosTomados.has(f.id));
          if (salidas.length === 1) elegido = salidas[0];
          else if (nuevas.length && rnd() < 0.5) elegido = nuevas[Math.floor(rnd() * nuevas.length)];
          else if (rnd() < sesgo) {
            elegido = [...salidas].sort((x, y) => (dist.get(x.targetRef.id) ?? 999) - (dist.get(y.targetRef.id) ?? 999))[0];
          } else elegido = salidas[Math.floor(rnd() * salidas.length)];
          flujosTomados.add(elegido.id);
          llegarA(elegido.id);
        } else if (t === 'EventBasedGateway') {
          const opciones = salidas.filter((f) => {
            const d = f.targetRef;
            if (d.eventDefinitions?.[0]?.$type === 'bpmn:MessageEventDefinition') return (msgEnt.get(d.id) ?? []).some((m) => (buzon.get(m.id) ?? 0) > 0);
            return true;
          });
          llegarA(opciones[Math.floor(rnd() * opciones.length)].id);
        } else {
          salirPor(id, salidas);
        }
      }
    }
    // veredicto de la corrida
    const restantesNodo = [...enNodo.entries()].filter(([, n]) => n > 0);
    const restantesFlujo = [...enFlujo.entries()].filter(([, n]) => n > 0);
    const esperandoOk = (id) => {
      // fichas que esperan un mensaje que otra rama no enviará (p. ej. rama alternativa) se consideran error igualmente
      void id;
      return false;
    };
    if (pasos >= 2000) err(`simulación #${run}: no termina en 2000 pasos (posible lazo infinito)`);
    else if (restantesNodo.length || restantesFlujo.length) {
      if (![...restantesNodo].every(([id]) => esperandoOk(id)) || restantesFlujo.length) {
        err(`simulación #${run}: quedaron fichas sin consumir -> ${[...restantesNodo, ...restantesFlujo].map(([k, n]) => `${k}x${n}`).join(', ')}`);
      }
    } else if (!terminados.size) err(`simulación #${run}: ningún evento de fin alcanzado`);
    else ok++;
    if (totalErroresSim(err) > 3) break;
  }
  const noVisitados = [...nodos.values()].filter(({ el }) => !['TextAnnotation', 'Association'].includes(tipoDe(el)) && tipoDe(el) !== 'EndEvent' && !visitados.has(el.id)).map(({ el }) => el.id);
  for (const id of noVisitados) err(`cobertura: ${id} nunca fue recorrido en ${corridas} corridas`);
  for (const [id, { el }] of nodos) {
    if (tipoDe(el) !== 'ExclusiveGateway') continue;
    for (const f of sal.get(id) ?? []) if ((sal.get(id) ?? []).length > 1 && !flujosTomados.has(f.id)) err(`cobertura: la rama "${f.name}" (${f.id}) de ${id} nunca fue tomada`);
  }
  return { ok, corridas, visitados: visitados.size };
}
let contadorSim = 0;
const totalErroresSim = () => contadorSim;

/* ------------- main ------------- */
for (const archivo of archivos) {
  const xml = readFileSync(DIR + archivo, 'utf8');
  const errores = [];
  const avisos = [];
  const err = (m) => errores.push(m);
  const aviso = (m) => avisos.push(m);
  let def;
  try {
    const r = await moddle.fromXML(xml);
    def = r.rootElement;
    for (const w of r.warnings ?? []) err(`moddle: ${w.message}`);
  } catch (e) {
    console.log(`FALLO ${archivo}: XML inválido - ${e.message}`);
    totalErrores++;
    continue;
  }
  const info = recolectar(def);
  estructura(archivo, def, info, err, aviso);
  geometria(archivo, def, info, err, aviso);
  const r = simular(archivo, def, info, err, aviso);
  totalErrores += errores.length;
  totalAvisos += avisos.length;
  const marca = errores.length ? 'FALLO' : 'ok';
  console.log(`${marca} ${archivo}: ${info.nodos.size} elementos, ${info.flujos.length} flujos, ${info.mensajes.length} mensajes - simulación ${r.ok}/${r.corridas} corridas limpias, ${r.visitados} elementos recorridos`);
  for (const e of errores.slice(0, 40)) console.log(`    FALLO ${e}`);
  if (errores.length > 40) console.log(`    ... y ${errores.length - 40} errores más`);
  for (const a of avisos.slice(0, 15)) console.log(`    ⚠ ${a}`);
}
console.log(`\n${totalErrores === 0 ? 'BPMN OK' : 'BPMN CON ERRORES'} - ${totalErrores} errores, ${totalAvisos} avisos`);
process.exit(totalErrores ? 1 : 0);
