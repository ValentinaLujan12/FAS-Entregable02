import { describe, expect, it } from 'vitest';
import { parsearMensaje } from '../src/infra/mensajes.js';
import type { MensajeServidor } from '../src/kernel/protocolo.js';
import { MANO_GANADORA_CLASICA, JugadorHttp, entornoProcesador, forzarTurnoConMano, salaIniciada } from './utilsProcesador.js';

/*
 * Funciones de idoneidad operacionales del Entregable 2 (Anexo E.1) sobre el procesador serverless real
 * (Procesador + TurnOrchestrator + almacén con las mismas reglas que guardar_sala_atomica).
 */

const cierres = <T extends { tipo: string }>(eventos: readonly T[]): T[] => eventos.filter((e) => e.tipo === 'CIERRE_ACEPTADO');

describe('FF-17 (G8): concurrencia en el cierre', () => {
  it('dos peticiones de cierre simultáneas: exactamente una gana y la otra recibe un rechazo', async () => {
    const { proc, almacen } = entornoProcesador();
    const ana = await salaIniciada(proc, 'CLASICA', 1, { victoriasObjetivo: 3 });
    await forzarTurnoConMano(almacen, ana.codigo!, ana.id!, MANO_GANADORA_CLASICA);
    const otraPestana = Object.assign(new JugadorHttp(proc, 'Ana (otra pestaña)'), { codigo: ana.codigo, token: ana.token, id: ana.id });

    await Promise.all([ana.llamar({ t: 'cerrar' }), otraPestana.llamar({ t: 'cerrar' })]);

    expect(cierres(almacen.eventosDe(ana.codigo!))).toHaveLength(1);
    expect([...ana.errores, ...otraPestana.errores]).toContain('FASE_INVALIDA');
    expect(almacen.registro).toContain('conflicto'); // la segunda escritura llegó con una versión vieja y se reintentó
  });
});

describe('FF-18 (G8): rechazo de jugadas en rondas cerradas o en salas ajenas', () => {
  it('con la ronda ya liquidada no se puede robar, descartar ni volver a cerrar', async () => {
    const { proc, almacen } = entornoProcesador();
    const ana = await salaIniciada(proc, 'CLASICA', 1, { victoriasObjetivo: 3 });
    await forzarTurnoConMano(almacen, ana.codigo!, ana.id!, MANO_GANADORA_CLASICA);
    await ana.llamar({ t: 'cerrar' });
    expect(ana.vista?.fase).toBe('LIQUIDACION');
    ana.errores = [];
    await ana.llamar({ t: 'robar', origen: 'MAZO' });
    await ana.llamar({ t: 'descartar', cartaId: '2H' });
    await ana.llamar({ t: 'cerrar' });
    expect(ana.errores).toEqual(['FASE_INVALIDA', 'FASE_INVALIDA', 'FASE_INVALIDA']);
    expect(cierres(almacen.eventosDe(ana.codigo!))).toHaveLength(1);
  });

  it('el token de una sala no sirve para jugar en otra', async () => {
    const { proc, almacen } = entornoProcesador();
    const ana = await salaIniciada(proc, 'CLASICA');
    const beto = await salaIniciada(proc, 'APUNTADO');
    const antes = (await almacen.leerSala(beto.codigo!))!.datos.snapshot!.ronda!.manos;
    const intruso = Object.assign(new JugadorHttp(proc, 'intruso'), { codigo: beto.codigo, token: ana.token });
    await intruso.llamar({ t: 'robar', origen: 'MAZO' });
    await intruso.llamar({ t: 'cerrar' });
    expect(intruso.errores).toEqual(['SIN_SESION', 'SIN_SESION']);
    expect((await almacen.leerSala(beto.codigo!))!.datos.snapshot!.ronda!.manos).toEqual(antes);
  });
});

