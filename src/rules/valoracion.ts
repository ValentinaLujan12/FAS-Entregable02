import type { Carta } from '../kernel/cartas.js';

/** Puntos de las figuras (J, Q, K); el resto de valores naturales vale su número. */
const FIGURAS: Readonly<Record<string, number>> = { J: 10, Q: 10, K: 10 };

/**
 * Valor nominal de una carta según la MODALIDAD (no vive en la Carta).
 * 2-10 = valor; J, Q, K = 10; As = parámetro (1, 10 u 11); comodín = 0.
 */
export class Valoracion {
  constructor(private readonly valorAs: 1 | 10 | 11) {}

  puntosDe = (carta: Carta): number => {
    if (carta.esComodin) return 0;
    if (carta.valor === 'A') return this.valorAs;
    return FIGURAS[carta.valor] ?? Number(carta.valor);
  };

  sumar = (cartas: readonly Carta[]): number => cartas.reduce((acc, c) => acc + this.puntosDe(c), 0);
}
