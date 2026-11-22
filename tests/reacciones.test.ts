import { describe, expect, it } from 'vitest';
import { REACCIONES, REACCION_ENFRIAMIENTO_MS, esReaccionValida, umbralSilencio } from '../src/extras/reacciones/reacciones.js';
import { PlanificadorReacciones, PROBABILIDADES_POR_DEFECTO, type ProbabilidadesBot } from '../src/extras/bots/ReaccionesBot.js';
import type { EventoJuego } from '../src/kernel/protocolo.js';
import { ClienteFalso, crearServicio } from './utilsServicio.js';

async function mesa(humanos: number, opts: Parameters<typeof crearServicio>[0] = {}) {
  const ctx = crearServicio(opts);
  const cs: ClienteFalso[] = [];
  const host = new ClienteFalso();
  await ctx.enviar(host, { t: 'crear_sala', nombre: 'H0', modalidad: 'CLASICA' });
  cs.push(host);
  for (let i = 1; i < humanos; i++) {
    const c = new ClienteFalso();
    await ctx.enviar(c, { t: 'unirse', codigo: host.codigo!, nombre: `H${i}` });
    cs.push(c);
  }
  return { ...ctx, cs, codigo: host.codigo! };
}

describe('Catálogo de reacciones', () => {
  it('umbral de silencio = techo de la mitad de los activos', () => {
    expect([1, 2, 3, 4, 5, 6].map(umbralSilencio)).toEqual([1, 1, 2, 2, 3, 3]);
  });
  it('solo ids del catálogo son válidos (no hay texto libre)', () => {
    expect(esReaccionValida('hola')).toBe(true);
    expect(esReaccionValida('<script>')).toBe(false);
    expect(REACCIONES.length).toBeGreaterThanOrEqual(10);
  });
});

describe('Reacciones y silencio por servidor', () => {
  it('una reacción llega a todos con jugadorId e id; inválida -> error', async () => {
    const s = await mesa(3);
    await s.enviar(s.cs[0]!, { t: 'reaccion', id: 'hola' });
    for (const c of s.cs) expect(c.reacciones().at(-1)).toMatchObject({ jugadorId: s.cs[0]!.jugadorId, id: 'hola' });
    await s.enviar(s.cs[1]!, { t: 'reaccion', id: 'texto_libre' });
    expect(s.cs[1]!.errores().at(-1)!.codigo).toBe('REACCION_INVALIDA');
  });
  it('anti-spam: dentro del enfriamiento se ignora; pasado el tiempo vuelve a funcionar', async () => {
    const s = await mesa(2);
    await s.enviar(s.cs[0]!, { t: 'reaccion', id: 'hola' });
    await s.enviar(s.cs[0]!, { t: 'reaccion', id: 'jaja' });
    expect(s.cs[1]!.reacciones()).toHaveLength(1);
    s.programador.avanzar(REACCION_ENFRIAMIENTO_MS + 10);
    await s.enviar(s.cs[0]!, { t: 'reaccion', id: 'jaja' });
    expect(s.cs[1]!.reacciones()).toHaveLength(2);
  });
  it('silenciar a alguien: quien lo silenció ya no recibe sus reacciones (los demás sí)', async () => {
    const s = await mesa(4); // umbral = 2
    const [a, b, c, d] = s.cs as [ClienteFalso, ClienteFalso, ClienteFalso, ClienteFalso];
    await s.enviar(b, { t: 'silenciar', jugadorId: a.jugadorId!, activo: true });
    expect(b.vista!.jugadores.find((j) => j.id === a.jugadorId)!.silenciadoPorMi).toBe(true);
    await s.enviar(a, { t: 'reaccion', id: 'jaja' });
    expect(b.reacciones()).toHaveLength(0);
    expect(c.reacciones()).toHaveLength(1);
    expect(d.reacciones()).toHaveLength(1);
    expect(c.vista!.jugadores.find((j) => j.id === a.jugadorId)!.silenciado).toBe(false);
  });
  it('si ⌈activos/2⌉ lo silencian queda silenciado para TODOS; si uno se retira del silencio, deja de estarlo', async () => {
    const s = await mesa(4);
    const [a, b, c, d] = s.cs as [ClienteFalso, ClienteFalso, ClienteFalso, ClienteFalso];
    await s.enviar(b, { t: 'silenciar', jugadorId: a.jugadorId!, activo: true });
    await s.enviar(c, { t: 'silenciar', jugadorId: a.jugadorId!, activo: true });
    expect(d.vista!.jugadores.find((j) => j.id === a.jugadorId)!.silenciado).toBe(true);
    await s.enviar(a, { t: 'reaccion', id: 'jaja' });
    expect(a.errores().at(-1)!.codigo).toBe('SILENCIADO');
    expect(d.reacciones()).toHaveLength(0);
    await s.enviar(c, { t: 'silenciar', jugadorId: a.jugadorId!, activo: false });
    expect(d.vista!.jugadores.find((j) => j.id === a.jugadorId)!.silenciado).toBe(false);
  });
  it('no puedes silenciarte a ti mismo ni a un jugador inexistente', async () => {
    const s = await mesa(2);
    await s.enviar(s.cs[0]!, { t: 'silenciar', jugadorId: s.cs[0]!.jugadorId!, activo: true });
    expect(s.cs[0]!.errores().at(-1)!.codigo).toBe('ACCION_NO_PERMITIDA');
    await s.enviar(s.cs[0]!, { t: 'silenciar', jugadorId: 'zzz', activo: true });
    expect(s.cs[0]!.errores().at(-1)!.codigo).toBe('JUGADOR_INEXISTENTE');
  });
});

