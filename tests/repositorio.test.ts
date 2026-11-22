import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseCartas } from '../src/kernel/cartas.js';
import type { IRepositorioPartida } from '../src/persistence/IRepositorioPartida.js';
import { MemoryStateRepository } from '../src/persistence/MemoryStateRepository.js';
import { LobbyManager } from '../src/game/lobby/LobbyManager.js';
import { extrasPorDefecto } from '../src/extras/composicion.js';
import { AleatorioSemilla } from '../src/deck/Baraja.js';
import { estadoMutable, forzarMano, nuevaPartida } from './utils.js';

/** Una partida real con una ronda liquidada para persistir. */
function escenario(codigo: string) {
  const lobby = new LobbyManager(new AleatorioSemilla(3), () => 1_700_000_000_000, extrasPorDefecto.estilos);
  const r = lobby.crearSala('Ana', 'CLASICA');
  if (!r.ok) throw new Error('lobby');
  lobby.unirse(r.sala.codigo, 'Beto');
  r.sala.codigo = codigo;
  const { partida, eventos } = nuevaPartida('CLASICA', 2);
  const ini = partida.estado.ronda!.turnoId;
  forzarMano(partida, ini, '2H 2C 2S 2D 5H 6H 7H 9C 9D 9S KH');
  const res = partida.cerrar(ini);
  const todos = [...eventos, ...(res.ok ? res.eventos : [])];
  const liq = partida.estado.liquidacion!;
  const ronda = {
    partidaN: 1,
    numero: liq.ronda,
    ganadorId: liq.ganadorId,
    tipoCierre: liq.tipoCierre,
    tablas: liq.tablas,
    detalle: liq.detalle,
    manosIniciales: { [ini]: ['2H#0'] },
    jugadores: liq.jugadores.map((j) => ({ ...j, jugadorId: j.jugadorId })),
  };
  estadoMutable(partida).codigo = codigo;
  return { sala: r.sala, snapshot: partida.snapshot(), eventos: todos, ronda, partida };
}

function suite(nombre: string, crear: () => Promise<{ repo: IRepositorioPartida; limpiar?: () => Promise<void> }>) {
  describe(`Contrato IRepositorioPartida - ${nombre}`, () => {
    let repo: IRepositorioPartida;
    let limpiar: (() => Promise<void>) | undefined;
    beforeAll(async () => {
      ({ repo, limpiar } = await crear());
      await repo.inicializar();
      await repo.inicializar(); // idempotente
    });
    afterAll(async () => {
      await limpiar?.();
      await repo.cerrar();
    });

    it('guarda y recupera sala, jugadores, snapshot, eventos y ronda liquidada', async () => {
      const e = escenario('AAAAA');
      await repo.guardar('AAAAA', { sala: e.sala, snapshot: e.snapshot, eventos: e.eventos, ronda: e.ronda });
      const rec = await repo.cargarSala('AAAAA');
      expect(rec).not.toBeNull();
      expect(rec!.sala.jugadores.map((j) => j.nombre)).toEqual(['Ana', 'Beto']);
      expect(rec!.sala.jugadores[0]!.tokenHash).toHaveLength(64);
      expect(rec!.sala.parametros.modalidad).toBe('CLASICA');
      expect(rec!.snapshot!.numeroRonda).toBe(e.snapshot.numeroRonda);
      expect(rec!.snapshot!.marcador.victorias).toEqual(e.snapshot.marcador.victorias);
      const h = await repo.historial('AAAAA');
      expect(h!.rondas).toHaveLength(1);
      expect(h!.rondas[0]!.jugadores).toHaveLength(2);
      expect(h!.rondas[0]!.manosIniciales).toEqual(e.ronda.manosIniciales);
      expect(h!.eventos.map((x) => x.seq)).toEqual(e.eventos.map((x) => x.seq));
    });

    it('es idempotente: reguardar los mismos eventos/ronda no duplica filas', async () => {
      const e = escenario('BBBBB');
      await repo.guardar('BBBBB', { sala: e.sala, snapshot: e.snapshot, eventos: e.eventos, ronda: e.ronda });
      await repo.guardar('BBBBB', { sala: e.sala, snapshot: e.snapshot, eventos: e.eventos, ronda: e.ronda });
      const h = await repo.historial('BBBBB');
      expect(h!.rondas).toHaveLength(1);
      expect(h!.eventos).toHaveLength(e.eventos.length);
    });

    it('cargarActivas excluye salas FINALIZADAS', async () => {
      const e = escenario('CCCCC');
      await repo.guardar('CCCCC', { sala: { ...e.sala, estado: 'EN_CURSO' }, snapshot: e.snapshot });
      let act = await repo.cargarActivas();
      expect(act.map((a) => a.sala.codigo)).toContain('CCCCC');
      await repo.guardar('CCCCC', { sala: { ...e.sala, estado: 'FINALIZADA' } });
      act = await repo.cargarActivas();
      expect(act.map((a) => a.sala.codigo)).not.toContain('CCCCC');
    });

    it('snapshot null elimina el snapshot y quitar jugadores actualiza la sala', async () => {
      const e = escenario('DDDDD');
      await repo.guardar('DDDDD', { sala: e.sala, snapshot: e.snapshot });
      const sinBeto = { ...e.sala, jugadores: e.sala.jugadores.slice(0, 1) };
      await repo.guardar('DDDDD', { sala: sinBeto, snapshot: null });
      const rec = await repo.cargarSala('DDDDD');
      expect(rec!.snapshot).toBeNull();
      expect(rec!.sala.jugadores).toHaveLength(1);
    });

    it('sala inexistente devuelve null', async () => {
      expect(await repo.cargarSala('NOPE1')).toBeNull();
      expect(await repo.historial('NOPE1')).toBeNull();
    });

    it('cuentas: guardar/cargar por claveHash, actualizar (upsert) y desconocida -> null', async () => {
      const c = { id: 'cTEST1', claveHash: 'h'.repeat(64), saldo: 99, inventario: [], elegidas: { carta: 'carta_salvia', mesa: 'mesa_salvia', ambiente: 'amb_desierto', celebracion: 'celeb_confeti' }, creadaEn: 1_700_000_000_000 };
      expect(await repo.cargarCuenta(c.claveHash)).toBeNull();
      await repo.guardarCuenta(c);
      expect(await repo.cargarCuenta(c.claveHash)).toEqual(c);
      const mod = { ...c, saldo: 3, inventario: ['carta_oro_viejo'], elegidas: { ...c.elegidas, carta: 'carta_oro_viejo' } };
      await repo.guardarCuenta(mod);
      expect(await repo.cargarCuenta(c.claveHash)).toEqual(mod);
    });

    it('salud() responde true', async () => {
      expect(await repo.salud()).toBe(true);
    });
  });
}

suite('memoria', async () => ({ repo: new MemoryStateRepository() }));

