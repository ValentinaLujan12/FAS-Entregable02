import type { EventoJuego } from '../kernel/protocolo.js';
import type { CambioPersistible, HistorialSala, IRepositorioPartida, RondaPersistible, SalaRecuperada } from './IRepositorioPartida.js';
import type { EstadoPartida, Sala } from '../estado/tipos.js';
import type { Cuenta } from './IRepositorioCuentas.js';

/** Adaptador en memoria: pruebas, demos y despliegues sin PostgreSQL (los datos se pierden al reiniciar). */
export class MemoryStateRepository implements IRepositorioPartida {
  private readonly salas = new Map<string, Sala>();
  private readonly snapshots = new Map<string, EstadoPartida | null>();
  private readonly eventos = new Map<string, EventoJuego[]>();
  private readonly rondas = new Map<string, Array<RondaPersistible & { cerradaEn: number }>>();

  private readonly cuentas = new Map<string, Cuenta>();

  async inicializar(): Promise<void> {}

  async cargarCuenta(claveHash: string): Promise<Cuenta | null> {
    const c = this.cuentas.get(claveHash);
    return c ? structuredClone(c) : null;
  }

  async guardarCuenta(cuenta: Cuenta): Promise<void> {
    this.cuentas.set(cuenta.claveHash, structuredClone(cuenta));
  }

  async guardar(codigo: string, c: CambioPersistible): Promise<void> {
    if (c.sala) this.salas.set(codigo, structuredClone(c.sala));
    if (c.snapshot !== undefined) this.snapshots.set(codigo, structuredClone(c.snapshot));
    if (c.eventos?.length) this.agregarEventos(codigo, c.eventos);
    if (c.ronda) this.guardarRonda(codigo, c.ronda);
  }

  /** Agrega los eventos nuevos (idempotente por número de secuencia). */
  private agregarEventos(codigo: string, eventos: readonly EventoJuego[]): void {
    const lista = this.eventos.get(codigo) ?? [];
    const vistos = new Set(lista.map((e) => e.seq));
    for (const e of eventos) if (!vistos.has(e.seq)) lista.push(structuredClone(e));
    this.eventos.set(codigo, lista);
  }

  /** Inserta o reemplaza la ronda liquidada (una por partida y número de ronda). */
  private guardarRonda(codigo: string, ronda: RondaPersistible): void {
    const lista = this.rondas.get(codigo) ?? [];
    const i = lista.findIndex((r) => r.partidaN === ronda.partidaN && r.numero === ronda.numero);
    const nueva = { ...structuredClone(ronda), cerradaEn: Date.now() };
    if (i >= 0) lista[i] = nueva;
    else lista.push(nueva);
    this.rondas.set(codigo, lista);
  }

  async cargarSala(codigo: string): Promise<SalaRecuperada | null> {
    const sala = this.salas.get(codigo);
    if (!sala) return null;
    return { sala: structuredClone(sala), snapshot: structuredClone(this.snapshots.get(codigo) ?? null) };
  }

  async cargarActivas(): Promise<SalaRecuperada[]> {
    const out: SalaRecuperada[] = [];
    for (const [codigo, sala] of this.salas) {
      if (sala.estado === 'FINALIZADA') continue;
      out.push({ sala: structuredClone(sala), snapshot: structuredClone(this.snapshots.get(codigo) ?? null) });
    }
    return out;
  }

  async historial(codigo: string): Promise<HistorialSala | null> {
    if (!this.salas.has(codigo)) return null;
    return {
      codigo,
      rondas: structuredClone(this.rondas.get(codigo) ?? []),
      eventos: structuredClone(this.eventos.get(codigo) ?? []),
    };
  }

  async salud(): Promise<boolean> {
    return true;
  }
  async cerrar(): Promise<void> {}
}
