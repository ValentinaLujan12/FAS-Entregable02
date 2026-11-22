import { describe, expect, it } from 'vitest';
import { parseCartas } from '../src/kernel/cartas.js';
import { Mano } from '../src/kernel/mano.js';
import { normalizarParametros, parametrosPorDefecto } from '../src/kernel/config.js';
import { marcadorInicial } from '../src/kernel/marcador.js';
import { crearRegistroReglas, RegistroReglas } from '../src/rules/RegistroReglas.js';
import type { IReglaJuego } from '../src/rules/IReglaJuego.js';
import { ReglaClasicaCuartaTerna } from '../src/rules/ReglaClasicaCuartaTerna.js';
import { ReglaApuntado101Puntos } from '../src/rules/ReglaApuntado101Puntos.js';

const m = (s: string) => Mano.de(parseCartas(s));
const clasica = new ReglaClasicaCuartaTerna(parametrosPorDefecto('CLASICA'));
const apuntado = new ReglaApuntado101Puntos(parametrosPorDefecto('APUNTADO'));

describe('Clásica 4-3-3 (CU-01, RF09)', () => {
  const valida = '2H 2C 2S 2D 5H 6H 7H 9C 9D 9S KH'; // cuarta + escalera + grupo + descarte KH
  it('acepta 1 cuarta + 2 ternas + 1 descarte', () => {
    const r = clasica.validarVictoria(m(valida));
    expect(r.valido).toBe(true);
    expect(r.tipo).toBe('CLASICA_4_3_3');
    expect(r.descarte?.id).toBe('KH#0');
  });
  it('REGRESIÓN: cuarta + cuarta + terna (11 cartas) se muestra completa, sin "sobrante" artificial', () => {
    const r = clasica.validarVictoria(m('KS KH KC KD 4C 4S 4D 4H 9C 10C JC'));
    expect(r.valido).toBe(true);
    expect(r.particion?.sobrantes).toHaveLength(0);
    expect(r.particion?.combinaciones.map((c) => c.cartas.length).sort()).toEqual([3, 4, 4]);
    const e = new ReglaApuntado101Puntos({ ...parametrosPorDefecto('APUNTADO'), permitirCierreConSobrante: false });
    const r2 = e.validarVictoria(m('KS KH KC KD 4C 4S 4D 4H 9C 10C JC'));
    expect(r2.valido).toBe(true);
    expect(r2.particion?.sobrantes).toHaveLength(0);
  });
  it('acepta cuarta en escalera', () => {
    expect(clasica.validarVictoria(m('4S 5S 6S 7S 9C 9D 9H JC JD JS 2H')).valido).toBe(true);
  });
  it('rechaza con SIN_COMBINACION_VALIDA cuando faltan combinaciones', () => {
    const r = clasica.validarVictoria(m('2H 2C 2S 2D 5H 6H 7H 9C 9D KS KH'));
    expect(r.valido).toBe(false);
    expect(r.motivo).toBe('SIN_COMBINACION_VALIDA');
  });
  it('rechaza mano con tamaño incorrecto', () => {
    expect(clasica.validarVictoria(m('2H 2C 2S')).motivo).toBe('MANO_INCOMPLETA');
  });
  it('3 ternas + 1 cuarta + ninguna sobrante (10 cartas + 1) no cuenta como 4-3-3 si no hay cuarta', () => {
    expect(clasica.validarVictoria(m('2H 2C 2S 5H 6H 7H 9C 9D 9S JC JD')).valido).toBe(false);
  });
  it('no penaliza: calcularPuntos = 0 y solo suma una victoria (ADR-02)', () => {
    expect(clasica.calcularPuntos(parseCartas('KH QH'))).toBe(0);
    const cierre = clasica.validarVictoria(m(valida));
    const manos = new Map([
      ['a', parseCartas(valida)],
      ['b', parseCartas('AH 3C 5D 7S 9H JC KD 2S 4H 6D')],
    ]);
    const s = clasica.liquidarRonda({ ganadorId: 'a', cierre, manos });
    expect(s.victoriasRonda).toEqual(['a']);
    expect(s.detalle.every((d) => d.delta === 0)).toBe(true);
  });
  it('gana la partida al alcanzar las victorias objetivo', () => {
    const base = marcadorInicial(['a', 'b']);
    const e = { marcador: { ...base, victorias: { a: 3, b: 1 } }, activos: ['a', 'b'], ronda: 4, ganadorRondaId: 'a' };
    expect(clasica.evaluarPartida(e)).toMatchObject({ finalizada: true, ganadorId: 'a' });
    expect(clasica.evaluarPartida({ ...e, marcador: { ...base, victorias: { a: 2, b: 1 } } }).finalizada).toBe(false);
  });
});

