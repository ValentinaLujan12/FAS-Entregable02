import type { Carta } from '../kernel/cartas.js';
import { type ParametrosModalidad, VOTACION, mazosEfectivos } from '../kernel/config.js';
import { Mano } from '../kernel/mano.js';
import { marcadorInicial } from '../kernel/marcador.js';
import type {
  CombinacionVista,
  EventoJuego,
  FinalVista,
  LiquidacionVista,
  OrigenRobo,
  TipoEvento,
  VotacionVista,
} from '../kernel/protocolo.js';
import { type Aleatorio, type IMazo, abrirMazo, nuevoMazo } from '../deck/index.js';
import type { IReglaJuego, IRegistroReglas, IValidadorCierre, ResultadoCierre } from '../rules/IReglaJuego.js';
import { type IServicioPuntaje, crearServicioPuntaje } from '../scoring/index.js';
import { type IJugadores, registroJugadores } from '../player/index.js';
import type { EstadoPartida, EstadoRonda, JugadorPartida, Resultado } from './tipos.js';

/** Fabrica la politica de descarte automatico para unos parametros y tamanos de combinacion dados. */
export type FabricaDescarte = (parametros: ParametrosModalidad, tamanos: readonly number[]) => (mano: readonly Carta[], pozoRoboId: string | null) => Carta;

export interface DepsPartida {
  motor: IRegistroReglas;
  rng: Aleatorio;
  /** Reloj inyectable (epoch ms): las pruebas usan un reloj falso. */
  reloj: () => number;
  /** Servicio de puntaje (IServicioPuntaje); por defecto, el de scoring. */
  liquidador?: IServicioPuntaje;
  /** Politica de descarte automatico (timeouts). La provee la capa de extras (fabricaDescarteAnalisis). */
  fabricaDescarte: FabricaDescarte;
  /** Umbrales de las votaciones por inactividad (por defecto `VOTACION`; las pruebas los acortan). */
  votacion?: Partial<{ [K in keyof typeof VOTACION]: number }>;
}

export interface JugadorEntrada {
  id: string;
  nombre: string;
  esBot: boolean;
  conectado?: boolean;
}

const CARTAS_MINIMAS_MAZO = 3;

/** Valores por defecto de campos que no existían en snapshots antiguos (antes de las votaciones). */
const DEFECTOS_JUGADOR: Readonly<Partial<JugadorPartida>> = { automatico: false, saltos: 0, turnosAuto: 0, enfriamientoVoto: 0, expulsionDisponible: false };

function completarJugador(j: JugadorPartida): void {
  const r = j as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(DEFECTOS_JUGADOR)) r[k] ??= v;
}

/**
 * PartidaEnCurso (GameDomain): máquina de estados de una partida, coordinada por TurnOrchestrator.
 *
 *   EN_CURSO --cierre válido---> LIQUIDACION --continuar---> EN_CURSO (siguiente ronda)
 *      |                            |---fin de partida---> FINALIZADA
 *      |-- turno: ROBAR --robar---> DESCARTAR --descartar / expirar---> ROBAR (siguiente jugador)
 *
 * Invariante (PDF): todo turno empieza robando y termina descartando, salvo que el jugador cierre.
 * Las reglas se usan por contratos: IValidadorCierre para validar, IServicioPuntaje para liquidar (que a su vez usa
 * ICalculadorPuntos), IMazo para la baraja e IJugadores para el turno. No conoce ninguna modalidad ni clase concreta.
 * No usa temporizadores ni E/S: devuelve eventos y expone `turnoN`/`venceEn` (driver Testability).
 */
export class PartidaEnCurso {
  private readonly regla: IReglaJuego;
  private readonly validador: IValidadorCierre;
  private readonly politicaDescarte: (mano: readonly Carta[], pozoRoboId: string | null) => Carta;
  private readonly liquidador: IServicioPuntaje;
  private pendientes: EventoJuego[] = [];

  private constructor(
    private readonly e: EstadoPartida,
    private readonly d: DepsPartida,
  ) {
    this.regla = d.motor.reglaPara(e.parametros);
    this.validador = this.regla;
    this.politicaDescarte = d.fabricaDescarte(e.parametros, this.regla.tamanosObjetivo());
    this.liquidador = d.liquidador ?? crearServicioPuntaje();
  }

  /* ------------------------- creación / restauración ------------------------- */

