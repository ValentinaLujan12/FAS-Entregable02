/**
 * Sonido SINTETIZADO con WebAudio (sin archivos de audio): efectos + música generativa por contexto (ver musica.ts). Los ajustes viven en
 * localStorage ('apuntado.sonido').
 *
 * Interruptores (todos conservan su valor aunque el general esté apagado):
 *  - `activo`     SONIDO GENERAL. Apagado = no suena NADA (efectos ni música); los demás quedan en gris.
 *  - `completos`  Efectos completos (sí): incluye arrastrar, soltar, seleccionar, deseleccionar y agrupar. (no): solo los básicos.
 *  - `clic`       Respuesta al clic / toque en botones.
 *  - `musica`     Música de fondo (retro y tranquila, generada al azar pero con sentido: tonalidad, progresión y motivo).
 *  - `volumen`    Nivel general 0..100.
 */
import { Compositor, RECETAS_CELEBRACION, elegirReceta, type ContextoMusica, type EventoNota, type Onda, type Receta } from './musica.js';

export type SonidoId =
  | 'robar' | 'descartar' | 'turno' | 'error' | 'cerrar' | 'aviso' | 'alarma' | 'alarma_final'
  | 'arrastrar' | 'soltar' | 'seleccionar' | 'deseleccionar' | 'agrupar'
  | 'clic'
  | 'estallido'
  | 'rx_saludo' | 'rx_risa' | 'rx_aplauso' | 'rx_uy' | 'rx_trompeta' | 'rx_queja' | 'rx_burla' | 'rx_ok';

export interface AjustesSonido {
  activo: boolean;
  completos: boolean;
  clic: boolean;
  musica: boolean;
  /** Sonidos de las reacciones rápidas de los demás jugadores (y las tuyas). */
  reacciones: boolean;
  /** Música y efectos de las celebraciones de victoria. */
  celebraciones: boolean;
  /** 0..100 */
  volumen: number;
}

const LS_SONIDO = 'apuntado.sonido';
const EXTRA = new Set<SonidoId>(['arrastrar', 'soltar', 'seleccionar', 'deseleccionar', 'agrupar']);
const POR_DEFECTO: AjustesSonido = { activo: true, completos: true, clic: true, musica: true, reacciones: true, celebraciones: true, volumen: 60 };

/** Nodos de salida con eco propio: uno para la música de fondo y otro para las celebraciones (así se puede atenuar la música). */
interface Destino {
  bus: GainNode;
  eco: GainNode;
}

const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

export class Sonido {
  ajustes: AjustesSonido = { ...POR_DEFECTO };
  /** Registro (solo pruebas / diagnóstico) de los sonidos pedidos que sí sonaron. */
  readonly historial: SonidoId[] = [];
  /** Registro de celebraciones reproducidas (id de música). */
  readonly celebraciones: string[] = [];
  /** Diagnóstico de la música: notas programadas y pieza en curso. */
  diag = { notas: 0, tonalidad: '', progresion: [] as number[], bpm: 0, contexto: '' as string, receta: '' as string, piezas: 0 };
  private ac: AudioContext | null = null;
  private maestro: GainNode | null = null;
  private dMusica: Destino | null = null;
  private dCelebra: Destino | null = null;
  private ruido: AudioBuffer | null = null;
  private escuchas: Array<() => void> = [];

  /* estado del secuenciador */
  private timer = 0;
  private sonando = false;
  private proximo = 0;
  private paso = 0;
  private comp: Compositor | null = null;
  private contextoMusica: ContextoMusica = 'sala';
  private ultimaReceta = new Map<ContextoMusica, string>();
  private pulso25: PeriodicWave | null = null;
  private timerDuck = 0;

