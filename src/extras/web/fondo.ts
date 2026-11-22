/**
 * Ambiente inmersivo: capas con paralaje (CSS) + canvas de partículas (motas de luz, polvo, rayos de sol).
 * Niveles de calidad: alto / medio / bajo / off. 'auto' degrada solo si los fotogramas tardan demasiado.
 * Respeta prefers-reduced-motion (arranca en 'off').
 */
import { capasFondo, urlAmbienteSkin } from '../../web/assets.js';
import { skinAmbiente } from '../skins/skins.js';

export type Efectos = 'auto' | 'alto' | 'medio' | 'bajo' | 'off';
type Nivel = Exclude<Efectos, 'auto'>;

interface Particula {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  fase: number;
  vel: number;
  color: string;
  a: number;
}

const ESC_W = 1920;
const ESC_H = 1080;
const ORDEN: Nivel[] = ['alto', 'medio', 'bajo', 'off'];

const CONFIG: Record<Exclude<Nivel, 'off'>, { bokeh: number; polvo: number; escala: number; fps: number }> = {
  alto: { bokeh: 70, polvo: 110, escala: 1, fps: 60 },
  medio: { bokeh: 38, polvo: 55, escala: 0.5, fps: 40 },
  bajo: { bokeh: 14, polvo: 18, escala: 0.34, fps: 24 },
};

const COLORES_BOKEH_DEFECTO = ['255,244,214', '231,194,125', '157,184,154', '255,255,255'];

