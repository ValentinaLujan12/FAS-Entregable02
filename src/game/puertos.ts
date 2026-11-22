import type { CuentaVista, EventoJuego, OrigenRobo } from '../kernel/protocolo.js';
import type { TipoSkin } from '../kernel/skins.js';
import type { FabricaDescarte, PartidaEnCurso } from './PartidaEnCurso.js';
import type { Cuenta, IRepositorioCuentas } from '../persistence/IRepositorioCuentas.js';

/*
 * Puertos del nucleo de juego (ADR-11): lo que el juego necesita de las funciones extra (cuentas, skins, reacciones,
 * bots). Los extras implementan estos contratos y se inyectan en la composicion (src/extras/composicion.ts). El nucleo
 * nunca importa de src/extras.
 */

export type ErrorCuenta = 'SKIN_INVALIDA' | 'YA_LA_TIENES' | 'NO_LA_TIENES' | 'SALDO_INSUFICIENTE' | 'RECARGA_NO_DISPONIBLE' | 'SIN_CUENTA';
export type ResultadoCuenta<T = object> = ({ ok: true } & T) | { ok: false; codigo: ErrorCuenta; mensaje: string };

export interface IServicioCuentas {
  cargarPorClave(clave: unknown): Promise<Cuenta | null>;
  abrir(clave?: string): Promise<{ cuenta: Cuenta; clave?: string }>;
  obtener(claveHash: string | null): Cuenta | null;
  comprar(c: Cuenta, tipo: unknown, id: unknown): ResultadoCuenta;
  activar(c: Cuenta, tipo: unknown, id: unknown): ResultadoCuenta;
  recargar(c: Cuenta): ResultadoCuenta;
  vista(c: Cuenta): CuentaVista;
  vaciar(): Promise<void>;
}

/** Estilos visuales: skin de cartas por defecto, mesas premium y elección aleatoria de los bots. */
export interface IEstilos {
  esMesaPremium(id: string | null | undefined): boolean;
  aleatorioCarta(): string;
  aleatorioCelebracion(): string;
}

/** Reglas del antirrebote y del silencio de las reacciones. */
export interface IReaccionesPolitica {
  valida(id: unknown): boolean;
  enfriamientoMs: number;
  umbralSilencio(humanosActivos: number): number;
}

export interface IPlanificadorReacciones {
  alEntrar(entra: { id: string; esBot: boolean }, botsPresentes: readonly string[]): PlanReaccion[];
  alReaccionHumana(id: string, botsPresentes: readonly string[]): PlanReaccion[];
  alEventos(eventos: readonly EventoJuego[], esBot: (id: string) => boolean, bots: readonly string[]): PlanReaccion[];
}

export interface IEstrategiaBot {
  decidir(partida: PartidaEnCurso, jugadorId: string): AccionBot | null;
}

/** Lo que un bot decide hacer en su turno (sin ejecutarlo). */
export type AccionBot =
  | { tipo: 'ROBAR'; origen: OrigenRobo }
  | { tipo: 'CERRAR' }
  | { tipo: 'DESCARTAR'; cartaId: string };

/** Muestra de latencia de un comando de juego (extra de métricas para las pruebas con usuarios). */
export interface MuestraLatencia {
  comando: string;
  jugadorId: string | null;
  /** Tiempo de proceso en el servidor, desde que llega la petición hasta justo antes de guardar (ms). */
  servidorMs: number;
  /** Ida y vuelta medida por el navegador en su petición anterior (ms); null si no la envió. */
  clienteMs: number | null;
}

/** Métricas de experiencia: convierte una muestra en un evento que se guarda con la sala (o null si no se mide). */
export interface IMetricas {
  eventoLatencia(muestra: MuestraLatencia, ahora: number): EventoJuego | null;
}

/** Paquete de extras que compone la aplicacion. */
export interface IExtrasJuego {
  estilos: IEstilos;
  reacciones: IReaccionesPolitica;
  bots: IEstrategiaBot;
  probabilidadesBot: ProbabilidadesBot;
  fabricaDescarte: FabricaDescarte;
  crearCuentas(repo: IRepositorioCuentas, reloj: () => number, opciones?: { alError?: (err: unknown) => void }): IServicioCuentas;
  crearPlanificador(p: ProbabilidadesBot, azar: () => number, reloj: () => number): IPlanificadorReacciones;
  /** Métricas de latencia para las pruebas con usuarios (opcional). */
  metricas?: IMetricas;
}

export type { TipoSkin };

/**
 * Reacciones de los bots ("chat orgánico"). Se disparan A VECES, según estas probabilidades, para que la mesa se sienta
 * viva sin saturarse: el saludo es un poco más probable que lo demás y cada bot tiene un enfriamiento entre reacciones.
 * Ajusta aquí la "personalidad" de los bots; no se toca ninguna otra parte.
 */
export interface ProbabilidadesBot {
  /** Un bot que entra a la sala saluda. */
  saludarAlEntrarBot: number;
  /** Cuando entra un humano, UN bot de la sala lo saluda. */
  saludarAlEntrarHumano: number;
  /** Cuando un humano saluda, UN bot responde. */
  responderSaludo: number;
  /** El bot que gana la ronda alardea o se burla. */
  alardearAlGanar: number;
  /** Otro bot comenta (GG / uy) cuando alguien gana la ronda. */
  comentarGanadorAjeno: number;
  /** El bot toma una carta útil del pozo: celebra o es sarcástico. */
  tomarPozo: number;
  /** Roba del mazo una carta que no le sirve y la descarta: se queja. */
  quejaMazoInutil: number;
  /** Roba del mazo y se queda con la carta (descarta otra): celebra. */
  celebrarMazoUtil: number;
  /** GG al terminar la partida (un bot que no ganó). */
  ggFinal: number;
  /** Tiempo mínimo entre dos reacciones del mismo bot. */
  enfriamientoMs: number;
  /** Retardo "humano" antes de reaccionar. */
  retardoMs: readonly [number, number];
}

export interface PlanReaccion {
  jugadorId: string;
  id: string;
  retrasoMs: number;
}

