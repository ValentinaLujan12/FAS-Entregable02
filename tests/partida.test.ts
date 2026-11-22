import { describe, expect, it } from 'vitest';
import { parametrosPorDefecto } from '../src/kernel/config.js';
import { parseCartas } from '../src/kernel/cartas.js';
import { PartidaEnCurso } from '../src/game/PartidaEnCurso.js';
import { deps, estadoMutable, forzarMano, jugadores, nuevaPartida } from './utils.js';

const VALIDA_CLASICA = '2H 2C 2S 2D 5H 6H 7H 9C 9D 9S KH';
const TRES_TERNAS_APUNTADO = '5H 6H 7H 9C 9D 9S JC JD JH AS AD';

describe('CU-04 Iniciar partida (RF03, RF04)', () => {
  it('reparte 10 a cada jugador y 11 al inicial; voltea la primera carta del pozo', () => {
    const { partida } = nuevaPartida('CLASICA', 4);
    const r = partida.estado.ronda!;
    const tamanos = Object.values(r.manos).map((m) => m.length).sort();
    expect(tamanos).toEqual([10, 10, 10, 11]);
    expect(r.manos[r.iniciaId]).toHaveLength(11);
    expect(r.mazo.pozo).toHaveLength(1);
    expect(partida.contarCartas()).toBe(52);
    expect(partida.estado.mazosEnJuego).toBe(1);
  });
  it('el jugador inicial empieza en fase DESCARTAR (ya tiene 11 cartas)', () => {
    const { partida } = nuevaPartida('APUNTADO', 3);
    expect(partida.estado.ronda!.fase).toBe('DESCARTAR');
  });
  it('A1: rechaza sin el mínimo de jugadores e informa cuántos faltan', () => {
    const r = PartidaEnCurso.iniciar('X', parametrosPorDefecto('CLASICA'), jugadores(1), deps());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).toContain('Faltan 1');
  });
  it('5-6 jugadores usan 2 mazos automáticamente; con 1 mazo forzado no caben', () => {
    const { partida } = nuevaPartida('APUNTADO', 6);
    expect(partida.estado.mazosEnJuego).toBe(2);
    expect(partida.contarCartas()).toBe(104);
    const r = PartidaEnCurso.iniciar('X', { ...parametrosPorDefecto('APUNTADO'), mazos: 1 }, jugadores(6), deps());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe('MAZO_INSUFICIENTE');
  });
  it('comodines opcionales se agregan al mazo', () => {
    const { partida } = nuevaPartida('CLASICA', 3, { comodines: 2 });
    expect(partida.contarCartas()).toBe(54);
  });
});

describe('CU-05 Ejecutar turno (RF05, RF07)', () => {
  it('flujo completo: descartar (inicial) -> siguiente ROBAR -> robar -> descartar; conserva las cartas', () => {
    const { partida } = nuevaPartida('CLASICA', 3);
    const inicial = partida.estado.ronda!.turnoId;
    const carta = partida.manoDe(inicial)[0]!;
    expect(partida.descartar(inicial, carta.id).ok).toBe(true);
    const sig = partida.estado.ronda!.turnoId;
    expect(sig).not.toBe(inicial);
    expect(partida.estado.ronda!.fase).toBe('ROBAR');
    expect(partida.robar(sig, 'MAZO').ok).toBe(true);
    expect(partida.manoDe(sig)).toHaveLength(11);
    expect(partida.descartar(sig, partida.manoDe(sig)[3]!.id).ok).toBe(true);
    expect(partida.manoDe(sig)).toHaveLength(10);
    expect(partida.contarCartas()).toBe(52);
  });
  it('PDF Caso 03: jugador con 10 cartas roba, valida y descarta y termina con 10; la ronda continúa', () => {
    const { partida } = nuevaPartida('CLASICA', 3);
    const ini = partida.estado.ronda!.turnoId;
    partida.descartar(ini, partida.manoDe(ini)[0]!.id);
    const j = partida.estado.ronda!.turnoId;
    partida.robar(j, 'MAZO');
    forzarMano(partida, j, '5H 6H 7H 9C 9D 9S JC JD JH KH 2S');
    expect(partida.validarCombinacion(j, partida.manoDe(j).slice(0, 3).map((c) => c.id))).toMatchObject({ valida: true, tipo: 'ESCALERA' });
    partida.descartar(j, partida.manoDe(j)[10]!.id);
    expect(partida.manoDe(j)).toHaveLength(10);
    expect(partida.estado.fase).toBe('EN_CURSO');
  });
  it('rechaza acciones fuera de turno, en fase incorrecta o con carta ajena', () => {
    const { partida } = nuevaPartida('CLASICA', 3);
    const ini = partida.estado.ronda!.turnoId;
    const otro = partida.activos().find((j) => j.id !== ini)!.id;
    expect(partida.robar(otro, 'MAZO')).toMatchObject({ ok: false, codigo: 'NO_ES_TU_TURNO' });
    expect(partida.robar(ini, 'MAZO')).toMatchObject({ ok: false, codigo: 'FASE_INVALIDA' });
    expect(partida.descartar(ini, 'ZZ#9')).toMatchObject({ ok: false, codigo: 'CARTA_NO_ENCONTRADA' });
    expect(partida.descartar(otro, partida.manoDe(otro)[0]!.id)).toMatchObject({ ok: false, codigo: 'NO_ES_TU_TURNO' });
  });
  it('no se puede devolver al pozo la carta recién tomada de él', () => {
    const { partida } = nuevaPartida('CLASICA', 3);
    const ini = partida.estado.ronda!.turnoId;
    partida.descartar(ini, partida.manoDe(ini)[0]!.id);
    const j = partida.estado.ronda!.turnoId;
    const tope = partida.mazoActual().tope!;
    expect(partida.robar(j, 'POZO').ok).toBe(true);
    expect(partida.manoDe(j).some((c) => c.id === tope.id)).toBe(true);
    expect(partida.descartar(j, tope.id)).toMatchObject({ ok: false, codigo: 'DEVOLUCION_PROHIBIDA' });
  });
  it('permitirRoboPozo=false impide robar del pozo', () => {
    const { partida } = nuevaPartida('CLASICA', 3, { permitirRoboPozo: false });
    const ini = partida.estado.ronda!.turnoId;
    partida.descartar(ini, partida.manoDe(ini)[0]!.id);
    expect(partida.robar(partida.estado.ronda!.turnoId, 'POZO')).toMatchObject({ ok: false, codigo: 'ACCION_NO_PERMITIDA' });
  });
});

