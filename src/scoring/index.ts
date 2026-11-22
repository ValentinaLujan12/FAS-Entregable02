/** API pública del módulo scoring (Entregable 2: IServicioPuntaje). */
import type { IServicioPuntaje } from './IServicioPuntaje.js';
import { RoundScoring } from './RoundScoring.js';

export type { EntradaLiquidar, IServicioPuntaje, ResultadoLiquidacion } from './IServicioPuntaje.js';

/** Composición por defecto del servicio de puntaje. */
export function crearServicioPuntaje(): IServicioPuntaje {
  return new RoundScoring();
}
