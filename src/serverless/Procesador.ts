import { createHmac, randomUUID } from 'node:crypto';
import type { EventoJuego, MensajeCliente, MensajeServidor } from '../kernel/protocolo.js';
import { AleatorioSeguro } from '../deck/Baraja.js';
import { LobbyManager, hashToken } from '../game/lobby/LobbyManager.js';
import { crearRegistroReglas } from '../rules/RegistroReglas.js';
import { type Conexion, type Logger, TurnOrchestrator } from '../game/TurnOrchestrator.js';
import type { IExtrasJuego, IServicioCuentas } from '../game/puertos.js';
import type { ICanalTiempoReal } from '../infra/GatewayTiempoReal.js';
import type { IRepositorioPartida } from '../persistence/IRepositorioPartida.js';
import type { DatosSala, FilaSala, IAlmacen, MensajeBuzon } from '../persistence/IAlmacen.js';
import { ProgramadorVirtual } from './ProgramadorVirtual.js';

/** Un jugador se considera conectado si su navegador dio señales en los últimos N ms (latido cada ~10 s). */
export const PRESENCIA_MS = 30_000;
/** Las salas sin actividad durante este tiempo se borran solas. */
export const SALA_CADUCA_MS = 12 * 3600_000;

export interface PeticionJuego {
  codigo?: string;
  token?: string;
  /** Clave anónima de la cuenta del navegador (créditos y skins). */
  clave?: string;
  /** Mensaje del protocolo (ver asyncapi.yaml). Sin mensaje = sincronizar. */
  msg?: MensajeCliente;
  /** El cliente no tiene ninguna vista (acaba de cargar la página). */
  vista?: boolean;
  /** Identificador anónimo del cliente para los límites anti-abuso (nunca la IP en claro). */
  idCliente?: string;
  /** Ida y vuelta de la petición anterior medida por el navegador (ms), para las métricas de latencia. */
  rttMs?: number;
}

export interface RespuestaJuego {
  ahora: number;
  mensajes: MensajeBuzon[];
  /** Cuándo debe volver a llamar el cliente para que el tiempo avance (fin de turno, pausa, votación). */
  proximoEn: number | null;
}

export interface OpcionesProcesador {
  almacen: IAlmacen;
  /** Extras (ADR-11): los inyecta la composicion (manejador). */
  extras: IExtrasJuego;
  /** Gateway de tiempo real (Supabase Realtime). Opcional: sin él, los clientes consultan cada pocos segundos. */
  canal?: ICanalTiempoReal;
  logger?: Logger;
  reloj?: () => number;
  retardoBotMs?: readonly [number, number];
  reaccionesBots?: boolean;
  votacion?: Partial<{ saltosMin: number; turnosAutoMin: number; duracionSeg: number }>;
}

/**
 * Repositorio de la petición: en serverless el estado se exporta entero al final de cada petición (no hay escritura
 * incremental). Solo recoge los eventos de juego para guardarlos junto con la sala (ADR-09).
 */
const repoCaptura = (cuentas: IAlmacen, capturados: EventoJuego[]): IRepositorioPartida => ({
  cargarCuenta: (h) => cuentas.cargarCuenta(h),
  guardarCuenta: (c) => cuentas.guardarCuenta(c),
  inicializar: async () => {},
  guardar: async (_codigo, cambio) => {
    capturados.push(...(cambio.eventos ?? []));
  },
  cargarSala: async () => null,
  cargarActivas: async () => [],
  historial: async () => null,
  salud: async () => true,
  cerrar: async () => {},
});

class ErrorConflicto extends Error {}

/** Buzón de quien ya no tiene asiento en la sala (salió o fue expulsado): se identifica por la huella de su token. */
const buzonSinAsiento = (huellaToken: string): string => `x:${huellaToken.slice(0, 32)}`;

type Exportado = NonNullable<ReturnType<TurnOrchestrator['exportar']>>;
type Lote = Array<{ jugadorId: string } & MensajeBuzon>;

