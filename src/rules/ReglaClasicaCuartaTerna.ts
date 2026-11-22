import type { Carta } from '../kernel/cartas.js';
import type { Mano } from '../kernel/mano.js';
import type { EntradaEvaluacion, ResultadoCierre, ResultadoPartida } from './IReglaJuego.js';
import { ReglaBase, mayorPor } from './ReglaBase.js';

const RECHAZO = 'Cierre rechazado: se requiere 1 cuarta + 2 ternas + 1 carta de descarte.';

const textoObjetivo = (n: number): string => `Alcanzó ${n} ${n === 1 ? 'ronda ganada' : 'rondas ganadas'}`;

/**
 * Modalidad Clásica (4-3-3) - CU-01, RF09.
 * Cierre: 11 cartas = 1 Cuarta + 2 Ternas + 1 carta de descarte. Victoria inmediata de ronda (sin puntos residuales).
 * La partida la gana quien primero acumule `victoriasObjetivo` rondas ganadas.
 */
export class ReglaClasicaCuartaTerna extends ReglaBase {
  getModalidad() {
    return 'CLASICA' as const;
  }

  tamanosObjetivo(): readonly number[] {
    return [3, 4];
  }

  validarVictoria(mano: Mano): ResultadoCierre {
    return this.manoIncompleta(mano) ?? this.cierreCuartaDosTernas(mano, 'CLASICA_4_3_3', RECHAZO);
  }

  /** ADR-02: en Clásica el cierre es inmediato, no hay puntos residuales. */
  override calcularPuntos(_cartas: readonly Carta[]): number {
    return 0;
  }

  protected deltaRonda(): number {
    return 0;
  }

  evaluarPartida(e: EntradaEvaluacion): ResultadoPartida {
    const vic = (id: string) => e.marcador.victorias[id] ?? 0;
    const objetivo = this.p.victoriasObjetivo;
    const candidatos = e.activos.filter((id) => vic(id) >= objetivo);
    if (candidatos.length > 0) return { finalizada: true, ganadorId: mayorPor(candidatos, vic)!, eliminados: [], motivoFin: textoObjetivo(objetivo) };
    if (this.alcanzoTope(e.ronda)) return { finalizada: true, ganadorId: mayorPor(e.activos, vic)!, eliminados: [], motivoFin: `Tope de ${this.p.rondasMax} rondas` };
    return { finalizada: false, eliminados: [] };
  }
}