describe('Apuntado a 101 (CU-02, CU-03, RF10, RF13-RF16)', () => {
  const tresTernas = '5H 6H 7H 9C 9D 9S JC JD JH';
  it('acepta 3 ternas con sobrante < 5 (A+A = 2)', () => {
    const r = apuntado.validarVictoria(m(`${tresTernas} AS AD`));
    expect(r.valido).toBe(true);
    expect(r.sobrante).toBe(2);
  });
  it('sobrante EXACTAMENTE 5 se rechaza (estrictamente menor)', () => {
    const r = apuntado.validarVictoria(m(`${tresTernas} 2S 3D`));
    expect(r.valido).toBe(false);
    expect(r.motivo).toBe('SOBRANTE_EXCEDE_LIMITE');
    expect(r.detalle).toContain('5 puntos');
  });
  it('sobrante 4 se acepta', () => {
    expect(apuntado.validarVictoria(m(`${tresTernas} 2S 2D`)).valido).toBe(true);
  });
  it('A2 de CU-02: rechazo diferenciado por sobrante vs. por combinación (A1)', () => {
    expect(apuntado.validarVictoria(m(`${tresTernas} KS QD`)).motivo).toBe('SOBRANTE_EXCEDE_LIMITE');
    expect(apuntado.validarVictoria(m('5H 6H 7H 9C 9D 9S JC KD 2H 3S 4D')).motivo).toBe('SIN_COMBINACION_VALIDA');
  });
  it('el valor del As es parámetro: con As=10 el sobrante A+A=20 se rechaza', () => {
    const conAs10 = new ReglaApuntado101Puntos({ ...parametrosPorDefecto('APUNTADO'), valorAs: 10 });
    expect(conAs10.validarVictoria(m(`${tresTernas} AS AD`)).valido).toBe(false);
  });
  it('liquidación: solo los perdedores acumulan el valor de sus cartas sueltas', () => {
    const cierre = apuntado.validarVictoria(m(`${tresTernas} AS AD`));
    const manos = new Map([
      ['ana', parseCartas(`${tresTernas} AS AD`)],
      ['beto', parseCartas('9C KD AS 2H 3C 4D 8S QH 5C 7D')], // sin combinaciones
    ]);
    const s = apuntado.liquidarRonda({ ganadorId: 'ana', cierre, manos });
    const d = Object.fromEntries(s.detalle.map((x) => [x.jugadorId, x.delta]));
    expect(d['ana']).toBe(0);
    expect(d['beto']).toBe(9 + 10 + 1 + 2 + 3 + 4 + 8 + 10 + 5 + 7);
  });
  it('elimina a quien alcanza 101 y declara ganador al último activo (A1/A2 de CU-03)', () => {
    const base = marcadorInicial(['a', 'b', 'c']);
    const marc = { ...base, puntos: { a: 20, b: 101, c: 130 } };
    const r = apuntado.evaluarPartida({ marcador: marc, activos: ['a', 'b', 'c'], ronda: 5, ganadorRondaId: 'a' });
    expect([...r.eliminados].sort()).toEqual(['b', 'c']);
    expect(r).toMatchObject({ finalizada: true, ganadorId: 'a' });
    const sigue = apuntado.evaluarPartida({ marcador: { ...base, puntos: { a: 20, b: 101, c: 40 } }, activos: ['a', 'b', 'c'], ronda: 5, ganadorRondaId: 'a' });
    expect(sigue.finalizada).toBe(false);
    expect(sigue.eliminados).toEqual(['b']);
  });
});

