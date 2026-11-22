import type { Carta } from '../kernel/cartas.js';
import type { Marcador } from '../kernel/marcador.js';
import type { PosicionFinal } from '../kernel/protocolo.js';
import type { DetalleLiquidacion, ICalculadorPuntos, ResultadoCierre, ResultadoPartida } from '../rules/IReglaJuego.js';

/** Contrato del módulo scoring (Entregable 2, Tabla 1.3.1: IServicioPuntaje). */
export interface EntradaLiquidar {
  regla: ICalculadorPuntos;
  ronda: number;
  ganadorId: string;
  cierre: ResultadoCierre;
  manos: ReadonlyMap<string, readonly Carta[]>;
  marcador: Marcador;
  /** Todos los jugadores del juego (incluye ya eliminados) para calcular posiciones. */
  todosIds: readonly string[];
  activos: readonly string[];
}

export interface ResultadoLiquidacion {
  marcador: Marcador;
  detalle: readonly DetalleLiquidacion[];
  partida: ResultadoPartida;
  posiciones: PosicionFinal[] | null;
}

/** Puerto pPuntaje (game -> scoring). */
export interface IServicioPuntaje {
  liquidarRonda(e: EntradaLiquidar): ResultadoLiquidacion;
}
