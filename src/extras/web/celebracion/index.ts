/**
 * Celebraciones de victoria: superpone un lienzo (canvas) sobre el escenario con el efecto de la skin del GANADOR y
 * reproduce la música de esa skin.
 *  - Gana el jugador local -> efecto a pantalla completa.
 *  - Gana otro jugador -> efecto pequeño que nace en su puesto y sube en cono invertido.
 *  - `alcance`: 'ronda' (breve, intensidad media, un compás de música) o 'partida' (completo).
 * Los efectos viven en ./efectos.ts y la elección de efecto/colores/música en skins.catalogo.ts (`celebraciones`).
 */
import { skinCelebracion } from '../../skins/skins.js';
import type { Sonido } from '../sonido.js';
import { EFECTOS, type ParamsEfecto } from './efectos.js';

export interface PedidoCelebracion {
  skinId: string;
  /** El ganador soy yo (pantalla completa) o es otro (en su puesto). */
  esMio: boolean;
  alcance: 'ronda' | 'partida';
  /** Punto (coordenadas del escenario 1920x1080) sobre la placa del ganador; obligatorio si `esMio` es false. */
  origen?: { x: number; y: number };
  /** Si el usuario eligió "sin animación" se reduce la intensidad. */
  reducido?: boolean;
}

const ESC_W = 1920;
const ESC_H = 1080;
const ASIENTO = { w: 640, h: 600, ox: 320, oy: 560 };

export class Celebraciones {
  /** Diagnóstico (pruebas E2E): últimas celebraciones lanzadas. */
  readonly historial: Array<{ skinId: string; efecto: string; musica: string; modo: 'pantalla' | 'asiento'; alcance: 'ronda' | 'partida' }> = [];
  private activas = new Set<() => void>();

  constructor(
    private readonly capa: HTMLElement,
    private readonly sonido: Sonido,
    private readonly azar: () => number = Math.random,
  ) {}

  get enCurso(): number {
    return this.activas.size;
  }

  /** Detiene todas las celebraciones (al salir de la sala, etc.). */
  limpiar(): void {
    for (const parar of [...this.activas]) parar();
  }

  lanzar(pedido: PedidoCelebracion): void {
    const skin = skinCelebracion(pedido.skinId);
    const fabrica = EFECTOS[skin.diseno.efecto] ?? EFECTOS.serpentinas;
    if (!fabrica) return;
    const modo: 'pantalla' | 'asiento' = pedido.esMio || !pedido.origen ? 'pantalla' : 'asiento';
    const ronda = pedido.alcance === 'ronda';
    const duracion = ronda ? 3.4 : 7.5;
    const intensidad = (ronda ? 0.55 : 1) * (pedido.reducido ? 0.5 : 1);
    this.historial.push({ skinId: skin.id, efecto: skin.diseno.efecto, musica: skin.diseno.musica, modo, alcance: pedido.alcance });
    if (this.historial.length > 30) this.historial.shift();

    const ancho = modo === 'pantalla' ? ESC_W : ASIENTO.w;
    const alto = modo === 'pantalla' ? ESC_H : ASIENTO.h;
    const origen = modo === 'pantalla' ? { x: ancho / 2, y: alto } : { x: ASIENTO.ox, y: ASIENTO.oy };
    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    canvas.className = `celeb-canvas ${modo}`;
    canvas.dataset.efecto = skin.diseno.efecto;
    if (modo === 'asiento' && pedido.origen) {
      canvas.style.left = `${pedido.origen.x - ASIENTO.ox}px`;
      canvas.style.top = `${pedido.origen.y - ASIENTO.oy}px`;
    }
    this.capa.append(canvas);
    const g = canvas.getContext('2d');
    if (!g) {
      canvas.remove();
      return;
    }
    const params: ParamsEfecto = {
      ancho, alto, modo, origen, colores: skin.diseno.colores, duracion, intensidad, azar: this.azar,
      alSonar: (id, vol) => this.sonido.reproducir(id, vol * (pedido.esMio ? 1 : 0.6)),
    };
    const efecto = fabrica(params);
    // Música: la del ganador (la tuya a todo volumen; la ajena, más suave). En rondas solo el primer compás.
    this.sonido.celebrar(skin.diseno.musica, pedido.esMio ? 1 : 0.55, ronda ? 1 : undefined);

    let t = 0;
    let ultimo = performance.now();
    let raf = 0;
    const parar = (): void => {
      cancelAnimationFrame(raf);
      canvas.remove();
      this.activas.delete(parar);
    };
    const cuadro = (ahora: number): void => {
      const dt = Math.min(0.05, (ahora - ultimo) / 1000);
      ultimo = ahora;
      t += dt;
      g.clearRect(0, 0, ancho, alto);
      if (!efecto.paso(dt, g, t) || t > duracion + 6) return parar();
      raf = requestAnimationFrame(cuadro);
    };
    this.activas.add(parar);
    raf = requestAnimationFrame(cuadro);
  }
}
