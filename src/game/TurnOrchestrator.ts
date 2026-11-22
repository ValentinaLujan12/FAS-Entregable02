import type { FabricaDescarte } from './PartidaEnCurso.js';
import { randomUUID } from 'node:crypto';
import type { EventoJuego, MensajeCliente, MensajeServidor, VistaMesa } from '../kernel/protocolo.js';
import type { Cuenta } from '../persistence/IRepositorioCuentas.js';
import type { IExtrasJuego, IPlanificadorReacciones, IServicioCuentas, PlanReaccion } from './puertos.js';
import type { Aleatorio } from '../deck/index.js';
import { PartidaEnCurso } from './PartidaEnCurso.js';
import type { EstadoPartida } from './tipos.js';
import type { ExtrasSala } from '../estado/tipos.js';
import type { ITemporizadorTurno } from '../infra/Programador.js';
import { ESTILO_POR_DEFECTO, type EstiloJugador, LobbyManager, type Sala, hashToken } from './lobby/LobbyManager.js';
import type { CambioPersistible, HistorialSala, IRepositorioPartida, RondaPersistible } from '../persistence/IRepositorioPartida.js';
import type { IRegistroReglas } from '../rules/IReglaJuego.js';
import { eventoPublico, vistaMesa } from '../infra/ProyectorVistaJugador.js';

/**
 * Servicio de aplicación: une Lobby + Orquestador + Temporizador + Bots + Repositorio + Canal en tiempo real.
 * Es el ÚNICO lugar donde conviven los dominios; cada uno depende solo de contratos (ADR-01, sin ciclos).
 * Orden de cada acción: ejecutar en el dominio -> preparar los mensajes de cada jugador -> persistir sala, buzones y
 * eventos en una transacción -> aviso Realtime (lo hace serverless/Procesador tras confirmar) -> reprogramar plazos.
 */
export interface Conexion {
  readonly id: string;
  enviar(msg: MensajeServidor): void;
  codigo: string | null;
  jugadorId: string | null;
  /** Hash de la clave de la cuenta abierta en esta conexión (null/ausente = sin cuenta). */
  cuentaHash?: string | null;
}

export type { ExtrasSala } from '../estado/tipos.js';

export interface Logger {
  info(msg: string, extra?: object): void;
  error(msg: string, extra?: object): void;
}

export interface DepsServicio {
  lobby: LobbyManager;
  motor: IRegistroReglas;
  /** Politica de descarte automatico (la aporta la capa de extras). */
  fabricaDescarte: FabricaDescarte;
  repo: IRepositorioPartida;
  programador: ITemporizadorTurno;
  rng: Aleatorio;
  /** Rango de "pensar" de los bots (ms). En pruebas: [0, 0]. */
  retardoBotMs?: readonly [number, number];
  logger?: Logger;
  /** Minutos sin conexiones tras los cuales se libera una sala de la memoria (sigue en la BD). */
  minutosInactividad?: number;
  /** Umbrales de las votaciones por inactividad (demos y pruebas: acortan la espera). */
  votacion?: Partial<{ saltosMin: number; turnosAutoMin: number; duracionSeg: number; enfriamientoSaltos: number }>;
  /** Extras (ADR-11): estilos, reacciones, bots y cuentas, inyectados por la composicion. */
  extras: IExtrasJuego;
  /** Cuentas/tienda (por defecto se crea una sobre `repo` con `extras.crearCuentas`). */
  cuentas?: IServicioCuentas;
  /** Planificador de reacciones de los bots (ausente = bots mudos, como en las pruebas deterministas). */
  planificador?: IPlanificadorReacciones;
}

interface OpcionesPersistir {
  sala?: boolean;
  borrarSnapshot?: boolean;
}

interface Sesion {
  sala: Sala;
  partida: PartidaEnCurso | null;
  conexiones: Set<Conexion>;
  seqBase: number;
  cancelTurno: (() => void) | null;
  cancelBot: (() => void) | null;
  cancelVoto: (() => void) | null;
  cancelContinuar: (() => void) | null;
  cola: Promise<void>;
  sinConexionDesde: number | null;
  /** objetivo -> humanos que lo silenciaron (solo memoria: no se persiste). */
  silencios: Map<string, Set<string>>;
  ultimaReaccion: Map<string, number>;
  cancelReacciones: Set<() => void>;
}

const silencioso: Logger = { info() {}, error() {} };

type Msg<T extends MensajeCliente['t']> = Extract<MensajeCliente, { t: T }>;
type ManejadorLibre = (conn: Conexion, msg: MensajeCliente) => void | Promise<void>;
type ManejadorSala = (conn: Conexion, ses: Sesion, yo: string, msg: MensajeCliente) => void | Promise<void>;
type TablaComandos<M> = Partial<Record<MensajeCliente['t'], M>>;

/** Manejador propio de la tabla (nunca uno heredado del prototipo, p. ej. "constructor"). */
function manejadorDe<M>(tabla: TablaComandos<M>, t: string): M | undefined {
  return Object.hasOwn(tabla, t) ? tabla[t as MensajeCliente['t']] : undefined;
}

/** Puerto de entrada de comandos del juego (entregable 2: IComandosJuego). Lo usa la infraestructura. */
export interface IComandosJuego {
  recibir(conn: Conexion, msg: MensajeCliente): Promise<void>;
}

export class TurnOrchestrator implements IComandosJuego {
  private readonly sesiones = new Map<string, Sesion>();
  private readonly log: Logger;
  readonly cuentas: IServicioCuentas;
  private readonly planificador: IPlanificadorReacciones | null;