  /** CU-04 Iniciar Partida (RF03, RF04): baraja, reparte 10 (+1 al inicial) y otorga el turno. */
  static iniciar(
    codigo: string,
    parametros: ParametrosModalidad,
    jugadores: readonly JugadorEntrada[],
    deps: DepsPartida,
    seqInicial = 0,
    partidaN = 1,
  ): Resultado<{ partida: PartidaEnCurso }> {
    const n = jugadores.length;
    if (n < parametros.minJugadores || n > parametros.maxJugadores) {
      return {
        ok: false,
        codigo: 'PARAMETROS_INVALIDOS',
        mensaje:
          n < parametros.minJugadores
            ? `Faltan ${parametros.minJugadores - n} jugador(es) para iniciar (mínimo ${parametros.minJugadores}).`
            : `Máximo ${parametros.maxJugadores} jugadores.`,
      };
    }
    if (new Set(jugadores.map((j) => j.id)).size !== n) {
      return { ok: false, codigo: 'PARAMETROS_INVALIDOS', mensaje: 'Jugadores duplicados.' };
    }
    const mazos = mazosEfectivos(parametros, n);
    const total = 52 * mazos + parametros.comodines;
    const necesarias = n * parametros.cartasPorMano + 1 + 1 + CARTAS_MINIMAS_MAZO;
    if (necesarias > total) {
      return {
        ok: false,
        codigo: 'MAZO_INSUFICIENTE',
        mensaje: `${n} jugadores no caben en ${mazos} mazo(s) (${total} cartas). Usa 2 mazos.`,
      };
    }
    const js: JugadorPartida[] = jugadores.map((j, i) => ({
      id: j.id,
      nombre: j.nombre,
      esBot: j.esBot,
      asiento: i,
      eliminado: false,
      conectado: j.conectado ?? true,
      autopiloto: false,
      timeouts: 0,
      automatico: false,
      saltos: 0,
      turnosAuto: 0,
      enfriamientoVoto: 0,
      expulsionDisponible: false,
    }));
    const estado: EstadoPartida = {
      codigo,
      parametros,
      jugadores: js,
      fase: 'EN_CURSO',
      marcador: marcadorInicial(js.map((j) => j.id)),
      ronda: null,
      numeroRonda: 0,
      liquidacion: null,
      final: null,
      siguienteIniciaId: null,
      mazosEnJuego: mazos,
      votacion: null,
      contadorVotaciones: 0,
      seq: seqInicial,
      partidaN,
    };
    const partida = new PartidaEnCurso(estado, deps);
    partida.emitir('PARTIDA_INICIADA', {
      modalidad: parametros.modalidad,
      jugadores: js.map((j) => ({ id: j.id, nombre: j.nombre, esBot: j.esBot })),
      mazos,
    });
    partida.iniciarRonda();
    return { ok: true, eventos: partida.drenar(), partida };
  }

  /** Recuperación tras reinicio del servidor (A2 de CU-04): el estado ya está consistente en el snapshot. */
  static restaurar(snapshot: EstadoPartida, deps: DepsPartida): PartidaEnCurso {
    const estado = structuredClone(snapshot);
    for (const j of estado.jugadores) {
      completarJugador(j);
      j.conectado = j.esBot; // los humanos deben reconectarse
    }
    estado.votacion = null; // una votación abierta no sobrevive a un reinicio
    estado.contadorVotaciones ??= 0;
    const partida = new PartidaEnCurso(estado, deps);
    partida.reiniciarPlazos();
    return partida;
  }

  /** Tras un reinicio los plazos vuelven a contar desde ahora (turno en curso o pausa de liquidación). */
  private reiniciarPlazos(): void {
    const e = this.e;
    const ahora = this.d.reloj();
    if (e.fase === 'EN_CURSO' && e.ronda) e.ronda.venceEn = ahora + this.tiempoTurnoMs(e.ronda.turnoId);
    if (e.fase === 'LIQUIDACION' && e.liquidacion) e.liquidacion = { ...e.liquidacion, siguienteEn: ahora + e.parametros.pausaLiquidacionSeg * 1000 };
  }

  /**
   * Reanudación EXACTA (despliegue serverless): cada petición reconstruye la partida tal como quedó en la anterior,
   * sin reiniciar plazos, conexiones ni votaciones (a diferencia de `restaurar`, pensado para un reinicio del servidor).
   */
  static reanudar(snapshot: EstadoPartida, deps: DepsPartida): PartidaEnCurso {
    const estado = structuredClone(snapshot);
    for (const j of estado.jugadores) completarJugador(j);
    estado.votacion ??= null;
    estado.contadorVotaciones ??= 0;
    return new PartidaEnCurso(estado, deps);
  }

  /* ------------------------- consultas ------------------------- */

  get estado(): Readonly<EstadoPartida> {
    return this.e;
  }

  snapshot(): EstadoPartida {
    return structuredClone(this.e);
  }

  get reglaActiva(): IReglaJuego {
    return this.regla;
  }

  /** Registro de jugadores sobre la lista de la partida (modulo player). */
  private get jugadores(): IJugadores {
    return registroJugadores(this.e.jugadores);
  }

  jugador(id: string): JugadorPartida | undefined {
    return this.jugadores.buscar(id);
  }

  activos(): JugadorPartida[] {
    return this.jugadores.ordenDeTurno();
  }

  manoDe(jugadorId: string): readonly Carta[] {
    return this.e.ronda?.manos[jugadorId] ?? [];
  }

  /** Total de cartas en juego (mazo + pozo + manos): invariante de conservación. */
  contarCartas(): number {
    const r = this.e.ronda;
    if (!r) return 0;
    return Object.values(r.manos).reduce((a, m) => a + m.length, 0) + r.mazo.mazo.length + r.mazo.pozo.length;
  }

