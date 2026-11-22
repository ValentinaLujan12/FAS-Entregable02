import { describe, expect, it } from 'vitest';
import type { MensajeCliente, MensajeServidor, VistaMesa } from '../src/kernel/protocolo.js';
import { AlmacenMemoria } from '../src/persistence/AlmacenMemoria.js';
import { Procesador } from '../src/serverless/Procesador.js';
import { extrasPorDefecto } from '../src/extras/composicion.js';
import { ProgramadorVirtual } from '../src/serverless/ProgramadorVirtual.js';

/** Reloj controlado por la prueba: así los plazos (turnos, votaciones) avanzan sin esperar de verdad. */
function entorno() {
  let t = 1_700_000_000_000;
  const almacen = new AlmacenMemoria();
  const proc = new Procesador({ almacen, extras: extrasPorDefecto, reloj: () => t, retardoBotMs: [50, 80], reaccionesBots: false, votacion: { saltosMin: 1, turnosAutoMin: 1, duracionSeg: 60 } });
  return { proc, avanzar: (ms: number) => (t += ms), ahora: () => t };
}

class Jugador {
  codigo: string | null = null;
  token: string | null = null;
  id: string | null = null;
  vista: VistaMesa | null = null;
  errores: string[] = [];
  constructor(private readonly proc: Procesador, readonly nombre: string) {}
  async llamar(msg?: MensajeCliente): Promise<MensajeServidor[]> {
    const r = await this.proc.atender({ codigo: this.codigo ?? undefined, token: this.token ?? undefined, msg });
    const ms = r.mensajes.map((x) => x.m);
    for (const m of ms) {
      if (m.t === 'sesion') Object.assign(this, { codigo: m.codigo, token: m.token, id: m.jugadorId });
      else if (m.t === 'estado') this.vista = m.vista;
      else if (m.t === 'error') this.errores.push(m.codigo);
    }
    return ms;
  }
}

describe('ProgramadorVirtual', () => {
  it('ejecuta los plazos vencidos y encadena los pasos de bots sin esperar', () => {
    const prog = new ProgramadorVirtual(1000);
    const orden: string[] = [];
    prog.programar(500, () => orden.push('plazo'));
    prog.programar(100, () => {
      orden.push('bot1');
      prog.programar(100, () => orden.push('bot2'), 'bot');
    }, 'bot');
    prog.programar(5000, () => orden.push('futuro'));
    prog.ponerAlDia(1600);
    expect(orden).toEqual(['bot1', 'bot2', 'plazo']);
    expect(prog.proximoEn()).toBe(6000);
  });
});

describe('Procesador (salas reales sin servidor permanente)', () => {
  it('dos clientes comparten la sala y el segundo recibe los cambios por su buzón', async () => {
    const { proc } = entorno();
    const ana = new Jugador(proc, 'Ana');
    const beto = new Jugador(proc, 'Beto');
    await ana.llamar({ t: 'crear_sala', nombre: 'Ana', modalidad: 'CLASICA' });
    expect(ana.codigo).toMatch(/^[A-Z0-9]{5}$/);
    await beto.llamar({ t: 'unirse', codigo: ana.codigo!, nombre: 'Beto' });
    expect(beto.vista?.jugadores).toHaveLength(2);
    await ana.llamar();
    expect(ana.vista?.jugadores.map((j) => j.nombre)).toEqual(['Ana', 'Beto']);
  });

  it('quien es expulsado por votación recibe el aviso aunque ya no tenga asiento', async () => {
    const { proc, avanzar } = entorno();
    const ana = new Jugador(proc, 'Ana');
    const beto = new Jugador(proc, 'Beto');
    const carla = new Jugador(proc, 'Carla');
    await ana.llamar({ t: 'crear_sala', nombre: 'Ana', modalidad: 'CLASICA', parametros: { tiempoTurnoSeg: 20, victoriasObjetivo: 7 } });
    await beto.llamar({ t: 'unirse', codigo: ana.codigo!, nombre: 'Beto' });
    await carla.llamar({ t: 'unirse', codigo: ana.codigo!, nombre: 'Carla' });
    await ana.llamar({ t: 'agregar_bot' });
    await ana.llamar({ t: 'iniciar' });
    // Ana no juega (solo da señales de vida); Beto y Carla juegan rápido.
    const jugar = async (p: Jugador): Promise<void> => {
      await p.llamar();
      const v = p.vista;
      if (!v || v.fase !== 'EN_CURSO' || v.turno?.jugadorId !== v.yoId) return;
      if (v.turno.fase === 'ROBAR') await p.llamar({ t: 'robar', origen: 'MAZO' });
      const c = p.vista!.mano[p.vista!.mano.length - 1];
      if (c && p.vista!.turno?.fase === 'DESCARTAR') await p.llamar({ t: 'descartar', cartaId: c.id });
    };
    let disponible = false;
    for (let i = 0; i < 400 && !disponible; i++) {
      avanzar(1500);
      await ana.llamar();
      await jugar(beto);
      await jugar(carla);
      disponible = !!beto.vista?.jugadores.find((j) => j.id === ana.id)?.expulsionDisponible;
    }
    expect(disponible).toBe(true);
    await beto.llamar({ t: 'iniciar_expulsion', objetivoId: ana.id! });
    await carla.llamar();
    await carla.llamar({ t: 'votar', aFavor: true });
    await ana.llamar();
    expect(ana.errores).toContain('EXPULSADO');
  });
});

describe('manejador HTTP', () => {
  const env = { ACCESO_USUARIOS: 'x=pbkdf2-sha256$600000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', SECRETO_SESION: 's'.repeat(40) };
  it('acepta la ruta tal cual y también la ruta reescrita por vercel.json', async () => {
    const { crearContexto, manejar } = await import('../src/serverless/manejador.js');
    const ctx = crearContexto(env, new AlmacenMemoria());
    for (const u of ['https://ejemplo.app/api/salud', 'https://ejemplo.app/api?__ruta=salud']) {
      const r = await manejar(new Request(u), ctx);
      expect(r.status).toBe(200);
      const d = (await r.json()) as { estado: string; baseDatos: string; tiempoReal: boolean };
      expect(d).toMatchObject({ estado: 'ok', baseDatos: 'memoria', tiempoReal: false });
    }
    const sinSesion = await manejar(new Request('https://ejemplo.app/api?__ruta=juego', { method: 'POST', headers: { origin: 'https://ejemplo.app' }, body: '{}' }), ctx);
    expect(sinSesion.status).toBe(401);
    const raro = await manejar(new Request('https://ejemplo.app/api?__ruta=../etc'), ctx);
    expect([401, 404]).toContain(raro.status);
  });
});
