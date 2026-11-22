import type { EventoJuego, JugadorVista, VistaMesa, VotacionVista } from '../kernel/protocolo.js';
import type { Marcador } from '../kernel/marcador.js';
import type { EstadoPartida, EstadoRonda, Sala } from '../estado/tipos.js';
import type { JugadorPartida } from '../player/IJugadores.js';
import { SKIN_CARTA_DEFECTO, SKIN_CELEBRACION_DEFECTO } from '../kernel/skins.js';

/**
 * ProyectorVistaJugador (infra): proyección de la partida hacia UN jugador. Regla anti-trampas (riesgo R7):
 * el cliente solo recibe SU mano; de los demás únicamente el número de cartas (y sus cartas al liquidar).
 */
export interface InfoSilencio {
  silenciado(jugadorId: string): boolean;
  silenciadoPor(jugadorId: string, quienId: string): boolean;
}
const SIN_SILENCIOS: InfoSilencio = { silenciado: () => false, silenciadoPor: () => false };

/** Lo único que el proyector lee de una partida (lo cumple PartidaEnCurso). infra no depende de game. */
export interface PartidaProyectable {
  readonly estado: Readonly<EstadoPartida>;
  votacionVista(yoId: string): VotacionVista | null;
  puedeIniciarExpulsion(iniciadorId: string, objetivoId: string): boolean;
}

/** Estado de un jugador sentado en la sala cuando aún no hay partida. */
const EN_ESPERA = { eliminado: false, conectado: true, autopiloto: false, automatico: false, saltos: 0, timeouts: 0, enfriamientoVoto: 0, turnosAuto: 0, expulsionDisponible: false };

const SIN_RONDA: Pick<VistaMesa, 'turno' | 'mano' | 'mazoRestantes' | 'pozo'> = { turno: null, mano: [], mazoRestantes: 0, pozo: { tope: null, cantidad: 0 } };

interface Proyeccion {
  sala: Sala;
  partida: PartidaProyectable | null;
  conectados: ReadonlySet<string>;
  yoId: string;
  silencios: InfoSilencio;
  ronda: EstadoRonda | null;
  marcador: Marcador | null;
}

function estiloDe(sala: Sala, jugadorId: string): Pick<JugadorVista, 'skinCartas' | 'mesaPremium' | 'celebracion'> {
  const sj = sala.jugadores.find((x) => x.id === jugadorId);
  return { skinCartas: sj?.skinCartas ?? SKIN_CARTA_DEFECTO, mesaPremium: sj?.mesaPremium ?? null, celebracion: sj?.celebracion ?? SKIN_CELEBRACION_DEFECTO };
}

function jugadorVista(j: JugadorPartida, c: Proyeccion): JugadorVista {
  return {
    id: j.id,
    nombre: j.nombre,
    esBot: j.esBot,
    conectado: j.esBot || c.conectados.has(j.id),
    autopiloto: j.autopiloto,
    automatico: j.automatico,
    saltos: j.saltos,
    eliminado: j.eliminado,
    esHost: c.sala.hostId === j.id,
    ...estiloDe(c.sala, j.id),
    silenciado: c.silencios.silenciado(j.id),
    silenciadoPorMi: c.silencios.silenciadoPor(j.id, c.yoId),
    expulsionDisponible: c.partida !== null && c.partida.puedeIniciarExpulsion(c.yoId, j.id),
    asiento: j.asiento,
    ...contadores(j, c),
  };
}

/** Cartas en mano (solo el número), puntos y rondas ganadas de un jugador. */
function contadores(j: JugadorPartida, c: Proyeccion): Pick<JugadorVista, 'numCartas' | 'puntos' | 'victorias'> {
  return {
    numCartas: c.ronda && !j.eliminado ? (c.ronda.manos[j.id]?.length ?? 0) : 0,
    puntos: c.marcador?.puntos[j.id] ?? 0,
    victorias: c.marcador?.victorias[j.id] ?? 0,
  };
}

/** Turno, mano propia, mazo y pozo de la ronda en curso (vacíos si no hay ronda). */
function vistaRonda(est: EstadoPartida | null, yoId: string): Pick<VistaMesa, 'turno' | 'mano' | 'mazoRestantes' | 'pozo'> {
  const r = est?.ronda;
  if (!est || !r) return SIN_RONDA;
  const pozo = r.mazo.pozo;
  return {
    turno: est.fase === 'EN_CURSO' ? { jugadorId: r.turnoId, fase: r.fase, venceEn: r.venceEn, turnoN: r.turnoN } : null,
    mano: [...(r.manos[yoId] ?? [])],
    mazoRestantes: r.mazo.mazo.length,
    pozo: { tope: pozo[pozo.length - 1] ?? null, cantidad: pozo.length },
  };
}

function vistaPartida(partida: PartidaProyectable | null, yoId: string): Pick<VistaMesa, 'fase' | 'ronda' | 'mazosEnJuego' | 'liquidacion' | 'final' | 'votacion'> {
  if (!partida) return { fase: 'ESPERA', ronda: 0, mazosEnJuego: 0, liquidacion: null, final: null, votacion: null };
  const est = partida.estado;
  return { fase: est.fase, ronda: est.numeroRonda, mazosEnJuego: est.mazosEnJuego, liquidacion: est.liquidacion ?? null, final: est.final ?? null, votacion: partida.votacionVista(yoId) };
}

export function vistaMesa(sala: Sala, partida: PartidaProyectable | null, conectados: ReadonlySet<string>, yoId: string, ahora: number, silencios: InfoSilencio = SIN_SILENCIOS): VistaMesa {
  const est = partida ? partida.estado : null;
  const c: Proyeccion = { sala, partida, conectados, yoId, silencios, ronda: est?.ronda ?? null, marcador: est ? est.marcador : null };
  const base: JugadorPartida[] = est ? est.jugadores : sala.jugadores.map((j) => ({ ...j, ...EN_ESPERA }));
  return {
    codigo: sala.codigo,
    modalidad: sala.modalidad,
    parametros: sala.parametros,
    yoId,
    hostId: sala.hostId,
    jugadores: base.map((j) => jugadorVista(j, c)),
    ...vistaPartida(partida, yoId),
    ...vistaRonda(est, yoId),
    ahora,
  };
}

/** Elimina las claves privadas ("_*") antes de emitir un evento a los clientes. */
export function eventoPublico(e: EventoJuego): EventoJuego {
  const datos: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(e.datos)) if (!k.startsWith('_')) datos[k] = v;
  return { ...e, datos };
}