  mazoActual(): { restantes: number; tope: Carta | null; cantidadPozo: number } {
    const r = this.e.ronda;
    if (!r) return { restantes: 0, tope: null, cantidadPozo: 0 };
    return { restantes: r.mazo.mazo.length, tope: r.mazo.pozo[r.mazo.pozo.length - 1] ?? null, cantidadPozo: r.mazo.pozo.length };
  }

  /** ¿Puede el bot / el jugador cerrar con la mano actual? (consulta sin efectos) */
  evaluarCierre(jugadorId: string): ResultadoCierre {
    return this.validador.validarVictoria(Mano.de(this.manoDe(jugadorId)));
  }

  /* ------------------------- acciones del jugador ------------------------- */

  /** RF05: robar del mazo central o del pozo de descarte. */
  robar(jugadorId: string, origen: OrigenRobo, auto = false): Resultado {
    const ctx = this.validarTurno(jugadorId, 'ROBAR');
    if (!ctx.ok) return ctx;
    if (origen === 'POZO' && !this.e.parametros.permitirRoboPozo) {
      return { ok: false, codigo: 'ACCION_NO_PERMITIDA', mensaje: 'En esta mesa no se puede robar del pozo.' };
    }
    this.registrarAccionHumana(ctx.j, auto);
    return origen === 'POZO' ? this.robarPozo(ctx.r, jugadorId) : this.robarMazo(ctx.r, jugadorId);
  }

  private robarPozo(r: EstadoRonda, jugadorId: string): Resultado {
    const mazo = abrirMazo(r.mazo);
    const carta = mazo.robarDelPozo();
    if (!carta) return { ok: false, codigo: 'POZO_VACIO', mensaje: 'El pozo de descarte está vacío.' };
    this.entregarRobo(r, jugadorId, carta, 'POZO', mazo);
    return { ok: true, eventos: this.drenar() };
  }

  private robarMazo(r: EstadoRonda, jugadorId: string): Resultado {
    const robo = this.robarDelMazoCiego(r);
    if (!robo) return this.terminarEnTablas();
    this.entregarRobo(r, jugadorId, robo.carta, 'MAZO', robo.mazo);
    return { ok: true, eventos: this.drenar() };
  }

  /** Roba del mazo ciego (reciclando el pozo si hace falta). null = no quedan cartas: la ronda termina en tablas. */
  private robarDelMazoCiego(r: EstadoRonda): { carta: Carta; mazo: IMazo } | null {
    const mazo = abrirMazo(r.mazo);
    const res = mazo.robarDelMazo(this.d.rng, this.e.parametros.maxReciclajes);
    if (!res) return null;
    if (res.reciclado) this.emitir('MAZO_RECICLADO', { reciclajes: mazo.reciclajes });
    return { carta: res.carta, mazo };
  }

  private entregarRobo(r: EstadoRonda, jugadorId: string, carta: Carta, origen: OrigenRobo, mazo: IMazo): void {
    (r.manos[jugadorId] ??= []).push(carta);
    r.fase = 'DESCARTAR';
    const delPozo = origen === 'POZO';
    r.pozoRoboId = delPozo ? carta.id : null;
    this.emitir('CARTA_ROBADA', {
      jugadorId,
      origen,
      carta: delPozo ? carta : null, // el robo del mazo es privado
      mazoRestantes: mazo.restantes,
      cantidadPozo: mazo.cantidadPozo,
      _privado: { cartaId: carta.id }, // solo auditoría: la capa de tiempo real elimina las claves "_*"
    });
  }

  private terminarEnTablas(): Resultado {
    this.declararTablas();
    return { ok: true, eventos: this.drenar() };
  }

  /** RF07: descartar una carta al pozo y ceder el turno al siguiente jugador activo. */
  descartar(jugadorId: string, cartaId: string, auto = false): Resultado {
    const ctx = this.validarTurno(jugadorId, 'DESCARTAR');
    if (!ctx.ok) return ctx;
    const { r, j } = ctx;
    const mano = r.manos[jugadorId] ?? [];
    const idx = mano.findIndex((c) => c.id === cartaId);
    if (idx < 0) return { ok: false, codigo: 'CARTA_NO_ENCONTRADA', mensaje: 'Esa carta no está en tu mano.' };
    if (cartaId === r.pozoRoboId) {
      return { ok: false, codigo: 'DEVOLUCION_PROHIBIDA', mensaje: 'No puedes devolver al pozo la carta que acabas de tomar de él.' };
    }
    this.registrarAccionHumana(j, auto);
    const [carta] = mano.splice(idx, 1);
    abrirMazo(r.mazo).descartar(carta!);
    this.emitir('CARTA_DESCARTADA', { jugadorId, carta, forzado: false, cantidadPozo: r.mazo.pozo.length });
    this.pasarTurno();
    if (auto && !j.esBot) this.turnoSaltado(j, true);
    return { ok: true, eventos: this.drenar() };
  }