  constructor(private readonly d: DepsServicio) {
    this.log = d.logger ?? silencioso;
    this.cuentas = d.cuentas ?? d.extras.crearCuentas(d.repo, () => d.programador.ahora(), { alError: (err) => this.log.error('fallo al persistir cuenta', { err: String(err) }) });
    this.planificador = d.planificador ?? null;
  }

  /* ===================== arranque / recuperación ===================== */

  /** A2 de CU-04: tras un reinicio, recupera salas y partidas desde el último snapshot consistente. */
  async restaurarActivas(): Promise<number> {
    const activas = await this.d.repo.cargarActivas();
    for (const { sala, snapshot } of activas) this.montar(sala, snapshot);
    return activas.length;
  }

  private montar(sala: Sala, snapshot: EstadoPartida | null, exacto = false): Sesion {
    this.d.lobby.restaurar(sala);
    const ses: Sesion = {
      sala,
      partida: null,
      conexiones: new Set(),
      seqBase: snapshot?.seq ?? 0,
      cancelTurno: null,
      cancelBot: null,
      cancelVoto: null,
      cancelContinuar: null,
      cola: Promise.resolve(),
      sinConexionDesde: this.d.programador.ahora(),
      silencios: new Map(),
      ultimaReaccion: new Map(),
      cancelReacciones: new Set(),
    };
    if ((sala.estado === 'EN_CURSO' || sala.estado === 'FINALIZADA') && snapshot) {
      ses.partida = exacto ? PartidaEnCurso.reanudar(snapshot, this.depsPartida()) : PartidaEnCurso.restaurar(snapshot, this.depsPartida());
    } else if (sala.estado === 'EN_CURSO') {
      sala.estado = 'ESPERA'; // sin snapshot no hay partida recuperable
    }
    this.sesiones.set(sala.codigo, ses);
    this.programar(ses);
    return ses;
  }

  private depsPartida() {
    return { motor: this.d.motor, fabricaDescarte: this.d.fabricaDescarte, rng: this.d.rng, reloj: () => this.d.programador.ahora(), votacion: this.d.votacion };
  }

  /* ===================== API para el despliegue serverless (una petición = montar -> actuar -> exportar) ===================== */

  /** Monta una sala EXACTAMENTE como quedó guardada (incluidos silencios y antirrebote de reacciones). */
  montarExacta(sala: Sala, snapshot: EstadoPartida | null, extras?: ExtrasSala): void {
    const ses = this.montar(sala, snapshot, true);
    if (snapshot) ses.seqBase = snapshot.seq;
    else if (extras?.seqBase) ses.seqBase = extras.seqBase;
    if (extras) {
      ses.silencios = new Map(extras.silencios.map(([k, v]) => [k, new Set(v)]));
      ses.ultimaReaccion = new Map(extras.ultimaReaccion);
    }
  }

  /** Vincula una conexión a un asiento SIN efectos (el jugador ya figuraba como conectado). */
  adjuntar(conn: Conexion, codigo: string, jugadorId: string): boolean {
    const ses = this.sesiones.get(codigo);
    if (!ses || !ses.sala.jugadores.some((j) => j.id === jugadorId && !j.esBot)) return false;
    this.vincular(conn, ses, jugadorId);
    return true;
  }

  /** Estado completo y serializable de la sala (null si la sala dejó de existir). */
  exportar(codigo: string): { sala: Sala; snapshot: EstadoPartida | null; extras: ExtrasSala } | null {
    const ses = this.sesiones.get(codigo);
    if (!ses) return null;
    return {
      sala: structuredClone(ses.sala),
      snapshot: ses.partida ? ses.partida.snapshot() : null,
      extras: {
        silencios: [...ses.silencios].map(([k, v]) => [k, [...v]]),
        ultimaReaccion: [...ses.ultimaReaccion],
        seqBase: ses.seqBase,
      },
    };
  }

  /** Vista actual de un jugador (para responder a quien entra sin cambios pendientes). */
  vistaDe(codigo: string, jugadorId: string): VistaMesa | null {
    const ses = this.sesiones.get(codigo);
    if (!ses) return null;
    return vistaMesa(ses.sala, ses.partida, this.conectadosDe(ses), jugadorId, this.d.programador.ahora(), {
      silenciado: (id) => this.silenciadoParaTodos(ses, id),
      silenciadoPor: (id, quien) => ses.silencios.get(id)?.has(quien) ?? false,
    });
  }

  estadisticas(): { salas: number; conexiones: number; partidasEnCurso: number } {
    let conexiones = 0;
    let enCurso = 0;
    for (const s of this.sesiones.values()) {
      conexiones += s.conexiones.size;
      if (s.partida?.estado.fase === 'EN_CURSO') enCurso++;
    }
    return { salas: this.sesiones.size, conexiones, partidasEnCurso: enCurso };
  }

  /** Solo pruebas/diagnóstico: acceso de lectura a la sesión en memoria. */
  inspeccionar(codigo: string): { sala: Sala; partida: PartidaEnCurso | null } | undefined {
    const s = this.sesiones.get(codigo.toUpperCase());
    return s ? { sala: s.sala, partida: s.partida } : undefined;
  }

  /** Información pública mínima de una sala (para validar un código antes de unirse). */
  infoSala(codigo: string): { existe: boolean; estado?: string; modalidad?: string; jugadores?: number; maxJugadores?: number } {
    const s = this.sesiones.get(codigo.trim().toUpperCase());
    if (!s) return { existe: false };
    return { existe: true, estado: s.sala.estado, modalidad: s.sala.modalidad, jugadores: s.sala.jugadores.length, maxJugadores: s.sala.parametros.maxJugadores };
  }