/** Estado de UN intento de atender la petición (se descarta entero si hay conflicto de versión). */
interface Intento {
  readonly ahora: number;
  readonly fila: FilaSala | null;
  readonly prog: ProgramadorVirtual;
  readonly cuentas: IServicioCuentas;
  readonly servicio: TurnOrchestrator;
  readonly eventos: EventoJuego[];
  /** Lo que el servicio envía a cada conexión, con su hora (virtual) de envío. */
  readonly salientes: Map<Conexion, MensajeBuzon[]>;
  readonly yo: Conexion;
  /** Jugadores presentes que siguen dando señales (conexión simulada por jugador). */
  readonly otros: Map<string, Conexion>;
  /** Huella del token de cada jugador ANTES de aplicar nada (el servicio modifica la sala en el sitio, p. ej. al expulsar). */
  readonly huellas: Map<string, string | null>;
  yoId: string | null;
  codigo: string | null;
}

/** Resultado de cerrar el servicio: estado exportado, próximo plazo y mensajes para los buzones de los demás. */
interface Cierre {
  readonly exportado: Exportado | null;
  readonly proximoEn: number | null;
  readonly lote: Lote;
}

const CODIGO_VALIDO = /^[A-Z0-9]{3,8}$/;

/** Código de sala al que va dirigida la petición (null al crear una sala). */
function codigoDe(p: PeticionJuego, msg: MensajeCliente | undefined): string | null {
  if (msg?.t === 'crear_sala') return null;
  if (msg?.t === 'unirse' || msg?.t === 'reconectar') return msg.codigo.trim().toUpperCase();
  return p.codigo ? p.codigo.trim().toUpperCase() : null;
}

/**
 * Atiende UNA petición del juego en un entorno sin servidor permanente (Vercel):
 *   leer sala -> reconstruir el servicio de juego -> aplicar presencia y mensaje -> poner el reloj al día (plazos y bots)
 *   -> guardar sala, buzones y eventos en una sola operación con versión optimista (reintenta si otra petición ganó)
 *   -> avisar por Realtime (ADR-05 v2, ADR-07, ADR-09, ADR-12).
 * Reutiliza íntegro el `TurnOrchestrator`: las reglas, turnos, votaciones y privacidad no cambian.
 */
export class Procesador {
  private readonly log: Logger;
  constructor(private readonly o: OpcionesProcesador) {
    this.log = o.logger ?? { info() {}, error() {} };
  }

  private ahora(): number {
    return (this.o.reloj ?? Date.now)();
  }

  async atender(p: PeticionJuego): Promise<RespuestaJuego> {
    const inicio = performance.now();
    const msg = p.msg;
    const inmediata = this.sinSala(p, msg);
    if (inmediata) return inmediata;
    const codigo = codigoDe(p, msg);
    if (codigo !== null && !CODIGO_VALIDO.test(codigo)) return this.error('SALA_INEXISTENTE', 'No existe una sala con ese código.');
    const previa = await this.antesDeIntentar(codigo, p, msg);
    return previa ?? this.conReintentos(codigo, p, msg, inicio);
  }

  /**
   * Respuestas que no necesitan reconstruir la sala: límite de creación, sincronización vacía o camino rápido
   * (solo latido y buzón). null = hay que atender la petición completa.
   */
  private async antesDeIntentar(codigo: string | null, p: PeticionJuego, msg: MensajeCliente | undefined): Promise<RespuestaJuego | null> {
    if (msg?.t === 'crear_sala') return this.limitarCreacion(p);
    if (msg) return null;
    if (!codigo || !p.token) return { ahora: this.ahora(), mensajes: [], proximoEn: null };
    return p.vista ? null : this.sincronizacionRapida(codigo, p.token);
  }

