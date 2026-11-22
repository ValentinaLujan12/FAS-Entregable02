import { describe, expect, it } from 'vitest';
import type { EventoJuego } from '../src/kernel/protocolo.js';
import { AlmacenMemoria } from '../src/persistence/AlmacenMemoria.js';
import type { DatosSala } from '../src/persistence/IAlmacen.js';

/** El almacen en memoria aplica las mismas reglas que guardar_sala_atomica (esquema.sql). */
const datos = (reloj: number): DatosSala => ({ sala: { codigo: 'ABC' } as never, snapshot: null, extras: {} as never, presentes: [], reloj });
const cierre = (ronda: number): EventoJuego => ({ seq: ronda, tipo: 'CIERRE_ACEPTADO', ronda, ts: 0, datos: { jugadorId: 'J1' } });
const mensaje = { jugadorId: 'J2', en: 1, m: { t: 'eventos' as const, eventos: [] } };

describe('AlmacenMemoria: escritura atomica', () => {
  it('la version 0 crea la sala y un segundo intento de creacion no escribe nada', async () => {
    const almacen = new AlmacenMemoria();
    expect(await almacen.guardarAtomico('ABC', 0, datos(1), null, [], [])).toBe(true);
    expect(await almacen.guardarAtomico('ABC', 0, datos(2), null, [mensaje], [])).toBe(false);
    expect((await almacen.leerSala('ABC'))!.version).toBe(1);
    expect(await almacen.sacarBuzon('ABC', 'J2')).toHaveLength(0);
  });

  it('con una version vieja no escribe nada', async () => {
    const almacen = new AlmacenMemoria();
    await almacen.guardarAtomico('ABC', 0, datos(1), null, [], []);
    expect(await almacen.guardarAtomico('ABC', 7, datos(2), null, [mensaje], [])).toBe(false);
    expect((await almacen.leerSala('ABC'))!.version).toBe(1);
  });

  it('no admite dos cierres de la misma ronda', async () => {
    const almacen = new AlmacenMemoria();
    await almacen.guardarAtomico('ABC', 0, datos(1), null, [], []);
    expect(await almacen.guardarAtomico('ABC', 1, datos(2), null, [mensaje], [cierre(3)])).toBe(true);
    expect(await almacen.guardarAtomico('ABC', 2, datos(3), null, [mensaje], [cierre(3)])).toBe(false);
    expect((await almacen.leerSala('ABC'))!.version).toBe(2);
    expect(await almacen.sacarBuzon('ABC', 'J2')).toHaveLength(1);
  });
});