describe('CU-01 Cierre Clásica', () => {
  it('cierre inválido NO altera el estado y el jugador conserva el turno (RF11, A1)', () => {
    const { partida } = nuevaPartida('CLASICA', 3);
    const ini = partida.estado.ronda!.turnoId;
    const antes = JSON.stringify({ ...partida.snapshot(), seq: 0 });
    const r = partida.cerrar(ini);
    expect(r.ok && r.cierre.valido).toBe(false);
    expect(JSON.stringify({ ...partida.snapshot(), seq: 0 })).toBe(antes);
    expect(r.ok && r.eventos.map((e) => e.tipo)).toEqual(['CIERRE_RECHAZADO']);
  });
  it('cierre válido: gana la ronda, suma victoria, pasa a LIQUIDACION y el ganador inicia la siguiente ronda con 11 cartas (RF17)', () => {
    const { partida } = nuevaPartida('CLASICA', 3);
    const ini = partida.estado.ronda!.turnoId;
    forzarMano(partida, ini, VALIDA_CLASICA);
    const r = partida.cerrar(ini);
    expect(r.ok && r.cierre.valido).toBe(true);
    expect(partida.estado.fase).toBe('LIQUIDACION');
    expect(partida.estado.marcador.victorias[ini]).toBe(1);
    expect(partida.estado.liquidacion!.ganadorId).toBe(ini);
    expect(partida.estado.liquidacion!.siguienteEn).toBeGreaterThan(0);
    partida.continuar();
    expect(partida.estado.numeroRonda).toBe(2);
    expect(partida.estado.ronda!.turnoId).toBe(ini);
    expect(partida.manoDe(ini)).toHaveLength(11);
    expect(partida.contarCartas()).toBe(52);
  });
  it('gana la partida al llegar a las victorias objetivo', () => {
    const { partida } = nuevaPartida('CLASICA', 2, { victoriasObjetivo: 1 });
    const ini = partida.estado.ronda!.turnoId;
    forzarMano(partida, ini, VALIDA_CLASICA);
    partida.cerrar(ini);
    expect(partida.estado.fase).toBe('FINALIZADA');
    expect(partida.estado.final!.ganadorId).toBe(ini);
    expect(partida.estado.final!.posiciones.map((p) => p.posicion)).toEqual([1, 2]);
  });
});

