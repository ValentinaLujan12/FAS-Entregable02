import { describe, expect, it } from 'vitest';
import { type Carta, parseCartas } from '../src/kernel/cartas.js';
import { type ParametrosModalidad, parametrosPorDefecto } from '../src/kernel/config.js';
import { Mano } from '../src/kernel/mano.js';
import { marcadorInicial } from '../src/kernel/marcador.js';
import type { EventoJuego } from '../src/kernel/protocolo.js';
import { PartidaEnCurso } from '../src/game/PartidaEnCurso.js';
import type { EntradaEvaluacion, IReglaJuego, ResultadoCierre, ResultadoPartida } from '../src/rules/IReglaJuego.js';
import { ReglaBase } from '../src/rules/ReglaBase.js';
import { RegistroReglas, crearRegistroReglas } from '../src/rules/RegistroReglas.js';
import { extrasPorDefecto } from '../src/extras/composicion.js';
import { medirLatencia } from '../tools/medir-latencia.js';
import { deps, jugadores } from './utils.js';
import { ClienteFalso, crearServicio } from './utilsServicio.js';

/*
 * Funciones de idoneidad del núcleo de reglas (Entregable 2, Anexo E.1): extensibilidad (G6), calidad del núcleo (G7)
 * y coherencia del marcador (G8).
 */

/**
 * Modalidad de PRUEBA que solo existe en el código de pruebas (FF-11): cierra con cualquier mano completa y termina la
 * partida tras la primera ronda. Se agrega con una clase y un registro, sin tocar ningún archivo de src/.
 */
class ReglaPrueba extends ReglaBase {
  getModalidad() {
    return 'PRUEBA' as never;
  }
  tamanosObjetivo(): readonly number[] {
    return [3];
  }
  validarVictoria(mano: Mano): ResultadoCierre {
    return this.manoIncompleta(mano) ?? { valido: true, detalle: 'Cierre de prueba', particion: this.particionResidual(mano.cartas), descarte: null, sobrante: 0, deltaCerrador: 0 };
  }
  protected deltaRonda(esGanador: boolean, puntos: number): number {
    return esGanador ? 0 : puntos;
  }
  evaluarPartida(e: EntradaEvaluacion): ResultadoPartida {
    return { finalizada: true, ganadorId: e.ganadorRondaId!, eliminados: [], motivoFin: 'Fin de la modalidad de prueba' };
  }
}

const paramsPrueba = (): ParametrosModalidad => ({ ...parametrosPorDefecto('CLASICA'), modalidad: 'PRUEBA' as never });

describe('FF-11 (G6): una modalidad nueva recorre el flujo completo sin modificar el núcleo', () => {
  it('ReglaPrueba (solo en pruebas) inicia, cierra, liquida y termina una partida a través del orquestador de partida', () => {
    const motor = crearRegistroReglas().registrar('PRUEBA', (p) => new ReglaPrueba(p));
    const r = PartidaEnCurso.iniciar('PRUEBA', paramsPrueba(), jugadores(3), { ...deps(), motor });
    if (!r.ok) throw new Error(r.mensaje);
    const p = r.partida;
    const quien = p.estado.ronda!.turnoId;
    const cierre = p.cerrar(quien);
    expect(cierre.ok && cierre.cierre.valido).toBe(true);
    expect(p.estado.fase).toBe('FINALIZADA');
    expect(p.estado.final?.ganadorId).toBe(quien);
    const perdedores = p.estado.jugadores.filter((j) => j.id !== quien);
    for (const j of perdedores) expect(p.estado.marcador.puntos[j.id]).toBeGreaterThanOrEqual(0);
    expect(motor.modalidades()).toContain('PRUEBA');
  });
});

/** Suite contractual común (FF-12): toda implementación de IReglaJuego debe cumplir estas propiedades. */
const ESTRATEGIAS: Array<[string, () => IReglaJuego]> = [
  ['CLASICA', () => crearRegistroReglas().reglaPara(parametrosPorDefecto('CLASICA'))],
  ['APUNTADO', () => crearRegistroReglas().reglaPara(parametrosPorDefecto('APUNTADO'))],
  ['APUNTADO estricto', () => crearRegistroReglas().reglaPara({ ...parametrosPorDefecto('APUNTADO'), permitirCierreConSobrante: false })],
  ['APUNTADO cuarta como terna', () => crearRegistroReglas().reglaPara({ ...parametrosPorDefecto('APUNTADO'), cuartaCuentaComoTerna: true })],
  ['PRUEBA (solo en pruebas)', () => new ReglaPrueba(paramsPrueba())],
];