  /**
   * CU-01 / CU-02: solicitud de cierre. Rechazo (RF11): no altera el estado y el jugador conserva el turno.
   * Aceptación: liquida la ronda con la modalidad activa (RF13-RF16) y evalúa el fin de partida.
   */
  cerrar(jugadorId: string, auto = false): Resultado<{ cierre: ResultadoCierre }> {
    const ctx = this.validarTurno(jugadorId, 'DESCARTAR');
    if (!ctx.ok) return ctx;
    const { r, j } = ctx;
    this.registrarAccionHumana(j, auto);
    const cierre = this.validador.validarVictoria(Mano.de(r.manos[jugadorId] ?? []));
    if (!cierre.valido) {
      this.emitir('CIERRE_RECHAZADO', {
        jugadorId,
        motivo: cierre.motivo,
        detalle: cierre.detalle,
        sobrante: cierre.sobrante ?? null,
      });
      return { ok: true, eventos: this.drenar(), cierre };
    }
    // "partida" + "ronda" identifican el cierre: la base de datos admite uno solo por ronda de cada partida (FF-17).
    this.emitir('CIERRE_ACEPTADO', { jugadorId, tipo: cierre.tipo, detalle: cierre.detalle, partida: this.e.partidaN ?? 1 });
    this.liquidarRonda(jugadorId, cierre);
    return { ok: true, eventos: this.drenar(), cierre };
  }

  /** RF06 / RF-02 del PDF: valida una selección de cartas de la mano (consulta, sin efectos). */
  validarCombinacion(jugadorId: string, cartaIds: readonly string[]): { valida: boolean; tipo?: 'GRUPO' | 'ESCALERA'; mensaje: string } {
    const mano = this.manoDe(jugadorId);
    const ids = new Set(cartaIds);
    if (ids.size !== cartaIds.length) return { valida: false, mensaje: 'Selección con cartas repetidas.' };
    const cartas = mano.filter((c) => ids.has(c.id));
    if (cartas.length !== cartaIds.length) return { valida: false, mensaje: 'Alguna carta no está en tu mano.' };
    if (cartas.length < 3) return { valida: false, mensaje: 'Una combinación necesita al menos 3 cartas.' };
    const comb = this.validador.clasificarCombinacion(cartas);
    if (!comb) return { valida: false, mensaje: 'No es un grupo (mismo valor) ni una escalera (consecutivas, misma pinta).' };
    return { valida: true, tipo: comb.tipo, mensaje: comb.tipo === 'GRUPO' ? 'Grupo válido' : 'Escalera válida' };
  }

  /**
   * RF08: el temporizador venció. Idempotente frente a temporizadores obsoletos (compara `turnoN`).
   * Fuerza el robo (si falta) y un descarte automático, y cede el turno.
   */
  expirarTurno(turnoN: number): Resultado {
    const r = this.e.ronda;
    if (this.e.fase !== 'EN_CURSO' || !r || r.turnoN !== turnoN) return { ok: true, eventos: [] };
    const j = this.jugador(r.turnoId)!;
    j.timeouts++;
    j.saltos++;
    this.emitir('TURNO_EXPIRADO', { jugadorId: j.id, timeouts: j.timeouts });
    if (r.fase === 'ROBAR' && !this.roboForzado(r, j.id)) return this.terminarEnTablas();
    this.descarteForzado(r, j.id);
    this.activarPilotoSiCorresponde(j);
    this.pasarTurno();
    if (!j.esBot) this.turnoSaltado(j, false);
    return { ok: true, eventos: this.drenar() };
  }

  /** Robo forzado del mazo al vencer el turno. false = no quedan cartas. */
  private roboForzado(r: EstadoRonda, jugadorId: string): boolean {
    const robo = this.robarDelMazoCiego(r);
    if (!robo) return false;
    (r.manos[jugadorId] ??= []).push(robo.carta);
    r.pozoRoboId = null;
    this.emitir('CARTA_ROBADA', { jugadorId, origen: 'MAZO', carta: null, mazoRestantes: robo.mazo.restantes, cantidadPozo: robo.mazo.cantidadPozo, forzado: true, _privado: { cartaId: robo.carta.id } });
    return true;
  }

  /** Descarte automático según la política inyectada (nunca devuelve al pozo la carta recién tomada de él). */
  private descarteForzado(r: EstadoRonda, jugadorId: string): void {
    const mano = r.manos[jugadorId]!;
    const descarte = this.politicaDescarte(mano, r.pozoRoboId);
    mano.splice(mano.findIndex((c) => c.id === descarte.id), 1);
    const mazo = abrirMazo(r.mazo);
    mazo.descartar(descarte);
    this.emitir('CARTA_DESCARTADA', { jugadorId, carta: descarte, forzado: true, cantidadPozo: mazo.cantidadPozo });
  }

  /** Un humano que agota su tiempo dos veces seguidas pasa a "piloto". */
  private activarPilotoSiCorresponde(j: JugadorPartida): void {
    if (j.esBot || j.autopiloto || j.timeouts < 2) return;
    j.autopiloto = true;
    this.emitir('AUTOPILOTO', { jugadorId: j.id, activo: true });
  }

  /** Pasa de LIQUIDACION a la siguiente ronda (por temporizador o por el botón "Continuar"). */
  continuar(): Resultado {
    if (this.e.fase !== 'LIQUIDACION') return { ok: false, codigo: 'FASE_INVALIDA', mensaje: 'No hay una liquidación pendiente.' };
    this.iniciarRonda();
    return { ok: true, eventos: this.drenar() };
  }