describe('Apuntado a 101 - parámetro cuartaCuentaComoTerna', () => {
  // 2222 + 3333 + 4H 5H 6H: con cuartas cierra sin sobrante; con solo ternas (222, 333, 456) sobran 2 + 3 = 5 puntos.
  const conCuartas = '2H 2C 2S 2D 3H 3C 3S 3D 4H 5H 6H';
  const conCuartaTerna = new ReglaApuntado101Puntos({ ...parametrosPorDefecto('APUNTADO'), cuartaCuentaComoTerna: true });

  it('viene desactivado por defecto: exige exactamente 3 ternas, como la guía, y la mano con cuartas no cierra', () => {
    expect(parametrosPorDefecto('APUNTADO').cuartaCuentaComoTerna).toBe(false);
    expect(apuntado.validarVictoria(m(conCuartas)).valido).toBe(false);
    expect(apuntado.validarVictoria(m('5H 6H 7H 9C 9D 9S JC JD JH AS AD')).valido).toBe(true);
    expect(apuntado.tamanosObjetivo()).toEqual([3]);
  });
  it('activado: una cuarta cuenta como una de las 3 combinaciones y la misma mano cierra', () => {
    expect(conCuartaTerna.validarVictoria(m(conCuartas)).valido).toBe(true);
    expect(conCuartaTerna.tamanosObjetivo()).toEqual([3, 4, 5]);
  });
  it('se normaliza como booleano (otro valor = por defecto)', () => {
    expect(normalizarParametros('APUNTADO', { cuartaCuentaComoTerna: true }).cuartaCuentaComoTerna).toBe(true);
    expect(normalizarParametros('APUNTADO', { cuartaCuentaComoTerna: 'si' }).cuartaCuentaComoTerna).toBe(false);
  });
});

describe('Apuntado a 101 - interruptor "Cerrar con sobrante" (permitirCierreConSobrante)', () => {
  const tresTernas = '5H 6H 7H 9C 9D 9S JC JD JH';
  const estricto = new ReglaApuntado101Puntos({ ...parametrosPorDefecto('APUNTADO'), permitirCierreConSobrante: false });
  const conCuarta = new ReglaApuntado101Puntos({ ...parametrosPorDefecto('APUNTADO'), cuartaCuentaComoTerna: true });

  it('viene ACTIVADO por defecto en las tres modalidades (según el PDF P01)', () => {
    for (const mod of ['CLASICA', 'APUNTADO'] as const) {
      expect(parametrosPorDefecto(mod).permitirCierreConSobrante).toBe(true);
    }
  });
  it('activado: 3 ternas + par bajo cierra (comportamiento previo)', () => {
    expect(apuntado.validarVictoria(m(`${tresTernas} AS AD`)).valido).toBe(true);
  });
  it('desactivado: 3 ternas + 2 sobrantes que suman < 5 YA NO cierra', () => {
    const r = estricto.validarVictoria(m(`${tresTernas} AS AD`));
    expect(r.valido).toBe(false);
    expect(r.motivo).toBe('SIN_COMBINACION_VALIDA');
    expect(r.detalle).toContain('cuarta');
  });
  it('desactivado: cuarta + 2 ternas + descarte libre SÍ cierra (el descarte puede valer mucho)', () => {
    const r = estricto.validarVictoria(m('5H 6H 7H 8H 9C 9D 9S JC JD JH KS'));
    expect(r.valido).toBe(true);
    expect(r.descarte?.id).toBe('KS#0');
    expect(r.sobrante).toBe(0);
  });
  it('desactivado: también valen quinta + 2 ternas y cuarta + cuarta + terna (como la Clásica)', () => {
    expect(estricto.validarVictoria(m('4H 5H 6H 7H 8H 9C 9D 9S KC KD KS')).valido).toBe(true);
    expect(estricto.validarVictoria(m('4H 5H 6H 7H 9C 9D 9S 9H KC KD KS')).valido).toBe(true);
  });
  it('desactivado: los bots/autodescarte persiguen cuartas y ternas; activado solo ternas (o hasta quintas si la cuarta cuenta)', () => {
    expect(estricto.tamanosObjetivo()).toEqual([3, 4]);
    expect(apuntado.tamanosObjetivo()).toEqual([3]);
    expect(conCuarta.tamanosObjetivo()).toEqual([3, 4, 5]);
  });
  it('activado con cuarta como terna: cuarta + 2 ternas + 1 sobrante (<5) es UNA combinación válida (no "terna + sobrante extra")', () => {
    const r = conCuarta.validarVictoria(m('4H 5H 6H 7H 9C 9D 9S KC KD KS 2S'));
    expect(r.valido).toBe(true);
    expect(r.sobrante).toBe(2);
    expect(r.detalle).toContain('1 cuarta + 2 ternas');
  });
  it('activado con cuarta como terna: 4-4-3 y 5-3-3 también cierran', () => {
    expect(conCuarta.validarVictoria(m('4H 5H 6H 7H 9C 9D 9S 9H KC KD KS')).valido).toBe(true);
    expect(conCuarta.validarVictoria(m('4H 5H 6H 7H 8H 9C 9D 9S KC KD KS')).valido).toBe(true);
  });
  it('activado con cuarta como terna: cuarta + 2 ternas con sobrante >= 5 se rechaza por el límite', () => {
    const r = conCuarta.validarVictoria(m('4H 5H 6H 7H 9C 9D 9S KC KD KS 6S'));
    expect(r.valido).toBe(false);
    expect(r.motivo).toBe('SOBRANTE_EXCEDE_LIMITE');
  });
  it('activado: 3 ternas + 2 sobrantes < 5 sigue cerrando', () => {
    expect(apuntado.validarVictoria(m(`${tresTernas} AS AD`)).valido).toBe(true);
  });
  it('desactivado: la liquidación sigue siendo de Apuntado (perdedores suman sueltas, ganador 0)', () => {
    const cierre = estricto.validarVictoria(m('5H 6H 7H 8H 9C 9D 9S JC JD JH 2S'));
    const manos = new Map([
      ['ana', parseCartas('5H 6H 7H 8H 9C 9D 9S JC JD JH 2S')],
      ['beto', parseCartas('9C KD AS 2H 3C 4D 8S QH 5C 7D')],
    ]);
    const d = Object.fromEntries(estricto.liquidarRonda({ ganadorId: 'ana', cierre, manos }).detalle.map((x) => [x.jugadorId, x.delta]));
    expect(d['ana']).toBe(0);
    expect(d['beto']).toBe(9 + 10 + 1 + 2 + 3 + 4 + 8 + 10 + 5 + 7);
  });
  it('normalizarParametros acepta el booleano y descarta valores inválidos', () => {
    expect(normalizarParametros('APUNTADO', { permitirCierreConSobrante: false }).permitirCierreConSobrante).toBe(false);
    expect(normalizarParametros('APUNTADO', { permitirCierreConSobrante: 'no' }).permitirCierreConSobrante).toBe(true);
    expect(normalizarParametros('APUNTADO', undefined).permitirCierreConSobrante).toBe(true);
  });
});