describe('CU-02 / CU-03 Apuntado (liquidación y eliminación)', () => {
  it('cierre válido: solo los perdedores acumulan puntos en contra', () => {
    const { partida } = nuevaPartida('APUNTADO', 3);
    const ini = partida.estado.ronda!.turnoId;
    forzarMano(partida, ini, TRES_TERNAS_APUNTADO);
    const otros = partida.activos().map((j) => j.id).filter((id) => id !== ini);
    forzarMano(partida, otros[0]!, 'KH QD JC 9S 8D 7C 2H 4S AH 3D');
    partida.cerrar(ini);
    const m = partida.estado.marcador;
    expect(m.puntos[ini]).toBe(0);
    expect(m.puntos[otros[0]!]).toBeGreaterThan(0);
    expect(partida.estado.liquidacion!.jugadores.find((x) => x.jugadorId === otros[0])!.delta).toBe(m.puntos[otros[0]!]);
  });
  it('A1/A2 de CU-03: elimina a quien llega a 101 y declara ganador al único activo', () => {
    const { partida } = nuevaPartida('APUNTADO', 2);
    const ini = partida.estado.ronda!.turnoId;
    const otro = partida.activos().find((j) => j.id !== ini)!.id;
    estadoMutable(partida).marcador = { ...partida.estado.marcador, puntos: { [ini]: 0, [otro]: 100 } };
    forzarMano(partida, ini, TRES_TERNAS_APUNTADO);
    forzarMano(partida, otro, 'KH QD JC 9S 8D 7C 2H 4S 6H 3D');
    partida.cerrar(ini);
    expect(partida.estado.fase).toBe('FINALIZADA');
    expect(partida.estado.final!.ganadorId).toBe(ini);
    expect(partida.jugador(otro)!.eliminado).toBe(true);
    expect(partida.estado.final!.posiciones.map((p) => p.jugadorId)).toEqual([ini, otro]);
  });
  it('con 3 jugadores, el eliminado queda fuera de las siguientes rondas', () => {
    const { partida } = nuevaPartida('APUNTADO', 3);
    const ini = partida.estado.ronda!.turnoId;
    const otros = partida.activos().map((j) => j.id).filter((id) => id !== ini);
    estadoMutable(partida).marcador = { ...partida.estado.marcador, puntos: { [ini]: 0, [otros[0]!]: 100, [otros[1]!]: 0 } };
    forzarMano(partida, ini, TRES_TERNAS_APUNTADO);
    forzarMano(partida, otros[0]!, 'KH QD JC 9S 8D 7C 2H 4S 6H 3D');
    partida.cerrar(ini);
    expect(partida.estado.fase).toBe('LIQUIDACION');
    partida.continuar();
    expect(partida.activos().map((j) => j.id).sort()).toEqual([ini, otros[1]!].sort());
    expect(Object.keys(partida.estado.ronda!.manos).sort()).toEqual([ini, otros[1]!].sort());
  });
});

describe('RF08 Temporizador de turno', () => {
  it('al expirar, roba (si falta) y descarta automáticamente y cede el turno', () => {
    const { partida } = nuevaPartida('CLASICA', 3);
    const r0 = partida.estado.ronda!;
    const j0 = r0.turnoId;
    const n0 = r0.turnoN;
    const res = partida.expirarTurno(n0);
    expect(res.ok && res.eventos.map((e) => e.tipo)).toContain('TURNO_EXPIRADO');
    expect(partida.manoDe(j0)).toHaveLength(10);
    expect(partida.estado.ronda!.turnoId).not.toBe(j0);
    expect(partida.estado.ronda!.turnoN).toBe(n0 + 1);
    const sig = partida.estado.ronda!.turnoId;
    partida.expirarTurno(partida.estado.ronda!.turnoN); // fase ROBAR: roba y descarta
    expect(partida.manoDe(sig)).toHaveLength(10);
    expect(partida.contarCartas()).toBe(52);
  });
  it('un temporizador obsoleto (turnoN viejo) se ignora', () => {
    const { partida } = nuevaPartida('CLASICA', 3);
    const n0 = partida.estado.ronda!.turnoN;
    const ini = partida.estado.ronda!.turnoId;
    partida.descartar(ini, partida.manoDe(ini)[0]!.id);
    const antes = JSON.stringify(partida.snapshot());
    const r = partida.expirarTurno(n0);
    expect(r.ok && r.eventos).toEqual([]);
    expect(JSON.stringify(partida.snapshot())).toBe(antes);
  });
  it('el descarte automático no descarta un comodín si hay otra opción', () => {
    const { partida } = nuevaPartida('CLASICA', 3, { comodines: 2 });
    const ini = partida.estado.ronda!.turnoId;
    forzarMano(partida, ini, '2H 2C 2S 5H 6H 7H 9C 9D 9S KH JK');
    partida.expirarTurno(partida.estado.ronda!.turnoN);
    expect(partida.manoDe(ini).some((c) => c.esComodin)).toBe(true);
  });
  it('2 timeouts seguidos activan autopiloto; actuar lo desactiva', () => {
    const { partida } = nuevaPartida('CLASICA', 2);
    const a = partida.estado.ronda!.turnoId;
    partida.expirarTurno(partida.estado.ronda!.turnoN); // a
    partida.expirarTurno(partida.estado.ronda!.turnoN); // b
    partida.expirarTurno(partida.estado.ronda!.turnoN); // a (2º timeout)
    expect(partida.jugador(a)!.autopiloto).toBe(true);
    partida.expirarTurno(partida.estado.ronda!.turnoN); // b
    partida.robar(a, 'MAZO');
    expect(partida.jugador(a)!.autopiloto).toBe(false);
  });
  it('jugador desconectado recibe el tiempo corto', () => {
    const { partida, d } = nuevaPartida('CLASICA', 3);
    const ini = partida.estado.ronda!.turnoId;
    const sig = partida.activos().find((j) => j.id !== ini)!.id;
    partida.setConectado(sig, false);
    expect(partida.tiempoTurnoMs(sig)).toBe(8000);
    expect(partida.tiempoTurnoMs(ini)).toBe(60000);
    expect(d.relojFalso.ahora).toBeGreaterThan(0);
  });
});

