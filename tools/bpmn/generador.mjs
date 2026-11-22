/**
 * Mini-DSL -> BPMN 2.0 XML (con BPMNDI) para los diagramas del Apuntado.
 * Objetivo: que los .bpmn se abran SIN retoques en bpmn.io / Camunda Modeler / Signavio y se puedan simular
 * (bpmn-js-token-simulation). El layout es una rejilla: carril (fila) x columna (paso del proceso).
 */

const NS = {
  bpmn: 'http://www.omg.org/spec/BPMN/20100524/MODEL',
  bpmndi: 'http://www.omg.org/spec/BPMN/20100524/DI',
  dc: 'http://www.omg.org/spec/DD/20100524/DC',
  di: 'http://www.omg.org/spec/DD/20100524/DI',
  xsi: 'http://www.w3.org/2001/XMLSchema-instance',
};

export const TAM = {
  inicio: [36, 36], inicioMsg: [36, 36], fin: [36, 36], finTerminar: [36, 36], timer: [36, 36], msgCatch: [36, 36], msgThrow: [36, 36], limite: [36, 36],
  xor: [50, 50], and: [50, 50], evento: [50, 50],
  usuario: [150, 80], servicio: [150, 80], regla: [150, 80], manual: [150, 80], envio: [150, 80], recepcion: [150, 80], tarea: [150, 80], llamada: [150, 80],
  datastore: [50, 50], nota: [190, 60],
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const TAREAS = { usuario: 'userTask', servicio: 'serviceTask', regla: 'businessRuleTask', manual: 'manualTask', envio: 'sendTask', recepcion: 'receiveTask', tarea: 'task' };
const esGateway = (t) => t === 'xor' || t === 'and' || t === 'evento';
const esEvento = (t) => ['inicio', 'inicioMsg', 'fin', 'finTerminar', 'timer', 'msgCatch', 'msgThrow', 'limite'].includes(t);

/** Normaliza un modelo: calcula geometría de pools, carriles y nodos. */
export function componer(modelo) {
  const cfg = { colW: modelo.colW ?? 190, x0: modelo.x0 ?? 170, margenPool: 40 };
  let yPool = 0;
  const geom = { participantes: [], nodos: new Map(), todosLosNodos: [] };
  for (const p of modelo.participantes) {
    const lanes = p.lanes ?? [{ id: `${p.id}_lane`, nombre: '', h: p.h ?? 200, implicito: true }];
    let yLane = yPool;
    const lanesG = lanes.map((l) => {
      const h = l.h ?? 180;
      const g = { ...l, top: yLane, h, cy: yLane + h / 2 };
      yLane += h;
      return g;
    });
    const maxCol = Math.max(...p.nodos.map((n) => n.col ?? 0), 0);
    const ancho = p.ancho ?? cfg.x0 + maxCol * cfg.colW + 130;
    const pg = { ...p, lanes: lanesG, top: yPool, h: yLane - yPool, w: ancho, left: 0 };
    const cabecera = p.lanes ? 60 : 30;
    for (const n of p.nodos) {
      const [w0, h0] = TAM[n.tipo] ?? [150, 80];
      const w = n.w ?? w0;
      const h = n.h ?? h0;
      const lane = lanesG.find((l) => l.id === n.lane) ?? lanesG[0];
      const cx = n.x ?? cfg.x0 + (n.col ?? 0) * cfg.colW + (n.dx && n.tipo !== 'limite' ? n.dx : 0);
      const cy = n.y ?? lane.cy + (n.dy ?? 0);
      const g = { ...n, w, h, cx, cy, left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, bottom: cy + h / 2, participante: p.id, laneId: lane.id };
      geom.nodos.set(n.id, g);
      geom.todosLosNodos.push(g);
    }
    // boundary events: se posicionan sobre el borde inferior de su tarea (o superior)
    for (const n of p.nodos.filter((x) => x.tipo === 'limite')) {
      const host = geom.nodos.get(n.adjunto);
      if (!host) throw new Error(`limite ${n.id}: adjunto inexistente ${n.adjunto}`);
      const g = geom.nodos.get(n.id);
      const dx = n.dx ?? host.w / 2 - 30;
      g.cx = host.cx + dx;
      g.cy = n.arriba ? host.top : host.bottom;
      g.left = g.cx - 18; g.right = g.cx + 18; g.top = g.cy - 18; g.bottom = g.cy + 18;
    }
    void cabecera;
    geom.participantes.push(pg);
    yPool += pg.h + cfg.margenPool + (p.espacioDespues ?? 0);
  }
  return { cfg, geom };
}

/* --------- ruteo de flujos --------- */
const pt = (x, y) => ({ x: Math.round(x), y: Math.round(y) });

function ladoDe(b, hacia) {
  const dx = hacia.x - b.cx;
  const dy = hacia.y - b.cy;
  if (Math.abs(dx) * b.h >= Math.abs(dy) * b.w) return dx >= 0 ? pt(b.right, b.cy) : pt(b.left, b.cy);
  return dy >= 0 ? pt(b.cx, b.bottom) : pt(b.cx, b.top);
}

export function rutaSecuencia(S, T, o = {}) {
  const tol = 6;
  if (o.via) {
    const primero = o.via[0];
    const ultimo = o.via[o.via.length - 1];
    return [ladoDe(S, { x: primero[0], y: primero[1] }), ...o.via.map(([x, y]) => pt(x, y)), ladoDe(T, { x: ultimo[0], y: ultimo[1] })];
  }
  if (S.tipo === 'limite') {
    const s0 = pt(S.cx, S.bottom);
    if (T.left > S.cx + 10) return [s0, pt(S.cx, T.cy), pt(T.left, T.cy)];
    const midy = (S.bottom + T.top) / 2;
    return [s0, pt(S.cx, midy), pt(T.cx, midy), pt(T.cx, T.top)];
  }
  const dx = T.cx - S.cx;
  const dy = T.cy - S.cy;
  if (Math.abs(dx) <= tol) return dy >= 0 ? [pt(S.cx, S.bottom), pt(T.cx, T.top)] : [pt(S.cx, S.top), pt(T.cx, T.bottom)];
  if (dx > 0) {
    if (Math.abs(dy) <= tol) return [pt(S.right, S.cy), pt(T.left, T.cy)];
    if (esGateway(S.tipo) && o.sale !== 'derecha') {
      const arriba = dy < 0;
      return [pt(S.cx, arriba ? S.top : S.bottom), pt(S.cx, T.cy), pt(T.left, T.cy)];
    }
    if (esGateway(T.tipo) && o.entra === 'vertical') {
      return [pt(S.right, S.cy), pt(T.cx, S.cy), pt(T.cx, dy >= 0 ? T.top : T.bottom)];
    }
    const mx = o.mx ?? S.right + (T.left - S.right) / 2;
    return [pt(S.right, S.cy), pt(mx, S.cy), pt(mx, T.cy), pt(T.left, T.cy)];
  }
  // retorno (lazo)
  const k = o.k ?? 0;
  if (o.lado === 'fondo' && o.ctx) {
    const yF = o.ctx.poolBottom + 30 + k * 16;
    return [pt(S.cx, S.bottom), pt(S.cx, yF), pt(T.cx, yF), pt(T.cx, T.bottom)];
  }
  if (o.lado === 'tope' && o.ctx) {
    const yF = o.ctx.poolTop - 30 - k * 16;
    return [pt(S.cx, S.top), pt(S.cx, yF), pt(T.cx, yF), pt(T.cx, T.top)];
  }
  if ((o.lado ?? 'abajo') === 'abajo') {
    const yL = Math.max(S.bottom, T.bottom) + 34 + k * 16;
    return [pt(S.cx, S.bottom), pt(S.cx, yL), pt(T.cx, yL), pt(T.cx, T.bottom)];
  }
  const yL = Math.min(S.top, T.top) - 34 - k * 16;
  return [pt(S.cx, S.top), pt(S.cx, yL), pt(T.cx, yL), pt(T.cx, T.top)];
}

export function rutaMensaje(S, T, o = {}) {
  if (o.via) {
    const p = o.via[0];
    const u = o.via[o.via.length - 1];
    return [ladoDe(S, { x: p[0], y: p[1] }), ...o.via.map(([x, y]) => pt(x, y)), ladoDe(T, { x: u[0], y: u[1] })];
  }
  const abajo = T.cy > S.cy;
  const sy = abajo ? S.bottom : S.top;
  const ty = abajo ? T.top : T.bottom;
  if (Math.abs(S.cx - T.cx) <= 4) return [pt(S.cx, sy), pt(T.cx, ty)];
  const my = o.my ?? (sy + ty) / 2;
  return [pt(S.cx, sy), pt(S.cx, my), pt(T.cx, my), pt(T.cx, ty)];
}

/** Permite escribir via/mx en términos de rejilla: {col, lane, dy, dx}. */
function resolver(v, geom, cfg, p) {
  if (v === undefined || v === null) return v;
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) return v.map((e) => (Array.isArray(e) ? e : resolverPunto(e, geom, cfg, p)));
  if (typeof v === 'object') return cfg.x0 + v.col * cfg.colW + (v.dx ?? 0);
  return v;
}
function resolverPunto(e, geom, cfg, p) {
  const x = cfg.x0 + e.col * cfg.colW + (e.dx ?? 0);
  const lane = (e.pool ? geom.participantes.find((q) => q.id === e.pool) : p).lanes.find((l) => l.id === e.lane) ?? p.lanes[0];
  return [x, lane.cy + (e.dy ?? 0)];
}