const MANOS = ['2H 2C 2S 2D 5H 6H 7H 9C 9D 9S KH', '2H 4C 6S 8D 10H QC KS AD 3H 5C 7S', 'AH 2H 3H 4C 4D 4S 9H 9C 9S QD KD'];
const multiconjunto = (cs: readonly Carta[]) => cs.map((c) => c.id).sort();

describe.each(ESTRATEGIAS)('FF-12 (G6): contrato común de IReglaJuego - %s', (_nombre, crear) => {
  const regla = crear();

  it('exige la mano completa (10 + robo) y rechaza la incompleta sin lanzar excepciones', () => {
    expect(regla.cartasParaCerrar()).toBe(regla.parametros().cartasPorMano + 1);
    const corta = regla.validarVictoria(Mano.de(parseCartas('2H 2C 2S')));
    expect(corta.valido).toBe(false);
    expect(corta.motivo).toBe('MANO_INCOMPLETA');
  });

  it('validar no modifica la mano y explica siempre el resultado', () => {
    for (const texto of MANOS) {
      const cartas = parseCartas(texto);
      const copia = structuredClone(cartas);
      const r = regla.validarVictoria(Mano.de(cartas));
      expect(cartas).toEqual(copia);
      expect(r.detalle.length).toBeGreaterThan(0);
      if (r.valido) expect(r.particion).toBeDefined();
    }
  });

  it('la partición residual conserva exactamente las cartas de la mano y los puntos nunca son negativos', () => {
    for (const texto of MANOS) {
      const cartas = parseCartas(texto);
      const p = regla.particionResidual(cartas);
      expect(multiconjunto([...p.combinaciones.flatMap((c) => c.cartas), ...p.sobrantes])).toEqual(multiconjunto(cartas));
      for (const c of p.combinaciones) expect(regla.clasificarCombinacion(c.cartas)).not.toBeNull();
      expect(regla.calcularPuntos(p.sobrantes)).toBeGreaterThanOrEqual(0);
    }
  });

  it('la liquidación devuelve una fila por mano, el ganador no suma puntos y gana la ronda', () => {
    const manos = new Map<string, readonly Carta[]>([
      ['a', parseCartas(MANOS[0]!)],
      ['b', parseCartas(MANOS[1]!)],
      ['c', parseCartas(MANOS[2]!)],
    ]);
    const cierre = regla.validarVictoria(Mano.de(manos.get('a')!));
    const s = regla.liquidarRonda({ ganadorId: 'a', cierre, manos });
    expect(s.detalle.map((d) => d.jugadorId).sort()).toEqual(['a', 'b', 'c']);
    expect(s.detalle.find((d) => d.jugadorId === 'a')!.delta).toBe(0);
    for (const d of s.detalle) expect(d.delta).toBeGreaterThanOrEqual(0);
    expect(s.victoriasRonda).toContain('a');
  });

  it('con el marcador inicial la partida no termina por eliminación', () => {
    const r = regla.evaluarPartida({ marcador: marcadorInicial(['a', 'b']), activos: ['a', 'b'], ronda: 1, ganadorRondaId: null });
    expect(r.eliminados).toEqual([]);
  });
});

describe('FF-13 (G6): consistencia entre la configuración y el registro', () => {
  it('un registro vacío rechaza cualquier modalidad con un error controlado', () => {
    expect(() => new RegistroReglas().reglaPara(parametrosPorDefecto('CLASICA'))).toThrow(/no registrada/);
  });
});