  /** Reconectar equivale a "estoy aquí": se cancelan piloto, automático y votaciones en su contra. Devuelve los eventos generados. */
  setConectado(jugadorId: string, conectado: boolean): EventoJuego[] {
    const j = this.jugador(jugadorId);
    if (!j) return [];
    this.jugadores.marcarConectado(jugadorId, conectado);
    if (conectado && !j.esBot) this.registrarAccionHumana(j);
    return this.drenar();
  }

  /** Un humano abandona la mesa a mitad de partida: un bot termina por él (no se rompe la partida). */
  abandonar(jugadorId: string): Resultado {
    const j = this.jugador(jugadorId);
    if (!j) return { ok: true, eventos: [] };
    this.cancelarVotacionDe(jugadorId, 'ABANDONO');
    this.convertirEnBot(j);
    this.emitir('AUTOPILOTO', { jugadorId, activo: true, abandono: true });
    return { ok: true, eventos: this.drenar() };
  }

  private convertirEnBot(j: JugadorPartida): void {
    j.esBot = true;
    j.conectado = true;
    j.autopiloto = false;
    j.automatico = false;
    j.expulsionDisponible = false;
  }

  /** "Retomar el control": el humano vuelve (sale de piloto / automático y se cancelan las votaciones en su contra). */
  retomar(jugadorId: string): Resultado {
    const j = this.jugador(jugadorId);
    if (j && !j.esBot) this.registrarAccionHumana(j);
    return { ok: true, eventos: this.drenar() };
  }

  /* ------------------------- votaciones por inactividad ------------------------- */

  private get umbrales() {
    return { ...VOTACION, ...(this.d.votacion ?? {}) };
  }

  /** Votantes: humanos de la mesa, conectados, no eliminados, sin piloto ni automático, excluido el acusado. */
  votantesElegibles(objetivoId: string): JugadorPartida[] {
    return this.e.jugadores.filter((x) => !x.esBot && !x.eliminado && x.conectado && !x.autopiloto && !x.automatico && x.id !== objetivoId);
  }

  private escrutinio(v: NonNullable<EstadoPartida['votacion']>) {
    const elegibles = this.votantesElegibles(v.objetivoId);
    const necesarios = Math.floor(elegibles.length / 2) + 1;
    return {
      elegibles: elegibles.length,
      necesarios,
      aFavor: elegibles.filter((x) => v.votos[x.id] === true).length,
      enContra: elegibles.filter((x) => v.votos[x.id] === false).length,
    };
  }

  /**
   * Un turno saltado (vencido o jugado en automático).
   *  1) Con ≥ `saltosMin` turnos saltados seguidos pasa SOLO a "automático" (sin votación).
   *  2) Si en automático acumula ≥ `turnosAutoMin` turnos jugados por el sistema, queda DISPONIBLE la expulsión:
   *     se emite un aviso suave y aparece un botón en su panel; la votación solo se abre cuando alguien lo pulsa.
   */
  private turnoSaltado(j: JugadorPartida, enAutomatico: boolean): void {
    if (enAutomatico) {
      j.turnosAuto++;
      j.saltos++;
    }
    if (this.e.fase === 'FINALIZADA' || j.esBot || j.eliminado) return;
    if (!j.automatico) return this.activarAutomaticoSiCorresponde(j);
    if (!this.puedeHabilitarExpulsion(j)) return;
    j.expulsionDisponible = true;
    this.emitir('EXPULSION_DISPONIBLE', { jugadorId: j.id, nombre: j.nombre, turnosAuto: j.turnosAuto });
  }

  private activarAutomaticoSiCorresponde(j: JugadorPartida): void {
    if (j.saltos < this.umbrales.saltosMin) return;
    j.automatico = true;
    j.turnosAuto = 0;
    j.enfriamientoVoto = 0;
    j.expulsionDisponible = false;
    this.emitir('AUTOMATICO', { jugadorId: j.id, activo: true, porVotacion: false, saltos: j.saltos });
  }

  private puedeHabilitarExpulsion(j: JugadorPartida): boolean {
    if (j.expulsionDisponible || this.e.votacion) return false;
    if (this.consumirEnfriamiento(j)) return false;
    return j.turnosAuto >= this.umbrales.turnosAutoMin && this.votantesElegibles(j.id).length > 0;
  }

  /** Tras un rechazo, cada turno saltado descuenta el enfriamiento. true = aún no se puede habilitar la expulsión. */
  private consumirEnfriamiento(j: JugadorPartida): boolean {
    if (j.enfriamientoVoto <= 0) return false;
    j.enfriamientoVoto--;
    return j.enfriamientoVoto > 0;
  }

  /** ¿Puede este jugador iniciar la expulsión de `objetivoId` ahora mismo? (botón del panel) */
  puedeIniciarExpulsion(iniciadorId: string, objetivoId: string): boolean {
    const j = this.jugador(objetivoId);
    return !!j && j.expulsionDisponible && !this.e.votacion && this.votantesElegibles(objetivoId).some((x) => x.id === iniciadorId);
  }