export class Fondo {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private capas: HTMLElement[] = [];
  private factores: number[] = [];
  private nivel: Nivel = 'alto';
  private modo: Efectos = 'auto';
  private coloresBokeh = COLORES_BOKEH_DEFECTO;
  private bokeh: Particula[] = [];
  private polvo: Particula[] = [];
  private raf = 0;
  private ultimo = 0;
  private acum = 0;
  private cuadros = 0;
  private ventana = 0;
  private objetivoX = 0;
  private objetivoY = 0;
  private mx = 0;
  private my = 0;
  private px = 0;
  private py = 0;
  private reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private readonly contenedor: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'fondo-canvas';
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D no disponible');
    this.ctx = ctx;
    for (const c of capasFondo()) {
      const el = document.createElement('div');
      el.className = 'fondo-capa';
      el.style.backgroundImage = `url(${c.url})`;
      contenedor.append(el);
      this.capas.push(el);
      this.factores.push(c.paralaje);
    }
    this.capas[this.capas.length - 1]?.classList.add('respira');
    contenedor.append(this.canvas);
    const viñeta = document.createElement('div');
    viñeta.className = 'fondo-vineta';
    contenedor.append(viñeta);
    window.addEventListener('pointermove', (e) => {
      const r = this.contenedor.getBoundingClientRect();
      const sx = r.width / ESC_W;
      // Posición normalizada del puntero en [-1, 1] con una pequeña zona muerta central.
      const zm = (v: number): number => (Math.abs(v) < 0.08 ? 0 : v);
      this.objetivoX = zm(Math.max(-1, Math.min(1, ((e.clientX - r.left) / sx - ESC_W / 2) / (ESC_W / 2))));
      this.objetivoY = zm(Math.max(-1, Math.min(1, ((e.clientY - r.top) / sx - ESC_H / 2) / (ESC_H / 2))));
    });
    document.addEventListener('visibilitychange', () => (document.hidden ? this.detener() : this.iniciar()));
  }

  establecer(modo: Efectos): void {
    this.modo = modo;
    this.aplicarNivel(modo === 'auto' ? (this.reducido ? 'off' : 'alto') : modo);
  }

  /** Skin de AMBIENTE (solo la ve quien la elige): cambia las 3 capas de paralaje y los colores de las partículas. */
  establecerAmbiente(id: string): void {
    const sk = skinAmbiente(id);
    this.coloresBokeh = sk.diseno.particulas.length ? sk.diseno.particulas : COLORES_BOKEH_DEFECTO;
    const capas: Array<'far' | 'mid' | 'near'> = ['far', 'mid', 'near'];
    this.capas.forEach((el, i) => {
      const capa = capas[i];
      if (capa) el.style.backgroundImage = `url(${urlAmbienteSkin(sk.id, capa)})`;
    });
    for (const p of [...this.bokeh]) p.color = this.coloresBokeh[Math.floor(Math.random() * this.coloresBokeh.length)]!;
    this.contenedor.dataset.ambiente = sk.id;
  }

  get modoActual(): Efectos {
    return this.modo;
  }

  private aplicarNivel(n: Nivel): void {
    this.nivel = n;
    this.contenedor.dataset.efectos = n;
    this.bokeh = [];
    this.polvo = [];
    this.detener();
    if (n === 'off') {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.canvas.style.display = 'none';
      for (const c of this.capas) c.style.transform = '';
      return;
    }
    const cfg = CONFIG[n];
    this.canvas.style.display = '';
    this.canvas.width = Math.round(ESC_W * cfg.escala);
    this.canvas.height = Math.round(ESC_H * cfg.escala);
    for (let i = 0; i < cfg.bokeh; i++) this.bokeh.push(this.nueva(true, true));
    for (let i = 0; i < cfg.polvo; i++) this.polvo.push(this.nueva(true, false));
    this.iniciar();
  }

  private nueva(inicial: boolean, esBokeh: boolean): Particula {
    const r = esBokeh ? 18 + Math.random() * 60 : 1 + Math.random() * 2.2;
    return {
      x: Math.random() * ESC_W,
      y: inicial ? Math.random() * ESC_H : ESC_H + r,
      r,
      vx: (Math.random() - 0.5) * (esBokeh ? 6 : 14),
      vy: -(esBokeh ? 4 + Math.random() * 8 : 6 + Math.random() * 16),
      fase: Math.random() * Math.PI * 2,
      vel: 0.2 + Math.random() * 0.8,
      color: this.coloresBokeh[Math.floor(Math.random() * this.coloresBokeh.length)]!,
      a: esBokeh ? 0.05 + Math.random() * 0.1 : 0.15 + Math.random() * 0.4,
    };
  }

  private iniciar(): void {
    if (this.raf || this.nivel === 'off' || document.hidden) return;
    this.ultimo = performance.now();
    this.ventana = this.ultimo;
    this.cuadros = 0;
    this.raf = requestAnimationFrame((t) => this.cuadro(t));
  }

  private detener(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private cuadro(t: number): void {
    this.raf = requestAnimationFrame((x) => this.cuadro(x));
    if (this.nivel === 'off') return;
    const cfg = CONFIG[this.nivel];
    const dt = (t - this.ultimo) / 1000;
    if (dt * 1000 < 1000 / cfg.fps - 2) return;
    this.ultimo = t;
    this.acum += dt;
    this.cuadros++;
    this.dibujar(Math.min(dt, 0.1), this.acum, cfg.escala);
    this.paralaje(Math.min(dt, 0.1));
    if (this.modo === 'auto' && t - this.ventana > 2500) {
      const fpsReal = (this.cuadros * 1000) / (t - this.ventana);
      if (fpsReal < 26) {
        const sig = ORDEN[Math.min(ORDEN.indexOf(this.nivel) + 1, ORDEN.length - 1)]!;
        if (sig !== this.nivel) this.aplicarNivel(sig);
        return;
      }
      this.ventana = t;
      this.cuadros = 0;
    }
  }

  /**
   * Paralaje muy suave: el puntero pasa por DOS filtros de paso bajo (constantes de tiempo largas), de modo que
   * movimientos rápidos de ida y vuelta se promedian y el fondo se estabiliza en lugar de balancearse. Amplitud
   * máxima de unos 22 px en la capa cercana.
   */
  private paralaje(dt: number): void {
    const a1 = 1 - Math.exp(-dt / 1.6);
    const a2 = 1 - Math.exp(-dt / 1.0);
    this.mx += (this.objetivoX - this.mx) * a1;
    this.my += (this.objetivoY - this.my) * a1;
    this.px += (this.mx - this.px) * a2;
    this.py += (this.my - this.py) * a2;
    const AMP = 440;
    this.capas.forEach((c, i) => {
      const f = this.factores[i] ?? 0;
      c.style.transform = `translate3d(${(-this.px * f * AMP).toFixed(2)}px, ${(-this.py * f * AMP).toFixed(2)}px, 0)`;
    });
  }

  private dibujar(dt: number, t: number, escala: number): void {
    const ctx = this.ctx;
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
    ctx.clearRect(0, 0, ESC_W, ESC_H);

    // Rayos de sol muy suaves que entran en diagonal (fondo claro: mezcla normal con poca opacidad).
    for (const [x0, ancho, fase] of [
      [520, 220, 0],
      [980, 160, 1.7],
      [1380, 260, 3.1],
    ] as const) {
      const a = 0.05 + 0.025 * Math.sin(t * 0.3 + fase);
      const g = ctx.createLinearGradient(x0, 0, x0 - 360, 1000);
      g.addColorStop(0, `rgba(255,248,226,${a * 2.2})`);
      g.addColorStop(1, 'rgba(255,248,226,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x0, -10);
      ctx.lineTo(x0 + ancho, -10);
      ctx.lineTo(x0 + ancho - 420, 1000);
      ctx.lineTo(x0 - 420 - ancho * 0.4, 1000);
      ctx.closePath();
      ctx.fill();
    }

    // Motas de luz pastel (círculos suaves).
    for (const p of this.bokeh) {
      p.x += (p.vx + Math.sin(t * p.vel + p.fase) * 5) * dt;
      p.y += p.vy * dt;
      if (p.y < -p.r * 2 || p.x < -p.r * 2 || p.x > ESC_W + p.r * 2) Object.assign(p, this.nueva(false, true));
      const pulso = p.a * 0.8 * (0.7 + 0.3 * Math.sin(t * p.vel * 1.5 + p.fase));
      const g = ctx.createRadialGradient(p.x, p.y, p.r * 0.2, p.x, p.y, p.r);
      g.addColorStop(0, `rgba(${p.color},${pulso})`);
      g.addColorStop(0.7, `rgba(${p.color},${pulso * 0.5})`);
      g.addColorStop(1, `rgba(${p.color},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Polvo del desierto: granitos cálidos que flotan con el viento.
    ctx.fillStyle = 'rgb(176,132,98)';
    for (const p of this.polvo) {
      p.x += (p.vx + 10 + Math.sin(t * p.vel + p.fase) * 8) * dt;
      p.y += p.vy * 0.5 * dt;
      if (p.y < -10 || p.x < -10 || p.x > ESC_W + 10) Object.assign(p, this.nueva(false, false));
      ctx.globalAlpha = p.a * 0.6 * (0.5 + 0.5 * Math.sin(t * 1.3 * p.vel + p.fase));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