  /** Operaciones que no tocan ninguna sala: tienda en el inicio y ping. */
  private sinSala(p: PeticionJuego, msg: MensajeCliente | undefined): Promise<RespuestaJuego> | RespuestaJuego | null {
    if (msg && msg.t.startsWith('cuenta_') && !p.codigo) return this.soloCuenta(p, msg);
    if (msg?.t !== 'ping') return null;
    const ahora = this.ahora();
    return { ahora, mensajes: [{ en: ahora, m: { t: 'pong', ahora } }], proximoEn: null };
  }

  /** Límite anti-abuso de creación de salas y limpieza de salas caducadas. */
  private async limitarCreacion(p: PeticionJuego): Promise<RespuestaJuego | null> {
    if (p.idCliente && (await this.o.almacen.contarIntento(`sala:${p.idCliente}`, 3600)) > 30) {
      return this.error('DEMASIADAS_SOLICITUDES', 'Has creado demasiadas salas en poco tiempo. Espera un rato.');
    }
    await this.o.almacen.purgar(this.ahora() - SALA_CADUCA_MS).catch((err) => this.log.error('limpieza de salas caducadas fallida', { err: String(err) }));
    return null;
  }

  /** Control de versión optimista (ADR-07): si otra petición escribió antes, se repite sobre el estado nuevo. */
  private async conReintentos(codigo: string | null, p: PeticionJuego, msg: MensajeCliente | undefined, inicio: number): Promise<RespuestaJuego> {
    for (let intento = 0; intento < 8; intento++) {
      try {
        return await this.intentar(codigo, p, msg, inicio);
      } catch (e) {
        if (!(e instanceof ErrorConflicto)) throw e;
        await new Promise((r) => setTimeout(r, 20 + Math.random() * 60 * (intento + 1)));
      }
    }
    return this.error('SERVIDOR_OCUPADO', 'La sala está muy ocupada. Intenta de nuevo.');
  }

  /** Si el jugador ya estaba presente y no vence ningún plazo, basta con el latido y su buzón. */
  private async sincronizacionRapida(codigo: string, token: string): Promise<RespuestaJuego | null> {
    const fila = await this.o.almacen.leerSala(codigo);
    const ahora = this.ahora();
    const yo = fila?.datos.sala.jugadores.find((j) => !j.esBot && j.tokenHash === hashToken(token));
    if (!fila || !yo || !fila.datos.presentes.includes(yo.id)) return null;
    if (fila.proximoEn !== null && fila.proximoEn <= ahora) return null;
    if (await this.alguienSeFue(fila, yo.id, ahora)) return null;
    await this.o.almacen.tocarPresencia(codigo, yo.id, ahora);
    const mensajes = await this.o.almacen.sacarBuzon(codigo, yo.id);
    return { ahora, mensajes, proximoEn: fila.proximoEn };
  }

  private async alguienSeFue(fila: FilaSala, yoId: string, ahora: number): Promise<boolean> {
    const pres = await this.o.almacen.leerPresencias(fila.codigo);
    return fila.datos.presentes.some((id) => id !== yoId && (pres.get(id) ?? 0) < ahora - PRESENCIA_MS);
  }

  private crearServicio(prog: ProgramadorVirtual, cuentas: IServicioCuentas, capturados: EventoJuego[] = []): TurnOrchestrator {
    const { extras } = this.o;
    const rng = new AleatorioSeguro();
    return new TurnOrchestrator({
      lobby: new LobbyManager(rng, () => prog.ahora(), extras.estilos),
      motor: crearRegistroReglas(),
      fabricaDescarte: extras.fabricaDescarte,
      extras,
      repo: repoCaptura(this.o.almacen, capturados),
      programador: prog,
      rng,
      cuentas,
      logger: this.log,
      retardoBotMs: this.o.retardoBotMs ?? [700, 1300],
      ...(this.o.reaccionesBots === false ? {} : { planificador: extras.crearPlanificador(extras.probabilidadesBot, Math.random, () => prog.ahora()) }),
      ...(this.o.votacion ? { votacion: this.o.votacion } : {}),
    });
  }