const ev = (tipo: string, datos: Record<string, unknown>): EventoJuego => ({ seq: 1, tipo, ronda: 1, ts: 0, datos } as unknown as EventoJuego);
const siempre: ProbabilidadesBot = { ...PROBABILIDADES_POR_DEFECTO, saludarAlEntrarBot: 1, saludarAlEntrarHumano: 1, responderSaludo: 1, alardearAlGanar: 1, comentarGanadorAjeno: 1, tomarPozo: 1, quejaMazoInutil: 1, celebrarMazoUtil: 1, ggFinal: 1, enfriamientoMs: 0 };
const nunca: ProbabilidadesBot = Object.fromEntries(Object.entries(siempre).map(([k, v]) => [k, typeof v === 'number' && k !== 'enfriamientoMs' ? 0 : v])) as unknown as ProbabilidadesBot;

describe('Bots que reaccionan (planificador)', () => {
  it('con probabilidad 1: saluda al entrar, responde saludos, celebra pozo, se queja del mazo inútil, alardea al ganar', () => {
    const p = new PlanificadorReacciones(siempre, () => 0.01, () => 0);
    expect(p.alEntrar({ id: 'h1', esBot: false }, ['b1'])).toEqual([expect.objectContaining({ jugadorId: 'b1', id: 'hola' })]);
    expect(p.alEntrar({ id: 'b2', esBot: true }, ['b1'])).toEqual([expect.objectContaining({ jugadorId: 'b2', id: 'hola' })]);
    expect(p.alReaccionHumana('hola', ['b1'])[0]).toMatchObject({ jugadorId: 'b1' });
    expect(p.alReaccionHumana('jaja', ['b1'])).toEqual([]);
    const esBot = (id: string) => id.startsWith('b');
    expect(p.alEventos([ev('CARTA_ROBADA', { jugadorId: 'b1', origen: 'POZO' })], esBot, ['b1', 'b2'])[0]!.id).toMatch(/celebro|sarcasmo|facil/);
    p.alEventos([ev('CARTA_ROBADA', { jugadorId: 'b1', origen: 'MAZO', _privado: { cartaId: 'X#0' } })], esBot, ['b1']);
    expect(p.alEventos([ev('CARTA_DESCARTADA', { jugadorId: 'b1', carta: { id: 'X#0' } })], esBot, ['b1'])[0]!.id).toMatch(/queja|uy/);
    p.alEventos([ev('CARTA_ROBADA', { jugadorId: 'b1', origen: 'MAZO', _privado: { cartaId: 'X#0' } })], esBot, ['b1']);
    expect(p.alEventos([ev('CARTA_DESCARTADA', { jugadorId: 'b1', carta: { id: 'Y#0' } })], esBot, ['b1'])[0]!.id).toBe('celebro');
    expect(p.alEventos([ev('RONDA_LIQUIDADA', { ganadorId: 'b1' })], esBot, ['b1'])[0]!.id).toMatch(/facil|jaja|sarcasmo/);
  });
  it('con probabilidad 0 los bots no dicen nada; un humano en automático (no es bot) tampoco reacciona', () => {
    const p = new PlanificadorReacciones(nunca, () => 0.5, () => 0);
    expect(p.alEntrar({ id: 'h1', esBot: false }, ['b1'])).toEqual([]);
    expect(p.alEventos([ev('CARTA_ROBADA', { jugadorId: 'b1', origen: 'POZO' }), ev('RONDA_LIQUIDADA', { ganadorId: 'b1' })], () => true, ['b1'])).toEqual([]);
    const q = new PlanificadorReacciones(siempre, () => 0.01, () => 0);
    expect(q.alEventos([ev('CARTA_ROBADA', { jugadorId: 'h1', origen: 'POZO' })], () => false, [])).toEqual([]);
  });
  it('enfriamiento por bot: no reacciona de nuevo hasta pasado el tiempo', () => {
    let t = 0;
    const p = new PlanificadorReacciones({ ...siempre, enfriamientoMs: 10_000 }, () => 0.01, () => t);
    expect(p.alEntrar({ id: 'h1', esBot: false }, ['b1'])).toHaveLength(1);
    expect(p.alEntrar({ id: 'h2', esBot: false }, ['b1'])).toHaveLength(0);
    t = 10_001;
    expect(p.alEntrar({ id: 'h3', esBot: false }, ['b1'])).toHaveLength(1);
  });
  it('integrado: con probabilidad 1 el bot saluda al entrar un humano y la reacción llega por el programador', async () => {
    const s = await mesa(1, { reaccionesBots: siempre });
    await s.enviar(s.cs[0]!, { t: 'agregar_bot' });
    s.programador.avanzar(5000);
    expect(s.cs[0]!.reacciones().some((r) => r.id === 'hola')).toBe(true);
  });
  it('por defecto (sin reaccionesBots) los bots no reaccionan: pruebas deterministas', async () => {
    const s = await mesa(1);
    await s.enviar(s.cs[0]!, { t: 'agregar_bot' });
    s.programador.avanzar(60_000);
    expect(s.cs[0]!.reacciones()).toHaveLength(0);
  });
});