  /** RF19: historial auditable. Mientras la partida no termine se ocultan cartas privadas. */
  async historial(codigo: string, token: string): Promise<{ ok: true; historial: HistorialSala } | { ok: false; estado: number; mensaje: string }> {
    const cod = codigo.trim().toUpperCase();
    const ses = this.sesiones.get(cod);
    const sala = ses?.sala ?? (await this.d.repo.cargarSala(cod))?.sala;
    if (!sala) return { ok: false, estado: 404, mensaje: 'Sala inexistente.' };
    const h = hashToken(token);
    if (!sala.jugadores.some((j) => !j.esBot && j.tokenHash === h)) return { ok: false, estado: 403, mensaje: 'Token de jugador inválido.' };
    const hist = await this.d.repo.historial(cod);
    if (!hist) return { ok: false, estado: 404, mensaje: 'Sin historial.' };
    if (sala.estado !== 'FINALIZADA') {
      hist.eventos = hist.eventos.map(eventoPublico);
      hist.rondas = hist.rondas.map((r) => ({ ...r, manosIniciales: {} }));
    }
    return { ok: true, historial: hist };
  }

  /* ===================== conexiones ===================== */

  desconectar(conn: Conexion): void {
    const ses = conn.codigo ? this.sesiones.get(conn.codigo) : undefined;
    if (!ses || !conn.jugadorId) return;
    ses.conexiones.delete(conn);
    const aunConectado = [...ses.conexiones].some((c) => c.jugadorId === conn.jugadorId);
    if (!aunConectado && ses.partida) {
      ses.partida.setConectado(conn.jugadorId, false);
      ses.partida.limitarTurno(conn.jugadorId, ses.partida.tiempoTurnoMs(conn.jugadorId));
      this.programar(ses);
    }
    if (ses.conexiones.size === 0) ses.sinConexionDesde = this.d.programador.ahora();
    this.difundirEstado(ses);
    conn.codigo = null;
    conn.jugadorId = null;
  }

  /** Libera de memoria las salas sin conexiones durante mucho tiempo (siguen recuperables desde la BD). */
  purgarInactivas(): number {
    const limite = (this.d.minutosInactividad ?? 30) * 60_000;
    const ahora = this.d.programador.ahora();
    let n = 0;
    for (const [codigo, s] of this.sesiones) {
      if (s.conexiones.size === 0 && s.sinConexionDesde !== null && ahora - s.sinConexionDesde > limite && s.partida?.estado.fase !== 'EN_CURSO') {
        this.detener(s);
        this.sesiones.delete(codigo);
        this.d.lobby.eliminar(codigo);
        n++;
      }
    }
    return n;
  }

  async cerrar(): Promise<void> {
    for (const s of this.sesiones.values()) {
      this.detener(s);
      await s.cola;
    }
  }

  /* ===================== comandos ===================== */

  async recibir(conn: Conexion, msg: MensajeCliente): Promise<void> {
    try {
      await this.despachar(conn, msg);
    } catch (err) {
      this.log.error('error procesando mensaje', { t: msg.t, err: String(err) });
      this.error(conn, 'ERROR_INTERNO', 'Ocurrió un error inesperado.');
    }
  }

  /** Comandos que no requieren estar sentado en una sala. */
  private readonly libres: TablaComandos<ManejadorLibre> = {
    ping: (c) => c.enviar({ t: 'pong', ahora: this.d.programador.ahora() }),
    crear_sala: (c, m) => this.crearSala(c, m as Msg<'crear_sala'>),
    unirse: (c, m) => this.unirse(c, m as Msg<'unirse'>),
    reconectar: (c, m) => this.reconectar(c, m as Msg<'reconectar'>),
    cuenta_abrir: (c, m) => this.cuentaAbrir(c, (m as Msg<'cuenta_abrir'>).clave),
    cuenta_comprar: (c, m) => this.cuentaOperar(c, m as Msg<'cuenta_comprar'>),
    cuenta_activar: (c, m) => this.cuentaOperar(c, m as Msg<'cuenta_activar'>),
    cuenta_recargar: (c, m) => this.cuentaOperar(c, m as Msg<'cuenta_recargar'>),
  };

  /** Comandos de un jugador sentado en una sala (IComandosJuego: robar, descartar, cerrar, votar, etc.). */
  private readonly enSala: TablaComandos<ManejadorSala> = {
    configurar: (c, s, yo, m) => this.configurar(c, s, yo, m as Msg<'configurar'>),
    agregar_bot: (c, s, yo) => this.agregarBot(c, s, yo),
    quitar_jugador: (c, s, yo, m) => this.quitarJugador(c, s, yo, (m as Msg<'quitar_jugador'>).jugadorId),
    iniciar: (c, s, yo) => this.iniciar(c, s, yo),
    robar: (c, s, yo, m) => this.accion(c, s, (p) => p.robar(yo, (m as Msg<'robar'>).origen)),
    descartar: (c, s, yo, m) => this.accion(c, s, (p) => p.descartar(yo, (m as Msg<'descartar'>).cartaId)),
    cerrar: (c, s, yo) => this.accion(c, s, (p) => p.cerrar(yo)),
    validar: (c, s, yo, m) => this.validar(c, s, yo, (m as Msg<'validar'>).cartaIds),
    continuar: (c, s, yo) => this.continuarManual(c, s, yo),
    nueva_partida: (c, s, yo) => this.nuevaPartida(c, s, yo),
    salir: (c, s, yo) => this.salir(c, s, yo),
    votar: (c, s, yo, m) => this.votar(c, s, yo, (m as Msg<'votar'>).aFavor),
    reaccion: (c, s, yo, m) => this.reaccionar(c, s, yo, (m as Msg<'reaccion'>).id),
    silenciar: (c, s, yo, m) => this.silenciar(c, s, yo, (m as Msg<'silenciar'>).jugadorId, (m as Msg<'silenciar'>).activo),
    iniciar_expulsion: (c, s, yo, m) => this.iniciarExpulsion(c, s, yo, (m as Msg<'iniciar_expulsion'>).objetivoId),
    retomar: (c, s, yo) => this.accion(c, s, (p) => p.retomar(yo)),
  };

