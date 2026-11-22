import type { EventoJuego } from '../kernel/protocolo.js';
import type { Cuenta } from './IRepositorioCuentas.js';
import type { DatosSala, FilaSala, IAlmacen, MensajeBuzon } from './IAlmacen.js';

interface EventoGuardado {
  tipo: string;
  ronda: number;
  detalle: unknown;
}

/** Clave del cierre único: partida y ronda (la revancha en la misma sala reinicia las rondas). */
const claveCierre = (ronda: number, detalle: unknown): string => `${(detalle as { partida?: number }).partida ?? 1}:${ronda}`;

/** Misma regla que el índice ux_evento_cierre_partida_ronda: un solo CIERRE_ACEPTADO por ronda de cada partida. */
function cierresUnicos(previos: readonly EventoGuardado[], nuevos: readonly EventoJuego[]): boolean {
  const vistos = new Set(previos.filter((c) => c.tipo === 'CIERRE_ACEPTADO').map((c) => claveCierre(c.ronda, c.detalle)));
  for (const e of nuevos.filter((x) => x.tipo === 'CIERRE_ACEPTADO')) {
    const k = claveCierre(e.ronda, e.datos);
    if (vistos.has(k)) return false;
    vistos.add(k);
  }
  return true;
}

/** Almacén en memoria: pruebas y servidor de desarrollo local (los datos se pierden al reiniciar). */
export class AlmacenMemoria implements IAlmacen {
  private salas = new Map<string, FilaSala & { actualizada: number }>();
  private presencias = new Map<string, Map<string, number>>();
  private buzones = new Map<string, Array<{ id: number } & MensajeBuzon>>();
  private eventos = new Map<string, EventoGuardado[]>();
  private cuentas = new Map<string, Cuenta>();
  private intentos = new Map<string, { desde: number; n: number }>();
  private seq = 0;

  async leerSala(codigo: string): Promise<FilaSala | null> {
    const f = this.salas.get(codigo);
    return f ? structuredClone({ codigo: f.codigo, datos: f.datos, version: f.version, proximoEn: f.proximoEn }) : null;
  }

  async guardarAtomico(
    codigo: string,
    versionEsperada: number,
    datos: DatosSala,
    proximoEn: number | null,
    mensajes: Array<{ jugadorId: string } & MensajeBuzon>,
    eventos: readonly EventoJuego[],
  ): Promise<boolean> {
    // Mismas reglas que guardar_sala_atomica: todas las comprobaciones antes de escribir nada.
    const actual = this.salas.get(codigo);
    if (versionEsperada === 0 ? actual !== undefined : actual?.version !== versionEsperada) return false;
    const cierres = this.eventos.get(codigo) ?? [];
    if (!cierresUnicos(cierres, eventos)) return false;

    this.salas.set(codigo, { codigo, datos: structuredClone(datos), version: versionEsperada + 1, proximoEn, actualizada: Date.now() });
    this.encolar(codigo, mensajes);
    this.eventos.set(codigo, [...cierres, ...eventos.map((e) => ({ tipo: e.tipo, ronda: e.ronda, detalle: structuredClone(e.datos) }))]);
    return true;
  }

  /** Eventos de auditoría guardados de una sala (solo lectura; para pruebas y verificación de FF-19). */
  eventosDe(codigo: string): readonly EventoGuardado[] {
    return structuredClone(this.eventos.get(codigo) ?? []);
  }

  async borrarSala(codigo: string): Promise<void> {
    this.salas.delete(codigo);
    this.presencias.delete(codigo);
    this.eventos.delete(codigo);
    for (const k of [...this.buzones.keys()]) if (k.startsWith(`${codigo}|`)) this.buzones.delete(k);
  }

  async tocarPresencia(codigo: string, jugadorId: string, en: number): Promise<void> {
    const m = this.presencias.get(codigo) ?? new Map();
    m.set(jugadorId, en);
    this.presencias.set(codigo, m);
  }

  async leerPresencias(codigo: string): Promise<Map<string, number>> {
    return new Map(this.presencias.get(codigo) ?? []);
  }

  private encolar(codigo: string, mensajes: Array<{ jugadorId: string } & MensajeBuzon>): void {
    for (const { jugadorId, en, m } of mensajes) {
      const k = `${codigo}|${jugadorId}`;
      const b = this.buzones.get(k) ?? [];
      b.push({ id: ++this.seq, en, m: structuredClone(m) });
      this.buzones.set(k, b);
    }
  }

  async sacarBuzon(codigo: string, jugadorId: string): Promise<MensajeBuzon[]> {
    const k = `${codigo}|${jugadorId}`;
    const b = this.buzones.get(k) ?? [];
    this.buzones.delete(k);
    return b.sort((a, c) => a.id - c.id).map(({ en, m }) => ({ en, m }));
  }

  async cargarCuenta(claveHash: string): Promise<Cuenta | null> {
    const c = this.cuentas.get(claveHash);
    return c ? structuredClone(c) : null;
  }

  async guardarCuenta(cuenta: Cuenta): Promise<void> {
    this.cuentas.set(cuenta.claveHash, structuredClone(cuenta));
  }

  async contarIntento(clave: string, ventanaSeg: number): Promise<number> {
    const ahora = Date.now();
    const i = this.intentos.get(clave);
    if (!i || ahora - i.desde > ventanaSeg * 1000) {
      this.intentos.set(clave, { desde: ahora, n: 1 });
      return 1;
    }
    i.n++;
    return i.n;
  }

  async purgar(antesDe: number): Promise<void> {
    for (const [c, f] of this.salas) if (f.actualizada < antesDe) await this.borrarSala(c);
  }
}
