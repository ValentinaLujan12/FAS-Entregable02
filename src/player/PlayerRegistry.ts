import type { IJugadores, JugadorPartida } from './IJugadores.js';

export type { IJugadores, JugadorPartida } from './IJugadores.js';

/**
 * PlayerRegistry (PlayerRegistryComponent, IJugadores): control del orden de turnos, jugadores activos, eliminaciones y
 * desconexiones. Depende solo del kernel. La partida guarda la lista; este módulo decide sobre ella.
 */
export class PlayerRegistry implements IJugadores {
  constructor(private readonly lista: JugadorPartida[]) {}

  /** Jugadores no eliminados, en orden de asiento (el turno gira sobre este orden). */
  ordenDeTurno(): JugadorPartida[] {
    return this.lista.filter((j) => !j.eliminado).sort((a, b) => a.asiento - b.asiento);
  }

  buscar(id: string): JugadorPartida | undefined {
    return this.lista.find((j) => j.id === id);
  }

  siguiente(desdeId: string): JugadorPartida {
    const act = this.ordenDeTurno();
    const i = act.findIndex((j) => j.id === desdeId);
    // El turno gira en sentido ANTIHORARIO: del asiento n al n-1 (el cliente dibuja los asientos en orden horario).
    return act[(i - 1 + act.length) % act.length]!;
  }

  marcarEliminado(id: string): void {
    const j = this.buscar(id);
    if (j) j.eliminado = true;
  }

  marcarConectado(id: string, conectado: boolean): void {
    const j = this.buscar(id);
    if (j) j.conectado = conectado;
  }
}
