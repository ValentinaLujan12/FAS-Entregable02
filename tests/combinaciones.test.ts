import { describe, expect, it } from 'vitest';
import { parseCartas } from '../src/kernel/cartas.js';
import { HandEvaluator } from '../src/rules/HandEvaluator.js';
import { Valoracion } from '../src/rules/valoracion.js';

const v = new HandEvaluator({ aceEscalera: 'AMBOS' });
const ok = (s: string, val = v) => val.clasificar(parseCartas(s));

describe('HandEvaluator - casos del PDF (§03 y §09)', () => {
  it('CASO 01: 5♥ 6♥ 7♥ es una escalera válida', () => {
    expect(ok('5H 6H 7H')?.tipo).toBe('ESCALERA');
  });
  it('CASO 02: 8♥ 8♣ 9♠ se rechaza', () => {
    expect(ok('8H 8C 9S')).toBeNull();
  });
  it('rechaza mezcla de pintas 4♥ 5♣ 6♥ y 9♠ 8♣ 10♠', () => {
    expect(ok('4H 5C 6H')).toBeNull();
    expect(ok('9S 8C 10S')).toBeNull();
  });
  it('acepta grupo 7♥ 7♣ 7♠ y escalera 5♥ 6♥ 7♥ 8♥', () => {
    expect(ok('7H 7C 7S')?.tipo).toBe('GRUPO');
    expect(ok('5H 6H 7H 8H')?.cartas.length).toBe(4);
  });
  it('el orden en la mano no importa', () => {
    expect(ok('7H 5H 6H')?.tipo).toBe('ESCALERA');
    expect(ok('10S 8S 9S')?.tipo).toBe('ESCALERA');
  });
  it('rechaza menos de 3 cartas y valores repetidos en escalera', () => {
    expect(ok('7H 7C')).toBeNull();
    expect(ok('5H 5H 6H')).toBeNull();
  });
  it('rechaza saltos (5♥ 6♥ 8♥)', () => {
    expect(ok('5H 6H 8H')).toBeNull();
  });
});

describe('As en escaleras (parámetro)', () => {
  it('AMBOS: A-2-3 y Q-K-A válidas, K-A-2 no (sin vuelta de esquina)', () => {
    expect(ok('AS 2S 3S')?.tipo).toBe('ESCALERA');
    expect(ok('QS KS AS')?.tipo).toBe('ESCALERA');
    expect(ok('KS AS 2S')).toBeNull();
  });
  it('BAJO: solo A-2-3', () => {
    const b = new HandEvaluator({ aceEscalera: 'BAJO' });
    expect(ok('AS 2S 3S', b)).not.toBeNull();
    expect(ok('QS KS AS', b)).toBeNull();
  });
  it('ALTO: solo Q-K-A', () => {
    const a = new HandEvaluator({ aceEscalera: 'ALTO' });
    expect(ok('AS 2S 3S', a)).toBeNull();
    expect(ok('QS KS AS', a)).not.toBeNull();
  });
});

describe('Comodines (opcionales)', () => {
  it('sustituye una carta en grupo y en escalera', () => {
    expect(ok('7H JK 7S')?.tipo).toBe('GRUPO');
    expect(ok('5H JK 7H')?.tipo).toBe('ESCALERA');
    expect(ok('5H 6H JK')?.tipo).toBe('ESCALERA');
  });
  it('exige al menos 2 cartas naturales', () => {
    const [a, j1, j2] = parseCartas('7H JK JK');
    expect(v.clasificar([a!, j1!, j2!])).toBeNull();
  });
  it('no puede completar una escalera fuera del rango (K + JK + JK sí como J-Q-K; A-K con comodín ok)', () => {
    expect(ok('KH QH JK')?.tipo).toBe('ESCALERA'); // J-Q-K o Q-K-A
    expect(ok('2H 3H JK')?.tipo).toBe('ESCALERA'); // A-2-3 o 2-3-4
  });
});

describe('mejorParticion / buscarParticionExacta', () => {
  const val = new Valoracion(1);
  it('minimiza el puntaje de las sueltas', () => {
    const p = v.mejorParticion(parseCartas('5H 6H 7H 9C 9D 9S KH'), [3, 4, 5], val.puntosDe);
    expect(p.combinaciones).toHaveLength(2);
    expect(p.sobrantes.map((c) => c.id)).toEqual(['KH#0']);
  });
  it('prefiere una escalera larga si deja menos sueltas', () => {
    const p = v.mejorParticion(parseCartas('5H 6H 7H 8H KC'), [3, 4, 5], val.puntosDe);
    expect(p.combinaciones[0]!.cartas).toHaveLength(4);
    expect(p.sobrantes).toHaveLength(1);
  });
  it('partición exacta 4-3-3 devuelve null si no existe', () => {
    const cartas = parseCartas('2H 2C 2S 2D 5H 6H 7H 9C 9D KS KH');
    expect(v.buscarParticionExacta(cartas, [{ tamano: 4, cantidad: 1 }, { tamano: 3, cantidad: 2 }], val.puntosDe)).toBeNull();
  });
  it('rendimiento: 11 cartas con 2 comodines en < 100 ms (Responsiveness)', () => {
    const cartas = parseCartas('2H 3H 4H 5D 5C JK JK 9S 10S JS KD');
    const t0 = performance.now();
    v.buscarParticionExacta(cartas, [{ tamano: 3, cantidad: 3 }], val.puntosDe);
    v.mejorParticion(cartas, [3, 4, 5], val.puntosDe);
    expect(performance.now() - t0).toBeLessThan(100);
  });
});

describe('Valoracion', () => {
  it('2-10 nominal, J/Q/K = 10, As parametrizable, comodín 0', () => {
    const c = (s: string) => parseCartas(s)[0]!;
    const a1 = new Valoracion(1);
    const a10 = new Valoracion(10);
    expect([a1.puntosDe(c('7H')), a1.puntosDe(c('KD')), a1.puntosDe(c('QS')), a1.puntosDe(c('JC')), a1.puntosDe(c('10H'))]).toEqual([7, 10, 10, 10, 10]);
    expect(a1.puntosDe(c('AS'))).toBe(1);
    expect(a10.puntosDe(c('AS'))).toBe(10);
    expect(a1.puntosDe(c('JK'))).toBe(0);
  });
});