  constructor() {
    try {
      const crudo = localStorage.getItem(LS_SONIDO);
      if (crudo) {
        const d = JSON.parse(crudo) as Partial<AjustesSonido> & { soloBasicos?: boolean };
        this.ajustes = {
          activo: typeof d.activo === 'boolean' ? d.activo : POR_DEFECTO.activo,
          // migración: "solo básicos" (versión anterior) = lo contrario de "efectos completos"
          completos: typeof d.completos === 'boolean' ? d.completos : typeof d.soloBasicos === 'boolean' ? !d.soloBasicos : POR_DEFECTO.completos,
          clic: typeof d.clic === 'boolean' ? d.clic : POR_DEFECTO.clic,
          musica: typeof d.musica === 'boolean' ? d.musica : POR_DEFECTO.musica,
          reacciones: typeof d.reacciones === 'boolean' ? d.reacciones : POR_DEFECTO.reacciones,
          celebraciones: typeof d.celebraciones === 'boolean' ? d.celebraciones : POR_DEFECTO.celebraciones,
          volumen: typeof d.volumen === 'number' ? Math.max(0, Math.min(100, d.volumen)) : POR_DEFECTO.volumen,
        };
      }
    } catch {
      /* valores por defecto */
    }
    // Los navegadores exigen un gesto del usuario para iniciar el audio: se "despierta" en la primera interacción.
    const despertar = (): void => {
      this.contexto();
      this.sincronizarMusica();
      window.removeEventListener('pointerdown', despertar, true);
      window.removeEventListener('keydown', despertar, true);
    };
    window.addEventListener('pointerdown', despertar, true);
    window.addEventListener('keydown', despertar, true);
    // Pestaña oculta: se pausa el audio (música incluida).
    document.addEventListener('visibilitychange', () => {
      if (!this.ac) return;
      if (document.hidden) void this.ac.suspend();
      else void this.ac.resume();
    });
  }

  alCambiar(fn: () => void): void {
    this.escuchas.push(fn);
  }

  cambiar(parcial: Partial<AjustesSonido>): void {
    this.ajustes = { ...this.ajustes, ...parcial };
    try {
      localStorage.setItem(LS_SONIDO, JSON.stringify(this.ajustes));
    } catch {
      /* ignorar */
    }
    if (this.maestro) this.maestro.gain.value = this.ganancia();
    this.sincronizarMusica();
    for (const fn of this.escuchas) fn();
  }

  /** ¿Debe estar sonando la música con los ajustes actuales? */
  get musicaDeberiaSonar(): boolean {
    const a = this.ajustes;
    return a.activo && a.musica && a.volumen > 0;
  }

  get musicaSonando(): boolean {
    return this.sonando;
  }

  /** Contexto musical vigente (sala / modalidad) y receta de la pieza en curso. */
  get contextoActual(): ContextoMusica {
    return this.contextoMusica;
  }

  get recetaActual(): Receta | null {
    return this.comp?.receta ?? null;
  }

  private ganancia(): number {
    return (this.ajustes.volumen / 100) ** 1.6 * 0.5;
  }

  private crearDestino(ac: AudioContext, destino: AudioNode, nivel: number): Destino {
    const bus = ac.createGain();
    bus.gain.value = nivel;
    bus.connect(destino);
    const retardo = ac.createDelay(1);
    retardo.delayTime.value = 0.36;
    const realim = ac.createGain();
    realim.gain.value = 0.28;
    const filtro = ac.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = 2400;
    const eco = ac.createGain();
    eco.gain.value = 0.5;
    eco.connect(retardo);
    retardo.connect(filtro);
    filtro.connect(realim);
    realim.connect(retardo);
    filtro.connect(bus);
    return { bus, eco };
  }