describe('FF-14 (G6): aislamiento entre partidas simultáneas', () => {
  it('una partida Clásica y una Apuntado en el mismo servicio no comparten estado, mazo ni marcador', async () => {
    const { servicio, programador, enviar } = crearServicio({ semilla: 11, retardoBot: [10, 10] });
    const a = new ClienteFalso();
    const b = new ClienteFalso();
    await enviar(a, { t: 'crear_sala', nombre: 'Ana', modalidad: 'CLASICA', parametros: { tiempoTurnoSeg: 10 } });
    await enviar(b, { t: 'crear_sala', nombre: 'Beto', modalidad: 'APUNTADO', parametros: { tiempoTurnoSeg: 10 } });
    const [codA, codB] = [a.codigo!, b.codigo!];
    expect(a.errores()).toEqual([]);
    for (const c of [a, b]) {
      await enviar(c, { t: 'agregar_bot' });
      await enviar(c, { t: 'agregar_bot' });
      await enviar(c, { t: 'iniciar' });
    }
    for (let i = 0; i < 60; i++) programador.avanzar(11_000);
    const pa = servicio.inspeccionar(codA)!.partida!;
    const pb = servicio.inspeccionar(codB)!.partida!;
    expect(pa.reglaActiva.getModalidad()).toBe('CLASICA');
    expect(pb.reglaActiva.getModalidad()).toBe('APUNTADO');
    expect(Object.values(pa.estado.marcador.puntos).every((x) => x === 0)).toBe(true); // Clásica no acumula puntos
    expect(pa.estado.jugadores.filter((j) => pb.estado.jugadores.some((x) => x.id === j.id))).toEqual([]);
    for (const p of [pa, pb]) if (p.estado.fase === 'EN_CURSO') expect(p.contarCartas()).toBe(52 * p.estado.mazosEnJuego);
    const salasDe = (c: ClienteFalso) => new Set(c.recibidos.flatMap((m) => (m.t === 'estado' ? [m.vista.codigo] : [])));
    expect(salasDe(a)).toEqual(new Set([codA]));
    expect(salasDe(b)).toEqual(new Set([codB]));
    expect(codA).not.toBe(codB);
  });
});

describe('FF-16 (G7): latencia de validación y cómputo de una mano de 11 cartas', () => {
  it('p99 y peor caso por debajo de 100 ms en todas las modalidades (manos aleatorias y adversas)', () => {
    const resultados = medirLatencia(600);
    for (const r of resultados) {
      expect(r.p99, r.escenario).toBeLessThan(100);
      expect(r.max, r.escenario).toBeLessThan(100);
    }
  });
});

/** Juega una partida completa solo con bots y devuelve los eventos y la partida final. */
function partidaDeBots(semilla: number): { eventos: EventoJuego[]; partida: PartidaEnCurso } {
  const r = PartidaEnCurso.iniciar('BOTS', parametrosPorDefecto('APUNTADO'), jugadores(4, true), deps(semilla));
  if (!r.ok) throw new Error(r.mensaje);
  const p = r.partida;
  const eventos = [...r.eventos];
  for (let paso = 0; paso < 5000 && p.estado.fase !== 'FINALIZADA'; paso++) {
    if (p.estado.fase === 'LIQUIDACION') {
      const c = p.continuar();
      if (c.ok) eventos.push(...c.eventos);
      continue;
    }
    const id = p.estado.ronda!.turnoId;
    const a = extrasPorDefecto.bots.decidir(p, id)!;
    const res = a.tipo === 'ROBAR' ? p.robar(id, a.origen, true) : a.tipo === 'CERRAR' ? p.cerrar(id, true) : p.descartar(id, a.cartaId, true);
    if (res.ok) eventos.push(...res.eventos);
  }
  return { eventos, partida: p };
}

describe('FF-20 (G8): el acumulado es la suma de las penalizaciones de cada ronda', () => {
  it.each([3, 17, 29])('partida Apuntado completa con bots (semilla %i)', (semilla) => {
    const { eventos, partida } = partidaDeBots(semilla);
    expect(partida.estado.fase).toBe('FINALIZADA');
    const suma: Record<string, number> = {};
    for (const e of eventos.filter((x) => x.tipo === 'RONDA_LIQUIDADA')) {
      const deltas = e.datos.deltas as Record<string, number>;
      for (const [id, d] of Object.entries(deltas)) suma[id] = (suma[id] ?? 0) + d;
      expect(e.datos.acumulados).toEqual(expect.objectContaining(suma));
    }
    for (const j of partida.estado.jugadores) expect(partida.estado.marcador.puntos[j.id]).toBe(suma[j.id] ?? 0);
  });
});
