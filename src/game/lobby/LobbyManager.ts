import { createHash, randomBytes } from 'node:crypto';
import { type ModalidadId, type ParametrosModalidad, normalizarParametros, MODALIDADES } from '../../kernel/config.js';
import type { Aleatorio } from '../../deck/index.js';
import { SKIN_CARTA_DEFECTO, SKIN_CELEBRACION_DEFECTO } from '../../kernel/skins.js';
import type { IEstilos } from '../puertos.js';
import type { EstadoSala, EstiloJugador, JugadorSala, Sala } from '../../estado/tipos.js';
export type { EstadoSala, EstiloJugador, JugadorSala, Sala } from '../../estado/tipos.js';

/**
 * LobbyManager (LobbyManagerComponent, Entregable 1 §4.1): ciclo de vida de las salas, fija la modalidad y
 * valida el acceso de los jugadores mediante código único (RF01, RF02, RF03).
 * NO conoce reglas de juego ni turnos: solo administra sesiones de sala.
 */
export const ESTILO_POR_DEFECTO: EstiloJugador = { skinCartas: SKIN_CARTA_DEFECTO, mesaPremium: null, celebracion: SKIN_CELEBRACION_DEFECTO };

export type ErrorLobby =
  | 'NOMBRE_INVALIDO'
  | 'MODALIDAD_INVALIDA'
  | 'SALA_INEXISTENTE'
  | 'SALA_LLENA'
  | 'PARTIDA_EN_CURSO'
  | 'NOMBRE_DUPLICADO'
  | 'TOKEN_INVALIDO'
  | 'SOLO_HOST'
  | 'JUGADOR_INEXISTENTE'
  | 'ESTADO_INVALIDO'
  | 'SKIN_INVALIDA';

export type ResultadoLobby<T = object> = ({ ok: true } & T) | { ok: false; codigo: ErrorLobby; mensaje: string };

