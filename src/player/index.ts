/** API pública del módulo player (Entregable 2: IJugadores). */
import type { IJugadores, JugadorPartida } from './IJugadores.js';
import { PlayerRegistry } from './PlayerRegistry.js';

export type { IJugadores, JugadorPartida } from './IJugadores.js';

/** Abre el registro de jugadores sobre la lista de la partida (las operaciones la modifican en el sitio). */
export function registroJugadores(lista: JugadorPartida[]): IJugadores {
  return new PlayerRegistry(lista);
}
