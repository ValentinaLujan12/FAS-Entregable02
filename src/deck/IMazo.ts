import type { Carta } from '../kernel/cartas.js';
import type { Aleatorio } from './Baraja.js';

/** Estado plano y serializable del mazo de una ronda (persistencia y recuperación, RF19). */
export interface EstadoMazo {
  mazo: Carta[];
  /** El último elemento es el tope visible. */
  pozo: Carta[];
  reciclajes: number;
}

export interface ResultadoRobo {
  carta: Carta;
  reciclado: boolean;
}

/** Puerto pMazo (game -> deck, Entregable 2 Tabla 1.3.1): control de la baraja, el mazo ciego y el pozo. */
export interface IMazo {
  readonly restantes: number;
  readonly cantidadPozo: number;
  readonly topePozo: Carta | null;
  readonly reciclajes: number;
  repartir(n: number): Carta[];
  /** Voltea la primera carta del mazo al pozo al iniciar la ronda. */
  voltearInicial(): void;
  /** Roba del mazo ciego; si está vacío recicla el pozo (menos el tope) hasta `maxReciclajes`. null = sin cartas. */
  robarDelMazo(rng: Aleatorio, maxReciclajes: number): ResultadoRobo | null;
  robarDelPozo(): Carta | null;
  descartar(carta: Carta): void;
  snapshot(): EstadoMazo;
}
