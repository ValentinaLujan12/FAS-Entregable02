export interface JugadorPartida {
  id: string;
  nombre: string;
  esBot: boolean;
  asiento: number;
  eliminado: boolean;
  conectado: boolean;
  /** Un humano que agota su tiempo 2 veces seguidas pasa a "piloto" (solo etiqueta): su turno espera el reloj completo y entonces se juega solo. Termina cuando actúa. */
  autopiloto: boolean;
  timeouts: number;
  /** "Automático completo": un bot juega por él al instante hasta que retome el control. */
  automatico: boolean;
  /** Turnos saltados seguidos: vencidos + jugados en automático. Se reinicia cuando el humano actúa. */
  saltos: number;
  /** Turnos jugados en automático desde que se activó (base de la votación de expulsión). */
  turnosAuto: number;
  /** Saltos que deben pasar antes de poder abrir otra votación contra él (tras un rechazo). */
  enfriamientoVoto: number;
  /** En automático con varios turnos jugados por el sistema: se puede iniciar la votación de expulsión. */
  expulsionDisponible: boolean;
}

/** Puerto pJugadores (game -> player, Entregable 2 Tabla 1.3.1): orden de turno, eliminaciones y conexión. */
export interface IJugadores {
  ordenDeTurno(): JugadorPartida[];
  buscar(id: string): JugadorPartida | undefined;
  /** Siguiente jugador activo en el sentido del turno (antihorario: del asiento n al n-1). */
  siguiente(desdeId: string): JugadorPartida;
  marcarEliminado(id: string): void;
  marcarConectado(id: string, conectado: boolean): void;
}
