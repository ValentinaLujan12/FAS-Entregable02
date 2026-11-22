import { parseCartas } from '../src/kernel/cartas.js';
import type { EventoJuego, MensajeCliente, MensajeServidor, VistaMesa } from '../src/kernel/protocolo.js';
import { AlmacenMemoria } from '../src/persistence/AlmacenMemoria.js';
import type { DatosSala, MensajeBuzon } from '../src/persistence/IAlmacen.js';
import type { ICanalTiempoReal } from '../src/infra/GatewayTiempoReal.js';
import { Procesador } from '../src/serverless/Procesador.js';
import { extrasPorDefecto } from '../src/extras/composicion.js';

/** Mano de 11 cartas que cierra en Clásica (1 cuarta + 2 ternas + descarte). */
export const MANO_GANADORA_CLASICA = '2H 2C 2S 2D 5H 6H 7H 9C 9D 9S KH';

/** Almacén en memoria que registra el orden de las escrituras y permite simular una caída en la siguiente. */
export class AlmacenObservado extends AlmacenMemoria {
  registro: string[] = [];
  fallarProxima = false;

  override async guardarAtomico(
    codigo: string,
    versionEsperada: number,
    datos: DatosSala,
    proximoEn: number | null,
    mensajes: Array<{ jugadorId: string } & MensajeBuzon>,
    eventos: readonly EventoJuego[],
  ): Promise<boolean> {
    if (this.fallarProxima) {
      this.fallarProxima = false;
      this.registro.push('caida');
      throw new Error('caída simulada del servidor durante la escritura');
    }
    const ok = await super.guardarAtomico(codigo, versionEsperada, datos, proximoEn, mensajes, eventos);
    this.registro.push(ok ? 'guardar' : 'conflicto');
    return ok;
  }
}

/** Canal de tiempo real falso: registra los avisos y puede fallar a propósito. */
export class CanalObservado implements ICanalTiempoReal {
  constructor(
    private readonly registro: string[],
    public fallar = false,
  ) {}
  async avisarCambio(codigo: string): Promise<void> {
    this.registro.push(`avisar:${codigo}`);
    if (this.fallar) throw new Error('Realtime no disponible');
  }
}

/** Reloj controlado por la prueba: los plazos avanzan sin esperar de verdad. */
export function entornoProcesador(opts: { canal?: boolean } = {}) {
  let t = 1_700_000_000_000;
  const almacen = new AlmacenObservado();
  const canal = new CanalObservado(almacen.registro);
  const errores: string[] = [];
  const proc = new Procesador({
    almacen,
    extras: extrasPorDefecto,
    reloj: () => t,
    retardoBotMs: [50, 80],
    reaccionesBots: false,
    ...(opts.canal ? { canal } : {}),
    logger: { info() {}, error: (msg) => errores.push(msg) },
  });
  return { proc, almacen, canal, errores, avanzar: (ms: number) => (t += ms), ahora: () => t };
}

/** Cliente HTTP simulado: guarda su sesión, su última vista y todo lo que recibe. */
export class JugadorHttp {
  codigo: string | null = null;
  token: string | null = null;
  id: string | null = null;
  vista: VistaMesa | null = null;
  errores: string[] = [];
  recibidos: MensajeServidor[] = [];
  constructor(
    private readonly proc: Procesador,
    readonly nombre: string,
  ) {}

  async llamar(msg?: MensajeCliente): Promise<MensajeServidor[]> {
    const r = await this.proc.atender({ codigo: this.codigo ?? undefined, token: this.token ?? undefined, msg });
    const ms = r.mensajes.map((x) => x.m);
    this.recibidos.push(...ms);
    for (const m of ms) this.registrar(m);
    return ms;
  }

  private registrar(m: MensajeServidor): void {
    if (m.t === 'sesion') Object.assign(this, { codigo: m.codigo, token: m.token, id: m.jugadorId });
    else if (m.t === 'estado') this.vista = m.vista;
    else if (m.t === 'error') this.errores.push(m.codigo);
  }

  eventos(): EventoJuego[] {
    return this.recibidos.flatMap((m) => (m.t === 'eventos' ? m.eventos : []));
  }
}

/** Sala con un anfitrión humano y bots; devuelve el anfitrión ya sentado y la partida iniciada. */
export async function salaIniciada(proc: Procesador, modalidad: 'CLASICA' | 'APUNTADO', bots = 1, parametros: Record<string, unknown> = {}) {
  const ana = new JugadorHttp(proc, 'Ana');
  await ana.llamar({ t: 'crear_sala', nombre: 'Ana', modalidad, parametros });
  for (let i = 0; i < bots; i++) await ana.llamar({ t: 'agregar_bot' });
  await ana.llamar({ t: 'iniciar' });
  return ana;
}

/**
 * Solo pruebas: da al jugador el turno en fase de descartar con una mano conocida, escribiendo el estado guardado
 * con su versión (como lo haría otra petición).
 */
export async function forzarTurnoConMano(almacen: AlmacenMemoria, codigo: string, jugadorId: string, mano: string): Promise<void> {
  const fila = (await almacen.leerSala(codigo))!;
  const r = fila.datos.snapshot!.ronda!;
  r.turnoId = jugadorId;
  r.fase = 'DESCARTAR';
  r.venceEn = Number.MAX_SAFE_INTEGER;
  r.pozoRoboId = null;
  r.manos[jugadorId] = parseCartas(mano);
  const ok = await almacen.guardarAtomico(codigo, fila.version, fila.datos, fila.proximoEn, [], []);
  if (!ok) throw new Error('no se pudo forzar la mano');
}
