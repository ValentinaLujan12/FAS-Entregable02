import type { MensajeCliente, MensajeServidor, VistaMesa } from '../src/kernel/protocolo.js';
import { TurnOrchestrator, type Conexion, type DepsServicio as TurnOrchestratorDeps } from '../src/game/TurnOrchestrator.js';
import { AleatorioSemilla } from '../src/deck/Baraja.js';
import { ProgramadorFalso } from '../src/infra/Programador.js';
import { LobbyManager } from '../src/game/lobby/LobbyManager.js';
import { MemoryStateRepository } from '../src/persistence/MemoryStateRepository.js';
import type { IRepositorioPartida } from '../src/persistence/IRepositorioPartida.js';
import { crearRegistroReglas } from '../src/rules/RegistroReglas.js';
import { extrasPorDefecto } from '../src/extras/composicion.js';
import type { ProbabilidadesBot } from '../src/game/puertos.js';

export class ClienteFalso implements Conexion {
  id = Math.random().toString(36).slice(2);
  codigo: string | null = null;
  jugadorId: string | null = null;
  token: string | null = null;
  recibidos: MensajeServidor[] = [];
  /** Hash de la cuenta abierta en esta conexión (lo fija el servicio). */
  cuentaHash: string | null = null;
  /** Última clave de cuenta entregada por el servidor (solo llega al crear la cuenta). */
  clave: string | null = null;
  enviar(m: MensajeServidor) {
    this.recibidos.push(m);
    if (m.t === 'sesion') this.token = m.token;
    if (m.t === 'cuenta' && m.clave) this.clave = m.clave;
  }
  get cuenta() {
    const ult = [...this.recibidos].reverse().find((m) => m.t === 'cuenta');
    return ult && ult.t === 'cuenta' ? ult.cuenta : null;
  }
  reacciones() {
    return this.recibidos.filter((m) => m.t === 'reaccion') as Extract<MensajeServidor, { t: 'reaccion' }>[];
  }
  get vista(): VistaMesa | null {
    const ult = [...this.recibidos].reverse().find((m) => m.t === 'estado');
    return ult && ult.t === 'estado' ? ult.vista : null;
  }
  errores() {
    return this.recibidos.filter((m) => m.t === 'error') as Extract<MensajeServidor, { t: 'error' }>[];
  }
  eventos() {
    return this.recibidos.flatMap((m) => (m.t === 'eventos' ? m.eventos : []));
  }
}

export function crearServicio(opts: { semilla?: number; repo?: IRepositorioPartida; retardoBot?: [number, number]; reaccionesBots?: ProbabilidadesBot } = {}) {
  const programador = new ProgramadorFalso();
  const rng = new AleatorioSemilla(opts.semilla ?? 7);
  const repo = opts.repo ?? new MemoryStateRepository();
  const lobby = new LobbyManager(rng, () => programador.ahora(), extrasPorDefecto.estilos);
  const planificador = opts.reaccionesBots ? extrasPorDefecto.crearPlanificador(opts.reaccionesBots, Math.random, () => programador.ahora()) : undefined;
  const servicio = new TurnOrchestrator({ lobby, motor: crearRegistroReglas(), fabricaDescarte: extrasPorDefecto.fabricaDescarte, extras: extrasPorDefecto, repo, programador, rng, retardoBotMs: opts.retardoBot ?? [50, 50], planificador });
  const enviar = async (c: ClienteFalso, m: MensajeCliente) => servicio.recibir(c, m);
  return { servicio, programador, repo, lobby, enviar };
}
