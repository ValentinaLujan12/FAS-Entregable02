import { describe, expect, it } from 'vitest';
import { RECARGA, SALDO_INICIAL, SKINS_CARTA, SKINS_CELEBRACION, SKINS_MESA } from '../src/extras/skins/skins.js';
import { ServicioCuentas, hashClave } from '../src/extras/cuentas/ServicioCuentas.js';
import { MemoryStateRepository } from '../src/persistence/MemoryStateRepository.js';
import { ClienteFalso, crearServicio } from './utilsServicio.js';

const premiumBarata = SKINS_CARTA.filter((s) => s.premium).sort((a, b) => a.precio - b.precio)[0]!;
const premiumCara = SKINS_CARTA.filter((s) => s.premium).sort((a, b) => b.precio - a.precio)[0]!;

describe('ServicioCuentas (servidor = fuente de verdad)', () => {
  it('abrir sin clave crea la cuenta con saldo inicial, entrega la clave UNA vez y guarda solo su hash', async () => {
    const repo = new MemoryStateRepository();
    const sc = new ServicioCuentas(repo);
    const { cuenta, clave } = await sc.abrir();
    expect(clave).toBeTruthy();
    expect(cuenta.saldo).toBe(SALDO_INICIAL);
    expect(cuenta.inventario).toEqual([]);
    expect(cuenta.claveHash).toBe(hashClave(clave!));
    await sc.vaciar();
    expect(JSON.stringify(await repo.cargarCuenta(cuenta.claveHash))).not.toContain(clave!);
    const otra = await sc.abrir(clave);
    expect(otra.clave).toBeUndefined();
    expect(otra.cuenta.id).toBe(cuenta.id);
  });
  it('una clave desconocida crea una cuenta nueva (no adivina cuentas ajenas)', async () => {
    const sc = new ServicioCuentas(new MemoryStateRepository());
    const a = await sc.abrir();
    const b = await sc.abrir('x'.repeat(30));
    expect(b.cuenta.id).not.toBe(a.cuenta.id);
    expect(b.clave).toBeTruthy();
  });
  it('comprar descuenta el saldo, agrega al inventario y ACTIVA la skin automáticamente', async () => {
    const sc = new ServicioCuentas(new MemoryStateRepository());
    const { cuenta } = await sc.abrir();
    expect(sc.posee(cuenta, 'carta', premiumBarata.id)).toBe(false);
    expect(sc.comprar(cuenta, 'carta', premiumBarata.id)).toEqual({ ok: true });
    expect(cuenta.saldo).toBe(SALDO_INICIAL - premiumBarata.precio);
    expect(cuenta.elegidas.carta).toBe(premiumBarata.id);
    expect(sc.posee(cuenta, 'carta', premiumBarata.id)).toBe(true);
    const otra = sc.comprar(cuenta, 'carta', premiumBarata.id);
    expect(otra).toMatchObject({ ok: false, codigo: 'YA_LA_TIENES' });
  });
  it('saldo insuficiente: no cambia nada', async () => {
    const sc = new ServicioCuentas(new MemoryStateRepository());
    const { cuenta } = await sc.abrir();
    cuenta.saldo = 1;
    const r = sc.comprar(cuenta, 'carta', premiumCara.id);
    expect(r).toMatchObject({ ok: false, codigo: 'SALDO_INSUFICIENTE' });
    expect(cuenta.saldo).toBe(1);
    expect(cuenta.inventario).toEqual([]);
  });
  it('activar exige poseer la skin; las básicas son gratis y siempre activables', async () => {
    const sc = new ServicioCuentas(new MemoryStateRepository());
    const { cuenta } = await sc.abrir();
    expect(sc.activar(cuenta, 'carta', premiumBarata.id)).toMatchObject({ ok: false, codigo: 'NO_LA_TIENES' });
    const basica = SKINS_CARTA.find((s) => !s.premium)!;
    expect(sc.activar(cuenta, 'carta', basica.id)).toEqual({ ok: true });
    expect(cuenta.elegidas.carta).toBe(basica.id);
    expect(sc.activar(cuenta, 'carta', 'inventada')).toMatchObject({ ok: false, codigo: 'SKIN_INVALIDA' });
    expect(sc.activar(cuenta, 'raro', 'x')).toMatchObject({ ok: false, codigo: 'SKIN_INVALIDA' });
  });
  it('mesas y celebraciones también se compran y activan; recargar suma los tokens de prueba', async () => {
    const sc = new ServicioCuentas(new MemoryStateRepository());
    const { cuenta } = await sc.abrir();
    sc.recargar(cuenta);
    expect(cuenta.saldo).toBe(SALDO_INICIAL + RECARGA.tokens);
    const mesa = SKINS_MESA.find((s) => s.premium)!;
    const cel = SKINS_CELEBRACION.find((s) => s.premium)!;
    expect(sc.comprar(cuenta, 'mesa', mesa.id).ok).toBe(true);
    expect(sc.comprar(cuenta, 'celebracion', cel.id).ok).toBe(true);
    expect(cuenta.elegidas.mesa).toBe(mesa.id);
    expect(cuenta.elegidas.celebracion).toBe(cel.id);
    expect(new ServicioCuentas(new MemoryStateRepository(), Date.now, { recarga: { activa: false, tokens: 1 } }).recargar(cuenta)).toMatchObject({ ok: false, codigo: 'RECARGA_NO_DISPONIBLE' });
  });
  it('persiste: tras "reiniciar" (otro servicio, mismo repositorio) la clave recupera saldo, inventario y elección', async () => {
    const repo = new MemoryStateRepository();
    const a = new ServicioCuentas(repo);
    const { cuenta, clave } = await a.abrir();
    a.comprar(cuenta, 'carta', premiumBarata.id);
    await a.vaciar();
    const b = new ServicioCuentas(repo);
    const { cuenta: c2, clave: nueva } = await b.abrir(clave);
    expect(nueva).toBeUndefined();
    expect(c2.saldo).toBe(SALDO_INICIAL - premiumBarata.precio);
    expect(c2.inventario).toEqual([premiumBarata.id]);
    expect(c2.elegidas.carta).toBe(premiumBarata.id);
  });
});