  /** Quien pulsa el botón abre la votación de expulsión y su voto cuenta a favor. */
  iniciarExpulsion(iniciadorId: string, objetivoId: string): Resultado<{ expulsado?: string }> {
    if (this.e.votacion) return { ok: false, codigo: 'ACCION_NO_PERMITIDA', mensaje: 'Ya hay una votación abierta.' };
    const j = this.jugador(objetivoId);
    if (!j || j.esBot || !j.expulsionDisponible) return { ok: false, codigo: 'ACCION_NO_PERMITIDA', mensaje: 'Ese jugador no está disponible para votar su expulsión.' };
    if (!this.votantesElegibles(objetivoId).some((x) => x.id === iniciadorId)) {
      return { ok: false, codigo: 'ACCION_NO_PERMITIDA', mensaje: 'No puedes iniciar esta votación.' };
    }
    this.e.contadorVotaciones += 1;
    const dur = this.umbrales.duracionSeg * 1000;
    this.e.votacion = { id: this.e.contadorVotaciones, tipo: 'EXPULSION', objetivoId, votos: { [iniciadorId]: true }, venceEn: this.d.reloj() + dur };
    const esc = this.escrutinio(this.e.votacion);
    this.emitir('VOTACION_ABIERTA', { id: this.e.votacion.id, tipo: 'EXPULSION', objetivoId, iniciadaPor: iniciadorId, elegibles: esc.elegibles, necesarios: esc.necesarios, venceEn: this.e.votacion.venceEn });
    let expulsado: string | undefined;
    if (esc.aFavor >= esc.necesarios) expulsado = this.cerrarVotacion(true);
    return { ok: true, eventos: this.drenar(), expulsado };
  }

  /** Voto de un humano elegible. Devuelve `expulsado` si la votación aprobada expulsó al acusado. */
  votar(votanteId: string, aFavor: boolean): Resultado<{ expulsado?: string }> {
    const v = this.e.votacion;
    if (!v) return { ok: false, codigo: 'ACCION_NO_PERMITIDA', mensaje: 'No hay ninguna votación abierta.' };
    if (!this.votantesElegibles(v.objetivoId).some((x) => x.id === votanteId)) {
      return { ok: false, codigo: 'ACCION_NO_PERMITIDA', mensaje: 'No puedes votar en esta votación.' };
    }
    if (votanteId in v.votos) return { ok: false, codigo: 'ACCION_NO_PERMITIDA', mensaje: 'Ya votaste.' };
    v.votos[votanteId] = aFavor;
    const esc = this.escrutinio(v);
    let expulsado: string | undefined;
    if (esc.aFavor >= esc.necesarios) expulsado = this.cerrarVotacion(true);
    else if (esc.enContra > esc.elegibles - esc.necesarios) this.cerrarVotacion(false); // ya no puede alcanzarse la mayoría
    return { ok: true, eventos: this.drenar(), expulsado };
  }

  /** El plazo de la votación venció: se aprueba solo si ya había mayoría; si no, se rechaza. */
  expirarVotacion(id: number): Resultado<{ expulsado?: string }> {
    const v = this.e.votacion;
    if (!v || v.id !== id) return { ok: true, eventos: [] };
    const esc = this.escrutinio(v);
    const expulsado = this.cerrarVotacion(esc.aFavor >= esc.necesarios);
    return { ok: true, eventos: this.drenar(), expulsado };
  }

  private cerrarVotacion(aprobada: boolean): string | undefined {
    const v = this.e.votacion!;
    const esc = this.escrutinio(v);
    const j = this.jugador(v.objetivoId)!;
    this.e.votacion = null;
    this.emitir('VOTACION_CERRADA', { id: v.id, tipo: v.tipo, objetivoId: v.objetivoId, resultado: aprobada ? 'APROBADA' : 'RECHAZADA', aFavor: esc.aFavor, enContra: esc.enContra, necesarios: esc.necesarios });
    j.expulsionDisponible = false;
    if (!aprobada) {
      j.enfriamientoVoto = this.umbrales.enfriamientoSaltos;
      return undefined;
    }
    this.convertirEnBot(j);
    this.emitir('JUGADOR_EXPULSADO', { jugadorId: j.id, nombre: j.nombre });
    return j.id;
  }

  private cancelarVotacionDe(jugadorId: string, motivo: string): void {
    const v = this.e.votacion;
    if (!v || v.objetivoId !== jugadorId) return;
    this.e.votacion = null;
    this.emitir('VOTACION_CERRADA', { id: v.id, tipo: v.tipo, objetivoId: v.objetivoId, resultado: 'CANCELADA', motivo });
  }

  /** Proyección de la votación abierta para un jugador (null si no hay). */
  votacionVista(yoId: string): VotacionVista | null {
    const v = this.e.votacion;
    if (!v) return null;
    const esc = this.escrutinio(v);
    return {
      id: v.id,
      tipo: v.tipo,
      objetivoId: v.objetivoId,
      venceEn: v.venceEn,
      ...esc,
      miVoto: yoId in v.votos ? v.votos[yoId]! : null,
      puedoVotar: !(yoId in v.votos) && this.votantesElegibles(v.objetivoId).some((x) => x.id === yoId),
    };
  }

