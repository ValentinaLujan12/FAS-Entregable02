import type { Carta } from '../kernel/cartas.js';
import type { ModalidadId, ParametrosModalidad } from '../kernel/config.js';
import type { Mano } from '../kernel/mano.js';
import { HandEvaluator, type RequisitoTamano } from './HandEvaluator.js';
import type {
  Combinacion,
  DetalleLiquidacion,
  EntradaEvaluacion,
  EntradaLiquidacion,
  IReglaJuego,
  Particion,
  ResultadoCierre,
  ResultadoPartida,
  SalidaLiquidacion,
  TipoCierre,
} from './IReglaJuego.js';
import { Valoracion } from './valoracion.js';

/** 1 cuarta + 2 ternas (Clásica 4-3-3 y cierre estricto del Apuntado). */
export const CUARTA_DOS_TERNAS: readonly RequisitoTamano[] = [
  { tamano: 4, cantidad: 1 },
  { tamano: 3, cantidad: 2 },
];

const TAMANOS_LIBRES: readonly number[] = [3, 4, 5];

/** Primer elemento con el menor valor de `clave` (a igual valor conserva el primero), o null si la lista está vacía. */
export function menorPor<T>(lista: readonly T[], clave: (x: T) => number): T | null {
  if (lista.length === 0) return null;
  return lista.reduce((mejor, x) => (clave(x) < clave(mejor) ? x : mejor));
}

/** Primer elemento con el mayor valor de `clave`, o null si la lista está vacía. */
export function mayorPor<T>(lista: readonly T[], clave: (x: T) => number): T | null {
  return menorPor(lista, (x) => -clave(x));
}

/**
 * Comportamiento común de las estrategias (ADR-03): validación con HandEvaluator, valoración de cartas y liquidación.
 * Cada modalidad concreta solo define lo que varía: su cierre, el delta de la ronda y el fin de partida.
 */
export abstract class ReglaBase implements IReglaJuego {
  protected readonly evaluador: HandEvaluator;
  protected readonly valoracion: Valoracion;

  constructor(protected readonly p: ParametrosModalidad) {
    this.evaluador = new HandEvaluator({ aceEscalera: p.aceEscalera });
    this.valoracion = new Valoracion(p.valorAs);
  }

  abstract getModalidad(): ModalidadId;
  abstract tamanosObjetivo(): readonly number[];
  abstract validarVictoria(mano: Mano): ResultadoCierre;
  abstract evaluarPartida(entrada: EntradaEvaluacion): ResultadoPartida;
  /** Variación del marcador de un jugador al liquidar la ronda. */
  protected abstract deltaRonda(esGanador: boolean, puntosSobrantes: number): number;

  parametros(): ParametrosModalidad {
    return this.p;
  }

  cartasParaCerrar(): number {
    return this.p.cartasPorMano + 1;
  }

  clasificarCombinacion(cartas: readonly Carta[]): Combinacion | null {
    return this.evaluador.clasificar(cartas);
  }

  calcularPuntos(cartas: readonly Carta[]): number {
    return this.valoracion.sumar(cartas);
  }

  particionResidual(cartas: readonly Carta[]): Particion {
    return this.evaluador.mejorParticion(cartas, TAMANOS_LIBRES, this.valoracion.puntosDe);
  }

  liquidarRonda(entrada: EntradaLiquidacion): SalidaLiquidacion {
    const detalle = [...entrada.manos].map(([jugadorId, cartas]) => this.detalleDe(jugadorId, cartas, entrada));
    return { detalle, victoriasRonda: [entrada.ganadorId] };
  }

  private detalleDe(jugadorId: string, cartas: readonly Carta[], entrada: EntradaLiquidacion): DetalleLiquidacion {
    const esGanador = jugadorId === entrada.ganadorId;
    const part = esGanador && entrada.cierre.particion ? entrada.cierre.particion : this.particionResidual(cartas);
    const puntosSobrantes = this.calcularPuntos(part.sobrantes);
    return { jugadorId, combinaciones: part.combinaciones, sobrantes: part.sobrantes, puntosSobrantes, delta: this.deltaRonda(esGanador, puntosSobrantes) };
  }

  /** Rechazo por tamaño de mano, o null si la mano tiene las cartas que exige el cierre. */
  protected manoIncompleta(mano: Mano): ResultadoCierre | null {
    const n = this.cartasParaCerrar();
    if (mano.tamano === n) return null;
    return { valido: false, motivo: 'MANO_INCOMPLETA', detalle: `Se necesitan ${n} cartas para cerrar (tienes ${mano.tamano}).` };
  }

  /** Cierre con 1 cuarta + 2 ternas + 1 carta de descarte (sin sobrantes). */
  protected cierreCuartaDosTernas(mano: Mano, tipo: TipoCierre, rechazo: string): ResultadoCierre {
    const particion = this.evaluador.buscarParticionExacta(mano.cartas, CUARTA_DOS_TERNAS, this.valoracion.puntosDe);
    if (!particion) return { valido: false, motivo: 'SIN_COMBINACION_VALIDA', detalle: rechazo };
    // Si las 11 cartas forman combinaciones completas (p. ej. cuarta + cuarta + terna) se muestran así, sin descarte artificial.
    const mostrada = this.evaluador.particionSinSobrantes(mano.cartas, this.valoracion.puntosDe) ?? particion;
    return { valido: true, tipo, detalle: 'Cierre válido: 1 cuarta + 2 ternas + descarte.', particion: mostrada, descarte: mostrada.sobrantes[0] ?? null, sobrante: 0, deltaCerrador: 0 };
  }

  /** ¿Se alcanzó el tope de rondas acordado? */
  protected alcanzoTope(ronda: number): boolean {
    return this.p.rondasMax !== null && ronda >= this.p.rondasMax;
  }
}
