import { describe, expect, it } from 'vitest';
import { SKIN_AMBIENTE_DEFECTO, SKIN_CARTA_DEFECTO, SKIN_CELEBRACION_DEFECTO, SKIN_MESA_DEFECTO } from '../src/kernel/skins.js';
import { PRECIO_MAXIMO, RECARGA, SALDO_INICIAL, SKINS_AMBIENTE, SKINS_CELEBRACION, SKINS_CARTA, SKINS_MESA, esMesaPremium, mesaPremiumMasCara } from '../src/extras/skins/skins.js';
import { parsearMensaje } from '../src/infra/mensajes.js';

describe('Catálogo de skins (mockup)', () => {
  it('cartas: 6 básicas + 7 premium; mesas: 5 básicas + 4 premium; ambientes: 4 básicos + 2 premium', () => {
    expect(SKINS_CARTA.filter((s) => !s.premium)).toHaveLength(6);
    expect(SKINS_CARTA.filter((s) => s.premium)).toHaveLength(7);
    expect(SKINS_MESA.filter((s) => !s.premium)).toHaveLength(5);
    expect(SKINS_MESA.filter((s) => s.premium)).toHaveLength(4);
    expect(SKINS_AMBIENTE.filter((s) => !s.premium)).toHaveLength(4);
    expect(SKINS_AMBIENTE.filter((s) => s.premium)).toHaveLength(2);
  });
  it('ids únicos, precios 1..999 para premium y 0 para básicas; saldo inicial 99 alcanza para una skin de entrada', () => {
    const todos = [...SKINS_CARTA, ...SKINS_MESA, ...SKINS_AMBIENTE];
    expect(new Set(todos.map((s) => s.id)).size).toBe(todos.length);
    for (const s of todos) {
      if (s.premium) expect(s.precio).toBeGreaterThan(0);
      else expect(s.precio).toBe(0);
      expect(s.precio).toBeLessThanOrEqual(PRECIO_MAXIMO);
    }
    expect(SALDO_INICIAL).toBe(99);
    // al menos una premium de entrada de cada tipo con precio <= saldo inicial
    expect(SKINS_CARTA.some((s) => s.premium && s.precio <= SALDO_INICIAL)).toBe(true);
    expect(SKINS_MESA.some((s) => s.premium && s.precio <= SALDO_INICIAL)).toBe(true);
  });
  it('las cartas premium usan acabados de tinta (no destellos de luz) y la recarga temporal suma 999', () => {
    for (const s of SKINS_CARTA.filter((c) => c.premium)) expect(s.diseno.tinta).toBeTruthy();
    expect(RECARGA).toEqual({ activa: true, tokens: 999 });
  });
  it('mesaPremiumMasCara: ignora básicas/desconocidas y elige la de mayor precio (empate: la primera)', () => {
    expect(mesaPremiumMasCara([null, 'mesa_pradera', 'x'])).toBeNull();
    expect(mesaPremiumMasCara(['mesa_pradera', 'mesa_cuero'])).toBe('mesa_cuero');
    expect(mesaPremiumMasCara(['mesa_cuero', 'mesa_noche_estrellada', 'mesa_cuero'])).toBe('mesa_noche_estrellada');
    expect(mesaPremiumMasCara(['mesa_cuero', 'mesa_cuero'])).toBe('mesa_cuero');
    expect(esMesaPremium('mesa_salvia')).toBe(false);
  });
  it('celebraciones: ids únicos, una gratuita por defecto y premium con efecto + música', () => {
    expect(SKINS_CELEBRACION.filter((s) => !s.premium).length).toBeGreaterThanOrEqual(2);
    expect(SKINS_CELEBRACION.some((s) => s.id === SKIN_CELEBRACION_DEFECTO && !s.premium)).toBe(true);
    for (const s of SKINS_CELEBRACION) {
      expect(s.diseno.efecto).toBeTruthy();
      expect(s.diseno.musica).toBeTruthy();
    }
    expect(new Set(SKINS_CELEBRACION.map((s) => s.id)).size).toBe(SKINS_CELEBRACION.length);
  });
  it('el parser acepta los mensajes de cuenta/reacción/votación bien formados y rechaza el resto', () => {
    expect(parsearMensaje('{"t":"cuenta_abrir"}')).toMatchObject({ t: 'cuenta_abrir' });
    expect(parsearMensaje('{"t":"cuenta_abrir","clave":123}')).toBeNull();
    expect(parsearMensaje('{"t":"cuenta_comprar","tipo":"carta","id":"carta_oro_viejo"}')).toMatchObject({ t: 'cuenta_comprar', tipo: 'carta', id: 'carta_oro_viejo' });
    expect(parsearMensaje('{"t":"cuenta_comprar","tipo":"carta"}')).toBeNull();
    expect(parsearMensaje('{"t":"cuenta_recargar"}')).toEqual({ t: 'cuenta_recargar' });
    expect(parsearMensaje('{"t":"perfil","skinCartas":"carta_oro_viejo"}')).toBeNull(); // el cliente ya no "fija" estilo
    expect(parsearMensaje('{"t":"reaccion","id":"hola"}')).toEqual({ t: 'reaccion', id: 'hola' });
    expect(parsearMensaje('{"t":"silenciar","jugadorId":"j1","activo":true}')).toEqual({ t: 'silenciar', jugadorId: 'j1', activo: true });
    expect(parsearMensaje('{"t":"iniciar_expulsion","objetivoId":"j1"}')).toEqual({ t: 'iniciar_expulsion', objetivoId: 'j1' });
    expect(parsearMensaje('{"t":"votar","aFavor":true}')).toEqual({ t: 'votar', aFavor: true });
    expect(parsearMensaje('{"t":"votar","aFavor":"si"}')).toBeNull();
    expect(parsearMensaje('{"t":"retomar"}')).toEqual({ t: 'retomar' });
  });

  it('los defectos que usa el nucleo existen en el catalogo', () => {
    expect(SKINS_CARTA.map((s) => s.id)).toContain(SKIN_CARTA_DEFECTO);
    expect(SKINS_MESA.map((s) => s.id)).toContain(SKIN_MESA_DEFECTO);
    expect(SKINS_AMBIENTE.map((s) => s.id)).toContain(SKIN_AMBIENTE_DEFECTO);
    expect(SKINS_CELEBRACION.map((s) => s.id)).toContain(SKIN_CELEBRACION_DEFECTO);
  });
});