  private async intentar(codigoPedido: string | null, p: PeticionJuego, msg: MensajeCliente | undefined, inicio: number): Promise<RespuestaJuego> {
    const fila = codigoPedido ? await this.o.almacen.leerSala(codigoPedido) : null;
    if (codigoPedido && !fila) return this.error('SALA_INEXISTENTE', msg?.t === 'unirse' ? 'No existe una sala con ese código.' : 'La sala ya no existe.');
    const it = await this.prepararIntento(fila, codigoPedido, p.clave);
    await this.montarSala(it, p, msg);
    await this.aplicarMensaje(it, p, msg);
    const cierre = await this.cerrarServicio(it);
    await this.escribir(it, cierre, this.muestraLatencia(it, p, msg, inicio));
    // A partir de aquí la sala ya quedó guardada: efectos que no deben repetirse si hubo reintento.
    await this.efectosPosteriores(it, cierre, msg);
    const previos = await this.buzonPendiente(it, p, msg);
    return { ahora: it.ahora, mensajes: [...previos, ...it.salientes.get(it.yo)!], proximoEn: cierre.proximoEn };
  }

  private async prepararIntento(fila: FilaSala | null, codigo: string | null, clave: string | undefined): Promise<Intento> {
    const ahora = this.ahora();
    const prog = new ProgramadorVirtual(Math.max(ahora, fila?.datos.reloj ?? 0));
    const cuentas = this.o.extras.crearCuentas(this.o.almacen, () => prog.ahora(), { alError: (err) => this.log.error('fallo al guardar cuenta', { err: String(err) }) });
    const eventos: EventoJuego[] = [];
    const salientes = new Map<Conexion, MensajeBuzon[]>();
    const yo = nuevaConexion(salientes, prog);
    await vincularCuenta(cuentas, yo, clave);
    const huellas = new Map((fila?.datos.sala.jugadores ?? []).map((j) => [j.id, j.tokenHash] as const));
    const servicio = this.crearServicio(prog, cuentas, eventos);
    return { ahora, fila, prog, cuentas, servicio, eventos, salientes, yo, otros: new Map(), huellas, yoId: null, codigo };
  }

  /** Monta la sala tal como quedó y aplica la presencia: quien sigue dando señales se vincula; quien dejó de darlas se desconecta. */
  private async montarSala(it: Intento, p: PeticionJuego, msg: MensajeCliente | undefined): Promise<void> {
    if (!it.fila) return;
    const d = it.fila.datos;
    it.servicio.montarExacta(d.sala, d.snapshot, d.extras);
    const presencias = await this.o.almacen.leerPresencias(it.fila.codigo);
    it.yoId = p.token ? (d.sala.jugadores.find((j) => !j.esBot && j.tokenHash === hashToken(p.token!))?.id ?? null) : null;
    for (const id of d.presentes) if (id !== it.yoId) this.vincularPresente(it, id, presencias);
    await this.vincularme(it, p, msg);
  }

  private vincularPresente(it: Intento, id: string, presencias: Map<string, number>): void {
    const c = nuevaConexion(it.salientes, it.prog);
    if (!it.servicio.adjuntar(c, it.fila!.codigo, id)) return;
    if ((presencias.get(id) ?? 0) >= it.ahora - PRESENCIA_MS) it.otros.set(id, c);
    else it.servicio.desconectar(c);
  }

  /** Vincula a quien pregunta: si ya estaba presente basta adjuntarlo; si no, entra como reconexión. */
  private async vincularme(it: Intento, p: PeticionJuego, msg: MensajeCliente | undefined): Promise<void> {
    if (!it.yoId || msg?.t === 'reconectar') return;
    const codigo = it.fila!.codigo;
    if (it.fila!.datos.presentes.includes(it.yoId)) it.servicio.adjuntar(it.yo, codigo, it.yoId);
    else await it.servicio.recibir(it.yo, { t: 'reconectar', codigo, token: p.token! });
  }

