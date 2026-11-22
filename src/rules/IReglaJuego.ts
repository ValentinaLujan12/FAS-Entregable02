import type { Carta } from '../kernel/cartas.js';
import type { ModalidadId, ParametrosModalidad } from '../kernel/config.js';
import type { Marcador } from '../kernel/marcador.js';
import type { Mano } from '../kernel/mano.js';

/*
 * Contratos del módulo rules (Entregable 2, Tabla 1.3.1).
 *  - IValidadorCierre: lo que el orquestador (game) necesita para validar jugadas y cierres.
 *  - ICalculadorPuntos: lo que la puntuación (scoring) necesita para liquidar una ronda.
 *  - IReglaJuego: el Strategy de cada modalidad (ADR-02, ADR-03); implementa los dos contratos anteriores.
 * Segregación de interfaces: game no conoce el cálculo de puntos y scoring no conoce la validación del cierre.
 */

export type TipoCombinacion = 'GRUPO' | 'ESCALERA';

export interface Combinacion {
  readonly tipo: TipoCombinacion;
  readonly cartas: readonly Carta[];
  readonly comodines: number;
}

export interface Particion {
  readonly combinaciones: readonly Combinacion[];
  readonly sobrantes: readonly Carta[];
}

export type TipoCierre = 'CLASICA_4_3_3' | 'APUNTADO_3_TERNAS';

export type MotivoRechazo =
  | 'MANO_INCOMPLETA' // la mano no tiene el tamaño requerido (ej. 11 cartas)
  | 'SIN_COMBINACION_VALIDA' // no existen las combinaciones exigidas (A1 de CU-01/CU-02)
  | 'SOBRANTE_EXCEDE_LIMITE'; // A2 de CU-02: ternas válidas pero sobrante >= límite

/** Resultado de validar un cierre (ResultadoValidacion en el Entregable 2). */
export interface ResultadoCierre {
  readonly valido: boolean;
  readonly tipo?: TipoCierre;
  readonly motivo?: MotivoRechazo;
  /** Mensaje diferenciado para el jugador (RF11). */
  readonly detalle: string;
  readonly particion?: Particion;
  /** Carta que sale de la mano al cerrar (el "descarte" del 4-3-3). */
  readonly descarte?: Carta | null;
  /** Puntos de las cartas sueltas del cerrador. */
  readonly sobrante?: number;
  /** Variación de puntaje para quien cierra. */
  readonly deltaCerrador?: number;
}

export interface EntradaLiquidacion {
  readonly ganadorId: string;
  readonly cierre: ResultadoCierre;
  /** Manos finales de los jugadores ACTIVOS de la ronda (la del ganador incluye las 11 cartas). */
  readonly manos: ReadonlyMap<string, readonly Carta[]>;
}

export interface DetalleLiquidacion {
  readonly jugadorId: string;
  readonly combinaciones: readonly Combinacion[];
  readonly sobrantes: readonly Carta[];
  readonly puntosSobrantes: number;
  /** Variación de `Marcador.puntos` en esta ronda. */
  readonly delta: number;
}

export interface SalidaLiquidacion {
  readonly detalle: readonly DetalleLiquidacion[];
  /** Jugadores que suman una victoria de ronda. */
  readonly victoriasRonda: readonly string[];
}

export interface EntradaEvaluacion {
  readonly marcador: Marcador;
  readonly activos: readonly string[];
  readonly ronda: number;
  readonly ganadorRondaId: string | null;
}

export interface ResultadoPartida {
  readonly finalizada: boolean;
  readonly ganadorId?: string;
  /** Eliminados NUEVOS a raíz de esta liquidación. */
  readonly eliminados: readonly string[];
  readonly motivoFin?: string;
}

/** Puerto pValida (game -> rules): validación de jugadas y cierres. */
export interface IValidadorCierre {
  /** Cartas por jugador que exige el cierre (10 + robo = 11). */
  cartasParaCerrar(): number;
  /** Valida el intento de cierre sobre la mano completa del jugador. No modifica nada. */
  validarVictoria(mano: Mano): ResultadoCierre;
  /** RF06: grupo o escalera válidos (>= 3 cartas), o null. */
  clasificarCombinacion(cartas: readonly Carta[]): Combinacion | null;
}

/** Puerto pPuntos (scoring -> rules): puntos residuales, liquidación y fin de partida según la modalidad. */
export interface ICalculadorPuntos {
  getModalidad(): ModalidadId;
  /** Puntos que suman las cartas SUELTAS en esta modalidad (0 si la modalidad no penaliza). */
  calcularPuntos(cartas: readonly Carta[]): number;
  /** Mejor partición de una mano para mostrar combinaciones y sobrantes (liquidación y tablas). */
  particionResidual(cartas: readonly Carta[]): Particion;
  liquidarRonda(entrada: EntradaLiquidacion): SalidaLiquidacion;
  evaluarPartida(entrada: EntradaEvaluacion): ResultadoPartida;
}

/** Strategy de una modalidad (ADR-02, ADR-03). Agregar una modalidad = una clase que implementa este contrato + un registro. */
export interface IReglaJuego extends IValidadorCierre, ICalculadorPuntos {
  /** Parámetros con los que se configuró la regla. */
  parametros(): ParametrosModalidad;
  /** Tamaños de combinación que persigue la modalidad (los usan el descarte automático y los bots). */
  tamanosObjetivo(): readonly number[];
}

export type FabricaRegla = (parametros: ParametrosModalidad) => IReglaJuego;

/** Puerto de RegistroReglas (Entregable 2: IRegistroReglas). Resuelve la estrategia de cada partida (ADR-08). */
export interface IRegistroReglas {
  modalidades(): string[];
  reglaPara(parametros: ParametrosModalidad): IReglaJuego;
}