  private async despachar(conn: Conexion, msg: MensajeCliente): Promise<void> {
    const libre = manejadorDe(this.libres, msg.t);
    if (libre) return libre(conn, msg);
    const ses = conn.codigo ? this.sesiones.get(conn.codigo) : undefined;
    if (!ses || !conn.jugadorId) return this.error(conn, 'SIN_SESION', 'Primero crea o únete a una sala.');
    const enSala = manejadorDe(this.enSala, msg.t);
    if (!enSala) return this.error(conn, 'MENSAJE_INVALIDO', 'Mensaje no soportado.');
    return enSala(conn, ses, conn.jugadorId, msg);
  }

  private crearSala(conn: Conexion, msg: Extract<MensajeCliente, { t: 'crear_sala' }>): void {
    if (conn.codigo) this.desconectar(conn);
    const r = this.d.lobby.crearSala(msg.nombre, msg.modalidad, msg.parametros as never, this.estiloDe(conn));
    if (!r.ok) return this.error(conn, r.codigo, r.mensaje);
    const ses = this.montar(r.sala, null);
    this.vincular(conn, ses, r.jugador.id);
    conn.enviar({ t: 'sesion', codigo: r.sala.codigo, jugadorId: r.jugador.id, token: r.token });
    this.persistir(ses, [], { sala: true });
    this.difundirEstado(ses);
  }

  private unirse(conn: Conexion, msg: Extract<MensajeCliente, { t: 'unirse' }>): void {
    if (conn.codigo) this.desconectar(conn);
    const r = this.d.lobby.unirse(msg.codigo, msg.nombre, this.estiloDe(conn));
    if (!r.ok) return this.error(conn, r.codigo, r.mensaje);
    const ses = this.sesiones.get(r.sala.codigo)!;
    this.vincular(conn, ses, r.jugador.id);
    conn.enviar({ t: 'sesion', codigo: r.sala.codigo, jugadorId: r.jugador.id, token: r.token });
    this.persistir(ses, [], { sala: true });
    this.difundirEstado(ses);
    this.lanzarPlanes(ses, this.planificador?.alEntrar({ id: r.jugador.id, esBot: false }, this.botsDe(ses)) ?? []);
  }

  private async reconectar(conn: Conexion, msg: Extract<MensajeCliente, { t: 'reconectar' }>): Promise<void> {
    if (conn.codigo) this.desconectar(conn);
    const codigo = msg.codigo.trim().toUpperCase();
    if (!this.sesiones.has(codigo)) {
      const rec = await this.d.repo.cargarSala(codigo); // sala liberada de memoria: se recupera de la BD
      if (rec && !this.sesiones.has(codigo)) this.montar(rec.sala, rec.snapshot);
    }
    const r = this.d.lobby.reconectar(codigo, msg.token);
    if (!r.ok) return this.error(conn, r.codigo, r.mensaje);
    const ses = this.sesiones.get(codigo)!;
    this.vincular(conn, ses, r.jugador.id);
    const evReco = ses.partida?.setConectado(r.jugador.id, true) ?? [];
    conn.enviar({ t: 'sesion', codigo, jugadorId: r.jugador.id, token: msg.token });
    this.tras(ses, evReco); // piloto / automático / votaciones en su contra se cancelan
    this.sincronizarEstilo(conn);
  }

  private vincular(conn: Conexion, ses: Sesion, jugadorId: string): void {
    conn.codigo = ses.sala.codigo;
    conn.jugadorId = jugadorId;
    ses.conexiones.add(conn);
    ses.sinConexionDesde = null;
  }

  private configurar(conn: Conexion, ses: Sesion, yo: string, msg: Extract<MensajeCliente, { t: 'configurar' }>): void {
    const r = this.d.lobby.configurar(ses.sala.codigo, yo, { modalidad: msg.modalidad, parametros: msg.parametros as never });
    if (!r.ok) return this.error(conn, r.codigo, r.mensaje);
    this.persistir(ses, [], { sala: true });
    this.difundirEstado(ses);
  }

  private agregarBot(conn: Conexion, ses: Sesion, yo: string): void {
    const r = this.d.lobby.agregarBot(ses.sala.codigo, yo);
    if (!r.ok) return this.error(conn, r.codigo, r.mensaje);
    this.persistir(ses, [], { sala: true });
    this.difundirEstado(ses);
    this.lanzarPlanes(ses, this.planificador?.alEntrar({ id: r.jugador.id, esBot: true }, []) ?? []);
  }

