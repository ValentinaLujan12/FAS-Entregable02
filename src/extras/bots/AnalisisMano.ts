import type { Carta, ValorNatural } from '../../kernel/cartas.js';
import { HandEvaluator } from '../../rules/HandEvaluator.js';
import { Valoracion } from '../../rules/valoracion.js';
import { rangoNumerico } from '../../kernel/cartas.js';

/**
 * Análisis heurístico de una mano (menor costo = mejor). Lo comparten el descarte automático por timeout
 * (RF08) y los bots. No decide reglas de cierre: eso es exclusivo de IReglaJuego.validarVictoria.
 */
export class AnalisisMano {
  constructor(
    private readonly validador: HandEvaluator,
    private readonly puntosDe: (c: Carta) => number,
    private readonly tamanos: readonly number[],
  ) {}

  /** Costo de una mano: puntos de sueltas + penalidad por sueltas - bonos por casi-combinaciones y comodines guardados. */
  costo(cartas: readonly Carta[]): number {
    const part = this.validador.mejorParticion(cartas, this.tamanos, this.puntosDe);
    const sueltas = part.sobrantes;
    let costo = 0;
    for (const c of sueltas) costo += this.puntosDe(c) + 3;
    for (const c of sueltas) if (c.esComodin) costo -= 25;
    for (let i = 0; i < sueltas.length; i++) {
      for (let j = i + 1; j < sueltas.length; j++) {
        if (this.cercanas(sueltas[i]!, sueltas[j]!)) costo -= 4;
      }
    }
    return costo;
  }

  private cercanas(a: Carta, b: Carta): boolean {
    if (a.esComodin || b.esComodin) return false;
    if (a.valor === b.valor) return true;
    if (a.pinta !== b.pinta) return false;
    const d = Math.abs(rangoNumerico(a.valor as ValorNatural, 'BAJO') - rangoNumerico(b.valor as ValorNatural, 'BAJO'));
    return d <= 2 || (a.valor === 'A' && ['K', 'Q'].includes(b.valor)) || (b.valor === 'A' && ['K', 'Q'].includes(a.valor));
  }

  /** Carta a descartar de una mano de N+1: la que deja la mano de N con menor costo. */
  elegirDescarte(mano: readonly Carta[], excluirId: string | null = null): Carta {
    let mejor: Carta | null = null;
    let mejorCosto = Number.POSITIVE_INFINITY;
    for (const candidata of mano) {
      if (candidata.id === excluirId) continue;
      const resto = mano.filter((c) => c.id !== candidata.id);
      // descartar un comodín es casi siempre un error: se penaliza fuerte
      const costo = this.costo(resto) + (candidata.esComodin ? 40 : 0);
      if (costo < mejorCosto) {
        mejorCosto = costo;
        mejor = candidata;
      }
    }
    return mejor ?? mano[mano.length - 1]!;
  }
}

/**
 * Fabrica de la politica de descarte automatico (RF08: timeouts) que usa la partida. Vive en extras: el nucleo
 * recibe la politica por inyeccion y no importa esta clase (ADR-11).
 */
export function fabricaDescarteAnalisis(
  parametros: { aceEscalera: 'BAJO' | 'ALTO' | 'AMBOS'; valorAs: 1 | 10 | 11 },
  tamanos: readonly number[],
): (mano: readonly Carta[], pozoRoboId: string | null) => Carta {
  const analisis = new AnalisisMano(new HandEvaluator({ aceEscalera: parametros.aceEscalera }), new Valoracion(parametros.valorAs).puntosDe, tamanos);
  return (mano, pozoRoboId) => analisis.elegirDescarte(mano, pozoRoboId);
}
