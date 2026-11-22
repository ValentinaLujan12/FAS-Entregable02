import type { EventoJuego } from '../kernel/protocolo.js';
import type { EstadoPartida, Sala } from '../estado/tipos.js';
import type { IRepositorioCuentas } from './IRepositorioCuentas.js';

/**
 * StateRepository (StateRepositoryComponent / PersistenceDomain): almacena y recupera de forma TRANSACCIONAL
 * el estado en vivo de las partidas, las manos activas y el registro histórico de rondas (RF14, RF19).
 * El resto del sistema depende de esta interfaz (puerto), no de PostgreSQL (adaptador).
 */
export interface RondaPersistible {
  partidaN: number;
  numero: number;
  ganadorId: string | null;
  tipoCierre: string | null;
  tablas: boolean;
  detalle: string;
  manosIniciales: Record<string, string[]>;
  jugadores: Array<{
    jugadorId: string;
    delta: number;
    acumulado: number;
    puntosSobrantes: number;
    combinaciones: unknown;
    sobrantes: unknown;
    eliminado: boolean;
  }>;
}

/** Un cambio = UNA transacción ACID (sala + snapshot + eventos + ronda liquidada). */
export interface CambioPersistible {
  sala?: Sala;
  snapshot?: EstadoPartida | null;
  eventos?: EventoJuego[];
  ronda?: RondaPersistible;
}

export interface SalaRecuperada {
  sala: Sala;
  snapshot: EstadoPartida | null;
}

export interface HistorialSala {
  codigo: string;
  rondas: Array<RondaPersistible & { cerradaEn: number }>;
  eventos: EventoJuego[];
}

export interface IRepositorioPartida extends IRepositorioCuentas {
  inicializar(): Promise<void>;
  guardar(codigo: string, cambio: CambioPersistible): Promise<void>;
  cargarSala(codigo: string): Promise<SalaRecuperada | null>;
  cargarActivas(): Promise<SalaRecuperada[]>;
  historial(codigo: string): Promise<HistorialSala | null>;
  salud(): Promise<boolean>;
  cerrar(): Promise<void>;
}