  private async aplicarMensaje(it: Intento, p: PeticionJuego, msg: MensajeCliente | undefined): Promise<void> {
    if (msg) await it.servicio.recibir(it.yo, msg);
    else if (p.vista && it.yoId && it.codigo) this.enviarVista(it);
    if (it.yo.codigo) it.codigo = it.yo.codigo;
  }

  private enviarVista(it: Intento): void {
    const v = it.servicio.vistaDe(it.codigo!, it.yoId!);
    if (v) it.yo.enviar({ t: 'estado', vista: v });
  }

  /** Pone el reloj al día (plazos vencidos y cadenas de bots), exporta el estado y arma los buzones de los demás. */
  private async cerrarServicio(it: Intento): Promise<Cierre> {
    it.prog.ponerAlDia(it.ahora);
    const proximoEn = it.prog.proximoEn();
    const exportado = it.codigo ? it.servicio.exportar(it.codigo) : null;
    await it.servicio.cerrar();
    it.prog.descartarTodo();
    return { exportado, proximoEn, lote: exportado ? armarLote(it) : [] };
  }

  /** Extra de métricas: una muestra de latencia por comando de juego, guardada con la sala (nunca va a los clientes). */
  private muestraLatencia(it: Intento, p: PeticionJuego, msg: MensajeCliente | undefined, inicio: number): EventoJuego[] {
    if (!msg || !this.o.extras.metricas) return [];
    const muestra = { comando: msg.t, jugadorId: it.yo.jugadorId ?? null, servidorMs: performance.now() - inicio, clienteMs: p.rttMs ?? null };
    const evento = this.o.extras.metricas.eventoLatencia(muestra, it.ahora);
    return evento ? [evento] : [];
  }

  /** Sala, mensajes y eventos se escriben en una sola operación (ADR-07, ADR-09). Versión 0 = crear la sala. */
  private async escribir(it: Intento, cierre: Cierre, metricas: readonly EventoJuego[] = []): Promise<void> {
    const codigo = it.codigo;
    if (!codigo) return;
    if (!cierre.exportado) {
      if (it.fila) await this.o.almacen.borrarSala(codigo);
      return;
    }
    const datos: DatosSala = { ...cierre.exportado, presentes: presentesDe(it), reloj: it.prog.ahora() };
    const creando = !it.fila || it.fila.codigo !== codigo;
    const version = creando ? 0 : it.fila!.version;
    if (!(await this.o.almacen.guardarAtomico(codigo, version, datos, cierre.proximoEn, cierre.lote, [...it.eventos, ...metricas]))) {
      throw new ErrorConflicto(creando ? 'código repetido' : 'versión');
    }
  }

  /** Después de confirmar la escritura: cuentas, latido propio y aviso por Realtime (persistir y luego notificar). */
  private async efectosPosteriores(it: Intento, cierre: Cierre, msg: MensajeCliente | undefined): Promise<void> {
    await it.cuentas.vaciar();
    const codigo = it.codigo;
    if (!codigo || !cierre.exportado) return;
    if (it.yo.jugadorId && it.yo.codigo === codigo) await this.o.almacen.tocarPresencia(codigo, it.yo.jugadorId, it.ahora);
    if (!cierre.lote.length && !msg) return;
    // Un fallo del aviso no revierte nada: la sala ya está guardada y los clientes la leerán en su próxima consulta.
    await this.o.canal?.avisarCambio(codigo).catch((err) => this.log.error('aviso en tiempo real fallido', { err: String(err) }));
  }

