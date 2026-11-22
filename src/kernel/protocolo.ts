/**
 * Contrato cliente <-> servidor (JSON por POST /api/juego). Documentado en docs/contracts/asyncapi.yaml.
 * El servidor es la ÚNICA fuente de verdad: el cliente solo envía intenciones y renderiza vistas.
 */
import type { Carta } from './cartas.js';
import type { ModalidadId, ParametrosModalidad } from './config.js';
import type { TipoSkin } from './skins.js';

export type FaseSala = 'ESPERA' | 'EN_CURSO' | 'LIQUIDACION' | 'FINALIZADA';
export type FaseTurno = 'ROBAR' | 'DESCARTAR';
export type OrigenRobo = 'MAZO' | 'POZO';

/* --------- Mensajes cliente -> servidor --------- */
export type MensajeCliente =
  | { t: 'crear_sala'; nombre: string; modalidad: ModalidadId; parametros?: Partial<ParametrosModalidad> }
  | { t: 'unirse'; codigo: string; nombre: string }
  | { t: 'reconectar'; codigo: string; token: string }
  | { t: 'configurar'; modalidad?: ModalidadId; parametros?: Partial<ParametrosModalidad> }
  | { t: 'agregar_bot' }
  | { t: 'quitar_jugador'; jugadorId: string }
  | { t: 'iniciar' }
  | { t: 'robar'; origen: OrigenRobo }
  | { t: 'descartar'; cartaId: string }
  | { t: 'validar'; cartaIds: string[] }
  | { t: 'cerrar' }
  | { t: 'continuar' }
  | { t: 'nueva_partida' }
  | { t: 'salir' }
  /* Cuenta anónima (MOCKUP del sistema real con cuentas): el servidor es la fuente de verdad del saldo, el inventario y lo elegido. */
  | { t: 'cuenta_abrir'; clave?: string }
  | { t: 'cuenta_comprar'; tipo: TipoSkin; id: string }
  | { t: 'cuenta_activar'; tipo: TipoSkin; id: string }
  | { t: 'cuenta_recargar' }
  /* Reacciones rápidas y silencio */
  | { t: 'reaccion'; id: string }
  | { t: 'silenciar'; jugadorId: string; activo: boolean }
  /* Votación de expulsión: la abre quien pulsa el botón del panel del jugador ausente; luego se vota */
  | { t: 'iniciar_expulsion'; objetivoId: string }
  | { t: 'votar'; aFavor: boolean }
  | { t: 'retomar' }
  | { t: 'ping' };

/* --------- Vistas (proyección por jugador; nunca incluyen manos ajenas salvo en liquidación) --------- */
export interface JugadorVista {
  id: string;
  nombre: string;
  esBot: boolean;
  conectado: boolean;
  /** "Piloto": 2 turnos vencidos seguidos. Solo etiqueta: su turno espera el reloj completo. */
  autopiloto: boolean;
  /** "Automático completo" (por votación): un bot juega por él al instante hasta que retome el control. */
  automatico: boolean;
  /** Turnos saltados seguidos (vencidos + jugados en automático). */
  saltos: number;
  eliminado: boolean;
  esHost: boolean;
  /** Skin de cartas del jugador (visible para todos). Los bots eligen una al azar. */
  skinCartas: string;
  /** Mesa PREMIUM elegida (id del catálogo) o null: las mesas básicas nunca se comparten. */
  mesaPremium: string | null;
  /** Skin de celebración (efecto de victoria que ve toda la mesa). */
  celebracion: string;
  /** Silenciado para TODOS por la regla de ⌈activos/2⌉ silenciadores. */
  silenciado: boolean;
  /** Yo lo silencié (solo yo no veo sus reacciones, salvo que ya esté silenciado para todos). */
  silenciadoPorMi: boolean;
  /** Tras varios turnos en automático: cualquiera puede iniciar la votación de expulsión desde su panel. */
  expulsionDisponible: boolean;
  asiento: number;
  numCartas: number;
  puntos: number;
  victorias: number;
}

export interface TurnoVista {
  jugadorId: string;
  fase: FaseTurno;
  /** Epoch ms (reloj del servidor) en que vence el turno. */
  venceEn: number;
  turnoN: number;
}

export interface CombinacionVista {
  tipo: 'GRUPO' | 'ESCALERA';
  cartas: Carta[];
}

export interface LiquidacionJugadorVista {
  jugadorId: string;
  combinaciones: CombinacionVista[];
  sobrantes: Carta[];
  puntosSobrantes: number;
  delta: number;
  acumulado: number;
  victorias: number;
  eliminado: boolean;
}

