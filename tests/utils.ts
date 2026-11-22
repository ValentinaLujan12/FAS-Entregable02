import { parseCartas } from '../src/kernel/cartas.js';
import { type ModalidadId, type ParametrosModalidad, parametrosPorDefecto } from '../src/kernel/config.js';
import { AleatorioSemilla } from '../src/deck/Baraja.js';
import { PartidaEnCurso, type DepsPartida, type JugadorEntrada } from '../src/game/PartidaEnCurso.js';
import { crearRegistroReglas } from '../src/rules/RegistroReglas.js';
import { fabricaDescarteAnalisis } from '../src/extras/bots/AnalisisMano.js';
import type { EstadoPartida } from '../src/game/tipos.js';

export class RelojFalso {
  constructor(public ahora = 1_700_000_000_000) {}
  reloj = () => this.ahora;
  avanzar(ms: number) {
    this.ahora += ms;
  }
}

export function deps(semilla = 42, reloj = new RelojFalso()): DepsPartida & { relojFalso: RelojFalso } {
  return { motor: crearRegistroReglas(), fabricaDescarte: fabricaDescarteAnalisis, rng: new AleatorioSemilla(semilla), reloj: reloj.reloj, relojFalso: reloj };
}

export const jugadores = (n: number, bots = false): JugadorEntrada[] =>
  Array.from({ length: n }, (_, i) => ({ id: `j${i + 1}`, nombre: `Jugador ${i + 1}`, esBot: bots }));

export function nuevaPartida(modalidad: ModalidadId, n = 3, extra: Partial<ParametrosModalidad> = {}, semilla = 42) {
  const d = deps(semilla);
  const r = PartidaEnCurso.iniciar('TESTA', { ...parametrosPorDefecto(modalidad), ...extra }, jugadores(n), d);
  if (!r.ok) throw new Error(r.mensaje);
  return { partida: r.partida, eventos: r.eventos, d };
}

/** Sustituye la mano de un jugador por una mano conocida (solo para pruebas). */
export function forzarMano(partida: PartidaEnCurso, jugadorId: string, texto: string): void {
  (partida.estado as EstadoPartida).ronda!.manos[jugadorId] = parseCartas(texto);
}

export const estadoMutable = (p: PartidaEnCurso) => p.estado as EstadoPartida;