  /** Mensajes que esperaban en el buzón de quien pregunta (o en el de su token, si ya no tiene asiento). */
  private async buzonPendiente(it: Intento, p: PeticionJuego, msg: MensajeCliente | undefined): Promise<MensajeBuzon[]> {
    const yo = it.yo;
    if (it.codigo && yo.jugadorId && yo.codigo === it.codigo) return this.o.almacen.sacarBuzon(it.codigo, yo.jugadorId);
    if (it.fila && p.token && !it.yoId && !msg) return this.o.almacen.sacarBuzon(it.fila.codigo, buzonSinAsiento(hashToken(p.token)));
    return [];
  }

  private async soloCuenta(p: PeticionJuego, msg: MensajeCliente): Promise<RespuestaJuego> {
    const ahora = this.ahora();
    const prog = new ProgramadorVirtual(ahora);
    const cuentas = this.o.extras.crearCuentas(this.o.almacen, () => ahora);
    const servicio = this.crearServicio(prog, cuentas);
    const lista: MensajeBuzon[] = [];
    const conn: Conexion = { id: randomUUID(), codigo: null, jugadorId: null, cuentaHash: null, enviar: (m) => lista.push({ en: ahora, m }) };
    await vincularCuenta(cuentas, conn, p.clave);
    await servicio.recibir(conn, msg);
    await cuentas.vaciar();
    return { ahora, mensajes: lista, proximoEn: null };
  }

  private error(codigo: string, mensaje: string): RespuestaJuego {
    const ahora = this.ahora();
    return { ahora, mensajes: [{ en: ahora, m: { t: 'error', codigo, mensaje } }], proximoEn: null };
  }
}

/** Conexión simulada: lo que el servicio le envía queda en su buzón de salida con la hora virtual. */
function nuevaConexion(salientes: Map<Conexion, MensajeBuzon[]>, prog: ProgramadorVirtual): Conexion {
  const conn: Conexion = {
    id: randomUUID(),
    codigo: null,
    jugadorId: null,
    cuentaHash: null,
    enviar: (m: MensajeServidor) => {
      if (m.t !== 'pong') salientes.get(conn)!.push({ en: prog.ahora(), m });
    },
  };
  salientes.set(conn, []);
  return conn;
}

async function vincularCuenta(cuentas: IServicioCuentas, conn: Conexion, clave: string | undefined): Promise<void> {
  if (!clave) return;
  const c = await cuentas.cargarPorClave(clave);
  if (c) conn.cuentaHash = c.claveHash;
}

/** Conectados al terminar: las conexiones vinculadas a esta sala. */
function presentesDe(it: Intento): string[] {
  const ids = [...it.salientes.keys()].filter((c) => c.codigo === it.codigo && c.jugadorId).map((c) => c.jugadorId!);
  return [...new Set(ids)];
}

/**
 * Mensajes para los buzones de los demás jugadores. Se calculan ANTES de escribir para guardarlos con la sala.
 * Quien acaba de salir o ser expulsado ya no tiene asiento: sus últimos mensajes van bajo la huella de su token.
 */
function armarLote(it: Intento): Lote {
  const lote: Lote = [];
  for (const [c, lista] of it.salientes) {
    if (c === it.yo || !c.jugadorId || c.codigo !== it.codigo) continue;
    for (const mb of lista) lote.push({ jugadorId: c.jugadorId, ...mb });
  }
  for (const [id, c] of it.otros) lote.push(...mensajesSinAsiento(it, id, c));
  return lote;
}

function mensajesSinAsiento(it: Intento, id: string, c: Conexion): Lote {
  const huella = it.huellas.get(id);
  if (c.codigo === it.codigo || !huella) return [];
  return it.salientes.get(c)!.map((mb) => ({ jugadorId: buzonSinAsiento(huella), ...mb }));
}

/** Identificador anónimo del cliente para límites: HMAC(secreto, IP + día). No se guarda ni se registra la IP. */
export function idAnonimo(ip: string, secreto: string, ahora = Date.now()): string {
  const dia = Math.floor(ahora / 86_400_000);
  return createHmac('sha256', secreto).update(`${dia}|${ip}`).digest('base64url').slice(0, 22);
}