describe('Tablas, recuperación y abandono', () => {
  it('mazo agotado y sin reciclajes disponibles => tablas y marcador intacto', () => {
    const { partida } = nuevaPartida('CLASICA', 2, { maxReciclajes: 0 });
    const ini = partida.estado.ronda!.turnoId;
    partida.descartar(ini, partida.manoDe(ini)[0]!.id);
    estadoMutable(partida).ronda!.mazo.mazo = [];
    const j = partida.estado.ronda!.turnoId;
    const r = partida.robar(j, 'MAZO');
    expect(r.ok && r.eventos.map((e) => e.tipo)).toContain('RONDA_TABLAS');
    expect(partida.estado.fase).toBe('LIQUIDACION');
    expect(partida.estado.liquidacion!.tablas).toBe(true);
    partida.continuar();
    expect(partida.estado.numeroRonda).toBe(2);
  });
  it('recicla el pozo cuando se agota el mazo', () => {
    const { partida } = nuevaPartida('CLASICA', 2);
    const ini = partida.estado.ronda!.turnoId;
    partida.descartar(ini, partida.manoDe(ini)[0]!.id);
    const r = estadoMutable(partida).ronda!;
    r.mazo.pozo = [...r.mazo.mazo, ...r.mazo.pozo];
    r.mazo.mazo = [];
    const res = partida.robar(r.turnoId, 'MAZO');
    expect(res.ok && res.eventos.map((e) => e.tipo)).toContain('MAZO_RECICLADO');
    expect(partida.contarCartas()).toBe(52);
  });
  it('snapshot -> restaurar conserva el estado y reinicia el temporizador (A2 de CU-04)', () => {
    const { partida, d } = nuevaPartida('APUNTADO', 3);
    const ini = partida.estado.ronda!.turnoId;
    partida.descartar(ini, partida.manoDe(ini)[0]!.id);
    const snap = JSON.parse(JSON.stringify(partida.snapshot()));
    const otra = PartidaEnCurso.restaurar(snap, d);
    expect(otra.estado.ronda!.turnoId).toBe(partida.estado.ronda!.turnoId);
    expect(otra.estado.ronda!.venceEn).toBeGreaterThan(0);
    expect(otra.activos().every((j) => j.conectado === j.esBot)).toBe(true);
    const sig = otra.estado.ronda!.turnoId;
    expect(otra.robar(sig, 'MAZO').ok).toBe(true);
  });
  it('abandonar convierte al jugador en bot y la partida continúa', () => {
    const { partida } = nuevaPartida('CLASICA', 3);
    const ini = partida.estado.ronda!.turnoId;
    partida.abandonar(ini);
    expect(partida.jugador(ini)!.esBot).toBe(true);
  });
  it('los eventos tienen seq estrictamente creciente', () => {
    const { partida, eventos } = nuevaPartida('CLASICA', 3);
    const ini = partida.estado.ronda!.turnoId;
    const r = partida.descartar(ini, partida.manoDe(ini)[0]!.id);
    const todos = [...eventos, ...(r.ok ? r.eventos : [])];
    for (let i = 1; i < todos.length; i++) expect(todos[i]!.seq).toBeGreaterThan(todos[i - 1]!.seq);
  });
  it('parseCartas del pozo inicial es una carta válida', () => {
    const { partida } = nuevaPartida('CLASICA', 3);
    expect(partida.mazoActual().tope).not.toBeNull();
    expect(parseCartas('AH')).toHaveLength(1);
  });
});