describe('Cuenta por el protocolo: el cliente solo pide, el servidor decide', () => {
  async function conCuenta() {
    const ctx = crearServicio();
    const c = new ClienteFalso();
    await ctx.enviar(c, { t: 'cuenta_abrir' });
    return { ...ctx, c };
  }
  it('cuenta_abrir entrega clave + vista; reabrir con la clave devuelve la misma cuenta sin clave nueva', async () => {
    const { c, enviar } = await conCuenta();
    expect(c.clave).toBeTruthy();
    expect(c.cuenta).toMatchObject({ saldo: SALDO_INICIAL, inventario: [], recargaDisponible: true });
    const d = new ClienteFalso();
    await enviar(d, { t: 'cuenta_abrir', clave: c.clave! });
    expect(d.clave).toBeNull();
    expect(d.cuenta!.saldo).toBe(SALDO_INICIAL);
  });
  it('sin cuenta abierta, comprar/activar se rechazan', async () => {
    const ctx = crearServicio();
    const c = new ClienteFalso();
    await ctx.enviar(c, { t: 'cuenta_comprar', tipo: 'carta', id: premiumBarata.id });
    expect(c.errores().at(-1)!.codigo).toBe('SIN_CUENTA');
  });
  it('comprar -> elegida automáticamente; activar sin tenerla -> NO_LA_TIENES; saldo corto -> SALDO_INSUFICIENTE; recarga +999', async () => {
    const { c, enviar } = await conCuenta();
    await enviar(c, { t: 'cuenta_activar', tipo: 'carta', id: premiumBarata.id });
    expect(c.errores().at(-1)!.codigo).toBe('NO_LA_TIENES');
    await enviar(c, { t: 'cuenta_comprar', tipo: 'carta', id: premiumCara.id });
    expect(c.errores().at(-1)!.codigo).toBe('SALDO_INSUFICIENTE');
    await enviar(c, { t: 'cuenta_comprar', tipo: 'carta', id: premiumBarata.id });
    expect(c.cuenta!.elegidas.carta).toBe(premiumBarata.id);
    expect(c.cuenta!.inventario).toContain(premiumBarata.id);
    await enviar(c, { t: 'cuenta_recargar' });
    expect(c.cuenta!.saldo).toBe(SALDO_INICIAL - premiumBarata.precio + RECARGA.tokens);
    await enviar(c, { t: 'cuenta_comprar', tipo: 'carta', id: premiumCara.id });
    expect(c.cuenta!.elegidas.carta).toBe(premiumCara.id);
  });
  it('la sala muestra el estilo de la cuenta de cada jugador; las mesas básicas no se comparten', async () => {
    const ctx = crearServicio();
    const a = new ClienteFalso();
    const b = new ClienteFalso();
    await ctx.enviar(a, { t: 'cuenta_abrir' });
    await ctx.enviar(b, { t: 'cuenta_abrir' });
    await ctx.enviar(a, { t: 'cuenta_comprar', tipo: 'carta', id: premiumBarata.id });
    await ctx.enviar(a, { t: 'crear_sala', nombre: 'Ana', modalidad: 'CLASICA' });
    await ctx.enviar(b, { t: 'unirse', codigo: a.codigo!, nombre: 'Beto' });
    const ja = b.vista!.jugadores.find((j) => j.id === a.jugadorId)!;
    expect(ja.skinCartas).toBe(premiumBarata.id);
    expect(b.vista!.jugadores.find((j) => j.id === b.jugadorId)!.mesaPremium).toBeNull();
    // cambiar estilo estando en la sala se refleja para todos
    await ctx.enviar(a, { t: 'cuenta_recargar' });
    const mesa = SKINS_MESA.find((s) => s.premium)!;
    await ctx.enviar(a, { t: 'cuenta_comprar', tipo: 'mesa', id: mesa.id });
    expect(b.vista!.jugadores.find((j) => j.id === a.jugadorId)!.mesaPremium).toBe(mesa.id);
  });
  it('el cliente no puede manipular el saldo ni la elección: los mensajes extra se ignoran y los ids falsos se rechazan', async () => {
    const { c, enviar } = await conCuenta();
    await enviar(c, { t: 'cuenta_comprar', tipo: 'carta', id: 'carta_inventada' });
    expect(c.errores().at(-1)!.codigo).toBe('SKIN_INVALIDA');
    expect(c.cuenta!.saldo).toBe(SALDO_INICIAL);
  });
});