  private quitarJugador(conn: Conexion, ses: Sesion, yo: string, objetivo: string): void {
    const r = this.d.lobby.quitarJugador(ses.sala.codigo, yo, objetivo);
    if (!r.ok) return this.error(conn, r.codigo, r.mensaje);
    for (const c of [...ses.conexiones]) {
      if (c.jugadorId === objetivo) {
        this.error(c, 'EXPULSADO', 'El anfitrión te retiró de la sala.');
        ses.conexiones.delete(c);
        c.codigo = null;
        c.jugadorId = null;
      }
    }
    this.persistir(ses, [], { sala: true });
    this.difundirEstado(ses);
  }

  /** CU-04: solo el host inicia; el orquestador valida 2-6 jugadores y el tamaño del mazo. */
  private iniciar(conn: Conexion, ses: Sesion, yo: string): void {
    const v = this.d.lobby.verificarInicio(ses.sala.codigo, yo);
    if (!v.ok) return this.error(conn, v.codigo, v.mensaje);
    const conectados = this.conectadosDe(ses);
    const res = PartidaEnCurso.iniciar(
      ses.sala.codigo,
      ses.sala.parametros,
      ses.sala.jugadores.map((j) => ({ id: j.id, nombre: j.nombre, esBot: j.esBot, conectado: j.esBot || conectados.has(j.id) })),
      this.depsPartida(),
      ses.seqBase,
      ses.sala.partidaN + 1,
    );
    if (!res.ok) return this.error(conn, res.codigo, res.mensaje);
    ses.partida = res.partida;
    ses.sala.estado = 'EN_CURSO';
    ses.sala.partidaN += 1;
    this.tras(ses, res.eventos, { sala: true });
  }

  private accion(conn: Conexion, ses: Sesion, fn: (p: PartidaEnCurso) => { ok: true; eventos: EventoJuego[]; cierre?: { valido: boolean; detalle: string } } | { ok: false; codigo: string; mensaje: string }): void {
    if (!ses.partida) return this.error(conn, 'FASE_INVALIDA', 'La partida no ha comenzado.');
    const r = fn(ses.partida);
    if (!r.ok) return this.error(conn, r.codigo, r.mensaje);
    this.tras(ses, r.eventos);
  }

  private validar(conn: Conexion, ses: Sesion, yo: string, cartaIds: string[]): void {
    if (!ses.partida) return this.error(conn, 'FASE_INVALIDA', 'La partida no ha comenzado.');
    const r = ses.partida.validarCombinacion(yo, cartaIds);
    conn.enviar({ t: 'validacion', valida: r.valida, tipo: r.tipo, mensaje: r.mensaje, cartaIds });
  }

  /* ===================== cuenta y tienda (servidor = única fuente de verdad) ===================== */

  private estiloDe(conn: Conexion): EstiloJugador {
    const c = this.cuentas.obtener(conn.cuentaHash ?? null);
    return c ? this.estiloDeCuenta(c) : ESTILO_POR_DEFECTO;
  }

  private estiloDeCuenta(c: Cuenta): EstiloJugador {
    return { skinCartas: c.elegidas.carta, mesaPremium: this.d.extras.estilos.esMesaPremium(c.elegidas.mesa) ? c.elegidas.mesa : null, celebracion: c.elegidas.celebracion };
  }

  /** Abre (o crea) la cuenta anónima de esta conexión. La clave nueva solo se entrega una vez al crearla. */
  private async cuentaAbrir(conn: Conexion, clave: string | undefined): Promise<void> {
    const { cuenta, clave: nueva } = await this.cuentas.abrir(clave);
    conn.cuentaHash = cuenta.claveHash;
    conn.enviar({ t: 'cuenta', ...(nueva ? { clave: nueva } : {}), cuenta: this.cuentas.vista(cuenta) });
    this.sincronizarEstilo(conn);
  }

  private cuentaOperar(conn: Conexion, msg: Extract<MensajeCliente, { t: 'cuenta_comprar' | 'cuenta_activar' | 'cuenta_recargar' }>): void {
    const c = this.cuentas.obtener(conn.cuentaHash ?? null);
    if (!c) return this.error(conn, 'SIN_CUENTA', 'Primero debe abrirse tu cuenta.');
    const r = msg.t === 'cuenta_comprar' ? this.cuentas.comprar(c, msg.tipo, msg.id) : msg.t === 'cuenta_activar' ? this.cuentas.activar(c, msg.tipo, msg.id) : this.cuentas.recargar(c);
    if (!r.ok) return this.error(conn, r.codigo, r.mensaje);
    conn.enviar({ t: 'cuenta', cuenta: this.cuentas.vista(c) });
    this.sincronizarEstilo(conn);
  }

  /** Copia el estilo de la cuenta al asiento de la sala (solo fuera de partida). */
  private sincronizarEstilo(conn: Conexion): void {
    const c = this.cuentas.obtener(conn.cuentaHash ?? null);
    const ses = conn.codigo ? this.sesiones.get(conn.codigo) : undefined;
    if (!c || !ses || !conn.jugadorId) return;
    const r = this.d.lobby.aplicarEstilo(ses.sala.codigo, conn.jugadorId, this.estiloDeCuenta(c));
    if (!r.ok) return; // en partida: se aplica al volver a la sala
    this.persistir(ses, [], { sala: true });
    this.difundirEstado(ses);
  }

  /* ===================== reacciones rápidas y silencio ===================== */

  private humanosActivos(ses: Sesion): string[] {
    const conectados = this.conectadosDe(ses);
    return ses.sala.jugadores.filter((j) => !j.esBot && conectados.has(j.id)).map((j) => j.id);
  }