/* --------- XML --------- */
function definicionEvento(n) {
  switch (n.tipo) {
    case 'inicioMsg':
    case 'msgCatch':
    case 'msgThrow':
      return '<bpmn:messageEventDefinition />';
    case 'timer':
    case 'limite':
      return `<bpmn:timerEventDefinition><bpmn:timeDuration xsi:type="bpmn:tFormalExpression">${esc(n.duracion ?? 'PT60S')}</bpmn:timeDuration></bpmn:timerEventDefinition>`;
    case 'finTerminar':
      return '<bpmn:terminateEventDefinition />';
    default:
      return '';
  }
}

export function docNodo(n) {
  const partes = [];
  if (n.doc) partes.push(n.doc);
  if (n.comp) partes.push(`Componente: ${n.comp}`);
  if (n.rf) partes.push(`Requisitos: ${n.rf}`);
  if (n.impl) partes.push(`Implementación: ${n.impl}`);
  return partes.join('\n');
}

function xmlNodo(n, inc, out, esParticipanteConLanes) {
  void esParticipanteConLanes;
  const doc = docNodo(n);
  const hijos = [];
  if (doc) hijos.push(`<bpmn:documentation>${esc(doc)}</bpmn:documentation>`);
  for (const i of inc) hijos.push(`<bpmn:incoming>${i}</bpmn:incoming>`);
  for (const o of out) hijos.push(`<bpmn:outgoing>${o}</bpmn:outgoing>`);
  const nombre = n.nombre ? ` name="${esc(n.nombre)}"` : '';
  const a = `id="${n.id}"${nombre}`;
  switch (n.tipo) {
    case 'inicio':
    case 'inicioMsg':
      return `<bpmn:startEvent ${a}>${hijos.join('')}${definicionEvento(n)}</bpmn:startEvent>`;
    case 'fin':
    case 'finTerminar':
      return `<bpmn:endEvent ${a}>${hijos.join('')}${definicionEvento(n)}</bpmn:endEvent>`;
    case 'timer':
    case 'msgCatch':
      return `<bpmn:intermediateCatchEvent ${a}>${hijos.join('')}${definicionEvento(n)}</bpmn:intermediateCatchEvent>`;
    case 'msgThrow':
      return `<bpmn:intermediateThrowEvent ${a}>${hijos.join('')}${definicionEvento(n)}</bpmn:intermediateThrowEvent>`;
    case 'limite':
      return `<bpmn:boundaryEvent ${a} attachedToRef="${n.adjunto}" cancelActivity="${n.interrumpe === false ? 'false' : 'true'}">${hijos.join('')}${definicionEvento(n)}</bpmn:boundaryEvent>`;
    case 'xor':
      return `<bpmn:exclusiveGateway ${a}${n.defecto ? ` default="${n.defecto}"` : ''}>${hijos.join('')}</bpmn:exclusiveGateway>`;
    case 'and':
      return `<bpmn:parallelGateway ${a}>${hijos.join('')}</bpmn:parallelGateway>`;
    case 'evento':
      return `<bpmn:eventBasedGateway ${a}>${hijos.join('')}</bpmn:eventBasedGateway>`;
    case 'llamada':
      return `<bpmn:callActivity ${a}${n.llama ? ` calledElement="${esc(n.llama)}"` : ''}>${hijos.join('')}</bpmn:callActivity>`;
    case 'datastore':
      return `<bpmn:dataStoreReference ${a} />`;
    default: {
      const el = TAREAS[n.tipo] ?? 'task';
      const extra = n.tipo === 'recepcion' ? ' instantiate="false"' : '';
      return `<bpmn:${el} ${a}${extra}>${hijos.join('')}</bpmn:${el}>`;
    }
  }
}

