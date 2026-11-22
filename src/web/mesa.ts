import { ordenPorPinta, ordenPresentacion, type Carta } from '../kernel/cartas.js';
import type { EventoJuego, JugadorVista, MensajeServidor, VistaMesa } from '../kernel/protocolo.js';
import { MODALIDADES } from '../kernel/config.js';
import { SKIN_CARTA_DEFECTO, SKIN_MESA_DEFECTO, esMesaPremium, mesaPremiumMasCara, skinCarta, skinMesa } from '../extras/skins/skins.js';
import { urlAvatar, urlCarta, urlDorsoSkin, urlIcono, urlMesaSkin, urlTablero } from './assets.js';
import type { Contexto } from './contexto.js';
import { agregar, h, img, vaciar } from './dom.js';
import { formatearTiempo } from './estado.js';

/* --------- Geometría del escenario lógico 1920x1080 (ver docs/GUIA_ASSETS.md) --------- */
export const ESC_W = 1920;
export const ESC_H = 1080;
const CARTA_W = 140;
const CARTA_H = 196;
const MAZO = { x: 855, y: 440 };
const POZO = { x: 1065, y: 440 };
const MESA = { x: 960, y: 470, w: 1640, h: 800 };
const PLACA = { w: 360, h: 90 };
/** Margen de seguridad mínimo (px) respecto de los bordes del escenario 1920x1080. */
const ZONA_SEGURA = 10;
const MANO = { cx: 1000, y: 924, ancho: 1220, sube: 40, huecoGrupo: 26 };
const MINI = 0.42;
/** Zona de descarte por arrastre: óvalo en el centro de la mesa + distancia mínima recorrida (evita descartes accidentales). */
const ZONA_DESCARTE = { x: 960, y: 450, rx: 240, ry: 134 };
const DIST_MIN_DESCARTE = 150;
/** Zona de robo por arrastre: rectángulo muy redondeado sobre la mano (entre mi placa y los botones de acción). */
const ZONA_MANO = { x: 410, y: 790, w: 1180, h: 262 };
/** Cuántas cartas anteriores asoman bajo la carta superior del pozo. */
const CAPAS_POZO = 5;
/** Retenciones de teclado/botón (ms). */
const HOLD_DESCARTE_MS = 3000;
const HOLD_CERRAR_MS = 2000;
/** Una pulsación de Espacio más corta que esto es un "toque" (seleccionar); más larga empieza a cargar el descarte. */
const TOQUE_MS = 350;

const ASIENTOS: Record<number, Array<{ x: number; y: number }>> = {
  1: [{ x: 960, y: 170 }],
  2: [{ x: 420, y: 330 }, { x: 1500, y: 330 }],
  3: [{ x: 330, y: 420 }, { x: 960, y: 170 }, { x: 1590, y: 420 }],
  4: [{ x: 260, y: 520 }, { x: 660, y: 190 }, { x: 1260, y: 190 }, { x: 1660, y: 520 }],
  5: [{ x: 240, y: 520 }, { x: 480, y: 260 }, { x: 960, y: 150 }, { x: 1440, y: 260 }, { x: 1680, y: 520 }],
};

interface Objetivo {
  key: string;
  carta: Carta | null;
  x: number;
  y: number;
  rot: number;
  escala: number;
  z: number;
  origen?: { x: number; y: number; abajo: boolean; retraso: number };
  cls?: string;
  /** Skin de cartas con la que se dibuja (reverso y marco). */
  skin?: string;
}

interface Grupo {
  id: number;
  ids: string[];
  tipo: string;
}

type Origen = 'MAZO' | 'POZO';

interface Carga {
  id: string;
  t0: number;
  dur: number;
  visibleDesde: number;
  onProg: (p: number, visible: boolean) => void;
  onFin: () => void;
  timer: number;
}

const etq = (texto: string, tecla?: string, sub?: string): Array<HTMLElement> => [
  h('span', { class: 'tx' }, texto, sub ? h('small', {}, sub) : null),
  ...(tecla ? [h('kbd', {}, tecla)] : []),
];

/** Pantalla de mesa: tablero, cartas animadas (elementos con clave), plaquetas, temporizador y acciones. */
export class PantallaMesa {
  readonly el = h('section', { class: 'pantalla mesa' });
  private capaCartas = h('div', { class: 'capa-cartas' });
  private capaUi = h('div', { class: 'capa-ui' });
  private elementos = new Map<string, HTMLElement>();
  private vista: VistaMesa | null = null;
  private previa: VistaMesa | null = null;

  // Estado local de la mano
  private orden: string[] = [];
  private seleccion = new Set<string>();
  private grupos: Grupo[] = [];
  private sigGrupo = 1;
  private nuevas = new Set<string>();
  /** Carta señalada con el teclado (<-/->). */
  private cursor: string | null = null;
  private usoTeclado = false;
  private ultimoOrden: 'valor' | 'pinta' | null = null;
  /** Geometría de la mano en el último render (para la selección por recuadro y los botones flotantes). */
  private geomMano: Array<{ id: string; x: number; y: number; ancho: number }> = [];
  private arrastrando = false;

  // Pistas de animación traídas por eventos
  private roboPor = new Map<string, Origen>();
  private descarteDe: string | null = null;
  private descartePor = new Map<string, string>();
  private rondaAnimada = -1;

  // Mesa premium: elección LOCAL (solo esta partida; se reinicia al volver a la sala)
  private mesaOverride: string | null = null;
  private mesaMostrada = '';

  private timer: number | null = null;
  private hint = h('div', { class: 'hint', id: 'hint' });
  private reloj = h('div', { class: 'reloj-central', id: 'reloj' });
  private botones: Record<string, HTMLButtonElement> = {};
  private plaquetas = new Map<string, HTMLElement>();
  private logEl = h('ul', { class: 'log', id: 'log' });
  private lineasLog = new Map<number, HTMLElement>();
  private info = h('div', { class: 'info-mesa' });
  private contMazo = h('div', { class: 'contador c-mazo' });
  private contPozo = h('div', { class: 'contador c-pozo' });
  private marcador = img(urlTablero('marcador_turno'), 'marcador-turno');
  private slotMazo = img(urlTablero('slot_mazo'), 'slot slot-mazo');
  private slotPozo = img(urlTablero('slot_pozo'), 'slot slot-pozo');
  private guiaGrupos = h('div', { class: 'guias-grupos' });
  private mesaImg = img(urlMesaSkin(SKIN_MESA_DEFECTO), 'mesa-img');
  private bisel = h('div', { class: 'bisel-mesa', id: 'bisel-mesa' });
  private flotDescartar = h('button', { class: 'btn flotante descartar', id: 'flot-descartar', type: 'button' }, ...etq('Descartar', 'D'));
  private flotAgrupar = h('button', { class: 'btn flotante agrupar', id: 'flot-agrupar', type: 'button' }, ...etq('Agrupar', 'G'));
  private marquesina = h('div', { class: 'marquesina' });
  private zonaDescarte = h('div', { class: 'zona-descarte', id: 'zona-descarte' });
  /** Notificación flotante (no queda tapada por las cartas de la mesa) mientras se arrastra una carta para descartar. */
  private alarmaClave = '';
  private avisoArrastre = h('div', { class: 'aviso-arrastre', id: 'aviso-arrastre' }, 'Arrastra la carta al centro de la mesa para descartar');
  private cargaFlot = h('div', { class: 'carga-flot', id: 'carga-flot' }, h('div', { class: 'cuerpo' }, h('b', {}, '3'), h('small', {}, 'Espacio')));
  /** Zona de la mano donde se suelta una carta del mazo/pozo para robarla. */
  private zonaRobo = h('div', { class: 'zona-robo', id: 'zona-robo' }, h('span', {}, 'Suelta aquí para robar'));
  /** Marca dorada que indica entre qué cartas quedará la carta que se está reordenando. */
  private guiaInsercion = h('div', { class: 'guia-insercion', id: 'guia-insercion' }, h('i'));
  /** Alerta grande: "Cerrar ronda" se suelta antes de los 2 s. */
  private alertaCierre = h('div', { class: 'alerta-cierre', id: 'alerta-cierre', role: 'alert' },
    h('strong', {}, '¡Mantén pulsado 2 segundos!'),
    h('span', {}, 'Para cerrar la ronda deja pulsado el botón (o la tecla C) durante 2 segundos. Hazlo solo si estás seguro.'),
  );
  private timerAlertaCierre = 0;
  /** Aviso suave (no bloquea): "se puede votar la expulsión de X". */
  private avisoSuave = h('div', { class: 'aviso-suave', id: 'aviso-suave' });
  private timerAvisoSuave = 0;
  /** Cartas conocidas que quedan DEBAJO de la superior del pozo (la más reciente al final), reconstruidas con los eventos. */
  private pilaPozo: Carta[] = [];
  private panelVoto = h('div', { class: 'panel-voto', id: 'panel-voto' });
  private bannerAuto = h('div', { class: 'banner-auto', id: 'banner-auto' });
  /** Columna inferior izquierda (libre en todas las disposiciones de asientos): votación y aviso de automático. El aviso suave va aparte, en una franja baja y central. */
  private colAvisos = h('div', { class: 'col-avisos' }, this.panelVoto, this.bannerAuto);
  private menuMesa = h('div', { class: 'menu-mesa', id: 'menu-mesa' });
  private btnMesa!: HTMLButtonElement;
  private cargas = new Map<string, Carga>();
  private teclasPulsadas = new Map<string, number>();

  constructor(private readonly ctx: Contexto) {
    this.construir();
    // Tonos/daltonismo: las caras cambian de carpeta de arte; se refrescan al instante.
    ctx.visual.alCambiar(() => this.render());
  }

  private sonar(id: Parameters<Contexto['sonido']['reproducir']>[0], suave = 1): void {
    this.ctx.sonido.reproducir(id, suave);
  }