describe('RegistroReglas - Strategy y Open/Closed (ADR-02)', () => {
  it('resuelve la regla por modalidad y valida sin condicionales', () => {
    const motor = crearRegistroReglas();
    expect(motor.modalidades().sort()).toEqual(['APUNTADO', 'CLASICA']);
    const mano = m('2H 2C 2S 2D 5H 6H 7H 9C 9D 9S KH');
    expect(motor.reglaPara(parametrosPorDefecto('CLASICA')).validarVictoria(mano).valido).toBe(true);
    expect(motor.reglaPara(parametrosPorDefecto('APUNTADO')).validarVictoria(mano).valido).toBe(false);
  });
  it('una 4ª modalidad se agrega como clase nueva + 1 línea de registro, sin tocar RegistroReglas', () => {
    class ReglaFusion implements IReglaJuego {
      getModalidad() { return 'CLASICA' as const; }
      cartasParaCerrar() { return 11; }
      tamanosObjetivo() { return [3]; }
      validarVictoria() { return { valido: true, detalle: 'fusión' } as const; }
      clasificarCombinacion() { return null; }
      parametros() { return parametrosPorDefecto('CLASICA'); }
      particionResidual() { return { combinaciones: [], sobrantes: [] }; }
      calcularPuntos() { return 0; }
      liquidarRonda() { return { detalle: [], victoriasRonda: [] }; }
      evaluarPartida() { return { finalizada: false, eliminados: [] }; }
    }
    const motor = new RegistroReglas().registrar('FUSION', () => new ReglaFusion());
    expect(motor.reglaPara({ ...parametrosPorDefecto('CLASICA'), modalidad: 'FUSION' as never }).validarVictoria(m('AH')).detalle).toBe('fusión');
  });
  it('modalidad no registrada lanza error controlado', () => {
    expect(() => new RegistroReglas().reglaPara(parametrosPorDefecto('CLASICA'))).toThrow(/no registrada/);
  });
  it('benchmark: validar una mano de 11 cartas en < 100 ms en las 2 modalidades', () => {
    const motor = crearRegistroReglas();
    const mano = m('2H 3H 4H 5D 5C 9S 10S JS KD QH 7C');
    for (const mod of ['CLASICA', 'APUNTADO'] as const) {
      const t0 = performance.now();
      motor.reglaPara(parametrosPorDefecto(mod)).validarVictoria(mano);
      expect(performance.now() - t0).toBeLessThan(100);
    }
  });
});