  private contexto(): AudioContext | null {
    if (this.ac) {
      if (this.ac.state === 'suspended' && !document.hidden) void this.ac.resume();
      return this.ac;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ac = new Ctor();
      this.maestro = this.ac.createGain();
      this.maestro.gain.value = this.ganancia();
      this.maestro.connect(this.ac.destination);
      this.dMusica = this.crearDestino(this.ac, this.maestro, 0);
      this.dCelebra = this.crearDestino(this.ac, this.maestro, 0.8);
      const n = Math.floor(this.ac.sampleRate * 0.5);
      this.ruido = this.ac.createBuffer(1, n, this.ac.sampleRate);
      const datos = this.ruido.getChannelData(0);
      for (let i = 0; i < n; i++) datos[i] = Math.random() * 2 - 1;
      // Onda de pulso 25 % (sonido típico de consola de 8 bits)
      const N = 32;
      const re = new Float32Array(N);
      const im = new Float32Array(N);
      for (let k = 1; k < N; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
      this.pulso25 = this.ac.createPeriodicWave(re, im);
      return this.ac;
    } catch {
      return null;
    }
  }

  /** ¿Sonaría este efecto con los ajustes actuales? */
  permite(id: SonidoId): boolean {
    const a = this.ajustes;
    if (!a.activo || a.volumen <= 0) return false;
    if (id === 'clic') return a.clic;
    if (id.startsWith('rx_')) return a.reacciones;
    if (id === 'estallido') return a.celebraciones;
    if (!a.completos && EXTRA.has(id)) return false;
    return true;
  }

  /** `suave`: volumen relativo (0..1), p. ej. para acciones de otros jugadores. */
  reproducir(id: SonidoId, suave = 1): void {
    if (!this.permite(id)) return;
    this.historial.push(id);
    if (this.historial.length > 200) this.historial.shift();
    const ac = this.contexto();
    if (!ac || !this.maestro) return;
    const t = ac.currentTime + 0.005;
    try {
      this.sintetizar(ac, id, t, suave);
    } catch {
      /* el audio nunca debe romper el juego */
    }
  }

  /* --------- música por contexto --------- */
  /**
   * Cambia el contexto musical (sala o modalidad) y REINICIA la música con una pieza nueva del contexto
   * (distinta de la anterior). Se llama al empezar cada ronda y cada partida, y al volver a la sala.
   */
  iniciarPieza(contexto: ContextoMusica): void {
    this.contextoMusica = contexto;
    if (this.musicaDeberiaSonar) this.arrancarMusica(this.sonando);
    else this.diag.contexto = contexto; // se compondrá al activar la música
  }

  /** Arranca o detiene la música según los ajustes (con fundido). */
  private sincronizarMusica(): void {
    const quiere = this.musicaDeberiaSonar;
    if (quiere && !this.sonando) this.arrancarMusica(false);
    else if (!quiere && this.sonando) this.detenerMusica();
  }

  private arrancarMusica(reinicio: boolean): void {
    const ac = this.contexto();
    if (!ac || !this.dMusica) return; // aún sin gesto del usuario: se reintenta en la primera interacción
    const g = this.dMusica.bus.gain;
    const t = ac.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    let inicio = t + 0.3;
    if (reinicio) {
      // fundido corto hacia la pieza nueva: no se mezclan dos canciones
      g.linearRampToValueAtTime(0, t + 0.2);
      g.linearRampToValueAtTime(this.nivelMusica(), t + 1.4);
      inicio = t + 0.28;
    } else g.linearRampToValueAtTime(this.nivelMusica(), t + 1.5);
    this.sonando = true;
    const receta = elegirReceta(this.contextoMusica, this.ultimaReceta.get(this.contextoMusica) ?? null);
    this.ultimaReceta.set(this.contextoMusica, receta.id);
    this.comp = new Compositor(receta);
    this.diag.contexto = this.contextoMusica;
    this.diag.receta = receta.id;
    this.diag.bpm = this.comp.bpm;
    this.diag.tonalidad = `MIDI ${this.comp.tonica}`;
    this.diag.progresion = [...this.comp.progresion];
    this.diag.piezas++;
    this.proximo = inicio;
    this.paso = 0;
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.agendar(), 120);
  }

  private nivelMusica(): number {
    return this.atenuada ? 0.12 : 0.55;
  }
  private atenuada = false;

  private detenerMusica(): void {
    this.sonando = false;
    const ac = this.ac;
    if (ac && this.dMusica) {
      const g = this.dMusica.bus.gain;
      g.cancelScheduledValues(ac.currentTime);
      g.setValueAtTime(g.value, ac.currentTime);
      g.linearRampToValueAtTime(0, ac.currentTime + 0.35);
    }
    window.clearInterval(this.timer);
    this.timer = 0;
  }

  private agendar(): void {
    const ac = this.ac;
    const comp = this.comp;
    if (!ac || !this.sonando || !this.dMusica || !comp) return;
    const seg = comp.segundosPaso;
    while (this.proximo < ac.currentTime + 0.45) {
      const { retraso, eventos } = comp.paso(this.paso);
      for (const ev of eventos) this.tocar(ac, ev, this.proximo + retraso * seg, seg, this.dMusica, comp.receta);
      this.proximo += seg;
      this.paso++;
    }
  }