const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I/L
const NOMBRES_BOT = ['Ada', 'Turing', 'Hopper', 'Knuth', 'Lovelace', 'Dijkstra', 'Liskov', 'Fowler', 'Booch', 'Parnas'];

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export class LobbyManager {
  private readonly salas = new Map<string, Sala>();

  constructor(
    private readonly rng: Aleatorio,
    private readonly reloj: () => number,
    private readonly estilos: IEstilos,
  ) {}

  /* --------- consultas --------- */
  obtener(codigo: string): Sala | undefined {
    return this.salas.get(codigo.trim().toUpperCase());
  }
  todas(): Sala[] {
    return [...this.salas.values()];
  }
  restaurar(sala: Sala): void {
    this.salas.set(sala.codigo, sala);
  }
  eliminar(codigo: string): void {
    this.salas.delete(codigo);
  }

  /* --------- RF01 --------- */
  crearSala(
    nombre: string,
    modalidad: ModalidadId,
    parametros?: Partial<Record<keyof ParametrosModalidad, unknown>>,
    estilo: EstiloJugador = ESTILO_POR_DEFECTO,
  ): ResultadoLobby<{ sala: Sala; jugador: JugadorSala; token: string }> {
    const n = this.validarNombre(nombre);
    if (!n.ok) return n;
    if (!MODALIDADES.some((m) => m.id === modalidad)) {
      return { ok: false, codigo: 'MODALIDAD_INVALIDA', mensaje: 'Modalidad desconocida.' };
    }
    const token = this.nuevoToken();
    const jugador: JugadorSala = { id: this.nuevoId(), nombre: n.nombre, esBot: false, tokenHash: hashToken(token), asiento: 0, ...estilo };
    const sala: Sala = {
      codigo: this.nuevoCodigo(),
      modalidad,
      parametros: normalizarParametros(modalidad, parametros),
      hostId: jugador.id,
      jugadores: [jugador],
      estado: 'ESPERA',
      partidaN: 0,
      creadaEn: this.reloj(),
    };
    this.salas.set(sala.codigo, sala);
    return { ok: true, sala, jugador, token };
  }

  /* --------- RF02, RF03 --------- */
  unirse(codigo: string, nombre: string, estilo: EstiloJugador = ESTILO_POR_DEFECTO): ResultadoLobby<{ sala: Sala; jugador: JugadorSala; token: string }> {
    const sala = this.obtener(codigo);
    if (!sala) return { ok: false, codigo: 'SALA_INEXISTENTE', mensaje: 'No existe una sala con ese código.' };
    if (sala.estado !== 'ESPERA') return { ok: false, codigo: 'PARTIDA_EN_CURSO', mensaje: 'La partida ya comenzó.' };
    if (sala.jugadores.length >= sala.parametros.maxJugadores) {
      return { ok: false, codigo: 'SALA_LLENA', mensaje: `La sala está llena (máx. ${sala.parametros.maxJugadores}).` };
    }
    const n = this.validarNombre(nombre);
    if (!n.ok) return n;
    if (sala.jugadores.some((j) => j.nombre.toLowerCase() === n.nombre.toLowerCase())) {
      return { ok: false, codigo: 'NOMBRE_DUPLICADO', mensaje: 'Ya hay un jugador con ese nombre en la sala.' };
    }
    const token = this.nuevoToken();
    const jugador: JugadorSala = {
      id: this.nuevoId(),
      nombre: n.nombre,
      esBot: false,
      tokenHash: hashToken(token),
      asiento: sala.jugadores.length,
      ...estilo,
    };
    sala.jugadores.push(jugador);
    return { ok: true, sala, jugador, token };
  }

  reconectar(codigo: string, token: string): ResultadoLobby<{ sala: Sala; jugador: JugadorSala }> {
    const sala = this.obtener(codigo);
    if (!sala) return { ok: false, codigo: 'SALA_INEXISTENTE', mensaje: 'La sala ya no existe.' };
    const h = hashToken(token);
    const jugador = sala.jugadores.find((j) => !j.esBot && j.tokenHash === h);
    if (!jugador) return { ok: false, codigo: 'TOKEN_INVALIDO', mensaje: 'Sesión inválida o expirada.' };
    return { ok: true, sala, jugador };
  }

  agregarBot(codigo: string, solicitanteId: string): ResultadoLobby<{ sala: Sala; jugador: JugadorSala }> {
    const ctx = this.contextoHost(codigo, solicitanteId);
    if (!ctx.ok) return ctx;
    const { sala } = ctx;
    if (sala.jugadores.length >= sala.parametros.maxJugadores) {
      return { ok: false, codigo: 'SALA_LLENA', mensaje: 'La sala está llena.' };
    }
    const usados = new Set(sala.jugadores.map((j) => j.nombre));
    const libres = NOMBRES_BOT.map((n) => `Bot ${n}`).filter((n) => !usados.has(n));
    const nombre = libres.length ? libres[this.rng.entero(libres.length)]! : `Bot ${sala.jugadores.length + 1}`;
    const jugador: JugadorSala = { id: this.nuevoId(), nombre, esBot: true, tokenHash: null, asiento: sala.jugadores.length, skinCartas: this.skinAleatoria(), mesaPremium: null, celebracion: this.celebracionAleatoria() };
    sala.jugadores.push(jugador);
    return { ok: true, sala, jugador };
  }

  /**
   * Aplica el estilo de la CUENTA del jugador (fuente de verdad: el servidor) a su asiento. Solo en ESPERA/FINALIZADA:
   * durante la partida no se personaliza. El cliente nunca dicta su estilo; solo pide activar skins que posee.
   */
  aplicarEstilo(codigo: string, jugadorId: string, estilo: EstiloJugador): ResultadoLobby<{ sala: Sala; jugador: JugadorSala }> {
    const sala = this.obtener(codigo);
    if (!sala) return { ok: false, codigo: 'SALA_INEXISTENTE', mensaje: 'La sala no existe.' };
    if (sala.estado === 'EN_CURSO') return { ok: false, codigo: 'PARTIDA_EN_CURSO', mensaje: 'No se puede personalizar el estilo durante la partida.' };
    const jugador = sala.jugadores.find((j) => j.id === jugadorId && !j.esBot);
    if (!jugador) return { ok: false, codigo: 'JUGADOR_INEXISTENTE', mensaje: 'El jugador no está en la sala.' };
    jugador.skinCartas = estilo.skinCartas;
    // Solo las mesas PREMIUM se comparten con la sala; las básicas son personales y el servidor no las expone.
    jugador.mesaPremium = estilo.mesaPremium && this.estilos.esMesaPremium(estilo.mesaPremium) ? estilo.mesaPremium : null;
    jugador.celebracion = estilo.celebracion;
    return { ok: true, sala, jugador };
  }

  quitarJugador(codigo: string, solicitanteId: string, objetivoId: string): ResultadoLobby<{ sala: Sala; quitado: JugadorSala }> {
    const ctx = this.contextoHost(codigo, solicitanteId);
    if (!ctx.ok) return ctx;
    const { sala } = ctx;
    if (objetivoId === sala.hostId) return { ok: false, codigo: 'ESTADO_INVALIDO', mensaje: 'El anfitrión no puede expulsarse a sí mismo.' };
    return this.retirar(sala, objetivoId);
  }

  /** Un jugador sale por su cuenta (en ESPERA/FINALIZADA). Si era el host, el mando pasa al siguiente humano. */
  salir(codigo: string, jugadorId: string): ResultadoLobby<{ sala: Sala | null; quitado: JugadorSala }> {
    const sala = this.obtener(codigo);
    if (!sala) return { ok: false, codigo: 'SALA_INEXISTENTE', mensaje: 'La sala no existe.' };
    const r = this.retirar(sala, jugadorId);
    if (!r.ok) return r;
    const humanos = sala.jugadores.filter((j) => !j.esBot);
    if (humanos.length === 0) {
      this.salas.delete(sala.codigo);
      return { ok: true, sala: null, quitado: r.quitado };
    }
    if (sala.hostId === jugadorId) sala.hostId = humanos[0]!.id;
    return { ok: true, sala, quitado: r.quitado };
  }

  /** Parámetros y modalidad solo se acuerdan ANTES de repartir (PDF §04). */
  configurar(
    codigo: string,
    solicitanteId: string,
    cambios: { modalidad?: ModalidadId; parametros?: Partial<Record<keyof ParametrosModalidad, unknown>> },
  ): ResultadoLobby<{ sala: Sala }> {
    const ctx = this.contextoHost(codigo, solicitanteId);
    if (!ctx.ok) return ctx;
    const { sala } = ctx;
    if (sala.estado !== 'ESPERA') return { ok: false, codigo: 'PARTIDA_EN_CURSO', mensaje: 'No se puede configurar una partida en curso.' };
    const modalidad = cambios.modalidad ?? sala.modalidad;
    if (!MODALIDADES.some((m) => m.id === modalidad)) return { ok: false, codigo: 'MODALIDAD_INVALIDA', mensaje: 'Modalidad desconocida.' };
    // Al cambiar de modalidad se recalculan los valores por defecto propios de esa modalidad (ej. valor del As).
    const base = cambios.modalidad && cambios.modalidad !== sala.modalidad ? undefined : (sala.parametros as unknown as Record<string, unknown>);
    sala.modalidad = modalidad;
    sala.parametros = normalizarParametros(modalidad, { ...(base ?? {}), ...(cambios.parametros ?? {}) } as never);
    return { ok: true, sala };
  }

  /** Solo el host puede iniciar (RF03: 2 a 6 jugadores). La validación numérica final la hace el orquestador. */
  verificarInicio(codigo: string, solicitanteId: string): ResultadoLobby<{ sala: Sala }> {
    const ctx = this.contextoHost(codigo, solicitanteId);
    if (!ctx.ok) return ctx;
    if (ctx.sala.estado !== 'ESPERA') return { ok: false, codigo: 'ESTADO_INVALIDO', mensaje: 'La partida ya fue iniciada.' };
    return { ok: true, sala: ctx.sala };
  }

  /* --------- internos --------- */
  private contextoHost(codigo: string, solicitanteId: string): ResultadoLobby<{ sala: Sala }> {
    const sala = this.obtener(codigo);
    if (!sala) return { ok: false, codigo: 'SALA_INEXISTENTE', mensaje: 'La sala no existe.' };
    if (sala.hostId !== solicitanteId) return { ok: false, codigo: 'SOLO_HOST', mensaje: 'Solo el anfitrión puede hacer esto.' };
    return { ok: true, sala };
  }

  private retirar(sala: Sala, jugadorId: string): ResultadoLobby<{ sala: Sala; quitado: JugadorSala }> {
    if (sala.estado === 'EN_CURSO') return { ok: false, codigo: 'PARTIDA_EN_CURSO', mensaje: 'No se puede retirar jugadores en plena partida.' };
    const i = sala.jugadores.findIndex((j) => j.id === jugadorId);
    if (i < 0) return { ok: false, codigo: 'JUGADOR_INEXISTENTE', mensaje: 'El jugador no está en la sala.' };
    const [quitado] = sala.jugadores.splice(i, 1);
    sala.jugadores.forEach((j, idx) => (j.asiento = idx));
    return { ok: true, sala, quitado: quitado! };
  }

  private validarNombre(nombre: unknown): ResultadoLobby<{ nombre: string }> {
    const n = typeof nombre === 'string' ? nombre.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim() : '';
    if (n.length < 2 || n.length > 16) return { ok: false, codigo: 'NOMBRE_INVALIDO', mensaje: 'El nombre debe tener entre 2 y 16 caracteres.' };
    return { ok: true, nombre: n };
  }

  private nuevoCodigo(): string {
    for (let intento = 0; intento < 100; intento++) {
      let c = '';
      for (let i = 0; i < 5; i++) c += ALFABETO_CODIGO[this.rng.entero(ALFABETO_CODIGO.length)];
      if (!this.salas.has(c)) return c;
    }
    throw new Error('No se pudo generar un código de sala único');
  }

  /** Los bots eligen su skin de cartas al azar entre TODAS las del catálogo (no usa el RNG de la partida). */
  private skinAleatoria(): string {
    return this.estilos.aleatorioCarta();
  }

  private celebracionAleatoria(): string {
    return this.estilos.aleatorioCelebracion();
  }

  private nuevoId(): string {
    return `p${randomBytes(5).toString('hex')}`;
  }

  private nuevoToken(): string {
    return randomBytes(24).toString('base64url');
  }
}