const bounds = (b) => `<dc:Bounds x="${Math.round(b.left)}" y="${Math.round(b.top)}" width="${b.w}" height="${b.h}" />`;
const waypoints = (w) => w.map((p) => `<di:waypoint x="${p.x}" y="${p.y}" />`).join('');

export function generarBpmn(modelo) {
  const { geom, cfg: cfgUso } = componer(modelo);
  const idDef = modelo.id;
  const shapes = [];
  const edges = [];
  const procesos = [];
  const errores = [];
  const rutas = []; // para el validador (colisiones)
  let flujoN = 0;

  // Pre-cálculo de rutas para saber qué lados de cada compuerta están ocupados (colocación de etiquetas)
  const lados = new Map();
  const marcar = (n, punto) => {
    const g = geom.nodos.get(n);
    const lado = punto.x <= g.left + 1 ? 'izq' : punto.x >= g.right - 1 ? 'der' : punto.y <= g.top + 1 ? 'arriba' : 'abajo';
    (lados.get(n) ?? lados.set(n, new Set()).get(n)).add(lado);
  };
  for (const p of geom.participantes) {
    for (const f of p.flujos ?? []) {
      const S = geom.nodos.get(f.de);
      const T = geom.nodos.get(f.a);
      if (!S || !T) continue;
      const w = rutaSecuencia(S, T, { ...f, via: resolver(f.via, geom, cfgUso, p), mx: typeof f.mx === 'object' ? resolver(f.mx, geom, cfgUso, p) : f.mx, ctx: { poolTop: p.top, poolBottom: p.top + p.h } });
      marcar(f.de, w[0]);
      marcar(f.a, w[w.length - 1]);
    }
  }
  for (const p of geom.participantes) {
    const pid = `Proceso_${p.id}`;
    const flujos = (p.flujos ?? []).map((f) => ({ ...f, id: f.id ?? `Flujo_${p.id}_${++flujoN}` }));
    const incoming = new Map();
    const outgoing = new Map();
    for (const f of flujos) {
      if (!geom.nodos.has(f.de)) errores.push(`flujo ${f.id}: origen inexistente ${f.de}`);
      if (!geom.nodos.has(f.a)) errores.push(`flujo ${f.id}: destino inexistente ${f.a}`);
      (outgoing.get(f.de) ?? outgoing.set(f.de, []).get(f.de)).push(f.id);
      (incoming.get(f.a) ?? incoming.set(f.a, []).get(f.a)).push(f.id);
    }
    const partes = [];
    if (p.lanes && !p.lanes[0]?.implicito) {
      const ls = p.lanes.map((l) => {
        const refs = geom.todosLosNodos.filter((n) => n.participante === p.id && n.laneId === l.id && n.tipo !== 'nota').map((n) => `<bpmn:flowNodeRef>${n.id}</bpmn:flowNodeRef>`);
        return `<bpmn:lane id="${l.id}" name="${esc(l.nombre)}">${refs.join('')}</bpmn:lane>`;
      });
      partes.push(`<bpmn:laneSet id="LaneSet_${p.id}">${ls.join('')}</bpmn:laneSet>`);
    }
    for (const n of p.nodos.filter((x) => x.tipo !== 'nota')) {
      partes.push(xmlNodo(n, incoming.get(n.id) ?? [], outgoing.get(n.id) ?? []));
    }
    for (const f of flujos) {
      const cond = f.cond ? `<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${esc(f.cond)}</bpmn:conditionExpression>` : '';
      partes.push(`<bpmn:sequenceFlow id="${f.id}" sourceRef="${f.de}" targetRef="${f.a}"${f.nombre ? ` name="${esc(f.nombre)}"` : ''}>${cond}</bpmn:sequenceFlow>`);
    }
    // notas (anotaciones de texto) + asociaciones
    for (const n of p.nodos.filter((x) => x.tipo === 'nota')) {
      partes.push(`<bpmn:textAnnotation id="${n.id}"><bpmn:text>${esc(n.nombre)}</bpmn:text></bpmn:textAnnotation>`);
      if (n.a) partes.push(`<bpmn:association id="Asoc_${n.id}" sourceRef="${n.id}" targetRef="${n.a}" />`);
    }
    // datastores: asociaciones de datos
    for (const d of p.datos ?? []) {
      const tarea = p.nodos.find((x) => x.id === d.desde);
      if (!tarea) continue;
      void tarea;
    }
    procesos.push(`<bpmn:process id="${pid}" name="${esc(p.nombre)}" isExecutable="false">${partes.join('')}</bpmn:process>`);

    // - DI
    shapes.push(`<bpmndi:BPMNShape id="Shape_${p.id}" bpmnElement="${p.id}" isHorizontal="true"><dc:Bounds x="${p.left}" y="${p.top}" width="${p.w}" height="${p.h}" /></bpmndi:BPMNShape>`);
    if (p.lanes && !p.lanes[0]?.implicito) {
      for (const l of p.lanes) {
        shapes.push(`<bpmndi:BPMNShape id="Shape_${l.id}" bpmnElement="${l.id}" isHorizontal="true"><dc:Bounds x="${p.left + 30}" y="${l.top}" width="${p.w - 30}" height="${l.h}" /></bpmndi:BPMNShape>`);
      }
    }
    for (const n of p.nodos) {
      const g = geom.nodos.get(n.id);
      let extra = '';
      if (esGateway(n.tipo) && n.nombre) {
        const usados = lados.get(n.id) ?? new Set();
        const pos = n.etiqueta ?? ['arriba', 'abajo', 'der', 'izq'].find((l) => !usados.has(l)) ?? 'arriba';
        const lw = pos === 'der' || pos === 'izq' ? 110 : 130, lh = 40;
        const lx = n.lx ?? (pos === 'izq' ? g.left - lw - 4 : pos === 'der' ? g.right + 4 : g.cx - lw / 2);
        const ly = n.ly ?? (pos === 'arriba' ? g.top - lh - 2 : pos === 'abajo' ? g.bottom + 2 : g.cy - lh / 2);
        extra = `<bpmndi:BPMNLabel><dc:Bounds x="${Math.round(lx)}" y="${Math.round(ly)}" width="${lw}" height="${lh}" /></bpmndi:BPMNLabel>`;
      }
      const marker = esGateway(n.tipo) && n.tipo === 'xor' ? ' isMarkerVisible="true"' : '';
      const expand = n.tipo === 'llamada' ? ' isExpanded="false"' : '';
      shapes.push(`<bpmndi:BPMNShape id="Shape_${n.id}" bpmnElement="${n.id}"${marker}${expand}>${bounds(g)}${extra}</bpmndi:BPMNShape>`);
      if (n.tipo === 'nota' && n.a) {
        const T = geom.nodos.get(n.a);
        let w, w2;
        const vertical = Math.abs(T.cy - g.cy) >= Math.abs(T.cx - g.cx) || Math.abs(T.cx - g.cx) < 4;
        if (vertical && Math.abs(T.cx - g.cx) >= 4) {
          const abajo = T.cy > g.cy;
          const my = (abajo ? g.bottom + T.top : g.top + T.bottom) / 2;
          const pts = [pt(g.cx, abajo ? g.bottom : g.top), pt(g.cx, my), pt(T.cx, my), pt(T.cx, abajo ? T.top : T.bottom)];
          edges.push(`<bpmndi:BPMNEdge id="Edge_Asoc_${n.id}" bpmnElement="Asoc_${n.id}">${waypoints(pts)}</bpmndi:BPMNEdge>`);
          continue;
        }
        w = ladoDe(g, { x: T.cx, y: T.cy });
        w2 = ladoDe(T, { x: g.cx, y: g.cy });
        edges.push(`<bpmndi:BPMNEdge id="Edge_Asoc_${n.id}" bpmnElement="Asoc_${n.id}">${waypoints([w, w2])}</bpmndi:BPMNEdge>`);
      }
    }
    for (const f of flujos) {
      const S = geom.nodos.get(f.de);
      const T = geom.nodos.get(f.a);
      if (!S || !T) continue;
      const w = rutaSecuencia(S, T, { ...f, via: resolver(f.via, geom, cfgUso, p), mx: typeof f.mx === 'object' ? resolver(f.mx, geom, cfgUso, p) : f.mx, ctx: { poolTop: p.top, poolBottom: p.top + p.h } });
      rutas.push({ id: f.id, de: f.de, a: f.a, puntos: w });
      const lbl = f.nombre
        ? `<bpmndi:BPMNLabel><dc:Bounds x="${f.lx ?? Math.round(labelPos(w).x)}" y="${f.ly ?? Math.round(labelPos(w).y)}" width="${Math.min(120, 8 + f.nombre.length * 6.4)}" height="${f.nombre.length > 16 ? 28 : 14}" /></bpmndi:BPMNLabel>`
        : '';
      edges.push(`<bpmndi:BPMNEdge id="Edge_${f.id}" bpmnElement="${f.id}">${waypoints(w)}${lbl}</bpmndi:BPMNEdge>`);
    }
  }

  // mensajes entre participantes
  const msgs = (modelo.mensajes ?? []).map((m, i) => ({ ...m, id: m.id ?? `Mensaje_${i + 1}` }));
  for (const m of msgs) {
    const S = geom.nodos.get(m.de);
    const T = geom.nodos.get(m.a);
    if (!S || !T) {
      errores.push(`mensaje ${m.id}: nodo inexistente (${m.de} -> ${m.a})`);
      continue;
    }
    const pS = geom.participantes.find((q) => q.id === S.participante);
    const w = rutaMensaje(S, T, { ...m, via: resolver(m.via, geom, cfgUso, pS) });
    rutas.push({ id: m.id, de: m.de, a: m.a, puntos: w, mensaje: true });
    const lbl = m.nombre
      ? `<bpmndi:BPMNLabel><dc:Bounds x="${m.lx ?? Math.round(labelPos(w).x)}" y="${m.ly ?? Math.round(labelPos(w).y)}" width="${Math.min(160, 8 + m.nombre.length * 6.4)}" height="${m.nombre.length > 22 ? 28 : 14}" /></bpmndi:BPMNLabel>`
      : '';
    edges.push(`<bpmndi:BPMNEdge id="Edge_${m.id}" bpmnElement="${m.id}">${waypoints(w)}${lbl}</bpmndi:BPMNEdge>`);
  }

  const colab = `<bpmn:collaboration id="Colaboracion_${idDef}">${geom.participantes
    .map((p) => `<bpmn:participant id="${p.id}" name="${esc(p.nombre)}" processRef="Proceso_${p.id}" />`)
    .join('')}${msgs.map((m) => `<bpmn:messageFlow id="${m.id}" sourceRef="${m.de}" targetRef="${m.a}"${m.nombre ? ` name="${esc(m.nombre)}"` : ''} />`).join('')}</bpmn:collaboration>`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="${NS.bpmn}" xmlns:bpmndi="${NS.bpmndi}" xmlns:dc="${NS.dc}" xmlns:di="${NS.di}" xmlns:xsi="${NS.xsi}" id="Definitions_${idDef}" name="${esc(modelo.nombre)}" targetNamespace="http://apuntado.unal.edu.co/bpmn" exporter="el-apuntado generador" exporterVersion="1.0">
${colab}
${procesos.join('\n')}
<bpmndi:BPMNDiagram id="Diagrama_${idDef}" name="${esc(modelo.nombre)}"><bpmndi:BPMNPlane id="Plano_${idDef}" bpmnElement="Colaboracion_${idDef}">
${shapes.join('\n')}
${edges.join('\n')}
</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>
`;
  return { xml, errores, geom, rutas, mensajes: msgs };
}

function labelPos(w) {
  // etiqueta cerca del primer tramo del flujo (junto al origen), fuera de la línea
  const a = w[0];
  const b = w[1] ?? w[0];
  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  return horizontal ? { x: a.x + 6, y: a.y - 22 } : { x: a.x + 6, y: a.y + (b.y >= a.y ? 6 : -30) };
}
