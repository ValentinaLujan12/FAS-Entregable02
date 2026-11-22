/**
 * Preferencias visuales locales (solo estética, no afectan al juego ni al servidor):
 *  - `pastel`: suaviza saturación y contraste de todo el escenario (tonos pastel).
 *  - `daltonico`: baraja de cuatro colores distinguibles (paleta Okabe-Ito) con caras alternativas `assets/cards-cb/`
 *    y reverso/contornos de más contraste.
 */
import { establecerDaltonico } from './assets.js';

const LS_VISUAL = 'apuntado.visual';

export interface AjustesVisuales {
  pastel: boolean;
  daltonico: boolean;
}

export class Visual {
  ajustes: AjustesVisuales = { pastel: false, daltonico: false };
  private escuchas: Array<() => void> = [];

  constructor(private readonly raiz: HTMLElement) {
    try {
      const d = JSON.parse(localStorage.getItem(LS_VISUAL) ?? '{}') as Partial<AjustesVisuales>;
      this.ajustes = { pastel: d.pastel === true, daltonico: d.daltonico === true };
    } catch {
      /* valores por defecto */
    }
    this.aplicar();
  }

  alCambiar(fn: () => void): void {
    this.escuchas.push(fn);
  }

  cambiar(parcial: Partial<AjustesVisuales>): void {
    this.ajustes = { ...this.ajustes, ...parcial };
    try {
      localStorage.setItem(LS_VISUAL, JSON.stringify(this.ajustes));
    } catch {
      /* ignorar */
    }
    this.aplicar();
    for (const fn of this.escuchas) fn();
  }

  private aplicar(): void {
    this.raiz.classList.toggle('pastel', this.ajustes.pastel);
    this.raiz.classList.toggle('daltonico', this.ajustes.daltonico);
    establecerDaltonico(this.ajustes.daltonico);
  }
}
