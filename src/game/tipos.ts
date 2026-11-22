import type { Carta } from '../kernel/cartas.js';
import type { ParametrosModalidad } from '../kernel/config.js';
import type { Marcador } from '../kernel/marcador.js';
import type { FaseSala, FaseTurno, FinalVista, LiquidacionVista } from '../kernel/protocolo.js';
import type { EstadoMazo } from '../deck/IMazo.js';
import type { EstadoPartida, EstadoRonda, VotacionEstado } from '../estado/tipos.js';
export type { EstadoPartida, EstadoRonda, VotacionEstado } from '../estado/tipos.js';

import type { JugadorPartida } from '../player/IJugadores.js';

export type { JugadorPartida } from '../player/IJugadores.js';

export type CodigoErrorJuego =
  | 'FASE_INVALIDA'
  | 'NO_ES_TU_TURNO'
  | 'ACCION_NO_PERMITIDA'
  | 'CARTA_NO_ENCONTRADA'
  | 'POZO_VACIO'
  | 'JUGADOR_ELIMINADO'
  | 'DEVOLUCION_PROHIBIDA'
  | 'PARAMETROS_INVALIDOS'
  | 'MAZO_INSUFICIENTE';

export type Resultado<T = object> =
  | ({ ok: true; eventos: import('../kernel/protocolo.js').EventoJuego[] } & T)
  | { ok: false; codigo: CodigoErrorJuego; mensaje: string };