  /** Si el jugador con el turno se desconecta, acorta su plazo para no bloquear la mesa. */
  limitarTurno(jugadorId: string, maxMs: number): void {
    const r = this.e.ronda;
    if (this.e.fase !== 'EN_CURSO' || !r || r.turnoId !== jugadorId) return;
    r.venceEn = Math.min(r.venceEn, this.d.reloj() + maxMs);
  }

  /** Duración (ms) del turno de un jugador (más corta si está desconectado). */
  tiempoTurnoMs(jugadorId: string): number {
    const j = this.jugador(jugadorId);
    const p = this.e.parametros;
    return (j && !j.conectado && !j.esBot ? p.tiempoTurnoDesconectadoSeg : p.tiempoTurnoSeg) * 1000;
  }

  /* ------------------------- internos ------------------------- */

  private validarTurno(
    jugadorId: string,
    fase: 'ROBAR' | 'DESCARTAR',
  ): { ok: true; r: EstadoRonda; j: JugadorPartida } | { ok: false; codigo: 'FASE_INVALIDA' | 'NO_ES_TU_TURNO' | 'JUGADOR_ELIMINADO'; mensaje: string } {
    const r = this.e.ronda;
    if (this.e.fase !== 'EN_CURSO' || !r) return { ok: false, codigo: 'FASE_INVALIDA', mensaje: 'La ronda no está en curso.' };
    const j = this.jugador(jugadorId);
    if (!j) return { ok: false, codigo: 'NO_ES_TU_TURNO', mensaje: 'No participas en esta partida.' };
    if (j.eliminado) return { ok: false, codigo: 'JUGADOR_ELIMINADO', mensaje: 'Estás eliminado de esta partida.' };
    if (r.turnoId !== jugadorId) return { ok: false, codigo: 'NO_ES_TU_TURNO', mensaje: 'No es tu turno.' };
    if (r.fase !== fase) {
      return {
        ok: false,
        codigo: 'FASE_INVALIDA',
        mensaje: fase === 'ROBAR' ? 'Ya robaste: ahora debes descartar o cerrar.' : 'Primero debes robar una carta.',
      };
    }
    return { ok: true, r, j };
  }

  /** Un humano actuó (o reconectó / retomó): vuelve al control. Las acciones del bot de "automático" (auto) no cuentan. */
  private registrarAccionHumana(j: JugadorPartida, auto = false): void {
    if (j.esBot || auto) return;
    j.timeouts = 0;
    j.saltos = 0;
    j.turnosAuto = 0;
    j.enfriamientoVoto = 0;
    j.expulsionDisponible = false;
    if (j.autopiloto) {
      j.autopiloto = false;
      this.emitir('AUTOPILOTO', { jugadorId: j.id, activo: false });
    }
    if (j.automatico) {
      j.automatico = false;
      this.emitir('AUTOMATICO', { jugadorId: j.id, activo: false });
    }
    this.cancelarVotacionDe(j.id, 'RETOMO');
  }


  private turnoIniciado(jugadorId: string, fase: 'ROBAR' | 'DESCARTAR'): void {
    const r = this.e.ronda!;
    const prev = r.turnoN;
    r.turnoId = jugadorId;
    r.fase = fase;
    r.turnoN = prev + 1;
    r.venceEn = this.d.reloj() + this.tiempoTurnoMs(jugadorId);
    r.pozoRoboId = null;
    this.emitir('TURNO_INICIADO', { jugadorId, fase, venceEn: r.venceEn, turnoN: r.turnoN });
  }

  private pasarTurno(): void {
    const r = this.e.ronda!;
    this.turnoIniciado(this.jugadores.siguiente(r.turnoId).id, 'ROBAR');
  }

  /** Reparte 10 a cada activo y 1 extra al inicial (RF04 / RF17); voltea la primera carta del pozo. */
  private iniciarRonda(): void {
    const e = this.e;
    const p = e.parametros;
    const act = this.activos();
    e.numeroRonda += 1;
    const mazo = nuevoMazo({ mazos: e.mazosEnJuego as 1 | 2, comodines: p.comodines }, this.d.rng);
    const manos: Record<string, Carta[]> = {};
    for (const j of act) manos[j.id] = mazo.repartir(p.cartasPorMano);
    const iniciaId =
      e.siguienteIniciaId && act.some((j) => j.id === e.siguienteIniciaId)
        ? e.siguienteIniciaId
        : act[this.d.rng.entero(act.length)]!.id;
    manos[iniciaId]!.push(...mazo.repartir(1));
    mazo.voltearInicial();
    const turnoPrevio = e.ronda?.turnoN ?? 0;
    e.ronda = {
      numero: e.numeroRonda,
      manos,
      mazo: mazo.snapshot(),
      turnoId: iniciaId,
      fase: 'DESCARTAR',
      turnoN: turnoPrevio,
      venceEn: 0,
      iniciaId,
      pozoRoboId: null,
      manosIniciales: Object.fromEntries(Object.entries(manos).map(([id, m]) => [id, m.map((c) => c.id)])),
    };
    e.fase = 'EN_CURSO';
    e.liquidacion = null;
    this.emitir('RONDA_INICIADA', {
      ronda: e.numeroRonda,
      iniciaId,
      activos: act.map((j) => j.id),
      mazoRestantes: mazo.restantes,
      tope: mazo.topePozo,
    });
    this.turnoIniciado(iniciaId, 'DESCARTAR');
  }