describe('FF-19 (G8): auditoría de cierres y liquidaciones', () => {
  it('cada ronda liquidada tiene exactamente un cierre aceptado, también en la revancha de la misma sala', async () => {
    const { proc, almacen } = entornoProcesador();
    const ana = await salaIniciada(proc, 'CLASICA', 1, { victoriasObjetivo: 2 });
    const cerrarRonda = async () => {
      await forzarTurnoConMano(almacen, ana.codigo!, ana.id!, MANO_GANADORA_CLASICA);
      await ana.llamar({ t: 'cerrar' });
    };
    await cerrarRonda();
    await ana.llamar({ t: 'continuar' });
    await cerrarRonda();
    expect(ana.vista?.fase).toBe('FINALIZADA');
    // Revancha: la segunda partida reinicia las rondas; su primer cierre no puede chocar con el de la primera partida.
    await ana.llamar({ t: 'nueva_partida' });
    await ana.llamar({ t: 'iniciar' });
    await cerrarRonda();
    expect(ana.errores).toEqual([]);

    const ev = almacen.eventosDe(ana.codigo!);
    const clave = (e: { ronda: number; detalle: unknown }) => `${(e.detalle as { partida?: number }).partida ?? '?'}:${e.ronda}`;
    const cerradas = cierres(ev).map(clave);
    const liquidadas = ev.filter((e) => e.tipo === 'RONDA_LIQUIDADA').map((e) => e.ronda);
    expect(cerradas).toEqual(['1:1', '1:2', '2:1']);
    expect(new Set(cerradas).size).toBe(cerradas.length);
    expect(liquidadas).toHaveLength(cerradas.length);
  });
});

describe('FF-21 / FF-22 (G8): recuperación tras una caída durante la escritura', () => {
  it('una caída no deja estado parcial y la siguiente petición continúa desde el último estado consistente', async () => {
    const { proc, almacen } = entornoProcesador();
    const ana = await salaIniciada(proc, 'CLASICA', 1, { victoriasObjetivo: 3 });
    await forzarTurnoConMano(almacen, ana.codigo!, ana.id!, MANO_GANADORA_CLASICA);
    const antes = (await almacen.leerSala(ana.codigo!))!;
    const eventosAntes = almacen.eventosDe(ana.codigo!).length;

    almacen.fallarProxima = true;
    await expect(ana.llamar({ t: 'cerrar' })).rejects.toThrow(/caída simulada/);

    const despues = (await almacen.leerSala(ana.codigo!))!;
    expect(despues.version).toBe(antes.version);
    expect(despues.datos.snapshot!.fase).toBe('EN_CURSO');
    expect(almacen.eventosDe(ana.codigo!)).toHaveLength(eventosAntes);
    expect(await almacen.sacarBuzon(ana.codigo!, 'cualquiera')).toEqual([]);

    await ana.llamar({ t: 'cerrar' });
    expect(ana.vista?.fase).toBe('LIQUIDACION');
    expect(cierres(almacen.eventosDe(ana.codigo!))).toHaveLength(1);
  });
});

describe('FF-23 / FF-24 (G5): persistir y luego notificar', () => {
  it('el aviso de Realtime sale siempre después de la escritura confirmada', async () => {
    const { proc, almacen } = entornoProcesador({ canal: true });
    const ana = await salaIniciada(proc, 'CLASICA');
    await ana.llamar({ t: 'agregar_bot' }).catch(() => undefined);
    const reg = almacen.registro.filter((x) => x !== 'conflicto');
    const avisos = reg.map((x, i) => [x, i] as const).filter(([x]) => x.startsWith('avisar'));
    expect(avisos.length).toBeGreaterThan(0);
    for (const [, i] of avisos) expect(reg[i - 1]).toBe('guardar');
  });

  it('si el aviso falla, la jugada queda guardada igual (el fallo de Realtime no revierte la base de datos)', async () => {
    const { proc, almacen, canal, errores } = entornoProcesador({ canal: true });
    const ana = await salaIniciada(proc, 'CLASICA', 1, { victoriasObjetivo: 3 });
    await forzarTurnoConMano(almacen, ana.codigo!, ana.id!, MANO_GANADORA_CLASICA);
    canal.fallar = true;
    await ana.llamar({ t: 'cerrar' });
    expect(ana.vista?.fase).toBe('LIQUIDACION');
    expect((await almacen.leerSala(ana.codigo!))!.datos.snapshot!.fase).toBe('LIQUIDACION');
    expect(errores).toContain('aviso en tiempo real fallido');
  });

  it('si la escritura falla, no se avisa a nadie', async () => {
    const { proc, almacen } = entornoProcesador({ canal: true });
    const ana = await salaIniciada(proc, 'CLASICA');
    almacen.registro.length = 0;
    almacen.fallarProxima = true;
    await expect(ana.llamar({ t: 'robar', origen: 'MAZO' })).rejects.toThrow();
    expect(almacen.registro).toEqual(['caida']);
  });
});