  /** Traduce un evento musical a síntesis. */
  private tocar(ac: AudioContext, ev: EventoNota, t: number, seg: number, d: Destino, r: Receta): void {
    const dur = ev.dur * seg;
    switch (ev.voz) {
      case 'bajo':
        this.osc(ac, t, ev.midi!, dur * 1.05, ev.vol, ev.onda ?? 'triangle', d);
        break;
      case 'arp':
        this.osc(ac, t, ev.midi!, dur, ev.vol, ev.onda ?? 'pulso', d, r.arp?.eco ?? 0.3);
        break;
      case 'pad':
        this.osc(ac, t, ev.midi!, dur, ev.vol, ev.onda ?? 'sine', d, 0.3, Math.min(0.6, dur * 0.4));
        break;
      case 'mel':
        this.osc(ac, t, ev.midi!, dur * 1.1, ev.vol, ev.onda ?? 'square', d, r.mel?.eco ?? 0.4);
        break;
      case 'kick':
        this.tono(ac, t, 150, 0.16, 0.9 * ev.vol, 'sine', 42, d.bus);
        break;
      case 'caja':
        this.soplo(ac, t, 0.11, 0.5 * ev.vol, 2600, 900, 0.8, 'bandpass', d.bus);
        this.tono(ac, t, 200, 0.08, 0.35 * ev.vol, 'triangle', 140, d.bus);
        break;
      case 'hat':
        this.soplo(ac, t, 0.04, 0.32 * ev.vol, 9000, 7000, 0.7, 'highpass', d.bus);
        break;
      case 'tic':
        this.tono(ac, t, 2100, 0.035, 0.28 * ev.vol, 'square', 1500, d.bus);
        this.soplo(ac, t, 0.02, 0.18 * ev.vol, 3800, 3000, 1, 'bandpass', d.bus);
        break;
      case 'clap':
        this.soplo(ac, t, 0.06, 0.45 * ev.vol, 1600, 1300, 1, 'bandpass', d.bus);
        this.soplo(ac, t + 0.014, 0.08, 0.4 * ev.vol, 1500, 1100, 1, 'bandpass', d.bus);
        break;
      case 'boom':
        this.soplo(ac, t, 0.5, 0.8 * ev.vol, 400, 70, 0.6, 'lowpass', d.bus);
        this.tono(ac, t, 80, 0.45, 0.7 * ev.vol, 'sine', 40, d.bus);
        break;
    }
    this.diag.notas++;
  }

