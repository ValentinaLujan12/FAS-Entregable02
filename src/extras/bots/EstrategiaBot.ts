import type { OrigenRobo } from '../../kernel/protocolo.js';
import type { PartidaEnCurso } from '../../game/PartidaEnCurso.js';
import { crearRegistroReglas } from '../../rules/RegistroReglas.js';
import { HandEvaluator } from '../../rules/HandEvaluator.js';
import { Valoracion } from '../../rules/valoracion.js';
import { AnalisisMano } from './AnalisisMano.js';
import type { AccionBot } from '../../game/puertos.js';

export type { AccionBot } from '../../game/puertos.js';

/** Analisis heuristico con los parametros y tamanos de la partida (no se guarda en la partida). */
function analisisDe(partida: PartidaEnCurso): AnalisisMano {
  const p = partida.estado.parametros;
  const tamanos = crearRegistroReglas().reglaPara(p).tamanosObjetivo();
  return new AnalisisMano(new HandEvaluator({ aceEscalera: p.aceEscalera }), new Valoracion(p.valorAs).puntosDe, tamanos);
}

/**
 * Estrategia de los bots (y del autopiloto de jugadores inactivos). Solo LEE la partida y devuelve la siguiente
 * acción; nunca la ejecuta ni conoce la modalidad: usa AnalisisMano y IReglaJuego a través de la partida.
 */
export function decidirAccionBot(partida: PartidaEnCurso, jugadorId: string): AccionBot | null {
  const r = partida.estado.ronda;
  if (partida.estado.fase !== 'EN_CURSO' || !r || r.turnoId !== jugadorId) return null;
  const mano = partida.manoDe(jugadorId);
  const analisis = analisisDe(partida);

  if (r.fase === 'ROBAR') {
    const tope = partida.mazoActual().tope;
    if (tope && partida.estado.parametros.permitirRoboPozo) {
      const costoActual = analisis.costo(mano);
      const conTope = [...mano, tope];
      const descarte = analisis.elegirDescarte(conTope, tope.id);
      const costoDespues = analisis.costo(conTope.filter((c) => c.id !== descarte.id));
      if (costoDespues < costoActual - 1) return { tipo: 'ROBAR', origen: 'POZO' };
    }
    return { tipo: 'ROBAR', origen: 'MAZO' };
  }

  if (partida.evaluarCierre(jugadorId).valido) return { tipo: 'CERRAR' };
  return { tipo: 'DESCARTAR', cartaId: analisis.elegirDescarte(mano, r.pozoRoboId).id };
}