  /** ¿Silenciado para TODOS? Sí si lo silencian ⌈activos/2⌉ humanos presentes. */
  silenciadoParaTodos(ses: Sesion, objetivoId: string): boolean {
    const activos = this.humanosActivos(ses);
    const quienes = ses.silencios.get(objetivoId);
    if (!quienes || activos.length === 0) return false;
    const vigentes = [...quienes].filter((id) => activos.includes(id)).length;
    return vigentes >= this.d.extras.reacciones.umbralSilencio(activos.length);
  }

  private reaccionar(conn: Conexion, ses: Sesion, yo: string, id: string): void {
    if (!this.d.extras.reacciones.valida(id)) return this.error(conn, 'REACCION_INVALIDA', 'Reacción desconocida.');
    const ahora = this.d.programador.ahora();
    if (ahora - (ses.ultimaReaccion.get(yo) ?? -Infinity) < this.d.extras.reacciones.enfriamientoMs) return; // anti-spam: se ignora en silencio
    if (this.silenciadoParaTodos(ses, yo)) return this.error(conn, 'SILENCIADO', 'La mesa te silenció: tus reacciones no se muestran.');
    ses.ultimaReaccion.set(yo, ahora);
    this.emitirReaccion(ses, yo, id);
    this.lanzarPlanes(ses, this.planificador?.alReaccionHumana(id, this.botsDe(ses)) ?? []);
  }

  private emitirReaccion(ses: Sesion, jugadorId: string, id: string): void {
    if (!ses.sala.jugadores.some((j) => j.id === jugadorId)) return;
    if (this.silenciadoParaTodos(ses, jugadorId)) return;
    const mudo = ses.silencios.get(jugadorId);
    const ts = this.d.programador.ahora();
    for (const c of ses.conexiones) {
      if (!c.jugadorId || mudo?.has(c.jugadorId)) continue; // quien lo silenció no ve ni oye sus reacciones
      c.enviar({ t: 'reaccion', jugadorId, id, ts });
    }
  }

  private silenciar(conn: Conexion, ses: Sesion, yo: string, objetivo: string, activo: boolean): void {
    if (objetivo === yo) return this.error(conn, 'ACCION_NO_PERMITIDA', 'No puedes silenciarte a ti mismo.');
    if (!ses.sala.jugadores.some((j) => j.id === objetivo)) return this.error(conn, 'JUGADOR_INEXISTENTE', 'Ese jugador no está en la sala.');
    const set = ses.silencios.get(objetivo) ?? new Set<string>();
    if (activo) set.add(yo);
    else set.delete(yo);
    if (set.size) ses.silencios.set(objetivo, set);
    else ses.silencios.delete(objetivo);
    this.difundirEstado(ses);
  }

  private botsDe(ses: Sesion): string[] {
    return ses.sala.jugadores.filter((j) => j.esBot).map((j) => j.id);
  }

  private lanzarPlanes(ses: Sesion, planes: readonly PlanReaccion[]): void {
    for (const pl of planes) {
      let cancel: () => void = () => {};
      cancel = this.d.programador.programar(
        pl.retrasoMs,
        () => {
          ses.cancelReacciones.delete(cancel);
          this.emitirReaccion(ses, pl.jugadorId, pl.id);
        },
        'cosmetico',
      );
      ses.cancelReacciones.add(cancel);
    }
  }

  private iniciarExpulsion(conn: Conexion, ses: Sesion, yo: string, objetivoId: string): void {
    if (!ses.partida) return this.error(conn, 'FASE_INVALIDA', 'La partida no ha comenzado.');
    const r = ses.partida.iniciarExpulsion(yo, objetivoId);
    if (!r.ok) return this.error(conn, r.codigo, r.mensaje);
    if (r.expulsado) this.aplicarExpulsion(ses, r.expulsado);
    this.tras(ses, r.eventos, r.expulsado ? { sala: true } : {});
  }

  /** Voto de un humano. Si la votación "Expulsar" se aprueba, el acusado sale de la sala y un bot termina su mano. */
  private votar(conn: Conexion, ses: Sesion, yo: string, aFavor: boolean): void {
    if (!ses.partida) return this.error(conn, 'FASE_INVALIDA', 'La partida no ha comenzado.');
    const r = ses.partida.votar(yo, aFavor);
    if (!r.ok) return this.error(conn, r.codigo, r.mensaje);
    if (r.expulsado) this.aplicarExpulsion(ses, r.expulsado);
    this.tras(ses, r.eventos, r.expulsado ? { sala: true } : {});
  }

  private aplicarExpulsion(ses: Sesion, jugadorId: string): void {
    this.limpiarSilencios(ses, jugadorId);
    const js = ses.sala.jugadores.find((j) => j.id === jugadorId);
    if (js) {
      js.esBot = true;
      js.tokenHash = null;
    }
    for (const c of [...ses.conexiones]) {
      if (c.jugadorId === jugadorId) {
        this.error(c, 'EXPULSADO', 'Los demás jugadores votaron expulsarte por inactividad. Un bot terminará tu mano.');
        ses.conexiones.delete(c);
        c.codigo = null;
        c.jugadorId = null;
      }
    }
    if (ses.sala.hostId === jugadorId) {
      const humano = ses.sala.jugadores.find((j) => !j.esBot);
      if (humano) ses.sala.hostId = humano.id;
    }
  }

  private limpiarSilencios(ses: Sesion, jugadorId: string): void {
    ses.silencios.delete(jugadorId);
    for (const [obj, set] of ses.silencios) {
      set.delete(jugadorId);
      if (!set.size) ses.silencios.delete(obj);
    }
  }