  private osc(ac: AudioContext, t: number, midi: number, dur: number, vol: number, tipo: Onda, d: Destino, alEco = 0, ataque = 0.015): void {
    const o = ac.createOscillator();
    const g = ac.createGain();
    if (tipo === 'pulso' && this.pulso25) o.setPeriodicWave(this.pulso25);
    else o.type = tipo === 'pulso' ? 'square' : tipo;
    o.frequency.value = hz(midi);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + ataque);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * 0.45), t + Math.max(dur * 0.6, ataque + 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, ataque + 0.02));
    o.connect(g);
    g.connect(d.bus);
    if (alEco > 0) {
      const e = ac.createGain();
      e.gain.value = alEco;
      g.connect(e);
      e.connect(d.eco);
    }
    o.start(t);
    o.stop(t + Math.max(dur, ataque + 0.02) + 0.05);
  }

  /** Atenúa la música de fondo mientras suena una celebración. */
  private atenuarMusica(ms: number): void {
    if (!this.ac || !this.dMusica) return;
    this.atenuada = true;
    if (this.sonando) {
      const g = this.dMusica.bus.gain;
      g.cancelScheduledValues(this.ac.currentTime);
      g.setValueAtTime(g.value, this.ac.currentTime);
      g.linearRampToValueAtTime(this.nivelMusica(), this.ac.currentTime + 0.25);
    }
    window.clearTimeout(this.timerDuck);
    this.timerDuck = window.setTimeout(() => {
      this.atenuada = false;
      if (this.ac && this.dMusica && this.sonando) {
        const g = this.dMusica.bus.gain;
        g.cancelScheduledValues(this.ac.currentTime);
        g.setValueAtTime(g.value, this.ac.currentTime);
        g.linearRampToValueAtTime(this.nivelMusica(), this.ac.currentTime + 1.2);
      }
    }, ms);
  }

  /**
   * Música de una celebración de victoria (`diseno.musica` de la skin: fanfarria, campanas, disco, synthwave...).
   * `relativo` 0..1: volumen (la tuya = 1; la de otros jugadores, menor). Devuelve la duración en ms.
   */
  celebrar(musicaId: string, relativo = 1, compasesMax?: number): number {
    const a = this.ajustes;
    if (!a.activo || !a.celebraciones || a.volumen <= 0) return 0;
    const receta = RECETAS_CELEBRACION[musicaId] ?? RECETAS_CELEBRACION.fanfarria!;
    this.celebraciones.push(receta.id);
    if (this.celebraciones.length > 50) this.celebraciones.shift();
    const ac = this.contexto();
    if (!ac || !this.dCelebra) return 0;
    const comp = new Compositor(receta);
    const seg = comp.segundosPaso;
    const t0 = ac.currentTime + 0.05;
    this.dCelebra.bus.gain.value = 0.9 * Math.max(0, Math.min(1, relativo));
    const pasos = compasesMax ? Math.min(comp.pasosTotales, compasesMax * comp.pasosCompas) : comp.pasosTotales;
    for (let n = 0; n < pasos; n++) {
      const { retraso, eventos } = comp.paso(n);
      for (const ev of eventos) this.tocar(ac, ev, t0 + (n + retraso) * seg, seg, this.dCelebra, receta);
    }
    const ms = Math.round(pasos * seg * 1000) + 600;
    this.atenuarMusica(ms);
    return ms;
  }

  /* --------- síntesis de efectos --------- */
  private tono(ac: AudioContext, t: number, f0: number, dur: number, vol: number, tipo: OscillatorType = 'sine', f1?: number, destino?: AudioNode): void {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(0.012, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(destino ?? this.maestro!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private soplo(ac: AudioContext, t: number, dur: number, vol: number, f0: number, f1: number, q = 1.2, tipo: BiquadFilterType = 'bandpass', destino?: AudioNode): void {
    const src = ac.createBufferSource();
    src.buffer = this.ruido;
    src.loop = true;
    const filtro = ac.createBiquadFilter();
    filtro.type = tipo;
    filtro.Q.value = q;
    filtro.frequency.setValueAtTime(f0, t);
    filtro.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(0.015, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filtro).connect(g).connect(destino ?? this.maestro!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private sintetizar(ac: AudioContext, id: SonidoId, t: number, v: number): void {
    switch (id) {
      case 'robar': // carta deslizándose: soplo agudo + golpecito
        this.soplo(ac, t, 0.16, 0.5 * v, 900, 3800, 0.9);
        this.tono(ac, t + 0.1, 520, 0.05, 0.12 * v, 'triangle');
        break;
      case 'descartar': // carta cayendo sobre el tapete
        this.tono(ac, t, 170, 0.14, 0.55 * v, 'sine', 70);
        this.soplo(ac, t, 0.09, 0.35 * v, 2400, 500, 0.7);
        break;
      case 'turno': // dos notas suaves ascendentes
        this.tono(ac, t, 784, 0.18, 0.28 * v, 'sine');
        this.tono(ac, t + 0.11, 1175, 0.3, 0.26 * v, 'sine');
        break;
      case 'error': // zumbido grave doble
        this.tono(ac, t, 150, 0.12, 0.3 * v, 'square', 120);
        this.tono(ac, t + 0.14, 125, 0.16, 0.3 * v, 'square', 95);
        break;
      case 'cerrar': // pequeño arpegio mayor
        [523, 659, 784, 1047].forEach((f, i) => this.tono(ac, t + i * 0.09, f, 0.35, 0.24 * v, 'triangle'));
        break;
      case 'aviso': // campanita
        this.tono(ac, t, 988, 0.25, 0.24 * v, 'sine');
        this.tono(ac, t + 0.02, 1976, 0.18, 0.08 * v, 'sine');
        break;
      case 'alarma': // pitido corto de cuenta atrás (últimos 5 s del turno)
        this.tono(ac, t, 1320, 0.11, 0.34 * v, 'square');
        break;
      case 'alarma_final': // último segundo: doble pitido más agudo
        this.tono(ac, t, 1760, 0.1, 0.38 * v, 'square');
        this.tono(ac, t + 0.15, 1760, 0.16, 0.38 * v, 'square');
        break;
      case 'arrastrar': // levantar la carta
        this.soplo(ac, t, 0.1, 0.25 * v, 600, 1800, 1);
        this.tono(ac, t, 300, 0.08, 0.1 * v, 'sine', 420);
        break;
      case 'soltar':
        this.tono(ac, t, 240, 0.08, 0.28 * v, 'sine', 160);
        this.soplo(ac, t, 0.05, 0.14 * v, 1800, 700, 0.8);
        break;
      case 'seleccionar':
        this.tono(ac, t, 660, 0.06, 0.22 * v, 'triangle', 760);
        break;
      case 'deseleccionar':
        this.tono(ac, t, 520, 0.06, 0.18 * v, 'triangle', 400);
        break;
      case 'agrupar': // dos notas que "encajan"
        this.tono(ac, t, 523, 0.14, 0.24 * v, 'triangle');
        this.tono(ac, t + 0.09, 784, 0.24, 0.24 * v, 'triangle');
        this.tono(ac, t + 0.09, 1568, 0.18, 0.06 * v, 'sine');
        break;
      case 'clic': // "tic" claro y audible: golpe seco + tono corto
        this.soplo(ac, t, 0.035, 0.45 * v, 3200, 1800, 1.2);
        this.tono(ac, t, 1500, 0.06, 0.34 * v, 'triangle', 900);
        break;
      case 'estallido': // fuegos artificiales: golpe grave + chisporroteo
        this.soplo(ac, t, 0.35, 0.55 * v, 500, 90, 0.6, 'lowpass');
        this.tono(ac, t, 90, 0.3, 0.4 * v, 'sine', 40);
        for (let i = 0; i < 6; i++) this.soplo(ac, t + 0.1 + i * 0.045, 0.03, 0.2 * v, 5200, 3600, 1);
        break;
      /* -- reacciones rápidas -- */
      case 'rx_saludo': // "¡hola!": dos notas alegres
        this.tono(ac, t, 660, 0.12, 0.26 * v, 'triangle', 700);
        this.tono(ac, t + 0.1, 988, 0.22, 0.26 * v, 'triangle', 1040);
        break;
      case 'rx_risa': // "ja-ja-ja": notas cortas que bajan
        [520, 470, 520, 440, 400].forEach((f, i) => this.tono(ac, t + i * 0.085, f, 0.07, 0.26 * v, 'square', f * 0.85));
        break;
      case 'rx_aplauso': // palmas: ráfagas de ruido
        for (let i = 0; i < 9; i++) this.soplo(ac, t + i * 0.055 + (i % 3) * 0.01, 0.04, 0.5 * v, 1900, 1300, 0.9);
        break;
      case 'rx_uy': // "uy": glissando descendente
        this.tono(ac, t, 520, 0.3, 0.26 * v, 'sine', 280);
        this.tono(ac, t + 0.02, 780, 0.28, 0.1 * v, 'sine', 420);
        break;
      case 'rx_trompeta': // "ta-dá" corto de trompeta
        this.tono(ac, t, 392, 0.11, 0.2 * v, 'sawtooth');
        this.tono(ac, t + 0.12, 523, 0.3, 0.22 * v, 'sawtooth');
        break;
      case 'rx_queja': // "bwomp"
        this.tono(ac, t, 230, 0.2, 0.28 * v, 'square', 150);
        this.tono(ac, t + 0.22, 180, 0.3, 0.28 * v, 'square', 95);
        break;
      case 'rx_burla': // "wah-wah"
        this.tono(ac, t, 520, 0.18, 0.24 * v, 'triangle', 330);
        this.tono(ac, t + 0.22, 440, 0.3, 0.24 * v, 'triangle', 240);
        break;
      case 'rx_ok': // "ding" agradable
        this.tono(ac, t, 880, 0.14, 0.24 * v, 'triangle');
        this.tono(ac, t + 0.08, 1318, 0.28, 0.22 * v, 'triangle');
        break;
    }
  }
}
