/**
 * Parámetros de la partida. Todos se acuerdan ANTES de repartir (PDF, "Configuración de la partida")
 * y el valor del As NUNCA se codifica en la interfaz (Entregable 1, §2.1 "Valor nominal de carta suelta").
 */
export type ModalidadId = 'CLASICA' | 'APUNTADO';
export type AceEscalera = 'BAJO' | 'ALTO' | 'AMBOS';

export interface ParametrosModalidad {
  modalidad: ModalidadId;
  minJugadores: number;
  maxJugadores: number;
  cartasPorMano: number;
  /** 'AUTO': 1 mazo hasta 4 jugadores, 2 mazos para 5-6 (PDF: "Para mesas grandes puede usarse un segundo mazo"). */
  mazos: 'AUTO' | 1 | 2;
  /** Comodines totales en el mazo (0 = sin comodines). PDF: "Comodines opcionales". */
  comodines: 0 | 2 | 4;
  valorAs: 1 | 10 | 11;
  aceEscalera: AceEscalera;
  tiempoTurnoSeg: number;
  /** Tiempo de turno cuando el jugador está desconectado (evita bloquear la mesa). */
  tiempoTurnoDesconectadoSeg: number;
  permitirRoboPozo: boolean;
  /** Umbral de eliminación (Apuntado: >=101 puntos en contra). */
  umbralEliminacion: number;
  /** Rondas ganadas para ganar la partida (solo CLASICA). */
  victoriasObjetivo: number;
  /** Tope de rondas acordado (null = sin tope). */
  rondasMax: number | null;
  /** Sobrante estrictamente menor a este valor para cerrar en Apuntado (Entregable: < 5). */
  sobranteMaxApuntado: number;
  /**
   * Apuntado a 101: permite cerrar con 3 ternas + sobrante (< sobranteMaxApuntado puntos).
   * Activado por defecto (P01: "3 ternas y el valor de las cartas restantes debe sumar menos de 5").
   * Desactivado = cierre estricto como la Clásica: 1 cuarta + 2 ternas + 1 descarte libre.
   */
  permitirCierreConSobrante: boolean;
  /**
   * Apuntado a 101 con sobrante: si es true, una cuarta o una quinta cuenta como UNA de las 3 combinaciones
   * (formas 3-3-3, 4-3-3, 4-4-3 y 5-3-3). Si es false (por defecto), se exigen exactamente 3 ternas, como dice la guía
   * del curso (decisión del equipo D41).
   */
  cuartaCuentaComoTerna: boolean;
  pausaLiquidacionSeg: number;
  /** Veces que se puede reciclar el pozo antes de declarar tablas. */
  maxReciclajes: number;
}

export interface InfoModalidad {
  id: ModalidadId;
  nombre: string;
  resumen: string;
  /** 'MENOS': gana quien menos puntos en contra tiene (Apuntado). 'VICTORIAS': rondas ganadas (Clásica). */
  sentidoPuntaje: 'MENOS' | 'VICTORIAS';
  fuente: string;
}

export const MODALIDADES: readonly InfoModalidad[] = [
  {
    id: 'CLASICA',
    nombre: 'Clásica 4-3-3',
    resumen:
      'Gana la ronda quien arma 1 cuarta + 2 ternas + 1 carta de descarte. Cierre inmediato; gana la partida quien primero llegue a las victorias objetivo.',
    sentidoPuntaje: 'VICTORIAS',
    fuente: 'Entregable 1 - CU-01 - ADR-02',
  },
  {
    id: 'APUNTADO',
    nombre: 'Apuntado a 101',
    resumen:
      'Cierra quien arma 3 ternas con sobrante < 5 puntos (configurable: se puede permitir que una cuarta o quinta cuente como terna, o se puede exigir cuarta + 2 ternas + descarte). Los demás suman los puntos de sus cartas sueltas; al llegar a 101 quedan eliminados. Gana el último en pie.',
    sentidoPuntaje: 'MENOS',
    fuente: 'Entregable 1 - CU-02/03 - ADR-02',
  },
];

