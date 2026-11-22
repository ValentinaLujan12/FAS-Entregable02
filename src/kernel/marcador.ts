/** Marcador acumulado de la partida (dato inmutable; lo produce RoundScoring). */
export interface Marcador {
  /** Puntos acumulados por jugador. Apuntado: puntos EN CONTRA (suben). Clásica: siempre 0. */
  readonly puntos: Readonly<Record<string, number>>;
  /** Rondas ganadas por jugador. */
  readonly victorias: Readonly<Record<string, number>>;
  /** Eliminados en orden cronológico. */
  readonly eliminados: ReadonlyArray<{ jugadorId: string; ronda: number }>;
}

export function marcadorInicial(jugadorIds: readonly string[]): Marcador {
  return {
    puntos: Object.fromEntries(jugadorIds.map((id) => [id, 0])),
    victorias: Object.fromEntries(jugadorIds.map((id) => [id, 0])),
    eliminados: [],
  };
}