  private declararTablas(): void {
    const e = this.e;
    const r = e.ronda!;
    this.emitir('RONDA_TABLAS', { ronda: r.numero });
    const jugadores = this.activos().map((j) => {
      const part = this.regla.particionResidual(r.manos[j.id] ?? []);
      return {
        jugadorId: j.id,
        combinaciones: this.combinacionesVista(part.combinaciones),
        sobrantes: [...part.sobrantes],
        puntosSobrantes: 0,
        delta: 0,
        acumulado: e.marcador.puntos[j.id] ?? 0,
        victorias: e.marcador.victorias[j.id] ?? 0,
        eliminado: false,
      };
    });
    e.siguienteIniciaId = null;
    e.fase = 'LIQUIDACION';
    e.liquidacion = {
      ronda: r.numero,
      tablas: true,
      ganadorId: null,
      tipoCierre: null,
      detalle: 'Se agotó el mazo: la ronda termina en tablas y no se modifica el marcador.',
      jugadores,
      eliminadosAhora: [],
      siguienteEn: this.d.reloj() + e.parametros.pausaLiquidacionSeg * 1000,
    };
  }

  private combinacionesVista(combs: readonly { tipo: 'GRUPO' | 'ESCALERA'; cartas: readonly Carta[] }[]): CombinacionVista[] {
    return combs.map((c) => ({ tipo: c.tipo, cartas: [...c.cartas] }));
  }

  private liquidarRonda(ganadorId: string, cierre: ResultadoCierre): void {
    const e = this.e;
    const r = e.ronda!;
    const act = this.activos();
    const manos = new Map<string, readonly Carta[]>(act.map((j) => [j.id, r.manos[j.id] ?? []]));
    const liq = this.liquidador.liquidarRonda({
      regla: this.regla,
      ronda: r.numero,
      ganadorId,
      cierre,
      manos,
      marcador: e.marcador,
      todosIds: e.jugadores.map((j) => j.id),
      activos: act.map((j) => j.id),
    });
    e.marcador = liq.marcador;
    for (const id of liq.partida.eliminados) {
      const j = this.jugador(id)!;
      this.jugadores.marcarEliminado(id);
      this.cancelarVotacionDe(id, 'ELIMINADO');
      this.emitir('JUGADOR_ELIMINADO', { jugadorId: id, ronda: r.numero, puntos: e.marcador.puntos[id] ?? 0 });
    }
    const finalizada = liq.partida.finalizada && !!liq.partida.ganadorId;
    const vista: LiquidacionVista = {
      ronda: r.numero,
      tablas: false,
      ganadorId,
      tipoCierre: cierre.tipo ?? null,
      detalle: cierre.detalle,
      jugadores: liq.detalle.map((d) => ({
        jugadorId: d.jugadorId,
        combinaciones: this.combinacionesVista(d.combinaciones),
        sobrantes: [...d.sobrantes],
        puntosSobrantes: d.puntosSobrantes,
        delta: d.delta,
        acumulado: e.marcador.puntos[d.jugadorId] ?? 0,
        victorias: e.marcador.victorias[d.jugadorId] ?? 0,
        eliminado: liq.partida.eliminados.includes(d.jugadorId) || e.marcador.eliminados.some((x) => x.jugadorId === d.jugadorId),
      })),
      eliminadosAhora: [...liq.partida.eliminados],
      siguienteEn: finalizada ? null : this.d.reloj() + e.parametros.pausaLiquidacionSeg * 1000,
    };
    e.liquidacion = vista;
    e.siguienteIniciaId = ganadorId;
    this.emitir('RONDA_LIQUIDADA', {
      ronda: r.numero,
      ganadorId,
      deltas: Object.fromEntries(liq.detalle.map((d) => [d.jugadorId, d.delta])),
      acumulados: e.marcador.puntos,
      victorias: e.marcador.victorias,
    });
    if (finalizada) {
      const final: FinalVista = {
        ganadorId: liq.partida.ganadorId!,
        motivo: liq.partida.motivoFin ?? 'Fin de partida',
        posiciones: liq.posiciones ?? [],
      };
      e.final = final;
      e.fase = 'FINALIZADA';
      if (e.votacion) this.cancelarVotacionDe(e.votacion.objetivoId, 'FIN');
      this.emitir('PARTIDA_FINALIZADA', { ganadorId: final.ganadorId, motivo: final.motivo, posiciones: final.posiciones });
    } else {
      e.fase = 'LIQUIDACION';
    }
  }

  private emitir(tipo: TipoEvento, datos: Record<string, unknown>): void {
    this.e.seq += 1;
    this.pendientes.push({ seq: this.e.seq, tipo, ronda: this.e.numeroRonda, ts: this.d.reloj(), partida: this.e.partidaN ?? 1, datos });
  }

  private drenar(): EventoJuego[] {
    const out = this.pendientes;
    this.pendientes = [];
    return out;
  }
}
