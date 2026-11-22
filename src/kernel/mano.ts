import type { Carta } from './cartas.js';

/** Objeto de valor inmutable. Las pruebas del motor de reglas se ejecutan en memoria sobre Carta/Mano (driver Testability). */
export class Mano {
  private constructor(private readonly _cartas: readonly Carta[]) {}

  static de(cartas: readonly Carta[]): Mano {
    return new Mano(Object.freeze([...cartas]));
  }

  /** Única excepción a la Ley de Deméter declarada en el Entregable 1 (§4.4): devuelve cartas inmutables. */
  get cartas(): readonly Carta[] {
    return this._cartas;
  }

  get tamano(): number {
    return this._cartas.length;
  }

  contiene(cartaId: string): boolean {
    return this._cartas.some((c) => c.id === cartaId);
  }

  sin(cartaId: string): Mano {
    return new Mano(Object.freeze(this._cartas.filter((c) => c.id !== cartaId)));
  }

  con(carta: Carta): Mano {
    return new Mano(Object.freeze([...this._cartas, carta]));
  }
}
