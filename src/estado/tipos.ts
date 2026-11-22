/**
 * Contratos del estado de la sala y de la partida. Viven fuera de `game/` para que la persistencia los use sin depender
 * del orquestador (regla G2 de .dependency-cruiser.cjs). No contienen logica.
 */
import type { Carta } from '../kernel/cartas.js';
import type { ModalidadId, ParametrosModalidad } from '../kernel/config.js';
import type { Marcador } from '../kernel/marcador.js';
import type { FaseSala, FaseTurno, FinalVista, LiquidacionVista } from '../kernel/protocolo.js';
import type { EstadoMazo } from '../deck/IMazo.js';
import type { JugadorPartida } from '../player/IJugadores.js';

export interface VotacionEstado {
  id: number;
  tipo: import('../kernel/protocolo.js').TipoVotacion;
  objetivoId: string;
  /** votanteId -> a favor (true) / en contra (false). */
  votos: Record<string, boolean>;
  venceEn: number;
}

export interface EstadoRonda {
  numero: number;
  manos: Record<string, Carta[]>;
  mazo: EstadoMazo;
  turnoId: string;
  fase: FaseTurno;
  /** Se incrementa en cada turno: invalida temporizadores obsoletos (turno vencido ya resuelto). */
  turnoN: number;
  venceEn: number;
  iniciaId: string;
  /** Carta tomada del pozo en este turno: no se puede devolver inmediatamente. */
  pozoRoboId: string | null;
  /** Reparto inicial (solo ids) para auditoría y resolución de disputas (RF19). Nunca se envía a los clientes. */
  manosIniciales: Record<string, string[]>;
}

/** Estado completo y SERIALIZABLE de una partida (snapshot ACID para recuperación, RF19). */
export interface EstadoPartida {
  codigo: string;
  parametros: ParametrosModalidad;
  jugadores: JugadorPartida[];
  fase: Exclude<FaseSala, 'ESPERA'>;
  marcador: Marcador;
  ronda: EstadoRonda | null;
  numeroRonda: number;
  liquidacion: LiquidacionVista | null;
  final: FinalVista | null;
  siguienteIniciaId: string | null;
  mazosEnJuego: number;
  /** Votación por inactividad abierta (una a la vez). */
  votacion: VotacionEstado | null;
  contadorVotaciones: number;
  seq: number;
  /** Número de partida dentro de la sala (revanchas). Ausente en snapshots antiguos = 1. Forma parte de la clave del cierre único. */
  partidaN?: number;
}

export interface JugadorSala {
  id: string;
  nombre: string;
  esBot: boolean;
  tokenHash: string | null;
  asiento: number;
  /** Estilo (mockup): skin de cartas visible para todos y mesa premium opcional. Ausentes en salas antiguas. */
  skinCartas?: string;
  mesaPremium?: string | null;
  celebracion?: string;
}

/** Estilo público del jugador, tomado SIEMPRE de su cuenta en el servidor (el cliente no lo envía). */
export interface EstiloJugador {
  skinCartas: string;
  mesaPremium: string | null;
  celebracion: string;
}

export type EstadoSala = 'ESPERA' | 'EN_CURSO' | 'FINALIZADA';

export interface Sala {
  codigo: string;
  modalidad: ModalidadId;
  parametros: ParametrosModalidad;
  hostId: string;
  jugadores: JugadorSala[];
  estado: EstadoSala;
  /** Número de partidas jugadas en la sala (revanchas). */
  partidaN: number;
  creadaEn: number;
}

/** Estado de la sala que no vive en la partida (silencios y antirrebote de reacciones): se guarda entre peticiones. */
export interface ExtrasSala {
  silencios: Array<[string, string[]]>;
  ultimaReaccion: Array<[string, number]>;
  seqBase: number;
}