export interface LiquidacionVista {
  ronda: number;
  tablas: boolean;
  ganadorId: string | null;
  tipoCierre: string | null;
  detalle: string;
  jugadores: LiquidacionJugadorVista[];
  eliminadosAhora: string[];
  /** Epoch ms en que se inicia sola la siguiente ronda (null si la partida terminó). */
  siguienteEn: number | null;
}

export interface PosicionFinal {
  jugadorId: string;
  posicion: number;
  puntos: number;
  victorias: number;
}

export interface FinalVista {
  ganadorId: string;
  motivo: string;
  posiciones: PosicionFinal[];
}

/** Solo existe la votación de expulsión: el paso a "automático" es automático (sin voto). */
export type TipoVotacion = 'EXPULSION';

export interface VotacionVista {
  id: number;
  tipo: TipoVotacion;
  objetivoId: string;
  /** Epoch ms (reloj del servidor) en que se cierra la votación. */
  venceEn: number;
  elegibles: number;
  necesarios: number;
  aFavor: number;
  enContra: number;
  /** Mi voto (null = aún no voto). */
  miVoto: boolean | null;
  puedoVotar: boolean;
}

export interface VistaMesa {
  codigo: string;
  modalidad: ModalidadId;
  parametros: ParametrosModalidad;
  fase: FaseSala;
  yoId: string;
  hostId: string;
  jugadores: JugadorVista[];
  ronda: number;
  turno: TurnoVista | null;
  mano: Carta[];
  mazoRestantes: number;
  pozo: { tope: Carta | null; cantidad: number };
  mazosEnJuego: number;
  liquidacion: LiquidacionVista | null;
  final: FinalVista | null;
  votacion: VotacionVista | null;
  /** Reloj del servidor al generar la vista (para corregir desfase del cliente). */
  ahora: number;
}

/* --------- Eventos públicos (pistas de animación + bitácora de la mesa) --------- */
export type TipoEvento =
  | 'SALA_ACTUALIZADA'
  | 'PARTIDA_INICIADA'
  | 'RONDA_INICIADA'
  | 'TURNO_INICIADO'
  | 'CARTA_ROBADA'
  | 'CARTA_DESCARTADA'
  | 'TURNO_EXPIRADO'
  | 'CIERRE_RECHAZADO'
  | 'CIERRE_ACEPTADO'
  | 'MAZO_RECICLADO'
  | 'RONDA_TABLAS'
  | 'RONDA_LIQUIDADA'
  | 'JUGADOR_ELIMINADO'
  | 'PARTIDA_FINALIZADA'
  | 'AUTOPILOTO'
  | 'AUTOMATICO'
  | 'EXPULSION_DISPONIBLE'
  | 'VOTACION_ABIERTA'
  | 'VOTACION_CERRADA'
  | 'JUGADOR_EXPULSADO'
  /** Muestra de latencia (extra de métricas): solo se guarda en la base de datos, nunca se envía a los clientes. */
  | 'METRICA_LATENCIA';

export interface EventoJuego {
  seq: number;
  tipo: TipoEvento;
  ronda: number;
  ts: number;
  /** Número de partida dentro de la sala (revanchas); agrupa los eventos de cada partida en la auditoría. */
  partida?: number;
  datos: Record<string, unknown>;
}

/* --------- Mensajes servidor -> cliente --------- */
export type MensajeServidor =
  | { t: 'sesion'; codigo: string; jugadorId: string; token: string }
  | { t: 'estado'; vista: VistaMesa }
  | { t: 'eventos'; eventos: EventoJuego[] }
  | { t: 'validacion'; valida: boolean; tipo?: 'GRUPO' | 'ESCALERA'; mensaje: string; cartaIds: string[] }
  | { t: 'error'; codigo: string; mensaje: string }
  | { t: 'pong'; ahora: number }
  /** Estado de la cuenta del jugador. `clave` solo viaja al abrir/crear (el navegador la guarda). */
  | { t: 'cuenta'; clave?: string; cuenta: CuentaVista }
  | { t: 'reaccion'; jugadorId: string; id: string; ts: number };

/** Proyección de la cuenta hacia su dueño (la clave nunca se guarda en claro en el servidor). */
export interface CuentaVista {
  saldo: number;
  /** Ids de skins PREMIUM compradas (las básicas son de todos). */
  inventario: string[];
  elegidas: Record<TipoSkin, string>;
  /** ¿Está activo el botón temporal "Recargar tokens"? (mockup; el sistema real lo reemplaza por "Comprar monedas") */
  recargaDisponible: boolean;
}

export interface InfoModalidadDTO {
  id: ModalidadId;
  nombre: string;
  resumen: string;
  sentidoPuntaje: 'MENOS' | 'VICTORIAS';
  parametros: ParametrosModalidad;
}