const BASE: Omit<ParametrosModalidad, 'modalidad' | 'valorAs'> = {
  minJugadores: 2,
  maxJugadores: 6,
  cartasPorMano: 10,
  mazos: 'AUTO',
  comodines: 0,
  aceEscalera: 'AMBOS',
  tiempoTurnoSeg: 60,
  tiempoTurnoDesconectadoSeg: 8,
  permitirRoboPozo: true,
  umbralEliminacion: 101,
  victoriasObjetivo: 3,
  rondasMax: null,
  sobranteMaxApuntado: 5,
  permitirCierreConSobrante: true,
  cuartaCuentaComoTerna: false,
  pausaLiquidacionSeg: 15,
  maxReciclajes: 2,
};

/** Valor del As por defecto según la fuente de cada modalidad (ADR-02: A=1). */
const AS_POR_DEFECTO: Record<ModalidadId, 1 | 10 | 11> = { CLASICA: 1, APUNTADO: 1 };

export function parametrosPorDefecto(modalidad: ModalidadId): ParametrosModalidad {
  return { ...BASE, modalidad, valorAs: AS_POR_DEFECTO[modalidad] };
}

const entero = (v: unknown, min: number, max: number, def: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : def;
  return Math.min(max, Math.max(min, n));
};

/** Sanea parámetros recibidos del cliente (nunca se confía en el cliente). */
export function normalizarParametros(
  modalidad: ModalidadId,
  entrada: Partial<Record<keyof ParametrosModalidad, unknown>> | undefined,
): ParametrosModalidad {
  const d = parametrosPorDefecto(modalidad);
  const e = entrada ?? {};
  const pick = <T extends string | number | boolean | null>(v: unknown, validos: readonly T[], def: T): T =>
    (validos as readonly unknown[]).includes(v) ? (v as T) : def;
  return {
    ...d,
    mazos: pick<'AUTO' | 1 | 2>(e.mazos, ['AUTO', 1, 2], d.mazos),
    comodines: pick<0 | 2 | 4>(e.comodines, [0, 2, 4], d.comodines),
    valorAs: pick<1 | 10 | 11>(e.valorAs, [1, 10, 11], d.valorAs),
    aceEscalera: pick<AceEscalera>(e.aceEscalera, ['BAJO', 'ALTO', 'AMBOS'], d.aceEscalera),
    tiempoTurnoSeg: entero(e.tiempoTurnoSeg, 10, 300, d.tiempoTurnoSeg),
    permitirRoboPozo: typeof e.permitirRoboPozo === 'boolean' ? e.permitirRoboPozo : d.permitirRoboPozo,
    permitirCierreConSobrante: typeof e.permitirCierreConSobrante === 'boolean' ? e.permitirCierreConSobrante : d.permitirCierreConSobrante,
    cuartaCuentaComoTerna: typeof e.cuartaCuentaComoTerna === 'boolean' ? e.cuartaCuentaComoTerna : d.cuartaCuentaComoTerna,
    victoriasObjetivo: entero(e.victoriasObjetivo, 1, 20, d.victoriasObjetivo),
    umbralEliminacion: entero(e.umbralEliminacion, 20, 1000, d.umbralEliminacion),
    rondasMax: e.rondasMax === null || e.rondasMax === undefined ? null : entero(e.rondasMax, 1, 100, 10),
    pausaLiquidacionSeg: entero(e.pausaLiquidacionSeg, 3, 120, d.pausaLiquidacionSeg),
  };
}

/** Mazos efectivos según número de jugadores (5-6 jugadores no caben en 52 cartas: 6x10+1). */
export function mazosEfectivos(p: ParametrosModalidad, jugadores: number): 1 | 2 {
  if (p.mazos !== 'AUTO') return p.mazos;
  return jugadores <= 4 ? 1 : 2;
}

/**
 * Inactividad de jugadores humanos.
 * - Con más de 3 turnos saltados seguidos (≥ 4) el jugador pasa SOLO a "automático completo" (un bot juega por él).
 * - Si sigue ausente (≥ 3 turnos jugados en automático) queda DISPONIBLE la expulsión: aviso suave + botón en su panel;
 *   la votación se abre cuando alguien lo pulsa (quien la abre vota a favor).
 * Mayoría = floor(N/2)+1 de los votantes elegibles (humanos conectados, no ausentes, sin piloto/automático, sin el acusado).
 */
export const VOTACION = {
  saltosMin: 4,
  turnosAutoMin: 3,
  duracionSeg: 30,
  enfriamientoSaltos: 2,
} as const;
