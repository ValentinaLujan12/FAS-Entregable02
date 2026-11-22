import type { EventoJuego, MensajeServidor } from '../kernel/protocolo.js';
import type { EstadoPartida, ExtrasSala, Sala } from '../estado/tipos.js';
import type { IRepositorioCuentas } from './IRepositorioCuentas.js';

/** Todo lo que hace falta para reconstruir una sala en la siguiente petición. */
export interface DatosSala {
  sala: Sala;
  snapshot: EstadoPartida | null;
  extras: ExtrasSala;
  /** Jugadores que la última petición consideró conectados. */
  presentes: string[];
  /** Reloj virtual alcanzado (puede ir unos segundos por delante del real mientras el cliente reproduce jugadas de bots). */
  reloj: number;
}

export interface FilaSala {
  codigo: string;
  datos: DatosSala;
  version: number;
  proximoEn: number | null;
}

export interface MensajeBuzon {
  /** Hora (ms) a la que el cliente debe mostrarlo. */
  en: number;
  m: MensajeServidor;
}

/**
 * Puerto de almacenamiento del despliegue serverless. Adaptadores: memoria (pruebas y desarrollo) y Supabase (producción).
 * La concurrencia se resuelve con versión optimista: `guardarAtomico` solo escribe si nadie cambió la sala entretanto.
 */
export interface IAlmacen extends IRepositorioCuentas {
  leerSala(codigo: string): Promise<FilaSala | null>;
  /**
   * Escritura atomica (ADR-07 y ADR-09): sala, mensajes de salida y eventos de auditoria en la misma operacion.
   * `versionEsperada` 0 crea la sala. false si la version no es la esperada o si la ronda ya estaba cerrada:
   * no se escribe nada y hay que reintentar.
   */
  guardarAtomico(
    codigo: string,
    versionEsperada: number,
    datos: DatosSala,
    proximoEn: number | null,
    mensajes: Array<{ jugadorId: string } & MensajeBuzon>,
    eventos: readonly EventoJuego[],
  ): Promise<boolean>;
  borrarSala(codigo: string): Promise<void>;

  tocarPresencia(codigo: string, jugadorId: string, en: number): Promise<void>;
  leerPresencias(codigo: string): Promise<Map<string, number>>;

  /** Saca (lee y borra) los mensajes pendientes de un jugador, en orden. */
  sacarBuzon(codigo: string, jugadorId: string): Promise<MensajeBuzon[]>;

  /** Cuenta un intento en una ventana de tiempo (límite anti-abuso). Devuelve el total en la ventana. */
  contarIntento(clave: string, ventanaSeg: number): Promise<number>;
  /** Borra salas sin actividad desde `antesDe` (ms). */
  purgar(antesDe: number): Promise<void>;
}
