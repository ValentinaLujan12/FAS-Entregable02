import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Pruebas del esquema real de Supabase (supabase/esquema.sql) sobre PostgreSQL en memoria (PGlite).
 * Verifican la escritura atomica de ADR-07: sala y buzon se escriben juntos o no se escribe nada.
 */
describe('esquema SQL: guardar_sala_atomica', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    // Roles que Supabase ya trae y que el esquema referencia en sus GRANT / REVOKE.
    await db.exec('create role anon; create role authenticated; create role service_role;');
    await db.exec(readFileSync(join(process.cwd(), 'supabase', 'esquema.sql'), 'utf8'));
    await db.exec(`insert into sala (codigo, datos, version) values ('ABC', '{"x":1}'::jsonb, 1);`);
  }, 60_000); // PGlite arranca PostgreSQL en WebAssembly: en equipos lentos tarda más de 10 s

  afterAll(async () => {
    await db.close();
  });

  const contar = async (tabla: string) => Number((await db.query<{ n: string }>(`select count(*) as n from ${tabla}`)).rows[0]!.n);
  const versionDe = async () => Number((await db.query<{ version: number }>(`select version from sala where codigo = 'ABC'`)).rows[0]!.version);

  it('con la version esperada actualiza la sala y guarda los mensajes', async () => {
    const r = await db.query<{ ok: boolean }>(
      `select guardar_sala_atomica('ABC', 1, '{"x":2}'::jsonb, null, '[{"jugadorId":"J1","en":5,"m":{"t":"a"}},{"jugadorId":"J2","en":6,"m":{"t":"b"}}]'::jsonb) as ok`,
    );
    expect(r.rows[0]!.ok).toBe(true);
    expect(await versionDe()).toBe(2);
    expect(await contar('buzon')).toBe(2);
  });

  it('con una version vieja no escribe nada y devuelve false', async () => {
    const r = await db.query<{ ok: boolean }>(
      `select guardar_sala_atomica('ABC', 1, '{"x":3}'::jsonb, null, '[{"jugadorId":"J3","en":7,"m":{"t":"c"}}]'::jsonb) as ok`,
    );
    expect(r.rows[0]!.ok).toBe(false);
    expect(await versionDe()).toBe(2);
    expect(await contar('buzon')).toBe(2);
  });

  it('si falla un mensaje, revierte tambien la actualizacion de la sala (atomicidad)', async () => {
    const antes = await versionDe();
    // jugador_id no admite nulos: el segundo mensaje hace fallar toda la operacion.
    await expect(
      db.query(
        `select guardar_sala_atomica('ABC', ${antes}, '{"x":9}'::jsonb, null, '[{"jugadorId":"J4","en":8,"m":{"t":"d"}},{"jugadorId":null,"en":9,"m":{"t":"e"}}]'::jsonb)`,
      ),
    ).rejects.toThrow();
    expect(await versionDe()).toBe(antes);
    expect(await contar('buzon')).toBe(2);
  });

  it('el registro de eventos existe y admite la insercion de un evento por sala', async () => {
    await db.exec(`insert into evento (codigo, tipo, detalle) values ('ABC', 'PRUEBA', '{"n":1}'::jsonb);`);
    expect(await contar('evento')).toBe(1);
  });

  it('con version 0 crea la sala en version 1; un segundo intento de creacion no escribe', async () => {
    const primera = await db.query<{ ok: boolean }>(
      `select guardar_sala_atomica('NUEVA', 0, '{"x":1}'::jsonb, null, '[{"jugadorId":"J5","en":1,"m":{"t":"f"}}]'::jsonb) as ok`,
    );
    expect(primera.rows[0]!.ok).toBe(true);
    const repetida = await db.query<{ ok: boolean }>(`select guardar_sala_atomica('NUEVA', 0, '{"x":2}'::jsonb, null, '[]'::jsonb) as ok`);
    expect(repetida.rows[0]!.ok).toBe(false);
    const v = await db.query<{ version: number }>(`select version from sala where codigo = 'NUEVA'`);
    expect(v.rows[0]!.version).toBe(1);
  });

  it('guarda los eventos de auditoria en la misma transaccion que la sala', async () => {
    const eventosAntes = await contar('evento');
    const v = await versionDe();
    const ok = await db.query<{ ok: boolean }>(
      `select guardar_sala_atomica('ABC', ${v}, '{"x":4}'::jsonb, null, '[]'::jsonb, '[{"seq":1,"tipo":"CARTA_ROBADA","ronda":1,"ts":10,"datos":{"jugadorId":"J1"}}]'::jsonb) as ok`,
    );
    expect(ok.rows[0]!.ok).toBe(true);
    expect(await contar('evento')).toBe(eventosAntes + 1);
  });

  it('no admite dos cierres de la misma ronda: devuelve false y no escribe nada', async () => {
    const cierre = (ronda: number) => `[{"seq":2,"tipo":"CIERRE_ACEPTADO","ronda":${ronda},"ts":11,"datos":{"jugadorId":"J1"}}]`;
    const v1 = await versionDe();
    const primero = await db.query<{ ok: boolean }>(
      `select guardar_sala_atomica('ABC', ${v1}, '{"x":5}'::jsonb, null, '[]'::jsonb, '${cierre(7)}'::jsonb) as ok`,
    );
    expect(primero.rows[0]!.ok).toBe(true);
    const eventosAntes = await contar('evento');
    const v2 = await versionDe();
    const duplicado = await db.query<{ ok: boolean }>(
      `select guardar_sala_atomica('ABC', ${v2}, '{"x":6}'::jsonb, null, '[{"jugadorId":"J9","en":3,"m":{"t":"g"}}]'::jsonb, '${cierre(7)}'::jsonb) as ok`,
    );
    expect(duplicado.rows[0]!.ok).toBe(false);
    expect(await versionDe()).toBe(v2);
    expect(await contar('evento')).toBe(eventosAntes);
  });

  it('FF-17: cuatro cierres simultáneos sobre la misma versión, exactamente uno se confirma', async () => {
    const v = await versionDe();
    const intentos = await Promise.all(
      [1, 2, 3, 4].map((n) => db.query<{ ok: boolean }>(`select guardar_sala_atomica('ABC', ${v}, '{"cierre":${n}}'::jsonb, null, '[]'::jsonb) as ok`)),
    );
    expect(intentos.filter((r) => r.rows[0]!.ok)).toHaveLength(1);
    expect(await versionDe()).toBe(v + 1);
  });

  it('la revancha (otra partida en la misma sala) puede cerrar su ronda 1 aunque la primera partida ya la cerró', async () => {
    const cierre = (partida: number) => `[{"seq":${30 + partida},"tipo":"CIERRE_ACEPTADO","ronda":1,"ts":12,"datos":{"jugadorId":"J1","partida":${partida}}}]`;
    for (const partida of [1, 2]) {
      const v = await versionDe();
      const r = await db.query<{ ok: boolean }>(`select guardar_sala_atomica('ABC', ${v}, '{"x":7}'::jsonb, null, '[]'::jsonb, '${cierre(partida)}'::jsonb) as ok`);
      expect(r.rows[0]!.ok).toBe(true);
    }
    const v = await versionDe();
    const repetido = await db.query<{ ok: boolean }>(`select guardar_sala_atomica('ABC', ${v}, '{"x":8}'::jsonb, null, '[]'::jsonb, '${cierre(2)}'::jsonb) as ok`);
    expect(repetido.rows[0]!.ok).toBe(false);
  });

  it('FF-19: la consulta de auditoría no encuentra cierres duplicados por partida y ronda', async () => {
    const r = await db.query<{ n: string }>(`
      select count(*) as n from (
        select codigo, coalesce(detalle->>'partida', '1') as partida, detalle->>'ronda' as ronda
          from evento where tipo = 'CIERRE_ACEPTADO'
         group by 1, 2, 3 having count(*) > 1
      ) duplicados`);
    expect(Number(r.rows[0]!.n)).toBe(0);
  });
});