  private construir(): void {
    const mesaImg = this.mesaImg;
    Object.assign(mesaImg.style, { left: `${MESA.x - MESA.w / 2}px`, top: `${MESA.y - MESA.h / 2}px`, width: `${MESA.w}px`, height: `${MESA.h}px` });
    const colocar = (e: HTMLElement, c: { x: number; y: number }, w = CARTA_W, hh = CARTA_H): void => {
      Object.assign(e.style, { left: `${c.x - w / 2}px`, top: `${c.y - hh / 2}px`, width: `${w}px`, height: `${hh}px` });
    };
    colocar(this.slotMazo, MAZO);
    colocar(this.slotPozo, POZO);
    // Robar: clic (sin mover) o ARRASTRAR la carta hasta la zona de la mano.
    this.slotMazo.addEventListener('pointerdown', (e) => this.iniciarArrastreRobo(e, 'MAZO'));
    this.slotPozo.addEventListener('pointerdown', (e) => this.iniciarArrastreRobo(e, 'POZO'));
    Object.assign(this.zonaRobo.style, { left: `${ZONA_MANO.x}px`, top: `${ZONA_MANO.y}px`, width: `${ZONA_MANO.w}px`, height: `${ZONA_MANO.h}px` });
    Object.assign(this.contMazo.style, { left: `${MAZO.x - 40}px`, top: `${MAZO.y + CARTA_H / 2 + 8}px` });
    Object.assign(this.contPozo.style, { left: `${POZO.x - 40}px`, top: `${POZO.y + CARTA_H / 2 + 8}px` });
    Object.assign(this.hint.style, { left: `${MESA.x - 420}px`, top: '640px', width: '840px' });
    Object.assign(this.reloj.style, { left: `${MESA.x - 60}px`, top: '585px' });
    Object.assign(this.zonaDescarte.style, {
      left: `${ZONA_DESCARTE.x - ZONA_DESCARTE.rx}px`,
      top: `${ZONA_DESCARTE.y - ZONA_DESCARTE.ry}px`,
      width: `${ZONA_DESCARTE.rx * 2}px`,
      height: `${ZONA_DESCARTE.ry * 2}px`,
    });
    this.marcador.style.width = '190px';
    this.marcador.style.height = '190px';

    const mkBtn = (id: string, hijos: HTMLElement[], cls: string, fn: (() => void) | null): HTMLButtonElement => {
      const b = h('button', { class: `btn accion ${cls}`, id, type: 'button' }, ...hijos);
      if (fn) b.addEventListener('click', fn);
      this.botones[id] = b;
      return b;
    };
    const btnCerrar = mkBtn('btn-cerrar', [...etq('¡Cerrar ronda!', 'C', 'mantén pulsado 2 s'), h('i', { class: 'relleno' })], 'primario cerrar', null);
    this.prepararBotonRetencion(btnCerrar);
    const acciones = h('div', { class: 'acciones' },
      mkBtn('btn-desel', etq('Deseleccionar todo', 'Esc'), 'desel', () => this.limpiarSeleccion()),
      mkBtn('btn-mazo', etq('Robar del mazo', 'M'), '', () => this.robar('MAZO')),
      mkBtn('btn-pozo', etq('Tomar del pozo', 'P'), '', () => this.robar('POZO')),
      mkBtn('btn-descartar', etq('Descartar', 'D'), '', () => this.descartarSeleccion()),
      mkBtn('btn-agrupar', etq('Agrupar selección', 'G'), '', () => this.agrupar()),
      btnCerrar,
      h('div', { class: 'fila mini-fila' },
        mkBtn('btn-ord-valor', etq('Orden', 'O'), 'mini', () => this.ordenar('valor')),
        mkBtn('btn-ord-pinta', etq('Pinta', 'O O'), 'mini', () => this.ordenar('pinta')),
      ),
    );
    this.flotDescartar.addEventListener('click', () => this.descartarSeleccion());
    this.flotAgrupar.addEventListener('click', () => this.agrupar());

    this.btnMesa = h('button', { class: 'btn mini texto', type: 'button', id: 'btn-mesa', title: 'Mesa (solo mesas premium de la sala)', onclick: () => this.alternarMenuMesa() }, img(urlIcono('mesa'), 'ic'));
    const superior = h('div', { class: 'barra-sup' },
      h('button', { class: 'btn mini texto', type: 'button', title: 'Reglas y atajos', id: 'btn-ayuda-mesa', onclick: () => this.ctx.abrirAyuda() }, img(urlIcono('ayuda'), 'ic')),
      h('button', { class: 'btn mini texto', type: 'button', title: 'Efectos', onclick: () => this.ctx.abrirAjustes() }, img(urlIcono('ajustes'), 'ic')),
      h('button', { class: 'btn mini texto', type: 'button', title: 'Sonido', id: 'btn-sonido-mesa', onclick: () => this.ctx.abrirSonido() }, img(urlIcono('sonido'), 'ic')),
      this.btnMesa,
      h('button', { class: 'btn mini peligro', type: 'button', id: 'btn-salir', onclick: () => this.ctx.enviar({ t: 'salir' }) }, 'Abandonar'),
    );

    this.capaUi.append(
      this.guiaGrupos, this.zonaDescarte, this.zonaRobo, this.guiaInsercion, this.avisoArrastre, this.bisel, this.info, this.logEl, superior, this.menuMesa, this.avisoSuave, this.colAvisos,
      acciones, this.hint, this.reloj, this.contMazo, this.contPozo, this.flotDescartar, this.flotAgrupar, this.marquesina, this.cargaFlot, this.alertaCierre,
    );
    this.el.append(mesaImg, this.slotMazo, this.slotPozo, this.marcador, this.capaCartas, this.capaUi);
    this.marcador.style.display = 'none';
    this.flotDescartar.style.display = 'none';
    this.flotAgrupar.style.display = 'none';

    // Clic en el fondo = limpiar selección; arrastre desde el fondo = selección por recuadro.
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target !== this.el) {
        this.menuMesa.classList.remove('abierto');
        return;
      }
      this.menuMesa.classList.remove('abierto');
      this.iniciarMarquesina(e);
    });
    // Los botones de acción no deben conservar el foco (si no, Espacio/Intro los "pulsaría" otra vez).
    this.capaUi.addEventListener('pointerup', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b) window.setTimeout(() => b.blur(), 0);
    });
    window.addEventListener('keydown', (e) => this.teclaAbajo(e));
    window.addEventListener('keyup', (e) => this.teclaArriba(e));
    window.addEventListener('blur', () => this.cancelarCargas());
  }

  /* --------- ciclo de vida --------- */
  /** Descarta todo el estado local (al salir de una sala o volver a la sala tras una revancha). */
  reiniciar(): void {
    for (const el of this.elementos.values()) el.remove();
    this.elementos.clear();
    for (const el of this.plaquetas.values()) el.remove();
    this.plaquetas.clear();
    this.vista = null;
    this.previa = null;
    this.orden = [];
    this.grupos = [];
    this.seleccion.clear();
    this.nuevas.clear();
    this.cursor = null;
    this.usoTeclado = false;
    this.ultimoOrden = null;
    this.roboPor.clear();
    this.descarteDe = null;
    this.descartePor.clear();
    this.rondaAnimada = -1;
    this.pilaPozo = [];
    this.alertaCierre.classList.remove('visible');
    this.avisoSuave.classList.remove('visible');
    vaciar(this.avisoSuave);
    // La mesa elegida dentro de la partida solo vale para esa partida y sus rondas: al volver a la sala se reinicia.
    this.mesaOverride = null;
    this.mesaMostrada = '';
    this.menuMesa.classList.remove('abierto');
    this.cancelarCargas();
    vaciar(this.guiaGrupos);
    vaciar(this.logEl);
    this.lineasLog.clear();
  }

  montado(): void {
    if (this.timer === null) this.timer = window.setInterval(() => this.tick(), 200);
  }
  desmontado(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.cancelarCargas();
  }

  /** Sonido/animación pistas: se llama ANTES de actualizar() (el servidor envía eventos y luego estado). */
  eventos(evs: EventoJuego[]): void {
    const yoId = this.vista?.yoId ?? this.ctx.almacen.sesion?.jugadorId;
    for (const e of evs) {
      const d = e.datos as Record<string, unknown>;
      const mio = d.jugadorId === yoId;
      if (e.tipo === 'CARTA_ROBADA') {
        this.roboPor.set(String(d.jugadorId), d.origen === 'POZO' ? 'POZO' : 'MAZO');
        if (d.origen === 'POZO') this.pilaPozo.pop(); // la carta de abajo queda como nueva superior
        this.sonar('robar', mio ? 1 : 0.5);
      }
      if (e.tipo === 'CARTA_DESCARTADA') {
        this.descarteDe = String(d.jugadorId);
        const c = d.carta as Carta | null;
        // la superior anterior pasa a quedar debajo (el estado aún no se ha actualizado: `vista` es la anterior)
        const anterior = this.vista?.pozo.tope;
        if (anterior && c && anterior.id !== c.id) this.pilaPozo.push(anterior);
        if (c) this.descartePor.set(c.id, String(d.jugadorId));
        this.sonar('descartar', mio ? 1 : 0.55);
      }
      if (e.tipo === 'RONDA_INICIADA' || e.tipo === 'MAZO_RECICLADO') this.pilaPozo = [];
      if (e.tipo === 'AUTOMATICO' && d.activo) {
        this.ctx.toast(mio ? 'Pasaste a modo automático: un bot juega por ti.' : `${this.ctx.almacen.nombreDe(String(d.jugadorId))} pasó a modo automático.`, 'info');
        this.sonar('aviso', 0.7);
      }
      if (e.tipo === 'EXPULSION_DISPONIBLE') this.avisarExpulsion(String(d.jugadorId));
      if (e.tipo === 'TURNO_INICIADO' && mio) this.sonar('turno');
      if (e.tipo === 'CIERRE_ACEPTADO') this.sonar('cerrar');
      if (e.tipo === 'VOTACION_ABIERTA' || e.tipo === 'JUGADOR_EXPULSADO') this.sonar('aviso');
      if (e.tipo === 'CIERRE_RECHAZADO' && mio) {
        this.ctx.toast(String(d.detalle ?? 'La mano no cumple para cerrar.'), 'error');
      }
      const txt = this.ctx.almacen.textoEvento(e);
      if (txt) this.ctx.almacen.agregarLog(txt);
    }
    this.celebrarGanador(evs);
    this.pintarLog();
  }

  /**
   * Gana la partida / ronda -> celebración con LA SKIN DEL GANADOR. Si el ganador soy yo, a pantalla completa; si es otro,
   * pequeña, en su puesto y subiendo en cono. Si en el mismo lote termina la partida, solo se celebra la partida.
   */
  private celebrarGanador(evs: EventoJuego[]): void {
    const v = this.vista;
    if (!v) return;
    const fin = evs.find((e) => e.tipo === 'PARTIDA_FINALIZADA');
    const ev = fin ?? evs.find((e) => e.tipo === 'RONDA_LIQUIDADA');
    if (!ev) return;
    const ganadorId = (ev.datos as Record<string, unknown>).ganadorId;
    if (typeof ganadorId !== 'string') return; // tablas: nadie gana
    const j = v.jugadores.find((x) => x.id === ganadorId);
    if (!j) return;
    const esMio = ganadorId === v.yoId;
    const pos = esMio ? null : this.posicionAsiento(v, ganadorId);
    this.ctx.celebracion.lanzar({
      skinId: j.celebracion,
      esMio,
      alcance: fin ? 'partida' : 'ronda',
      origen: pos ? { x: pos.x, y: pos.y - PLACA.h / 2 } : undefined,
      reducido: this.ctx.almacen.efectos === 'off',
    });
  }

  /** Aviso SUAVE (no bloquea la mesa): ya se puede proponer expulsar a un jugador ausente. El botón queda en su panel. */
  private avisarExpulsion(jugadorId: string): void {
    const v = this.vista;
    if (!v) return;
    const nombre = this.ctx.almacen.nombreDe(jugadorId);
    const soyYo = jugadorId === v.yoId;
    this.sonar('aviso', 0.8);
    vaciar(this.avisoSuave);
    agregar(this.avisoSuave,
      h('strong', {}, soyYo ? 'La mesa puede proponer tu expulsión' : `${nombre} sigue ausente`),
      h('span', {}, soyYo ? 'Llevas varios turnos en automático. Pulsa "Retomar el control" para seguir jugando.' : 'Puedes proponer su expulsión por inactividad con el botón "Expulsar" de su panel; la votación solo empieza cuando alguien lo pulsa.'),
      soyYo ? null : h('div', { class: 'fila' },
        h('button', { class: 'btn mini primario', id: 'btn-aviso-expulsar', type: 'button', onclick: () => { this.ctx.enviar({ t: 'iniciar_expulsion', objetivoId: jugadorId }); this.avisoSuave.classList.remove('visible'); } }, 'Proponer expulsión'),
        h('button', { class: 'btn mini', type: 'button', onclick: () => this.avisoSuave.classList.remove('visible') }, 'Luego'),
      ),
    );
    this.avisoSuave.classList.add('visible');
    window.clearTimeout(this.timerAvisoSuave);
    this.timerAvisoSuave = window.setTimeout(() => this.avisoSuave.classList.remove('visible'), 12000);
  }

  mensaje(m: MensajeServidor): void {
    if (m.t !== 'validacion') return;
    if (m.valida) {
      this.crearGrupo(m.cartaIds, m.tipo === 'ESCALERA' ? 'Escalera' : 'Grupo');
      this.sonar('agrupar');
      this.ctx.toast(`${m.tipo === 'ESCALERA' ? 'Escalera' : 'Grupo'} válido`, 'ok');
    } else {
      this.ctx.toast(m.mensaje || 'Esa selección no es una combinación válida.', 'error');
      this.sacudir(m.cartaIds);
    }
  }

  actualizar(v: VistaMesa): void {
    this.previa = this.vista;
    this.vista = v;
    this.sincronizarMano(v);
    this.pilaPozo = this.pilaPozo.slice(Math.max(0, this.pilaPozo.length - Math.max(0, v.pozo.cantidad - 1)));
    this.aplicarMesa(v);
    this.render();
    this.pintarInfo();
    this.pintarLog();
    this.pintarVotacion(v);
    this.tick();
    this.roboPor.clear();
    this.descarteDe = null;
  }

  /* --------- mano local --------- */
  private sincronizarMano(v: VistaMesa): void {
    const ids = new Set(v.mano.map((c) => c.id));
    const previos = new Set(this.orden);
    const nuevaRonda = v.ronda !== this.rondaAnimada && v.mano.length > 0;
    if (nuevaRonda) {
      this.rondaAnimada = v.ronda;
      this.orden = [];
      this.grupos = [];
      this.seleccion.clear();
      this.nuevas.clear();
      this.cursor = null;
      this.ultimoOrden = null;
    }
    this.orden = this.orden.filter((id) => ids.has(id));
    for (const c of v.mano) {
      if (!previos.has(c.id) || nuevaRonda) {
        if (!this.orden.includes(c.id)) this.orden.push(c.id);
        if (!nuevaRonda) this.nuevas.add(c.id);
      }
    }
    for (const id of [...this.seleccion]) if (!ids.has(id)) this.seleccion.delete(id);
    for (const id of [...this.nuevas]) if (!ids.has(id)) this.nuevas.delete(id);
    if (this.cursor && !ids.has(this.cursor)) this.cursor = this.orden[0] ?? null;
    this.grupos = this.grupos.map((g) => ({ ...g, ids: g.ids.filter((x) => ids.has(x)) })).filter((g) => g.ids.length >= 3);
    this.verificarContiguidad();
    if (v.turno?.jugadorId !== v.yoId) this.nuevas.clear();
  }

  private verificarContiguidad(): void {
    this.grupos = this.grupos.filter((g) => {
      const pos = g.ids.map((id) => this.orden.indexOf(id)).sort((a, b) => a - b);
      return pos.every((p, i) => p >= 0 && (i === 0 || p === pos[i - 1]! + 1));
    });
  }

  private crearGrupo(cartaIds: string[], tipo: string): void {
    const ids = this.orden.filter((id) => cartaIds.includes(id));
    if (ids.length < 3) return;
    this.grupos = this.grupos
      .map((g) => ({ ...g, ids: g.ids.filter((x) => !ids.includes(x)) }))
      .filter((g) => g.ids.length >= 3);
    const primero = this.orden.findIndex((id) => ids.includes(id));
    const resto = this.orden.filter((id) => !ids.includes(id));
    resto.splice(primero, 0, ...ids);
    this.orden = resto;
    this.grupos.push({ id: this.sigGrupo++, ids, tipo });
    this.verificarContiguidad();
    this.seleccion.clear();
    this.render();
  }

  /** Orden ascendente por valor ('valor') o por pinta ('pinta'). */
  private ordenar(modo: 'valor' | 'pinta'): void {
    if (!this.vista) return;
    const cmp = modo === 'valor' ? ordenPresentacion : ordenPorPinta;
    const porId = new Map(this.vista.mano.map((c) => [c.id, c]));
    this.orden = this.orden.map((id) => porId.get(id)!).filter(Boolean).sort(cmp).map((c) => c.id);
    this.grupos = [];
    this.ultimoOrden = modo;
    this.sonar('soltar');
    this.render();
  }

  private limpiarSeleccion(): void {
    if (this.seleccion.size === 0) return;
    this.seleccion.clear();
    this.render();
  }

  private alternar(id: string): void {
    const quita = this.seleccion.has(id);
    if (quita) this.seleccion.delete(id);
    else this.seleccion.add(id);
    this.sonar(quita ? 'deseleccionar' : 'seleccionar');
    this.render();
  }

  /* --------- acciones --------- */
  private get miTurno(): boolean {
    const v = this.vista;
    return !!v && v.fase === 'EN_CURSO' && v.turno?.jugadorId === v.yoId;
  }

  private get puedoDescartar(): boolean {
    return this.miTurno && this.vista?.turno?.fase === 'DESCARTAR';
  }

  private robar(origen: Origen): void {
    const v = this.vista;
    if (!v || !this.miTurno || v.turno?.fase !== 'ROBAR') return;
    if (origen === 'POZO' && (!v.parametros.permitirRoboPozo || !v.pozo.tope)) return;
    this.ctx.enviar({ t: 'robar', origen });
  }

  /** Descartar la carta seleccionada: solo si hay UNA seleccionada (con varias, se avisa y no se hace nada). */
  private descartarSeleccion(): void {
    if (!this.miTurno) return this.ctx.toast('No es tu turno.', 'info');
    if (this.vista?.turno?.fase !== 'DESCARTAR') return this.ctx.toast('Primero roba una carta.', 'info');
    if (this.seleccion.size === 0) return this.ctx.toast('Selecciona la carta que quieres descartar.', 'info');
    if (this.seleccion.size > 1) return this.ctx.toast('Hay varias cartas seleccionadas: deja solo una para descartar.', 'info');
    this.descartar([...this.seleccion][0]!);
  }

  private descartar(id: string): void {
    if (!this.puedoDescartar) return;
    this.seleccion.delete(id);
    this.ctx.enviar({ t: 'descartar', cartaId: id });
  }

  private agrupar(): void {
    if (this.seleccion.size < 3) return this.ctx.toast('Selecciona 3 o más cartas para agruparlas.', 'info');
    this.ctx.enviar({ t: 'validar', cartaIds: [...this.seleccion] });
  }

  private cerrarRonda(): void {
    if (!this.puedoDescartar) return;
    this.ctx.enviar({ t: 'cerrar' });
  }

  private sacudir(ids: string[]): void {
    for (const id of ids) {
      const el = this.elementos.get(id);
      if (!el) continue;
      el.classList.remove('sacude');
      void el.offsetWidth;
      el.classList.add('sacude');
    }
  }

  /* --------- retenciones (mantener pulsado) con indicador de carga --------- */
  private iniciarCarga(id: string, dur: number, visibleDesde: number, onProg: Carga['onProg'], onFin: () => void): void {
    this.cancelarCarga(id);
    const c: Carga = { id, t0: performance.now(), dur, visibleDesde, onProg, onFin, timer: 0 };
    c.timer = window.setInterval(() => {
      const t = performance.now() - c.t0;
      c.onProg(Math.min(1, t / c.dur), t >= c.visibleDesde);
      if (t >= c.dur) {
        this.cancelarCarga(id);
        onFin();
      }
    }, 30);
    this.cargas.set(id, c);
  }

  /** Cancela una carga (soltar antes de tiempo) y reinicia su indicador. */
  private cancelarCarga(id: string): void {
    const c = this.cargas.get(id);
    if (!c) return;
    window.clearInterval(c.timer);
    this.cargas.delete(id);
    c.onProg(0, false);
  }

  private cancelarCargas(): void {
    for (const id of [...this.cargas.keys()]) this.cancelarCarga(id);
    this.teclasPulsadas.clear();
  }

  private progresoCerrar = (p: number, visible: boolean): void => {
    const b = this.botones['btn-cerrar'];
    if (!b) return;
    b.style.setProperty('--p', String(Math.round(p * 100)));
    b.classList.toggle('cargando', visible && p > 0);
  };

  /** Botón "Cerrar ronda": hay que mantenerlo pulsado 2 s (evita cierres accidentales). */
  private prepararBotonRetencion(b: HTMLButtonElement): void {
    const empezar = (): void => {
      if (b.disabled) return;
      this.iniciarCarga('cerrar', HOLD_CERRAR_MS, 0, this.progresoCerrar, () => this.cerrarRonda());
    };
    const cancelar = (): void => this.cancelarCarga('cerrar');
    const soltar = (): void => this.soltarCierre();
    b.addEventListener('pointerdown', (e) => {
      if (e.button === 0) empezar();
    });
    // Soltar el botón antes de los 2 s = intento flojo -> alerta muy visible; salirse del botón solo cancela.
    b.addEventListener('pointerup', soltar);
    b.addEventListener('pointerleave', cancelar);
    b.addEventListener('pointercancel', cancelar);
    b.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        empezar();
      }
    });
    b.addEventListener('keyup', (e) => {
      if (e.key === 'Enter' || e.key === ' ') soltar();
    });
  }

  /** Se suelta "Cerrar ronda" (botón o tecla C): si la carga no llegó a los 2 s, se avisa de que hay que mantenerla. */
  private soltarCierre(): void {
    if (!this.cargas.has('cerrar')) return;
    this.cancelarCarga('cerrar');
    this.mostrarAlertaCierre();
  }

  private mostrarAlertaCierre(): void {
    this.sonar('aviso');
    const a = this.alertaCierre;
    a.classList.remove('visible');
    void a.offsetWidth;
    a.classList.add('visible');
    window.clearTimeout(this.timerAlertaCierre);
    this.timerAlertaCierre = window.setTimeout(() => a.classList.remove('visible'), 3800);
  }

  /* --------- teclado --------- */
  private hayModal(): boolean {
    return !!document.querySelector('.overlays .velo');
  }

  private moverCursor(delta: number): void {
    if (this.orden.length === 0) return;
    const i = this.cursor ? this.orden.indexOf(this.cursor) : -1;
    const sig = i < 0 ? (delta > 0 ? 0 : this.orden.length - 1) : Math.max(0, Math.min(this.orden.length - 1, i + delta));
    this.cursor = this.orden[sig]!;
    this.usoTeclado = true;
    this.render();
  }

  private cursorValido(): string | null {
    if (this.orden.length === 0) return null;
    if (!this.cursor || !this.orden.includes(this.cursor)) this.cursor = this.orden[0]!;
    return this.cursor;
  }

  private teclaAbajo(e: KeyboardEvent): void {
    const objetivo = e.target as HTMLElement;
    if (!this.el.isConnected || objetivo.tagName === 'INPUT' || objetivo.tagName === 'SELECT' || objetivo.tagName === 'TEXTAREA') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.hayModal()) return;
    const tecla = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const v = this.vista;
    if (!v || v.fase === 'ESPERA') return;
    const conocida = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Escape', 'm', 'p', 'd', 'g', 'o', 'c'].includes(tecla);
    if (!conocida) return;
    e.preventDefault();
    if (e.repeat) return; // las retenciones se miden desde la primera pulsación
    switch (tecla) {
      case 'ArrowLeft':
        return this.moverCursor(-1);
      case 'ArrowRight':
        return this.moverCursor(1);
      case 'ArrowUp': {
        const id = this.cursorValido();
        this.usoTeclado = true;
        if (id && !this.seleccion.has(id)) this.alternar(id);
        else this.render();
        return;
      }
      case 'ArrowDown': {
        const id = this.cursorValido();
        this.usoTeclado = true;
        if (id && this.seleccion.has(id)) this.alternar(id);
        else this.render();
        return;
      }
      case ' ':
        return this.espacioAbajo();
      case 'Escape':
        return this.limpiarSeleccion();
      case 'm':
        return this.robar('MAZO');
      case 'p':
        return this.robar('POZO');
      case 'd':
        return this.descartarSeleccion();
      case 'g':
        return this.agrupar();
      case 'o':
        return this.ordenar(this.ultimoOrden === 'valor' ? 'pinta' : 'valor'); // 1.ª pulsación: valor; 2.ª: pinta; y alterna
      case 'c':
        if (!this.botones['btn-cerrar']!.disabled) this.iniciarCarga('cerrar', HOLD_CERRAR_MS, 0, this.progresoCerrar, () => this.cerrarRonda());
        return;
    }
  }

  private teclaArriba(e: KeyboardEvent): void {
    const tecla = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (tecla === 'c') this.soltarCierre();
    else if (tecla === ' ') this.espacioArriba();
  }

  /**
   * Espacio: un toque alterna la selección de la carta señalada; mantenido 3 s la DESCARTA (aunque haya otras
   * seleccionadas). El indicador de carga aparece pasado un instante, para distinguir toque de retención.
   */
  private espacioAbajo(): void {
    const id = this.cursorValido();
    if (!id) return;
    this.usoTeclado = true;
    this.teclasPulsadas.set(' ', performance.now());
    if (!this.puedoDescartar) return; // fuera de la fase de descarte solo hay toque (seleccionar)
    this.iniciarCarga('espacio', HOLD_DESCARTE_MS, TOQUE_MS, (p, visible) => this.progresoEspacio(p, visible), () => {
      this.teclasPulsadas.delete(' ');
      const objetivo = this.cursorValido();
      if (objetivo) this.descartar(objetivo);
    });
  }

  private espacioArriba(): void {
    const t0 = this.teclasPulsadas.get(' ');
    if (t0 === undefined) return;
    this.teclasPulsadas.delete(' ');
    this.cancelarCarga('espacio');
    const id = this.cursorValido();
    if (id && performance.now() - t0 < TOQUE_MS) this.alternar(id);
  }

  private progresoEspacio(p: number, visible: boolean): void {
    const f = this.cargaFlot;
    if (!visible || p <= 0) {
      f.classList.remove('visible');
      return;
    }
    const o = this.geomMano.find((g) => g.id === this.cursor);
    if (o) {
      // Flecha redondeada ENCIMA de la carta (apunta hacia la mesa); si el botón flotante está en la misma zona, se sube más.
      const fl = this.flotDescartar.style.display !== 'none' ? parseFloat(this.flotDescartar.style.left || '-999') : -999;
      const extra = Math.abs(fl - o.x) < 170 ? 62 : 0;
      Object.assign(f.style, { left: `${o.x}px`, top: `${o.y - CARTA_H / 2 - 16 - extra}px` });
    }
    f.style.setProperty('--p', String(Math.round(p * 100)));
    f.classList.add('visible');
    const num = f.querySelector('b');
    if (num) num.textContent = `${Math.max(0, Math.ceil((HOLD_DESCARTE_MS * (1 - p)) / 1000))}`;
  }

  /* --------- selección por recuadro --------- */
  private iniciarMarquesina(e: PointerEvent): void {
    if (e.button !== 0) return;
    const inicio = this.aEscenario(e.clientX, e.clientY);
    const base = e.shiftKey || e.ctrlKey || e.metaKey ? new Set(this.seleccion) : new Set<string>();
    let activa = false;
    const mover = (ev: PointerEvent): void => {
      const p = this.aEscenario(ev.clientX, ev.clientY);
      if (!activa && Math.hypot(p.x - inicio.x, p.y - inicio.y) > 8) {
        activa = true;
        this.marquesina.classList.add('visible');
      }
      if (!activa) return;
      const x0 = Math.min(inicio.x, p.x);
      const x1 = Math.max(inicio.x, p.x);
      const y0 = Math.min(inicio.y, p.y);
      const y1 = Math.max(inicio.y, p.y);
      Object.assign(this.marquesina.style, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` });
      const nueva = new Set(base);
      for (const g of this.geomMano) {
        if (x0 < g.x + g.ancho / 2 && x1 > g.x - g.ancho / 2 && y0 < g.y + CARTA_H / 2 && y1 > g.y - CARTA_H / 2) nueva.add(g.id);
      }
      const igual = nueva.size === this.seleccion.size && [...nueva].every((id) => this.seleccion.has(id));
      if (!igual) {
        this.seleccion = nueva;
        this.sonar('seleccionar');
        this.render();
      }
    };
    const soltar = (): void => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
      this.marquesina.classList.remove('visible');
      if (!activa) this.limpiarSeleccion();
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
  }

  /* --------- mesa premium --------- */
  private contextoMesa(v: VistaMesa): { propia: string; duenos: Map<string, string[]>; predeterminada: string; efectiva: string } {
    const propia = this.ctx.estilo.elegida('mesa');
    const duenos = new Map<string, string[]>();
    for (const j of v.jugadores) {
      if (!j.mesaPremium || !esMesaPremium(j.mesaPremium)) continue;
      duenos.set(j.mesaPremium, [...(duenos.get(j.mesaPremium) ?? []), j.id === v.yoId ? 'ti' : j.nombre]);
    }
    const cara = mesaPremiumMasCara(v.jugadores.map((j) => j.mesaPremium));
    const predeterminada = cara ?? propia;
    let efectiva = predeterminada;
    if (this.mesaOverride === 'MIA') efectiva = propia;
    else if (this.mesaOverride && duenos.has(this.mesaOverride)) efectiva = this.mesaOverride;
    return { propia, duenos, predeterminada, efectiva };
  }

  private aplicarMesa(v: VistaMesa): void {
    const { efectiva, duenos } = this.contextoMesa(v);
    if (efectiva !== this.mesaMostrada) {
      this.mesaMostrada = efectiva;
      this.mesaImg.src = urlMesaSkin(efectiva);
    }
    // Bisel con el dueño de la mesa premium que se está mostrando
    const d = duenos.get(efectiva);
    vaciar(this.bisel);
    if (d && esMesaPremium(efectiva)) {
      const nombres = d.map((n) => (n === 'ti' ? 'Tu mesa' : n)).join(' y ');
      const texto = d.length === 1 && d[0] === 'ti' ? 'Tu mesa' : `Mesa de ${nombres.replace('Tu mesa', 'ti')}`;
      this.bisel.append(h('span', { class: 'gema' }), h('strong', {}, skinMesa(efectiva).nombre), h('span', { class: 'dueno' }, texto));
      this.bisel.classList.add('visible');
    } else this.bisel.classList.remove('visible');
    if (this.menuMesa.classList.contains('abierto')) this.pintarMenuMesa(v);
  }

  private alternarMenuMesa(): void {
    const v = this.vista;
    if (!v) return;
    this.menuMesa.classList.toggle('abierto');
    if (this.menuMesa.classList.contains('abierto')) this.pintarMenuMesa(v);
  }

  /** Menú de mesa dentro de la partida: SOLO permite elegir entre las mesas premium de la sala o la propia. */
  private pintarMenuMesa(v: VistaMesa): void {
    const { propia, duenos, efectiva } = this.contextoMesa(v);
    vaciar(this.menuMesa);
    const opcion = (id: string, titulo: string, sub: string, override: string | null): HTMLElement =>
      h('button', {
        class: `opcion-mesa${efectiva === id ? ' activa' : ''}`,
        type: 'button',
        dataset: { mesa: id },
        onclick: () => {
          this.mesaOverride = override;
          this.aplicarMesa(v);
          this.menuMesa.classList.remove('abierto');
        },
      }, img(urlMesaSkin(id), 'mini-mesa'), h('span', {}, h('strong', {}, titulo), h('small', {}, sub)));
    agregar(this.menuMesa,
      h('div', { class: 'titulo-menu' }, 'Mesa (solo para ti, esta partida)'),
      opcion(propia, `Mi mesa: ${skinMesa(propia).nombre}`, esMesaPremium(propia) ? 'Premium' : 'Básica', 'MIA'),
      ...[...duenos.entries()]
        .filter(([id]) => id !== propia)
        .map(([id, d]) => opcion(id, skinMesa(id).nombre, `Premium - de ${d.map((n) => (n === 'ti' ? 'ti' : n)).join(' y ')} - ${skinMesa(id).precio} tokens`, id)),
      duenos.size === 0 ? h('p', { class: 'nota-menu' }, 'Nadie usa una mesa premium en esta sala.') : null,
    );
  }

  /* --------- skins de cartas --------- */
  private skinPropia(v: VistaMesa): string {
    return v.jugadores.find((j) => j.id === v.yoId)?.skinCartas ?? this.ctx.estilo.elegida('carta');
  }

  private skinDe(v: VistaMesa, jugadorId: string | undefined | null): string {
    return v.jugadores.find((j) => j.id === jugadorId)?.skinCartas ?? this.skinPropia(v);
  }

  /** Aplica la skin (reverso + marco) a un elemento de carta; solo toca el DOM si la skin cambió. */
  private aplicarSkin(el: HTMLElement, id: string): void {
    if (el.dataset.skin === id) return;
    el.dataset.skin = id;
    const sk = skinCarta(id);
    const dorso = el.querySelector<HTMLImageElement>('img.dorso') ?? el.querySelector<HTMLImageElement>('img.frente.solo-dorso');
    if (dorso) dorso.src = urlDorsoSkin(id);
    const m = sk.diseno.marco;
    el.style.setProperty('--mc', m?.color ?? 'transparent');
    el.style.setProperty('--mw', `${m ? m.ancho : 0}px`);
    el.dataset.tinta = m?.tinta ?? '';
  }

  /* --------- layout --------- */
  private objetivos(v: VistaMesa): Objetivo[] {
    const res: Objetivo[] = [];
    const porId = new Map(v.mano.map((c) => [c.id, c]));
    const enMano = this.orden.map((id) => porId.get(id)).filter((c): c is Carta => !!c);
    const grupoDe = new Map<string, Grupo>();
    for (const g of this.grupos) for (const id of g.ids) grupoDe.set(id, g);
    const miSkin = this.skinPropia(v);

    // Mano propia: paso adaptativo + hueco entre grupos + leve arco
    const n = enMano.length;
    let huecos = 0;
    enMano.forEach((c, i) => {
      if (i > 0 && grupoDe.get(c.id) !== grupoDe.get(enMano[i - 1]!.id)) huecos++;
    });
    const paso = n > 1 ? Math.min(118, (MANO.ancho - CARTA_W - huecos * MANO.huecoGrupo) / (n - 1)) : 0;
    const total = n > 0 ? (n - 1) * paso + huecos * MANO.huecoGrupo : 0;
    let x = MANO.cx - total / 2;
    const guias: Array<{ g: Grupo; x0: number; x1: number }> = [];
    this.geomMano = [];
    enMano.forEach((c, i) => {
      if (i > 0) {
        x += paso;
        if (grupoDe.get(c.id) !== grupoDe.get(enMano[i - 1]!.id)) x += MANO.huecoGrupo;
      }
      const t = n > 1 ? i / (n - 1) - 0.5 : 0;
      const sel = this.seleccion.has(c.id);
      const g = grupoDe.get(c.id);
      if (g) {
        const ex = guias.find((q) => q.g === g);
        if (ex) ex.x1 = x + CARTA_W / 2;
        else guias.push({ g, x0: x - CARTA_W / 2, x1: x + CARTA_W / 2 });
      }
      const y = Math.min(MANO.y + 40 * t * t, ESC_H - ZONA_SEGURA - CARTA_H / 2 - 2) - (sel ? MANO.sube : 0);
      this.geomMano.push({ id: c.id, x, y, ancho: n > 1 ? Math.max(paso, 40) : CARTA_W });
      const foco = this.usoTeclado && this.cursor === c.id;
      res.push({
        key: c.id,
        carta: c,
        x,
        y,
        rot: t * 5,
        escala: 1,
        z: 100 + i,
        cls: `mia${sel ? ' sel' : ''}${foco ? ' foco' : ''}${this.nuevas.has(c.id) ? ' nueva' : ''}${g ? ' agrupada' : ''}`,
        origen: this.origenNuevaMano(v, i),
        skin: miSkin,
      });
    });
    this.pintarGuias(guias);

    // Mazo: hasta 3 dorsos apilados (con tu skin)
    const capas = Math.min(3, v.mazoRestantes);
    for (let i = 0; i < capas; i++) {
      res.push({ key: `mazo:${i}`, carta: null, x: MAZO.x - i * 2, y: MAZO.y - i * 2, rot: 0, escala: 1, z: 10 + i, cls: 'mazo', skin: miSkin });
    }
    // Pozo: "cachitos" de las cartas anteriores asoman bajo la superior, ligeramente desordenadas.
    if (v.pozo.tope) {
      const debajo = this.pilaPozo.slice(-CAPAS_POZO);
      const anonimas = Math.min(CAPAS_POZO - debajo.length, Math.max(0, v.pozo.cantidad - 1 - debajo.length));
      for (let i = 0; i < anonimas; i++) {
        const hh = hash(`${v.codigo}:${v.ronda}:anon${i}`);
        res.push({ key: `pozo:anon:${i}`, carta: null, ...this.desorden(hh), z: 30 + i, cls: 'pozo-bajo', skin: miSkin });
      }
      debajo.forEach((c, i) => {
        res.push({ key: c.id, carta: c, ...this.desorden(hash(c.id + 'x')), z: 30 + anonimas + i, cls: 'pozo-bajo', skin: this.skinDe(v, this.descartePor.get(c.id)) });
      });
    }
    // Pozo: tope visible (con la skin de quien lo descartó)
    if (v.pozo.tope) {
      const de = this.descarteDe && this.descarteDe !== v.yoId ? this.posicionAsiento(v, this.descarteDe) : null;
      res.push({
        key: v.pozo.tope.id,
        carta: v.pozo.tope,
        x: POZO.x,
        y: POZO.y,
        rot: (hash(v.pozo.tope.id) % 9) - 4,
        escala: 1,
        z: 50,
        cls: 'pozo-tope',
        origen: de ? { x: de.x, y: de.y, abajo: false, retraso: 0 } : undefined,
        skin: this.skinDe(v, this.descartePor.get(v.pozo.tope.id)),
      });
    }

    // Rivales: dorsos en abanico bajo la plaqueta (con la skin de cada rival)
    for (const j of this.rivales(v)) {
      const p = this.posicionAsiento(v, j.id);
      if (!p) continue;
      const robo = this.roboPor.get(j.id);
      const desde = robo === 'POZO' ? POZO : MAZO;
      const pasoR = Math.min(16, 220 / Math.max(1, j.numCartas - 1));
      const tot = (j.numCartas - 1) * pasoR;
      for (let i = 0; i < j.numCartas; i++) {
        res.push({
          key: `op:${j.id}:${i}`,
          carta: null,
          x: p.x - tot / 2 + i * pasoR,
          y: p.y + PLACA.h / 2 + 14 + (CARTA_H * MINI) / 2,
          rot: 0,
          escala: MINI,
          z: 20 + i,
          cls: `rival${j.eliminado ? ' out' : ''}`,
          origen: { x: desde.x, y: desde.y, abajo: true, retraso: this.esReparto(v) ? i * 70 : 0 },
          skin: j.skinCartas,
        });
      }
    }
    return res;
  }

  /** Posición/giro pseudoaleatorio pero estable (a partir de un hash) de una carta bajo la superior del pozo. */
  private desorden(hh: number): { x: number; y: number; rot: number; escala: number } {
    return { x: POZO.x + ((hh % 31) - 15), y: POZO.y + (((hh >> 5) % 23) - 11), rot: ((hh >> 9) % 29) - 14, escala: 1 };
  }

  private origenNuevaMano(v: VistaMesa, i: number): Objetivo['origen'] {
    if (this.esReparto(v)) return { x: MAZO.x, y: MAZO.y, abajo: true, retraso: 120 + i * 90 };
    const robo = this.roboPor.get(v.yoId);
    const d = robo === 'POZO' ? POZO : MAZO;
    return { x: d.x, y: d.y, abajo: robo !== 'POZO', retraso: 0 };
  }

  private esReparto(v: VistaMesa): boolean {
    return !this.previa || this.previa.ronda !== v.ronda || this.previa.fase !== v.fase;
  }

  private rivales(v: VistaMesa): JugadorVista[] {
    const yo = v.jugadores.find((j) => j.id === v.yoId);
    const total = v.jugadores.length;
    const base = yo?.asiento ?? 0;
    return v.jugadores
      .filter((j) => j.id !== v.yoId)
      .sort((a, b) => ((a.asiento - base + total) % total) - ((b.asiento - base + total) % total));
  }

  private posicionAsiento(v: VistaMesa, id: string): { x: number; y: number } | null {
    const r = this.rivales(v);
    const i = r.findIndex((j) => j.id === id);
    if (i < 0) return null;
    return ASIENTOS[Math.min(5, r.length)]?.[i] ?? null;
  }

  private render(): void {
    const v = this.vista;
    if (!v) return;
    const objs = this.objetivos(v);
    const vivos = new Set(objs.map((o) => o.key));
    for (const [k, el] of this.elementos) {
      if (!vivos.has(k)) {
        this.elementos.delete(k);
        el.classList.add('saliendo');
        window.setTimeout(() => el.remove(), 260);
      }
    }
    for (const o of objs) {
      let el = this.elementos.get(o.key);
      const transf = `translate(${o.x - CARTA_W / 2}px, ${o.y - CARTA_H / 2}px) rotate(${o.rot}deg) scale(${o.escala})`;
      if (!el) {
        el = this.crearElemento(o);
        this.elementos.set(o.key, el);
        this.capaCartas.append(el);
        if (o.origen) {
          const orig = o.origen;
          el.style.transition = 'none';
          el.style.transform = `translate(${orig.x - CARTA_W / 2}px, ${orig.y - CARTA_H / 2}px) scale(${o.escala})`;
          el.classList.toggle('boca-abajo', orig.abajo && !!o.carta);
          void el.offsetWidth;
          el.style.transition = '';
          el.style.transitionDelay = `${orig.retraso}ms`;
          requestAnimationFrame(() => {
            el!.style.transform = transf;
            el!.classList.remove('boca-abajo');
            window.setTimeout(() => (el!.style.transitionDelay = ''), orig.retraso + 500);
          });
        } else {
          el.style.transform = transf;
        }
      } else {
        el.style.transform = transf;
      }
      el.style.zIndex = String(o.z);
      el.className = `carta ${o.cls ?? ''}${el.classList.contains('boca-abajo') ? ' boca-abajo' : ''}`;
      if (o.skin) this.aplicarSkin(el, o.skin);
      if (o.carta) {
        const f = el.querySelector<HTMLImageElement>('img.frente:not(.solo-dorso)');
        const u = urlCarta(o.carta);
        if (f && f.dataset.u !== u) {
          f.dataset.u = u;
          f.src = u;
        }
      }
      if (o.carta) el.dataset.id = o.carta.id;
      if (o.carta) el.setAttribute('aria-label', `${o.carta.valor}${o.carta.pinta ?? ''}`);
    }
    this.marcarZonas(v);
    this.posicionarFlotantes();
  }

  private crearElemento(o: Objetivo): HTMLElement {
    const giro = h('div', { class: 'giro' });
    const skin = o.skin ?? SKIN_CARTA_DEFECTO;
    if (o.carta) {
      const dorso = img(urlDorsoSkin(skin), 'dorso');
      const frente = img(urlCarta(o.carta), 'frente');
      frente.dataset.u = urlCarta(o.carta);
      giro.append(frente, h('div', { class: 'marco' }), dorso);
    } else {
      giro.append(img(urlDorsoSkin(skin), 'frente solo-dorso'));
    }
    const el = h('div', { class: 'carta', dataset: { key: o.key } }, giro);
    // El mismo elemento se reutiliza cuando una carta cambia de zona (pozo -> mano y mano -> pozo),
    // así que el listener se registra siempre y se decide al pulsar si la carta es "mía" en ese momento.
    el.addEventListener('pointerdown', (e) => {
      if (el.classList.contains('mia')) {
        this.usoTeclado = false;
        this.iniciarArrastre(e, o.key);
      }
    });
    return el;
  }

  private pintarGuias(guias: Array<{ g: Grupo; x0: number; x1: number }>): void {
    vaciar(this.guiaGrupos);
    for (const { g, x0, x1 } of guias) {
      const b = h('div', {
        class: 'guia-grupo',
        title: 'Clic para deshacer el grupo',
        style: { left: `${x0}px`, top: `${MANO.y + CARTA_H / 2 + 6}px`, width: `${x1 - x0}px` },
        onclick: () => {
          this.grupos = this.grupos.filter((q) => q.id !== g.id);
          this.render();
        },
      }, h('span', {}, g.tipo));
      this.guiaGrupos.append(b);
    }
  }

  /** Botones flotantes: "Descartar" sobre la carta seleccionada y "Agrupar" sobre el centro de peso de la selección. */
  private posicionarFlotantes(): void {
    const sel = this.geomMano.filter((g) => this.seleccion.has(g.id));
    const ocultos = this.arrastrando || sel.length === 0 || !this.vista || this.vista.fase !== 'EN_CURSO';
    const un = sel.length === 1 ? sel[0]! : null;
    // Descartar: una sola carta seleccionada y es mi turno (habilitado solo tras robar)
    const verD = !ocultos && !!un && this.miTurno;
    this.flotDescartar.style.display = verD ? '' : 'none';
    if (verD && un) {
      const x = Math.max(110, Math.min(ESC_W - 110, un.x));
      Object.assign(this.flotDescartar.style, { left: `${x}px`, top: `${un.y - CARTA_H / 2 - 12}px` });
      const puede = this.puedoDescartar;
      this.flotDescartar.disabled = !puede;
      const tx = this.flotDescartar.querySelector('.tx');
      if (tx) tx.textContent = puede ? 'Descartar' : 'Roba primero';
    }
    // Agrupar: varias cartas (≥ 3), centrado en el centro de peso de la selección
    const verG = !ocultos && sel.length >= 3;
    this.flotAgrupar.style.display = verG ? '' : 'none';
    if (verG) {
      const cx = sel.reduce((a, g) => a + g.x, 0) / sel.length;
      const top = Math.min(...sel.map((g) => g.y));
      Object.assign(this.flotAgrupar.style, { left: `${Math.max(110, Math.min(ESC_W - 110, cx))}px`, top: `${top - CARTA_H / 2 - 12}px` });
    }
  }

  /* --------- arrastre de cartas de la mano --------- */
  private aEscenario(cx: number, cy: number): { x: number; y: number } {
    const esc = this.el.parentElement!.getBoundingClientRect();
    const s = esc.width / ESC_W;
    return { x: (cx - esc.left) / s, y: (cy - esc.top) / s };
  }

  private enZonaDescarte(p: { x: number; y: number }): boolean {
    const dx = (p.x - ZONA_DESCARTE.x) / ZONA_DESCARTE.rx;
    const dy = (p.y - ZONA_DESCARTE.y) / ZONA_DESCARTE.ry;
    return dx * dx + dy * dy <= 1;
  }

  private iniciarArrastre(e: PointerEvent, key: string): void {
    if (e.button !== 0) return;
    const el = this.elementos.get(key);
    if (!el) return;
    const inicio = this.aEscenario(e.clientX, e.clientY);
    let arrastrando = false;
    const mover = (ev: PointerEvent): void => {
      const p = this.aEscenario(ev.clientX, ev.clientY);
      const dx = p.x - inicio.x;
      const dy = p.y - inicio.y;
      if (!arrastrando && Math.hypot(dx, dy) > 8) {
        arrastrando = true;
        this.arrastrando = true;
        el.classList.add('arrastrando');
        el.style.zIndex = '400';
        this.capaCartas.classList.add('arrastre');
        this.sonar('arrastrar');
        this.posicionarFlotantes();
        if (this.puedoDescartar) {
          this.zonaDescarte.classList.add('visible');
          this.avisoArrastre.classList.add('visible');
        }
      }
      if (arrastrando) {
        // La carta se centra en el puntero (así la guía de inserción coincide con lo que se ve).
        el.style.transform = `translate(${p.x - CARTA_W / 2}px, ${p.y - CARTA_H / 2}px) rotate(0deg) scale(1.06)`;
        this.mostrarGuiaInsercion(key, p);
        const dentro = this.puedoDescartar && this.enZonaDescarte(p) && Math.hypot(dx, dy) >= DIST_MIN_DESCARTE;
        this.zonaDescarte.classList.toggle('dentro', dentro);
        this.avisoArrastre.classList.toggle('dentro', dentro);
        this.avisoArrastre.textContent = dentro ? 'Suelta para descartar' : 'Arrastra la carta al centro de la mesa para descartar';
      }
    };
    const soltar = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
      this.capaCartas.classList.remove('arrastre');
      this.zonaDescarte.classList.remove('visible', 'dentro');
      this.avisoArrastre.classList.remove('visible', 'dentro');
      this.guiaInsercion.classList.remove('visible');
      el.classList.remove('arrastrando');
      this.arrastrando = false;
      if (!arrastrando) {
        this.alternar(key);
        return;
      }
      const p = this.aEscenario(ev.clientX, ev.clientY);
      const recorrido = Math.hypot(p.x - inicio.x, p.y - inicio.y);
      if (this.enZonaDescarte(p)) {
        // Descarte por arrastre: movimiento COMPLETO = soltar dentro de la zona central y haber recorrido una distancia mínima
        if (!this.miTurno) this.ctx.toast('No es tu turno.', 'info');
        else if (!this.puedoDescartar) this.ctx.toast('Primero roba una carta.', 'info');
        else if (recorrido < DIST_MIN_DESCARTE) this.ctx.toast('Arrastra la carta hasta el centro de la mesa para descartarla.', 'info');
        else {
          this.descartar(key);
          return;
        }
        this.render();
        return;
      }
      if (p.y > 700) {
        this.reubicar(key, p.x);
        this.seleccion.delete(key); // al colocarla entre otras, solo la movida se deselecciona (las demás conservan la selección)
        this.sonar('soltar');
      }
      this.render();
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
  }

  /** Posición de inserción (índice entre las demás cartas de la mano) para una x del escenario. */
  private indiceInsercion(key: string, x: number): { idx: number; centros: number[] } {
    const centros = this.geomMano.filter((g) => g.id !== key).sort((a, b) => a.x - b.x).map((g) => g.x);
    return { idx: centros.filter((cx) => cx < x).length, centros };
  }

  /** Marca dorada entre las dos cartas donde caerá la que se está arrastrando (visible solo sobre la zona de la mano). */
  private mostrarGuiaInsercion(key: string, p: { x: number; y: number }): void {
    const g = this.guiaInsercion;
    if (p.y <= 700 || this.enZonaDescarte(p)) {
      g.classList.remove('visible');
      return;
    }
    const { idx, centros } = this.indiceInsercion(key, p.x);
    let x = MANO.cx;
    if (centros.length > 0) {
      const medio = centros.length > 1 ? (centros[centros.length - 1]! - centros[0]!) / (centros.length - 1) : CARTA_W;
      const sep = Math.min(medio, CARTA_W);
      if (idx <= 0) x = centros[0]! - sep / 2 - 8;
      else if (idx >= centros.length) x = centros[centros.length - 1]! + sep / 2 + 8;
      else x = (centros[idx - 1]! + centros[idx]!) / 2;
    }
    Object.assign(g.style, { left: `${x}px`, top: `${MANO.y - CARTA_H / 2 - 18}px`, height: `${CARTA_H + 36}px` });
    g.classList.add('visible');
  }

  private reubicar(key: string, xDestino: number): void {
    const v = this.vista;
    if (!v) return;
    const otros = this.orden.filter((id) => id !== key);
    let idx = this.indiceInsercion(key, xDestino).idx;
    idx = Math.max(0, Math.min(otros.length, idx));
    otros.splice(idx, 0, key);
    this.orden = otros;
    this.ultimoOrden = null;
    this.verificarContiguidad();
  }

  /* --------- robar arrastrando (mazo/pozo -> mano) --------- */
  private puedoRobarDe(origen: Origen): boolean {
    const v = this.vista;
    if (!v || !this.miTurno || v.turno?.fase !== 'ROBAR') return false;
    return origen === 'MAZO' || (v.parametros.permitirRoboPozo && !!v.pozo.tope);
  }

  private enZonaRobo(p: { x: number; y: number }): boolean {
    return p.x >= ZONA_MANO.x && p.x <= ZONA_MANO.x + ZONA_MANO.w && p.y >= ZONA_MANO.y && p.y <= ZONA_MANO.y + ZONA_MANO.h;
  }

  /** Clic (sin mover) = robar; arrastrar la carta hasta la zona de la mano y soltarla = robar. Soltar fuera la devuelve. */
  private iniciarArrastreRobo(e: PointerEvent, origen: Origen): void {
    if (e.button !== 0 || !this.puedoRobarDe(origen)) return;
    const v = this.vista!;
    const inicio = this.aEscenario(e.clientX, e.clientY);
    let fantasma: HTMLElement | null = null;
    const tope = v.pozo.tope;
    const mover = (ev: PointerEvent): void => {
      const p = this.aEscenario(ev.clientX, ev.clientY);
      if (!fantasma && Math.hypot(p.x - inicio.x, p.y - inicio.y) > 8) {
        fantasma = h('div', { class: 'fantasma-robo' }, origen === 'POZO' && tope ? img(urlCarta(tope), '') : img(urlDorsoSkin(this.skinPropia(v)), ''));
        this.capaUi.append(fantasma);
        this.arrastrando = true;
        this.zonaRobo.classList.add('visible');
        this.sonar('arrastrar');
      }
      if (!fantasma) return;
      fantasma.style.transform = `translate(${p.x - CARTA_W / 2}px, ${p.y - CARTA_H / 2}px) scale(1.06)`;
      this.zonaRobo.classList.toggle('dentro', this.enZonaRobo(p));
    };
    const limpiar = (): void => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', limpiar);
      fantasma?.remove();
      this.zonaRobo.classList.remove('visible', 'dentro');
      this.arrastrando = false;
    };
    const soltar = (ev: PointerEvent): void => {
      const movio = !!fantasma;
      const p = this.aEscenario(ev.clientX, ev.clientY);
      limpiar();
      if (!movio) return this.robar(origen);
      if (this.enZonaRobo(p)) this.robar(origen);
      else this.ctx.toast('Suelta la carta sobre tu mano para robarla.', 'info');
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', limpiar);
  }

  /* --------- HUD --------- */
  private marcarZonas(v: VistaMesa): void {
    const turnoMio = this.miTurno;
    const fase = v.turno?.fase;
    const robo = turnoMio && fase === 'ROBAR';
    this.slotMazo.classList.toggle('activo', robo);
    this.slotPozo.classList.toggle('activo', robo && v.parametros.permitirRoboPozo && !!v.pozo.tope);
    this.slotPozo.classList.toggle('destino', turnoMio && fase === 'DESCARTAR');
    const b = this.botones;
    b['btn-mazo']!.disabled = !robo;
    b['btn-pozo']!.disabled = !(robo && v.parametros.permitirRoboPozo && !!v.pozo.tope);
    // Descartar: solo con UNA carta seleccionada. Agrupar: solo con VARIAS (3 o más).
    b['btn-descartar']!.disabled = !(turnoMio && fase === 'DESCARTAR' && this.seleccion.size === 1);
    b['btn-agrupar']!.disabled = this.seleccion.size < 3;
    // "Deseleccionar todo" solo aparece cuando hay varias cartas seleccionadas (también con Esc).
    b['btn-desel']!.style.display = this.seleccion.size >= 2 ? '' : 'none';
    b['btn-cerrar']!.disabled = !(turnoMio && fase === 'DESCARTAR');
    b['btn-ord-valor']!.disabled = v.mano.length === 0;
    b['btn-ord-pinta']!.disabled = v.mano.length === 0;
    this.contMazo.textContent = String(v.mazoRestantes);
    this.contPozo.textContent = String(v.pozo.cantidad);
    this.pintarPlaquetas(v);
    this.pintarBannerAuto(v);
  }

  private pintarPlaquetas(v: VistaMesa): void {
    const activos = new Set<string>();
    const lista: Array<{ j: JugadorVista; x: number; y: number; yo: boolean }> = [];
    const yo = v.jugadores.find((j) => j.id === v.yoId);
    if (yo) lista.push({ j: yo, x: 24 + PLACA.w / 2, y: 1080 - 24 - PLACA.h / 2, yo: true });
    for (const j of this.rivales(v)) {
      const p = this.posicionAsiento(v, j.id);
      if (p) lista.push({ j, x: p.x, y: p.y, yo: false });
    }
    let posMarcador: { x: number; y: number } | null = null;
    for (const { j, x, y, yo: soyYo } of lista) {
      activos.add(j.id);
      let el = this.plaquetas.get(j.id);
      if (!el) {
        el = h('div', { class: 'plaqueta', dataset: { id: j.id } });
        this.plaquetas.set(j.id, el);
        this.capaUi.append(el);
      }
      const esTurno = v.fase === 'EN_CURSO' && v.turno?.jugadorId === j.id;
      if (esTurno) posMarcador = { x, y };
      Object.assign(el.style, { left: `${x - PLACA.w / 2}px`, top: `${y - PLACA.h / 2}px`, width: `${PLACA.w}px`, height: `${PLACA.h}px` });
      el.className = `plaqueta${soyYo ? ' yo' : ''}${esTurno ? ' turno' : ''}${j.eliminado ? ' eliminado' : ''}${!j.conectado ? ' desconectado' : ''}`;
      vaciar(el);
      agregar(el,
        img(urlTablero('placa_jugador'), 'fondo-placa'),
        img(urlAvatar(j.asiento), 'avatar'),
        h('div', { class: 'txt' },
          h('strong', {}, j.nombre),
          h('span', { class: 'marca' }, this.textoMarcador(v, j)),
        ),
        h('div', { class: 'iconos' },
          h('span', { class: 'skin-mini', title: `Cartas: ${skinCarta(j.skinCartas).nombre}` }, img(urlDorsoSkin(j.skinCartas), '')),
          j.esHost ? img(urlIcono('corona'), 'ic') : null,
          j.esBot ? img(urlIcono('bot'), 'ic') : null,
          !j.conectado ? img(urlIcono('desconectado'), 'ic') : null,
          j.eliminado ? img(urlIcono('eliminado'), 'ic') : null,
          j.automatico ? h('span', { class: 'auto completo', title: 'Automático completo: un bot juega por él' }, 'AUTOMÁTICO') : j.autopiloto ? h('span', { class: 'auto', title: 'Piloto: sus turnos esperan el reloj completo' }, 'PILOTO') : null,
        ),
        esTurno ? h('span', { class: 'etiqueta-turno' }, soyYo ? 'TU TURNO' : 'TURNO') : null,
        h('div', { class: 'barra-tiempo' }, h('i')),
        this.accionesPlaqueta(v, j, soyYo),
      );
    }
    for (const [id, el] of this.plaquetas) {
      if (!activos.has(id)) {
        el.remove();
        this.plaquetas.delete(id);
      }
    }
    if (posMarcador && v.fase === 'EN_CURSO') {
      this.marcador.style.display = '';
      this.marcador.style.left = `${posMarcador.x - 95}px`;
      this.marcador.style.top = `${posMarcador.y - 95}px`;
    } else {
      this.marcador.style.display = 'none';
    }
  }

  /**
   * Pestañas sobre el borde superior del panel (no ocupan sitio en la mesa): mi panel -> "Reaccionar"; panel ajeno ->
   * "Silenciar" y, si ya se puede, "Expulsar" (la votación solo empieza cuando alguien lo pulsa).
   */
  private accionesPlaqueta(v: VistaMesa, j: JugadorVista, soyYo: boolean): HTMLElement | null {
    const chips: HTMLElement[] = [];
    if (soyYo) {
      chips.push(h('button', {
        class: 'chip-acc', id: 'btn-reaccion-mesa', type: 'button', title: 'Enviar una reacción', 'data-abre-rx': '1',
        onclick: (e: Event) => this.ctx.reacciones.abrirMenu(e.currentTarget as HTMLElement, 'arriba'),
      }, '😀 Reaccionar'));
    } else {
      if (j.silenciado) chips.push(h('span', { class: 'chip-acc info', title: 'La mesa lo silenció (lo pidió la mitad de los jugadores activos)' }, '🔇 Silenciado'));
      chips.push(h('button', {
        class: `chip-acc${j.silenciadoPorMi ? ' activo' : ''}`, type: 'button', dataset: { silenciar: j.id },
        title: j.silenciadoPorMi ? 'Volver a ver sus reacciones' : 'No ver sus reacciones',
        onclick: () => this.ctx.enviar({ t: 'silenciar', jugadorId: j.id, activo: !j.silenciadoPorMi }),
      }, j.silenciadoPorMi ? '🔇 Quitar silencio' : '🔊 Silenciar'));
      if (j.expulsionDisponible && !v.votacion && !j.eliminado) {
        chips.push(h('button', {
          class: 'chip-acc expulsar', type: 'button', dataset: { expulsar: j.id }, title: 'Proponer su expulsión por inactividad (se vota)',
          onclick: () => this.ctx.enviar({ t: 'iniciar_expulsion', objetivoId: j.id }),
        }, '⛔ Expulsar'));
      }
    }
    return chips.length ? h('div', { class: 'acc-plaqueta' }, ...chips) : null;
  }

  private textoMarcador(v: VistaMesa, j: JugadorVista): string {
    const info = MODALIDADES.find((m) => m.id === v.modalidad);
    if (info?.sentidoPuntaje === 'VICTORIAS') return `${j.victorias}/${v.parametros.victoriasObjetivo} victorias - ${j.numCartas} 🂠`;
    const signo = '';
    return `${signo}${j.puntos} pts - ${j.numCartas} 🂠`;
  }

  private pintarInfo(): void {
    const v = this.vista;
    if (!v) return;
    const m = MODALIDADES.find((x) => x.id === v.modalidad)!;
    vaciar(this.info);
    this.info.append(
      h('div', { class: 'linea' }, img(urlIcono('ronda'), 'ic'), h('strong', {}, `Ronda ${v.ronda}`)),
      h('div', { class: 'linea sub' }, m.nombre),
      h('div', { class: 'linea sub' }, `Sala ${v.codigo} - ${v.mazosEnJuego} mazo${v.mazosEnJuego === 1 ? '' : 's'}`),
      h('div', { class: 'linea sub sentido', title: 'Los turnos giran en sentido contrario a las manecillas del reloj' }, 'Sentido antihorario'),
    );
  }

  private pintarLog(): void {
    const ahora = Date.now();
    const lineas = this.ctx.almacen.log.filter((l) => ahora - l.ts < 12000).slice(-5);
    // Reconciliación por id: solo se añaden las líneas nuevas y se quitan las vencidas.
    // (Vaciar y reconstruir en cada tick reiniciaba la animación de entrada y hacía parpadear el historial.)
    const vigentes = new Set(lineas.map((l) => l.id));
    for (const [id, li] of this.lineasLog) {
      if (!vigentes.has(id)) {
        li.remove();
        this.lineasLog.delete(id);
      }
    }
    for (const l of lineas) {
      if (this.lineasLog.has(l.id)) continue;
      const li = h('li', {}, l.texto);
      this.lineasLog.set(l.id, li);
      this.logEl.append(li);
    }
  }

  /* --------- inactividad: aviso propio y votaciones --------- */
  private pintarBannerAuto(v: VistaMesa): void {
    const yo = v.jugadores.find((j) => j.id === v.yoId);
    const clave = yo?.automatico ? 'auto' : yo?.autopiloto ? 'piloto' : '';
    if (this.bannerAuto.dataset.k === clave && this.bannerAuto.firstChild) return;
    this.bannerAuto.dataset.k = clave;
    vaciar(this.bannerAuto);
    this.bannerAuto.classList.toggle('visible', !!clave);
    if (!clave) return;
    agregar(this.bannerAuto,
      h('strong', {}, clave === 'auto' ? 'Modo automático' : 'Piloto automático'),
      h('span', {}, clave === 'auto' ? 'Un bot juega por ti porque llevas varios turnos sin actuar.' : 'Tus turnos esperan el reloj completo y se juegan solos. Actúa para retomar.'),
      h('button', { class: 'btn mini primario', id: 'btn-retomar', type: 'button', onclick: () => { this.ctx.enviar({ t: 'retomar' }); } }, 'Retomar el control'),
    );
  }

  private pintarVotacion(v: VistaMesa): void {
    const vo = v.votacion;
    const p = this.panelVoto;
    if (!vo || v.fase === 'FINALIZADA') {
      if (p.dataset.k) {
        p.dataset.k = '';
        p.classList.remove('visible');
        vaciar(p);
      }
      return;
    }
    const nombre = this.ctx.almacen.nombreDe(vo.objetivoId);
    const soyObjetivo = vo.objetivoId === v.yoId;
    const clave = `${vo.id}:${vo.aFavor}:${vo.enContra}:${vo.elegibles}:${vo.miVoto}:${vo.puedoVotar}`;
    if (p.dataset.k !== clave) {
      p.dataset.k = clave;
      p.classList.add('visible');
      vaciar(p);
      const pregunta = soyObjetivo ? 'Están votando expulsarte de la sala.' : `¿Expulsar a ${nombre} de la sala?`;
      const detalle = `${nombre} lleva varios turnos ausente (en automático). Si se aprueba, un bot termina su mano y sale de la sala.`;
      agregar(p,
        h('div', { class: 'cab-voto' }, h('strong', {}, 'Votación - Expulsión por inactividad'), h('span', { class: 'cuenta-voto', id: 'cuenta-voto' }, '')),
        h('p', { class: 'pregunta' }, pregunta),
        soyObjetivo ? null : h('p', { class: 'detalle-voto' }, detalle),
        h('p', { class: 'conteo' }, `A favor ${vo.aFavor} - En contra ${vo.enContra} - mayoría: ${vo.necesarios} de ${vo.elegibles}`),
        vo.puedoVotar
          ? h('div', { class: 'fila' },
              h('button', { class: 'btn mini primario', id: 'btn-voto-si', type: 'button', onclick: () => { this.ctx.enviar({ t: 'votar', aFavor: true }); } }, 'Sí'),
              h('button', { class: 'btn mini peligro', id: 'btn-voto-no', type: 'button', onclick: () => { this.ctx.enviar({ t: 'votar', aFavor: false }); } }, 'No'))
          : soyObjetivo
            ? h('div', { class: 'fila' }, h('button', { class: 'btn mini primario', id: 'btn-retomar-voto', type: 'button', onclick: () => { this.ctx.enviar({ t: 'retomar' }); } }, 'Estoy aquí: retomar el control'))
            : h('p', { class: 'conteo' }, vo.miVoto === null ? 'No puedes votar (estás ausente o en piloto).' : `Votaste: ${vo.miVoto ? 'Sí' : 'No'}`),
      );
    }
    const c = p.querySelector<HTMLElement>('#cuenta-voto');
    if (c) c.textContent = formatearTiempo(vo.venceEn - this.ctx.almacen.ahoraServidor());
  }

  private tick(): void {
    const v = this.vista;
    if (!v) return;
    this.pintarLog();
    this.pintarVotacion(v);
    const t = v.turno;
    const restante = t ? t.venceEn - this.ctx.almacen.ahoraServidor() : 0;
    const total = t ? (v.parametros.tiempoTurnoSeg * 1000) : 1;
    // Alarma de cuenta atrás: SOLO la oye quien tiene el turno y le quedan ≤ 5 s (un pitido por segundo; doble en el último).
    const yo = v.jugadores.find((j) => j.id === v.yoId);
    if (t && t.jugadorId === v.yoId && v.fase === 'EN_CURSO' && !yo?.automatico && restante > 0 && restante <= 5000) {
      const seg = Math.ceil(restante / 1000);
      const clave = `${t.turnoN}:${seg}`;
      if (clave !== this.alarmaClave) {
        this.alarmaClave = clave;
        this.sonar(seg === 1 ? 'alarma_final' : 'alarma');
      }
    }
    for (const [id, el] of this.plaquetas) {
      const barra = el.querySelector<HTMLElement>('.barra-tiempo i');
      if (!barra) continue;
      const activo = t?.jugadorId === id;
      barra.style.width = activo ? `${Math.max(0, Math.min(100, (restante / Math.max(total, restante)) * 100))}%` : '0%';
    }
    if (v.fase !== 'EN_CURSO' || !t) {
      this.hint.textContent = '';
      this.reloj.textContent = '';
      return;
    }
    this.reloj.textContent = formatearTiempo(restante);
    this.reloj.classList.toggle('urgente', restante < 10000);
    if (t.jugadorId === v.yoId) {
      this.hint.textContent = t.fase === 'ROBAR'
        ? 'Tu turno: roba con un clic en el mazo o el pozo, arrastrando la carta a tu mano, o con M / P'
        : 'Tu turno: descarta una carta (arrástrala al centro de la mesa) o cierra la ronda';
      this.hint.classList.add('mio');
    } else {
      this.hint.textContent = `Turno de ${this.ctx.almacen.nombreDe(t.jugadorId)}...`;
      this.hint.classList.remove('mio');
    }
  }
}

function hash(s: string): number {
  let x = 0;
  for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(x);
}