  private continuarManual(conn: Conexion, ses: Sesion, yo: string): void {
    if (!ses.partida) return;
    if (ses.sala.hostId !== yo) return this.error(conn, 'SOLO_HOST', 'Solo el anfitrión puede adelantar la siguiente ronda.');
    const r = ses.partida.continuar();
    if (!r.ok) return this.error(conn, r.codigo, r.mensaje);
    this.tras(ses, r.eventos);
  }

  private nuevaPartida(conn: Conexion, ses: Sesion, yo: string): void {
    if (ses.sala.hostId !== yo) return this.error(conn, 'SOLO_HOST', 'Solo el anfitrión puede iniciar la revancha.');
    if (ses.partida?.estado.fase !== 'FINALIZADA') return this.error(conn, 'FASE_INVALIDA', 'La partida aún no termina.');
    ses.seqBase = ses.partida.estado.seq;
    ses.partida = null;
    ses.sala.estado = 'ESPERA';
    this.detenerTimers(ses);
    for (const c of ses.conexiones) {
      const cu = this.cuentas.obtener(c.cuentaHash ?? null);
      if (cu && c.jugadorId) this.d.lobby.aplicarEstilo(ses.sala.codigo, c.jugadorId, this.estiloDeCuenta(cu));
    }
    this.persistir(ses, [], { sala: true, borrarSnapshot: true });
    this.difundirEstado(ses);
  }

  private salir(conn: Conexion, ses: Sesion, yo: string): void {
    const codigo = ses.sala.codigo;
    this.limpiarSilencios(ses, yo);
    if (ses.sala.estado === 'EN_CURSO' && ses.partida) {
      const r = ses.partida.abandonar(yo);
      const js = ses.sala.jugadores.find((j) => j.id === yo);
      if (js) {
        js.esBot = true;
        js.tokenHash = null;
      }
      ses.conexiones.delete(conn);
      conn.codigo = null;
      conn.jugadorId = null;
      const humanos = ses.sala.jugadores.filter((j) => !j.esBot);
      if (humanos.length === 0) {
        ses.sala.estado = 'FINALIZADA';
        this.detener(ses);
        this.persistir(ses, r.ok ? r.eventos : [], { sala: true });
        this.sesiones.delete(codigo);
        this.d.lobby.eliminar(codigo);
        return;
      }
      if (ses.sala.hostId === yo) ses.sala.hostId = humanos[0]!.id;
      this.tras(ses, r.ok ? r.eventos : [], { sala: true });
      return;
    }
    const r = this.d.lobby.salir(codigo, yo);
    ses.conexiones.delete(conn);
    conn.codigo = null;
    conn.jugadorId = null;
    if (!r.ok) return;
    if (r.sala === null) {
      this.detener(ses);
      this.sesiones.delete(codigo);
      return;
    }
    this.persistir(ses, [], { sala: true });
    this.difundirEstado(ses);
  }

  /* ===================== efectos colaterales tras cada acción ===================== */

  private tras(ses: Sesion, eventos: EventoJuego[], opts: { sala?: boolean } = {}): void {
    if (ses.partida?.estado.fase === 'FINALIZADA' && ses.sala.estado === 'EN_CURSO') {
      ses.sala.estado = 'FINALIZADA';
      opts = { ...opts, sala: true };
    }
    this.difundir(ses, eventos);
    this.persistir(ses, eventos, opts);
    this.programar(ses);
    if (this.planificador && eventos.length) {
      const bots = this.botsDe(ses);
      this.lanzarPlanes(ses, this.planificador.alEventos(eventos, (id) => bots.includes(id), bots));
    }
  }

  private conectadosDe(ses: Sesion): Set<string> {
    const s = new Set<string>();
    for (const c of ses.conexiones) if (c.jugadorId) s.add(c.jugadorId);
    return s;
  }

  private difundir(ses: Sesion, eventos: EventoJuego[]): void {
    const pub = eventos.map(eventoPublico);
    const conectados = this.conectadosDe(ses);
    const ahora = this.d.programador.ahora();
    for (const c of ses.conexiones) {
      if (!c.jugadorId) continue;
      if (pub.length) c.enviar({ t: 'eventos', eventos: pub });
      c.enviar({ t: 'estado', vista: vistaMesa(ses.sala, ses.partida, conectados, c.jugadorId, ahora, { silenciado: (id) => this.silenciadoParaTodos(ses, id), silenciadoPor: (id, quien) => ses.silencios.get(id)?.has(quien) ?? false }) });
    }
  }

  private difundirEstado(ses: Sesion): void {
    this.difundir(ses, []);
  }

  private error(conn: Conexion, codigo: string, mensaje: string): void {
    conn.enviar({ t: 'error', codigo, mensaje });
  }

  private persistir(ses: Sesion, eventos: EventoJuego[], opts: OpcionesPersistir = {}): void {
    const cambio = this.cambioDe(ses, eventos, opts);
    if (!cambio) return;
    // La cola por sala serializa las transacciones y conserva el orden de los eventos (FF-25).
    ses.cola = ses.cola
      .then(() => this.d.repo.guardar(ses.sala.codigo, cambio))
      .catch((err) => this.log.error('fallo al persistir', { sala: ses.sala.codigo, err: String(err) }));
  }