describe('FF-25 (G5): serialización de los comandos de una misma sala', () => {
  it('dos jugadores escriben a la vez y ninguna escritura se pierde (versión optimista con reintento)', async () => {
    const { proc, almacen } = entornoProcesador();
    const ana = new JugadorHttp(proc, 'Ana');
    await ana.llamar({ t: 'crear_sala', nombre: 'Ana', modalidad: 'CLASICA' });
    const beto = new JugadorHttp(proc, 'Beto');
    await beto.llamar({ t: 'unirse', codigo: ana.codigo!, nombre: 'Beto' });
    const v0 = (await almacen.leerSala(ana.codigo!))!.version;

    await Promise.all([ana.llamar({ t: 'reaccion', id: 'hola' }), beto.llamar({ t: 'reaccion', id: 'hola' })]);

    const fila = (await almacen.leerSala(ana.codigo!))!;
    expect(fila.version).toBe(v0 + 2);
    expect(fila.datos.extras.ultimaReaccion.map(([id]) => id).sort()).toEqual([ana.id, beto.id].sort());
  });
});

describe('FF-28 (G1): privacidad de la mano', () => {
  it('ningún mensaje para un jugador trae las cartas de los rivales ni datos privados', async () => {
    const { proc, avanzar } = entornoProcesador();
    const ana = new JugadorHttp(proc, 'Ana');
    await ana.llamar({ t: 'crear_sala', nombre: 'Ana', modalidad: 'APUNTADO', parametros: { tiempoTurnoSeg: 10 } });
    const beto = new JugadorHttp(proc, 'Beto');
    await beto.llamar({ t: 'unirse', codigo: ana.codigo!, nombre: 'Beto' });
    await ana.llamar({ t: 'agregar_bot' });
    await ana.llamar({ t: 'iniciar' });
    for (let i = 0; i < 12; i++) {
      avanzar(11_000); // los turnos vencen: robos y descartes automáticos de todos
      await ana.llamar();
      await beto.llamar();
    }
    const revisar = (yo: JugadorHttp) => {
      const vistas = yo.recibidos.filter((m): m is Extract<MensajeServidor, { t: 'estado' }> => m.t === 'estado').map((m) => m.vista);
      expect(vistas.length).toBeGreaterThan(5);
      for (const v of vistas) {
        for (const j of v.jugadores) expect(Object.keys(j)).not.toContain('mano');
        expect(v.yoId).toBe(yo.id);
      }
      for (const e of yo.eventos()) {
        expect(Object.keys(e.datos).some((k) => k.startsWith('_'))).toBe(false);
        if (e.tipo === 'CARTA_ROBADA' && e.datos.origen === 'MAZO') expect(e.datos.carta).toBeNull();
      }
    };
    revisar(ana);
    revisar(beto);
  });
});

describe('FF-29 (G1): identidad atada a la sesión', () => {
  it('el cliente no puede declarar quién es: el campo jugadorId inyectado se descarta al validar', () => {
    expect(parsearMensaje(JSON.stringify({ t: 'descartar', cartaId: '5H', jugadorId: 'otro' }))).toEqual({ t: 'descartar', cartaId: '5H' });
    expect(parsearMensaje(JSON.stringify({ t: 'cerrar', jugadorId: 'otro' }))).toEqual({ t: 'cerrar' });
  });

  it('un jugador no puede jugar el turno de otro: el servidor usa la identidad de su token', async () => {
    const { proc, almacen } = entornoProcesador();
    const ana = new JugadorHttp(proc, 'Ana');
    await ana.llamar({ t: 'crear_sala', nombre: 'Ana', modalidad: 'CLASICA' });
    const beto = new JugadorHttp(proc, 'Beto');
    await beto.llamar({ t: 'unirse', codigo: ana.codigo!, nombre: 'Beto' });
    await ana.llamar({ t: 'iniciar' });
    await forzarTurnoConMano(almacen, ana.codigo!, ana.id!, MANO_GANADORA_CLASICA);
    await beto.llamar({ t: 'cerrar' });
    expect(beto.errores).toContain('NO_ES_TU_TURNO');
    const falso = Object.assign(new JugadorHttp(proc, 'falso'), { codigo: ana.codigo, token: 'token-inventado' });
    await falso.llamar({ t: 'cerrar' });
    expect(falso.errores).toContain('SIN_SESION');
    expect(cierres(almacen.eventosDe(ana.codigo!))).toHaveLength(0);
  });
});
