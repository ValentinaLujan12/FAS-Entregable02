import { MODALIDADES } from '../kernel/config.js';
import type { Marcador } from '../kernel/marcador.js';
import type { PosicionFinal } from '../kernel/protocolo.js';
import type { ICalculadorPuntos } from '../rules/IReglaJuego.js';
import type { EntradaLiquidar, IServicioPuntaje, ResultadoLiquidacion } from './IServicioPuntaje.js';

/**
 * RoundScoring (RoundScoringComponent, CU-03): suma los puntos residuales según la modalidad, actualiza el marcador
 * histórico y evalúa el umbral de eliminación o el fin de partida.
 *
 * Es una función pura: RECIBE los datos y DEVUELVE el resultado sin llamar de vuelta al orquestador
 * (evita la ruta cíclica GameDomain -> ScoringDomain -> GameDomain señalada en ADR-01).
 * Solo conoce el contrato ICalculadorPuntos de rules (segregación de interfaces, Entregable 2 Tabla 1.3.1).
 */
export type { EntradaLiquidar, IServicioPuntaje, ResultadoLiquidacion } from './IServicioPuntaje.js';

const sumarEn = (base: Readonly<Record<string, number>>, pares: ReadonlyArray<readonly [string, number]>): Record<string, number> => {
  const out: Record<string, number> = { ...base };
  for (const [id, n] of pares) out[id] = (out[id] ?? 0) + n;
  return out;
};

export class RoundScoring implements IServicioPuntaje {
  liquidarRonda(e: EntradaLiquidar): ResultadoLiquidacion {
    const salida = e.regla.liquidarRonda({ ganadorId: e.ganadorId, cierre: e.cierre, manos: e.manos });
    const puntos = sumarEn(e.marcador.puntos, salida.detalle.map((d) => [d.jugadorId, d.delta] as const));
    const victorias = sumarEn(e.marcador.victorias, salida.victoriasRonda.map((id) => [id, 1] as const));
    const parcial: Marcador = { puntos, victorias, eliminados: e.marcador.eliminados };
    const partida = e.regla.evaluarPartida({ marcador: parcial, activos: e.activos, ronda: e.ronda, ganadorRondaId: e.ganadorId });
    const marcador: Marcador = {
      puntos,
      victorias,
      eliminados: [...e.marcador.eliminados, ...partida.eliminados.map((jugadorId) => ({ jugadorId, ronda: e.ronda }))],
    };
    const posiciones = partida.finalizada && partida.ganadorId ? this.posiciones(e.regla, marcador, e.todosIds, partida.ganadorId) : null;
    return { marcador, detalle: salida.detalle, partida, posiciones };
  }

  /** Ganador primero; luego los que siguieron en pie; luego los eliminados (el eliminado más tarde queda mejor). */
  posiciones(regla: ICalculadorPuntos, marcador: Marcador, todos: readonly string[], ganadorId: string): PosicionFinal[] {
    const calidad = comparador(regla, marcador);
    const rondaElim = new Map(marcador.eliminados.map((x) => [x.jugadorId, x.ronda]));
    const otros = todos.filter((id) => id !== ganadorId);
    const enPie = otros.filter((id) => !rondaElim.has(id)).sort(calidad);
    const eliminados = otros.filter((id) => rondaElim.has(id)).sort((a, b) => rondaElim.get(b)! - rondaElim.get(a)! || calidad(a, b));
    return [ganadorId, ...enPie, ...eliminados].map((jugadorId, i) => ({
      jugadorId,
      posicion: i + 1,
      puntos: marcador.puntos[jugadorId] ?? 0,
      victorias: marcador.victorias[jugadorId] ?? 0,
    }));
  }
}

/** Orden de calidad según el sentido del puntaje de la modalidad (menos puntos o más rondas ganadas). */
function comparador(regla: ICalculadorPuntos, marcador: Marcador): (a: string, b: string) => number {
  const pts = (id: string) => marcador.puntos[id] ?? 0;
  const vic = (id: string) => marcador.victorias[id] ?? 0;
  const sentido = MODALIDADES.find((m) => m.id === regla.getModalidad())?.sentidoPuntaje;
  if (sentido === 'VICTORIAS') return (a, b) => vic(b) - vic(a) || pts(b) - pts(a);
  return (a, b) => pts(a) - pts(b);
}
