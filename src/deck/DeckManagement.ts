import type { Carta } from '../kernel/cartas.js';
import { type Aleatorio, barajar } from './Baraja.js';
import type { EstadoMazo, IMazo, ResultadoRobo } from './IMazo.js';

export type { EstadoMazo, ResultadoRobo } from './IMazo.js';

/**
 * DeckManagement (DeckManagementComponent, IMazo): extracciones del mazo ciego y del pozo de descarte.
 * El estado es un dato plano serializable (persistencia y recuperación tras reinicio, RF19).
 */
export class DeckManagement implements IMazo {
  constructor(private readonly e: EstadoMazo) {}

  static desde(cartasBarajadas: Carta[]): DeckManagement {
    return new DeckManagement({ mazo: [...cartasBarajadas], pozo: [], reciclajes: 0 });
  }

  get restantes(): number {
    return this.e.mazo.length;
  }
  get cantidadPozo(): number {
    return this.e.pozo.length;
  }
  get topePozo(): Carta | null {
    return this.e.pozo[this.e.pozo.length - 1] ?? null;
  }
  get reciclajes(): number {
    return this.e.reciclajes;
  }

  repartir(n: number): Carta[] {
    return this.e.mazo.splice(0, n);
  }

  voltearInicial(): void {
    const c = this.e.mazo.shift();
    if (c) this.e.pozo.push(c);
  }

  robarDelMazo(rng: Aleatorio, maxReciclajes: number): ResultadoRobo | null {
    if (this.e.mazo.length > 0) return { carta: this.e.mazo.shift()!, reciclado: false };
    if (this.e.pozo.length <= 1 || this.e.reciclajes >= maxReciclajes) return null;
    const tope = this.e.pozo.pop()!;
    this.e.mazo = barajar(this.e.pozo, rng);
    this.e.pozo = [tope];
    this.e.reciclajes++;
    return { carta: this.e.mazo.shift()!, reciclado: true };
  }

  robarDelPozo(): Carta | null {
    return this.e.pozo.pop() ?? null;
  }

  descartar(carta: Carta): void {
    this.e.pozo.push(carta);
  }

  snapshot(): EstadoMazo {
    return this.e;
  }
}
