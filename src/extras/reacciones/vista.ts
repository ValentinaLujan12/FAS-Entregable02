/**
 * Reacciones rápidas (chat básico SIN texto libre): menú desplegable desde el panel propio y burbujas sobre el panel de
 * quien reacciona, con sonido. El servidor valida ids (catálogo compartido), aplica anti-spam y silencios, y decide a
 * quién se entrega cada reacción; aquí solo se pinta lo recibido.
 */
import { REACCIONES, reaccion } from './reacciones.js';
import type { MensajeCliente } from '../../kernel/protocolo.js';
import type { Sonido } from '../web/sonido.js';
import { h } from '../../web/dom.js';

const DURACION_BURBUJA_MS = 3400;

/** Lo que las reacciones necesitan de la pantalla (subconjunto del Contexto de la web; evita un ciclo web <-> extras). */
export interface ContextoReacciones {
  sonido: Pick<Sonido, 'reproducir'>;
  enviar(m: MensajeCliente): void;
}

export class Reacciones {
  readonly capa = h('div', { class: 'capa-rx' });
  private menu: HTMLElement | null = null;
  private burbujas = new Map<string, { el: HTMLElement; timer: number }>();
  private ctx!: ContextoReacciones;

  /** Se enlaza tras crear el contexto (evita la dependencia circular). */
  enlazar(ctx: ContextoReacciones): void {
    this.ctx = ctx;
    window.addEventListener('keydown', (e) => e.key === 'Escape' && this.cerrarMenu());
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (this.menu && !this.menu.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('[data-abre-rx]')) this.cerrarMenu();
      },
      true,
    );
  }

  /** Coordenadas del elemento en el escenario 1920x1080. */
  private rectEscenario(el: HTMLElement): { x: number; y: number; w: number; h: number } {
    const esc = this.capa.parentElement!.getBoundingClientRect();
    const s = esc.width / 1920 || 1;
    const r = el.getBoundingClientRect();
    return { x: (r.left - esc.left) / s, y: (r.top - esc.top) / s, w: r.width / s, h: r.height / s };
  }

  private anclaDe(jugadorId: string): HTMLElement | null {
    return this.capa.parentElement?.querySelector<HTMLElement>(`.plaqueta[data-id="${jugadorId}"], .jugador[data-id="${jugadorId}"]`) ?? null;
  }

  /** Burbuja con la reacción sobre el panel del jugador + sonido. Llamado al llegar `{t:'reaccion'}`. */
  mostrar(jugadorId: string, id: string, yoId: string | undefined): void {
    const def = reaccion(id);
    if (!def) return;
    this.ctx.sonido.reproducir(`rx_${def.sonido}`, jugadorId === yoId ? 0.8 : 1);
    const ancla = this.anclaDe(jugadorId);
    if (!ancla) return;
    const r = this.rectEscenario(ancla);
    const previa = this.burbujas.get(jugadorId);
    if (previa) {
      window.clearTimeout(previa.timer);
      previa.el.remove();
    }
    const debajo = r.y < 120;
    const el = h('div', { class: `burbuja-rx${debajo ? ' abajo' : ''}`, dataset: { jugador: jugadorId, rx: id }, role: 'status' }, h('span', { class: 'emoji' }, def.emoji), h('span', { class: 'txt' }, def.texto));
    Object.assign(el.style, { left: `${r.x + r.w / 2}px`, top: `${debajo ? r.y + r.h + 8 : r.y - 8}px` });
    this.capa.append(el);
    const timer = window.setTimeout(() => {
      el.classList.add('saliendo');
      window.setTimeout(() => el.remove(), 260);
      this.burbujas.delete(jugadorId);
    }, DURACION_BURBUJA_MS);
    this.burbujas.set(jugadorId, { el, timer });
  }

  cerrarMenu(): void {
    this.menu?.remove();
    this.menu = null;
  }

  /** Menú desplegable de reacciones anclado a un elemento (mi panel / botón de la sala). */
  abrirMenu(ancla: HTMLElement, direccion: 'arriba' | 'abajo' = 'arriba'): void {
    if (this.menu) {
      this.cerrarMenu();
      return;
    }
    const m = h('div', { class: `menu-rx ${direccion}`, id: 'menu-reacciones', role: 'menu' },
      ...REACCIONES.map((r) =>
        h('button', { class: 'rx', type: 'button', title: r.texto, dataset: { rx: r.id }, onclick: () => {
          this.ctx.enviar({ t: 'reaccion', id: r.id });
          this.cerrarMenu();
        } }, h('span', { class: 'emoji' }, r.emoji), h('small', {}, r.texto)),
      ),
    );
    const r = this.rectEscenario(ancla);
    Object.assign(m.style, direccion === 'arriba'
      ? { left: `${r.x}px`, bottom: `${1080 - r.y + 8}px` }
      : { left: `${Math.min(1920 - 440, r.x)}px`, top: `${r.y + r.h + 8}px` });
    this.capa.append(m);
    this.menu = m;
  }

  limpiar(): void {
    this.cerrarMenu();
    for (const { el, timer } of this.burbujas.values()) {
      window.clearTimeout(timer);
      el.remove();
    }
    this.burbujas.clear();
  }
}