  /** Lo que hay que guardar en una sola transacción, o null si no cambió nada. */
  private cambioDe(ses: Sesion, eventos: EventoJuego[], opts: OpcionesPersistir): CambioPersistible | null {
    const cambio: CambioPersistible = {};
    if (opts.sala) cambio.sala = structuredClone(ses.sala);
    const snapshot = opts.borrarSnapshot ? null : ses.partida?.snapshot();
    if (snapshot !== undefined) cambio.snapshot = snapshot;
    if (eventos.length) cambio.eventos = structuredClone(eventos);
    const ronda = this.rondaPersistible(ses, eventos);
    if (ronda) cambio.ronda = ronda;
    return Object.keys(cambio).length ? cambio : null;
  }

  private rondaPersistible(ses: Sesion, eventos: EventoJuego[]): RondaPersistible | undefined {
    if (!ses.partida || !eventos.some((e) => e.tipo === 'RONDA_LIQUIDADA' || e.tipo === 'RONDA_TABLAS')) return undefined;
    const liq = ses.partida.estado.liquidacion;
    const ronda = ses.partida.estado.ronda;
    if (!liq || !ronda) return undefined;
    return {
      partidaN: ses.sala.partidaN,
      numero: liq.ronda,
      ganadorId: liq.ganadorId,
      tipoCierre: liq.tipoCierre,
      tablas: liq.tablas,
      detalle: liq.detalle,
      manosIniciales: structuredClone(ronda.manosIniciales),
      jugadores: liq.jugadores.map((j) => ({
        jugadorId: j.jugadorId,
        delta: j.delta,
        acumulado: j.acumulado,
        puntosSobrantes: j.puntosSobrantes,
        combinaciones: j.combinaciones,
        sobrantes: j.sobrantes,
        eliminado: j.eliminado,
      })),
    };
  }

  /* ===================== temporizadores y bots ===================== */

  private detenerTimers(ses: Sesion): void {
    ses.cancelTurno?.();
    ses.cancelBot?.();
    ses.cancelVoto?.();
    ses.cancelContinuar?.();
    ses.cancelTurno = ses.cancelBot = ses.cancelVoto = ses.cancelContinuar = null;
  }

  private detener(ses: Sesion): void {
    this.detenerTimers(ses);
    for (const c of ses.cancelReacciones) c();
    ses.cancelReacciones.clear();
  }

  /** (Re)programa: vencimiento del turno (RF08), avance automático tras la liquidación y el siguiente paso de bot. */
  private programar(ses: Sesion): void {
    this.detenerTimers(ses);
    const p = ses.partida;
    if (!p) return;
    const est = p.estado;
    const ahora = this.d.programador.ahora();
    const reloj = this.d.programador;
    if (est.votacion) {
      const idVotacion = est.votacion.id;
      ses.cancelVoto = reloj.programar(est.votacion.venceEn - ahora, () => this.alExpirarVotacion(ses, idVotacion));
    }
    if (est.fase === 'EN_CURSO' && est.ronda) this.programarTurno(ses, p, est.ronda, ahora);
    else if (est.fase === 'LIQUIDACION' && est.liquidacion?.siguienteEn) {
      ses.cancelContinuar = reloj.programar(est.liquidacion.siguienteEn - ahora, () => this.alContinuar(ses));
    }
  }

  /** Vencimiento del turno (RF08) y, si juega un bot o un humano en automático, su jugada diferida. */
  private programarTurno(ses: Sesion, p: PartidaEnCurso, ronda: { turnoN: number; venceEn: number; turnoId: string }, ahora: number): void {
    const { turnoN, venceEn, turnoId } = ronda;
    ses.cancelTurno = this.d.programador.programar(venceEn - ahora, () => this.alExpirar(ses, turnoN));
    const j = p.jugador(turnoId);
    if (!j || !(j.esBot || j.automatico)) return;
    ses.cancelBot = this.d.programador.programar(this.esperaBot(), () => this.pasoBot(ses, turnoId, turnoN), 'bot');
  }

  /** Tiempo de "pensar" de un bot, al azar dentro del rango configurado. */
  private esperaBot(): number {
    const [a, b] = this.d.retardoBotMs ?? [900, 1800];
    return a + (b > a ? this.d.rng.entero(b - a + 1) : 0);
  }

  private alExpirar(ses: Sesion, turnoN: number): void {
    if (!ses.partida) return;
    const r = ses.partida.expirarTurno(turnoN);
    if (r.ok) this.tras(ses, r.eventos);
  }

  private alExpirarVotacion(ses: Sesion, id: number): void {
    if (!ses.partida) return;
    const r = ses.partida.expirarVotacion(id);
    if (!r.ok) return;
    if (r.expulsado) this.aplicarExpulsion(ses, r.expulsado);
    this.tras(ses, r.eventos, r.expulsado ? { sala: true } : {});
  }

  private alContinuar(ses: Sesion): void {
    if (ses.partida?.estado.fase !== 'LIQUIDACION') return;
    const r = ses.partida.continuar();
    if (r.ok) this.tras(ses, r.eventos);
  }

  private pasoBot(ses: Sesion, jugadorId: string, turnoN: number): void {
    const p = ses.partida;
    if (!p || p.estado.ronda?.turnoN !== turnoN || p.estado.ronda.turnoId !== jugadorId) return;
    const a = this.d.extras.bots.decidir(p, jugadorId);
    if (!a) return;
    const r = a.tipo === 'ROBAR' ? p.robar(jugadorId, a.origen, true) : a.tipo === 'CERRAR' ? p.cerrar(jugadorId, true) : p.descartar(jugadorId, a.cartaId, true);
    if (!r.ok) {
      this.log.error('acción de bot rechazada', { jugadorId, a, r });
      return;
    }
    this.tras(ses, r.eventos);
  }
}

export const nuevoIdConexion = (): string => randomUUID();
