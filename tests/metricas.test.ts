import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { metricasLatencia } from '../src/extras/metricas/latencia.js';
import { entornoProcesador, salaIniciada } from './utilsProcesador.js';

/**
 * Extra de métricas para las pruebas con usuarios: al registrar PARTIDA_FINALIZADA, supabase/esquema.sql resume la
 * partida en partida_registro (turnos, cierres y latencias) y conserva solo las últimas 100 partidas.
 */
describe('métricas de experiencia: histórico de partidas', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec('create role anon; create role authenticated; create role service_role;');
    await db.exec(readFileSync(join(process.cwd(), 'supabase', 'esquema.sql'), 'utf8'));
  }, 60_000); // PGlite arranca PostgreSQL en WebAssembly: en equipos lentos tarda más de 10 s

  afterAll(async () => {
    await db.close();
  });

  const sala = { sala: { modalidad: 'APUNTADO', jugadores: [{ id: 'H1', nombre: 'U01', esBot: false }, { id: 'B1', nombre: 'Bot Ada', esBot: true }] } };
  const ev = (seq: number, tipo: string, ts: number, datos: object = {}, partida = 1) => ({ seq, tipo, ronda: 1, ts, partida, datos });
  const guardar = async (codigo: string, version: number, eventos: object[]) => {
    const r = await db.query<{ ok: boolean }>(
      `select guardar_sala_atomica($1, $2, $3::jsonb, null, '[]'::jsonb, $4::jsonb) as ok`,
      [codigo, version, JSON.stringify(sala), JSON.stringify(eventos)],
    );
    return r.rows[0]!.ok;
  };

  it('resume la partida al terminar: turnos (con y sin bots), cierres y latencias', async () => {
    expect(await guardar('MET1', 0, [ev(1, 'PARTIDA_INICIADA', 0)])).toBe(true);
    const lat = (n: number, srv: number, cli: number | null) => ({ ...ev(n, 'METRICA_LATENCIA', 0, { comando: 'descartar', servidorMs: srv, clienteMs: cli }), partida: undefined });
    expect(await guardar('MET1', 1, [
      ev(2, 'TURNO_INICIADO', 1_000, { jugadorId: 'H1' }),
      ev(3, 'TURNO_INICIADO', 13_000, { jugadorId: 'B1' }),
      ev(4, 'TURNO_INICIADO', 15_000, { jugadorId: 'H1' }),
      ev(5, 'CIERRE_RECHAZADO', 16_000, { jugadorId: 'H1' }),
      ev(6, 'TURNO_INICIADO', 25_000, { jugadorId: 'B1' }),
      lat(0, 40, 120),
      lat(0, 60, null),
    ])).toBe(true);
    expect(await guardar('MET1', 2, [ev(7, 'CIERRE_ACEPTADO', 26_000, { jugadorId: 'B1', partida: 1 }), ev(8, 'PARTIDA_FINALIZADA', 26_000, { ganadorId: 'B1', motivo: 'UMBRAL' })])).toBe(true);

    const r = (await db.query<Record<string, unknown>>(`select * from partida_registro where codigo = 'MET1'`)).rows;
    expect(r).toHaveLength(1);
    const f = r[0]!;
    expect(f.modalidad).toBe('APUNTADO');
    expect(f.jugadores).toBe(2);
    expect(f.humanos).toBe(1);
    expect(f.ganador_id).toBe('B1');
    expect(Number(f.turnos)).toBe(4);
    // Turnos: H1 12 s, B1 2 s, H1 10 s -> promedio 8 s; solo humanos 11 s.
    expect(Number(f.turno_promedio_ms)).toBe(8000);
    expect(Number(f.turno_humano_ms)).toBe(11000);
    expect(Number(f.cierres_aceptados)).toBe(1);
    expect(Number(f.cierres_rechazados)).toBe(1);
    expect(Number(f.servidor_p50_ms)).toBe(50);
    expect(Number(f.cliente_p50_ms)).toBe(120);
    // p99 por partida para FF-32: interpolación lineal entre 40 y 60 ms.
    expect(Number(f.servidor_p99_ms)).toBeCloseTo(59.8, 5);
    expect(Number(f.cliente_p99_ms)).toBe(120);
    expect(Number(f.muestras_latencia)).toBe(2);

    const porJugador = (await db.query<Record<string, unknown>>(
      `select j.* from partida_jugador_registro j join partida_registro p on p.id = j.registro_id where p.codigo = 'MET1' order by j.jugador_id`,
    )).rows;
    expect(porJugador.map((x) => x.jugador_id)).toEqual(['B1', 'H1']);
    const h1 = porJugador.find((x) => x.jugador_id === 'H1')!;
    expect(h1.es_bot).toBe(false);
    expect(Number(h1.turnos)).toBe(2);
    expect(Number(h1.turno_promedio_ms)).toBe(11000);
    expect(Number(h1.cierres_rechazados)).toBe(1);
  });

  it('cada evento guarda su número de partida (revancha) y el resumen sobrevive al borrar la sala', async () => {
    const det = (await db.query<{ partida: string }>(`select detalle->>'partida' as partida from evento where codigo = 'MET1' and tipo = 'TURNO_INICIADO' limit 1`)).rows[0]!;
    expect(det.partida).toBe('1');
    await db.exec(`delete from sala where codigo = 'MET1'`);
    expect(Number((await db.query<{ n: string }>(`select count(*) as n from partida_registro where codigo = 'MET1'`)).rows[0]!.n)).toBe(1);
  });

  it('conserva solo las últimas 100 partidas', async () => {
    for (let i = 1; i <= 101; i++) {
      const codigo = `H${String(i).padStart(3, '0')}`;
      expect(await guardar(codigo, 0, [ev(1, 'PARTIDA_INICIADA', 0), ev(2, 'PARTIDA_FINALIZADA', 1, { ganadorId: 'H1', motivo: 'UMBRAL' })])).toBe(true);
    }
    const n = Number((await db.query<{ n: string }>(`select count(*) as n from partida_registro`)).rows[0]!.n);
    expect(n).toBe(100);
    const resumen = (await db.query<{ partidas: string }>(`select partidas from v_metricas_partidas where modalidad = 'APUNTADO'`)).rows[0]!;
    expect(Number(resumen.partidas)).toBe(100);
  });

  it('el extra solo mide jugadas y nunca datos inválidos del cliente', () => {
    expect(metricasLatencia.eventoLatencia({ comando: 'ping', jugadorId: null, servidorMs: 3, clienteMs: null }, 0)).toBeNull();
    const e = metricasLatencia.eventoLatencia({ comando: 'cerrar', jugadorId: 'J1', servidorMs: 12.6, clienteMs: 80 }, 5)!;
    expect(e.tipo).toBe('METRICA_LATENCIA');
    expect(e.datos).toEqual({ comando: 'cerrar', jugadorId: 'J1', servidorMs: 13, clienteMs: 80 });
  });

  it('el procesador guarda una muestra por jugada con la ida y vuelta del navegador, sin enviarla a los clientes', async () => {
    const { proc, almacen } = entornoProcesador();
    const ana = await salaIniciada(proc, 'CLASICA', 1);
    await proc.atender({ codigo: ana.codigo!, token: ana.token!, msg: { t: 'cerrar' }, rttMs: 85 });
    const muestras = almacen.eventosDe(ana.codigo!).filter((e) => e.tipo === 'METRICA_LATENCIA');
    expect(muestras.length).toBeGreaterThanOrEqual(2);
    expect(muestras.at(-1)!.detalle).toMatchObject({ comando: 'cerrar', clienteMs: 85 });
    expect(ana.eventos().some((e) => e.tipo === 'METRICA_LATENCIA')).toBe(false);
  });
});
