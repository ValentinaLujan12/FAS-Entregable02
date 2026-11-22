import { describe, expect, it } from 'vitest';
import { RoundScoring } from '../src/scoring/RoundScoring.js';
import { ReglaApuntado101Puntos } from '../src/rules/ReglaApuntado101Puntos.js';
import { ReglaClasicaCuartaTerna } from '../src/rules/ReglaClasicaCuartaTerna.js';
import { marcadorInicial } from '../src/kernel/marcador.js';
import { parametrosPorDefecto } from '../src/kernel/config.js';

/**
 * Pruebas de posiciones finales (RoundScoring.posiciones). Cubren el orden por sentido de puntaje:
 * MENOS (gana quien tiene menos puntos, modalidad Apuntado) y MAS / VICTORIAS (modalidad Clasica).
 */
describe('RoundScoring.posiciones', () => {
  const scoring = new RoundScoring();
  const todos = ['A', 'B', 'C', 'D'];

  it('con sentido MENOS, el ganador va primero y luego quien tiene menos puntos', () => {
    const regla = new ReglaApuntado101Puntos(parametrosPorDefecto('APUNTADO'));
    const marcador = { puntos: { A: 0, B: 40, C: 10, D: 25 }, victorias: {}, eliminados: [] };
    const posiciones = scoring.posiciones(regla, marcador, todos, 'A');
    expect(posiciones.map((p) => p.jugadorId)).toEqual(['A', 'C', 'D', 'B']);
    expect(posiciones.map((p) => p.posicion)).toEqual([1, 2, 3, 4]);
  });

  it('con sentido MENOS, un eliminado queda detrás de los que siguen en pie', () => {
    const regla = new ReglaApuntado101Puntos(parametrosPorDefecto('APUNTADO'));
    const marcador = {
      puntos: { A: 0, B: 101, C: 30, D: 5 },
      victorias: {},
      eliminados: [{ jugadorId: 'B', ronda: 4 }],
    };
    const posiciones = scoring.posiciones(regla, marcador, todos, 'A');
    expect(posiciones.map((p) => p.jugadorId)).toEqual(['A', 'D', 'C', 'B']);
  });

  it('con sentido MAS, ordena por puntos de mayor a menor', () => {
    const regla = new ReglaClasicaCuartaTerna(parametrosPorDefecto('CLASICA'));
    const marcador = { ...marcadorInicial(todos), puntos: { A: 3, B: 1, C: 7, D: 5 } };
    const posiciones = scoring.posiciones(regla, marcador, todos, 'A');
    expect(posiciones.map((p) => p.jugadorId)).toEqual(['A', 'C', 'D', 'B']);
  });
});
