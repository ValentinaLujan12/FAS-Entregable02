import { describe, expect, it } from 'vitest';
import { parseCartas } from '../src/kernel/cartas.js';
import { SKINS_CARTA } from '../src/extras/skins/skins.js';
import type { ModalidadId } from '../src/kernel/config.js';
import type { EstadoPartida } from '../src/game/tipos.js';
import { MemoryStateRepository } from '../src/persistence/MemoryStateRepository.js';
import { ClienteFalso, crearServicio } from './utilsServicio.js';

async function sala(modalidad: ModalidadId = 'CLASICA', humanos = 2, bots = 0, opts: Parameters<typeof crearServicio>[0] = {}) {
  const ctx = crearServicio(opts);
  const clientes: ClienteFalso[] = [];
  const host = new ClienteFalso();
  await ctx.enviar(host, { t: 'crear_sala', nombre: 'Host', modalidad });
  clientes.push(host);
  for (let i = 1; i < humanos; i++) {
    const c = new ClienteFalso();
    await ctx.enviar(c, { t: 'unirse', codigo: host.codigo!, nombre: `Jugador${i}` });
    clientes.push(c);
  }
  for (let i = 0; i < bots; i++) await ctx.enviar(host, { t: 'agregar_bot' });
  const codigo = host.codigo!;
  return { ...ctx, host, clientes, codigo, ses: () => ctx.servicio.inspeccionar(codigo)! };
}

const estadoDe = (p: { estado: unknown }) => p.estado as EstadoPartida;

describe('Lobby por el protocolo (RF01, RF02, RF03)', () => {
  it('crea sala con código único y el host recibe sesión + token', async () => {
    const s = await sala();
    expect(s.host.codigo).toMatch(/^[A-Z2-9]{5}$/);
    expect(s.host.token).toBeTruthy();
    expect(s.host.vista!.fase).toBe('ESPERA');
    expect(s.host.vista!.hostId).toBe(s.host.jugadorId);
  });
  it('los demás entran con el código y todos ven la lista actualizada', async () => {
    const s = await sala('APUNTADO', 3);
    expect(s.host.vista!.jugadores).toHaveLength(3);
    expect(s.clientes[2]!.vista!.jugadores.map((j) => j.nombre)).toEqual(['Host', 'Jugador1', 'Jugador2']);
  });
  it('código inexistente, nombre duplicado y sala llena se rechazan con mensajes claros', async () => {
    const s = await sala('CLASICA', 2);
    const x = new ClienteFalso();
    await s.enviar(x, { t: 'unirse', codigo: 'ZZZZZ', nombre: 'Ana' });
    expect(x.errores()[0]!.codigo).toBe('SALA_INEXISTENTE');
    await s.enviar(x, { t: 'unirse', codigo: s.codigo, nombre: 'host' });
    expect(x.errores()[1]!.codigo).toBe('NOMBRE_DUPLICADO');
    for (let i = 0; i < 4; i++) await s.enviar(s.host, { t: 'agregar_bot' });
    await s.enviar(x, { t: 'unirse', codigo: s.codigo, nombre: 'Tarde' });
    expect(x.errores()[2]!.codigo).toBe('SALA_LLENA');
  });
  it('solo el host puede configurar, agregar bots e iniciar', async () => {
    const s = await sala('CLASICA', 2);
    const otro = s.clientes[1]!;
    await s.enviar(otro, { t: 'iniciar' });
    await s.enviar(otro, { t: 'agregar_bot' });
    await s.enviar(otro, { t: 'configurar', modalidad: 'APUNTADO' });
    expect(otro.errores().map((e) => e.codigo)).toEqual(['SOLO_HOST', 'SOLO_HOST', 'SOLO_HOST']);
  });
  it('RF03: no inicia con menos de 2 jugadores e informa cuántos faltan', async () => {
    const s = await sala('CLASICA', 1);
    await s.enviar(s.host, { t: 'iniciar' });
    expect(s.host.errores()[0]!.mensaje).toContain('Faltan 1');
  });
  it('los parámetros del cliente se sanean (nunca se confía en el cliente)', async () => {
    const s = await sala('APUNTADO', 1);
    await s.enviar(s.host, { t: 'configurar', parametros: { tiempoTurnoSeg: 99999, comodines: 7, valorAs: 3 } as never });
    const p = s.host.vista!.parametros;
    expect(p.tiempoTurnoSeg).toBe(300);
    expect(p.comodines).toBe(0);
    expect(p.valorAs).toBe(1);
  });
});

describe('Partida en tiempo real', () => {
  it('privacidad: cada jugador solo ve su mano; los demás solo el número de cartas', async () => {
    const s = await sala('CLASICA', 2, 1);
    await s.enviar(s.host, { t: 'iniciar' });
    for (const c of s.clientes) {
      const v = c.vista!;
      expect(v.fase).toBe('EN_CURSO');
      expect(v.mano.length === 10 || v.mano.length === 11).toBe(true);
      const yo = v.jugadores.find((j) => j.id === v.yoId)!;
      expect(yo.numCartas).toBe(v.mano.length);
      const json = JSON.stringify(v);
      const ajenas = s.ses().partida!.activos().filter((j) => j.id !== v.yoId).flatMap((j) => s.ses().partida!.manoDe(j.id));
      for (const carta of ajenas) expect(json.includes(`"${carta.id}"`)).toBe(false);
    }
  });
  it('los eventos públicos nunca exponen datos privados (_privado)', async () => {
    const s = await sala('CLASICA', 2);
    await s.enviar(s.host, { t: 'iniciar' });
    const p = s.ses().partida!;
    const ini = p.estado.ronda!.turnoId;
    const jug = s.clientes.find((c) => c.jugadorId === ini)!;
    await s.enviar(jug, { t: 'descartar', cartaId: p.manoDe(ini)[0]!.id });
    const sig = s.clientes.find((c) => c.jugadorId === p.estado.ronda!.turnoId)!;
    await s.enviar(sig, { t: 'robar', origen: 'MAZO' });
    const ev = s.clientes[0]!.eventos().find((e) => e.tipo === 'CARTA_ROBADA' && e.datos.origen === 'MAZO')!;
    expect(ev).toBeTruthy();
    expect(ev.datos.carta).toBeNull();
    expect(JSON.stringify(s.clientes.map((c) => c.recibidos))).not.toContain('_privado');
  });
  it('RF18: un cierre inválido se notifica a TODOS y no cambia el estado', async () => {
    const s = await sala('APUNTADO', 2);
    await s.enviar(s.host, { t: 'iniciar' });
    const p = s.ses().partida!;
    const ini = p.estado.ronda!.turnoId;
    const jug = s.clientes.find((c) => c.jugadorId === ini)!;
    await s.enviar(jug, { t: 'cerrar' });
    for (const c of s.clientes) {
      const ev = c.eventos().find((e) => e.tipo === 'CIERRE_RECHAZADO');
      expect(ev?.datos.jugadorId).toBe(ini);
    }
    expect(p.estado.ronda!.turnoId).toBe(ini);
  });
  it('cierre válido por el protocolo liquida la ronda y notifica a todos', async () => {
    const s = await sala('CLASICA', 2);
    await s.enviar(s.host, { t: 'iniciar' });
    const p = s.ses().partida!;
    const ini = p.estado.ronda!.turnoId;
    (p.estado as EstadoPartida).ronda!.manos[ini] = parseCartas('2H 2C 2S 2D 5H 6H 7H 9C 9D 9S KH');
    const jug = s.clientes.find((c) => c.jugadorId === ini)!;
    await s.enviar(jug, { t: 'cerrar' });
    for (const c of s.clientes) {
      expect(c.vista!.fase).toBe('LIQUIDACION');
      expect(c.vista!.liquidacion!.ganadorId).toBe(ini);
      expect(c.eventos().some((e) => e.tipo === 'CIERRE_ACEPTADO')).toBe(true);
    }
  });
  it('validar combinación responde solo al solicitante', async () => {
    const s = await sala('CLASICA', 2);
    await s.enviar(s.host, { t: 'iniciar' });
    const p = s.ses().partida!;
    const ini = p.estado.ronda!.turnoId;
    (p.estado as EstadoPartida).ronda!.manos[ini] = parseCartas('5H 6H 7H 9C 9D 9S JC JD JH KH 2S');
    const jug = s.clientes.find((c) => c.jugadorId === ini)!;
    const otro = s.clientes.find((c) => c !== jug)!;
    const ids = p.manoDe(ini).slice(0, 3).map((c) => c.id);
    await s.enviar(jug, { t: 'validar', cartaIds: ids });
    const r = jug.recibidos.find((m) => m.t === 'validacion');
    expect(r).toMatchObject({ t: 'validacion', valida: true, tipo: 'ESCALERA' });
    expect(otro.recibidos.some((m) => m.t === 'validacion')).toBe(false);
  });
  it('RF08: al vencer el temporizador se fuerza el descarte y pasa el turno', async () => {
    const s = await sala('CLASICA', 2);
    await s.enviar(s.host, { t: 'iniciar' });
    const p = s.ses().partida!;
    const ini = p.estado.ronda!.turnoId;
    s.programador.avanzar(60_001);
    expect(p.estado.ronda!.turnoId).not.toBe(ini);
    expect(s.clientes[0]!.eventos().some((e) => e.tipo === 'TURNO_EXPIRADO')).toBe(true);
    expect(p.manoDe(ini)).toHaveLength(10);
  });
  it('piloto automático "esperando": tras 2 timeouts el jugador sigue marcado, pero su turno espera el reloj completo (sin robo anticipado)', async () => {
    const s = await sala('CLASICA', 2);
    await s.enviar(s.host, { t: 'iniciar' });
    const p = s.ses().partida!;
    const objetivo = s.host.jugadorId!;
    for (let i = 0; i < 400 && !p.jugador(objetivo)!.autopiloto; i++) s.programador.avanzar(1000);
    expect(p.jugador(objetivo)!.autopiloto).toBe(true);
    for (let i = 0; i < 400 && p.estado.ronda!.turnoId !== objetivo; i++) s.programador.avanzar(1000);
    expect(p.estado.ronda!.turnoId).toBe(objetivo);
    const n0 = p.estado.ronda!.turnoN;
    s.programador.avanzar(20_000);
    expect(p.estado.ronda!.turnoN).toBe(n0);
    expect(p.estado.ronda!.fase).toBe('ROBAR');
    expect(p.jugador(objetivo)!.autopiloto).toBe(true);
    s.programador.avanzar(41_000);
    expect(p.estado.ronda!.turnoN).toBeGreaterThan(n0);
  });
  it('inactividad: 4 turnos perdidos -> automático solo -> expulsión disponible -> alguien la inicia -> votación -> bot termina la mano', async () => {
    const s = await sala('CLASICA', 3);
    await s.enviar(s.host, { t: 'iniciar' });
    const p = s.ses().partida!;
    const ausente = s.host;
    const idAusente = ausente.jugadorId!;
    const activos = s.clientes.filter((c) => c !== ausente);
    const jugarActivos = async () => {
      const r = p.estado.ronda!;
      const c = activos.find((x) => x.jugadorId === r.turnoId);
      if (!c) return;
      if (r.fase === 'ROBAR') await s.enviar(c, { t: 'robar', origen: 'MAZO' });
      const mano = p.manoDe(c.jugadorId!);
      await s.enviar(c, { t: 'descartar', cartaId: mano[mano.length - 1]!.id });
    };
    // 1) 4 turnos perdidos -> pasa SOLO a automático (sin votación) y avisa
    for (let i = 0; i < 3000 && !p.jugador(idAusente)!.automatico; i++) {
      await jugarActivos();
      s.programador.avanzar(1000);
    }
    expect(p.jugador(idAusente)!.automatico).toBe(true);
    expect(p.estado.votacion).toBeNull();
    expect(activos[0]!.eventos().some((e) => e.tipo === 'AUTOMATICO')).toBe(true);
    // 2) en automático juega solo, mucho antes de que venza el reloj de 60 s (cada turno suyo dura segundos, no 60)
    let inicioTurnoAusente = -1;
    const duraciones: number[] = [];
    for (let i = 0; i < 20000 && !p.jugador(idAusente)!.expulsionDisponible; i++) {
      await jugarActivos();
      const suTurno = p.estado.ronda!.turnoId === ausente.jugadorId;
      if (suTurno && inicioTurnoAusente < 0) inicioTurnoAusente = s.programador.ahora();
      if (!suTurno && inicioTurnoAusente >= 0) {
        duraciones.push(s.programador.ahora() - inicioTurnoAusente);
        inicioTurnoAusente = -1;
      }
      s.programador.avanzar(100);
    }
    expect(duraciones.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...duraciones)).toBeLessThan(5000);
    // 3) queda DISPONIBLE (aviso + botón en su panel) pero NO se abre ninguna votación hasta que alguien lo pulsa
    expect(p.estado.votacion).toBeNull();
    expect(activos[0]!.eventos().some((e) => e.tipo === 'EXPULSION_DISPONIBLE')).toBe(true);
    expect(activos[0]!.vista!.jugadores.find((j) => j.id === idAusente)!.expulsionDisponible).toBe(true);
    await s.enviar(ausente, { t: 'iniciar_expulsion', objetivoId: idAusente });
    expect(p.estado.votacion).toBeNull(); // el acusado no puede iniciarla
    await s.enviar(activos[0]!, { t: 'iniciar_expulsion', objetivoId: idAusente });
    expect(activos[0]!.vista!.votacion).toMatchObject({ tipo: 'EXPULSION', objetivoId: idAusente, necesarios: 2, aFavor: 1 });
    expect(ausente.vista!.votacion!.puedoVotar).toBe(false);
    await s.enviar(ausente, { t: 'votar', aFavor: true });
    expect(ausente.errores().some((e) => e.codigo === 'ACCION_NO_PERMITIDA')).toBe(true);
    await s.enviar(activos[1]!, { t: 'votar', aFavor: true });
    expect(p.jugador(idAusente)!.esBot).toBe(true);
    expect(ausente.errores().some((e) => e.codigo === 'EXPULSADO')).toBe(true);
    expect(ausente.codigo).toBeNull();
    expect(s.ses().sala.jugadores.find((j) => j.id === idAusente)!.esBot).toBe(true);
    expect(activos[0]!.vista!.hostId).not.toBe(idAusente);
    const antes = p.estado.ronda!.turnoN;
    for (let i = 0; i < 4000 && p.estado.ronda!.turnoN === antes; i++) {
      await jugarActivos();
      s.programador.avanzar(100);
    }
    expect(p.contarCartas()).toBe(52);
  });
  it('votaciones: un humano en automático puede "retomar" el control', async () => {
    const s = await sala('CLASICA', 3);
    await s.enviar(s.host, { t: 'iniciar' });
    const p = s.ses().partida!;
    estadoDe(p).jugadores.find((j) => j.id === s.host.jugadorId)!.automatico = true;
    await s.enviar(s.host, { t: 'retomar' });
    expect(p.jugador(s.host.jugadorId!)!.automatico).toBe(false);
  });
  it('desconexión acorta el turno (8 s) y la reconexión con token recupera la sesión', async () => {
    const s = await sala('CLASICA', 2);
    await s.enviar(s.host, { t: 'iniciar' });
    const p = s.ses().partida!;
    const ini = p.estado.ronda!.turnoId;
    const jug = s.clientes.find((c) => c.jugadorId === ini)!;
    const token = jug.token!;
    const id = jug.jugadorId!;
    s.servicio.desconectar(jug);
    s.programador.avanzar(8_001);
    expect(p.estado.ronda!.turnoId).not.toBe(id);
    const nuevo = new ClienteFalso();
    await s.enviar(nuevo, { t: 'reconectar', codigo: s.codigo, token });
    expect(nuevo.jugadorId).toBe(id);
    expect(nuevo.vista!.mano.length).toBeGreaterThanOrEqual(10);
    const malo = new ClienteFalso();
    await s.enviar(malo, { t: 'reconectar', codigo: s.codigo, token: 'falso' });
    expect(malo.errores()[0]!.codigo).toBe('TOKEN_INVALIDO');
  });
  it('salir a mitad de partida: un bot continúa por el jugador y el host se transfiere', async () => {
    const s = await sala('CLASICA', 2, 1);
    await s.enviar(s.host, { t: 'iniciar' });
    const hostId = s.host.jugadorId!;
    await s.enviar(s.host, { t: 'salir' });
    const p = s.ses().partida!;
    expect(p.jugador(hostId)?.esBot).toBe(true);
    expect(s.clientes[1]!.vista!.hostId).toBe(s.clientes[1]!.jugadorId);
  });
  it('acciones fuera de fase devuelven errores del dominio', async () => {
    const s = await sala('CLASICA', 2);
    await s.enviar(s.clientes[1]!, { t: 'robar', origen: 'MAZO' });
    expect(s.clientes[1]!.errores()[0]!.codigo).toBe('FASE_INVALIDA');
    await s.enviar(s.host, { t: 'iniciar' });
    const p = s.ses().partida!;
    const noTurno = s.clientes.find((c) => c.jugadorId !== p.estado.ronda!.turnoId)!;
    await s.enviar(noTurno, { t: 'robar', origen: 'MAZO' });
    expect(noTurno.errores().pop()!.codigo).toBe('NO_ES_TU_TURNO');
  });
});

describe('Partidas completas con bots (las 2 modalidades)', () => {
  for (const mod of ['CLASICA', 'APUNTADO'] as ModalidadId[]) {
    it(`${mod}: una partida de 3 jugadores termina con ganador y conserva las cartas`, async () => {
      const ctx = crearServicio({ semilla: 5, retardoBot: [10, 10] });
      const host = new ClienteFalso();
      await ctx.enviar(host, { t: 'crear_sala', nombre: 'Host', modalidad: mod, parametros: { pausaLiquidacionSeg: 3 } as never });
      await ctx.enviar(host, { t: 'agregar_bot' });
      await ctx.enviar(host, { t: 'agregar_bot' });
      await ctx.enviar(host, { t: 'iniciar' });
      const codigo = host.codigo!;
      let fin = false;
      for (let i = 0; i < 200000 && !fin; i++) {
        ctx.programador.avanzar(1000);
        const p = ctx.servicio.inspeccionar(codigo)!.partida!;
        expect(p.contarCartas()).toBe(52 * p.estado.mazosEnJuego);
        fin = p.estado.fase === 'FINALIZADA';
      }
      expect(fin).toBe(true);
      expect(host.vista!.final!.ganadorId).toBeTruthy();
      expect(host.vista!.final!.posiciones.map((x) => x.posicion)).toEqual([1, 2, 3]);
      expect(ctx.servicio.inspeccionar(codigo)!.sala.estado).toBe('FINALIZADA');
    });
  }
  it('APUNTADO con cierre estricto (sin sobrante): una partida de 3 jugadores termina y conserva las cartas', async () => {
    const ctx = crearServicio({ semilla: 5, retardoBot: [10, 10] });
    const host = new ClienteFalso();
    await ctx.enviar(host, { t: 'crear_sala', nombre: 'Host', modalidad: 'APUNTADO', parametros: { pausaLiquidacionSeg: 3, permitirCierreConSobrante: false } as never });
    await ctx.enviar(host, { t: 'agregar_bot' });
    await ctx.enviar(host, { t: 'agregar_bot' });
    await ctx.enviar(host, { t: 'iniciar' });
    expect(host.vista!.parametros.permitirCierreConSobrante).toBe(false);
    const codigo = host.codigo!;
    let fin = false;
    for (let i = 0; i < 200000 && !fin; i++) {
      ctx.programador.avanzar(1000);
      const p = ctx.servicio.inspeccionar(codigo)!.partida!;
      expect(p.contarCartas()).toBe(52 * p.estado.mazosEnJuego);
      fin = p.estado.fase === 'FINALIZADA';
    }
    expect(fin).toBe(true);
    expect(host.vista!.final!.ganadorId).toBeTruthy();
  });
  it('revancha: nueva_partida vuelve a la sala de espera y permite iniciar otra', async () => {
    const ctx = crearServicio({ semilla: 9, retardoBot: [10, 10] });
    const host = new ClienteFalso();
    await ctx.enviar(host, { t: 'crear_sala', nombre: 'Host', modalidad: 'CLASICA', parametros: { victoriasObjetivo: 1, pausaLiquidacionSeg: 3 } as never });
    await ctx.enviar(host, { t: 'agregar_bot' });
    await ctx.enviar(host, { t: 'iniciar' });
    for (let i = 0; i < 100000 && host.vista!.fase !== 'FINALIZADA'; i++) ctx.programador.avanzar(1000);
    expect(host.vista!.fase).toBe('FINALIZADA');
    await ctx.enviar(host, { t: 'nueva_partida' });
    expect(host.vista!.fase).toBe('ESPERA');
    await ctx.enviar(host, { t: 'iniciar' });
    expect(host.vista!.fase).toBe('EN_CURSO');
    const seqs = host.eventos().map((e) => e.seq);
    expect(new Set(seqs).size).toBe(seqs.length); // seq continúa sin repetirse entre partidas
  });
});

describe('Persistencia y recuperación (RF14, RF19, A2 de CU-04)', () => {
  it('tras "reiniciar" el servidor se recupera la partida y los jugadores reconectan con su token', async () => {
    const repo = new MemoryStateRepository();
    const a = await sala('APUNTADO', 2, 1, { repo });
    await a.enviar(a.host, { t: 'iniciar' });
    const p = a.ses().partida!;
    const ini = p.estado.ronda!.turnoId;
    const jug = a.clientes.find((c) => c.jugadorId === ini);
    if (jug) await a.enviar(jug, { t: 'descartar', cartaId: p.manoDe(ini)[0]!.id });
    await a.servicio.cerrar(); // vacía la cola de escrituras
    const tokens = a.clientes.map((c) => ({ id: c.jugadorId!, token: c.token! }));
    const snapshotTurno = a.ses().partida!.estado.ronda!.turnoId;

    const b = crearServicio({ repo, semilla: 99 });
    expect(await b.servicio.restaurarActivas()).toBe(1);
    const otro = new ClienteFalso();
    await b.enviar(otro, { t: 'reconectar', codigo: a.codigo, token: tokens[0]!.token });
    expect(otro.jugadorId).toBe(tokens[0]!.id);
    expect(otro.vista!.fase).toBe('EN_CURSO');
    expect(b.servicio.inspeccionar(a.codigo)!.partida!.estado.ronda!.turnoId).toBe(snapshotTurno);
  });
  it('historial: exige token de jugador y oculta cartas privadas mientras la partida sigue', async () => {
    const s = await sala('CLASICA', 2);
    await s.enviar(s.host, { t: 'iniciar' });
    const p = s.ses().partida!;
    const ini = p.estado.ronda!.turnoId;
    (p.estado as EstadoPartida).ronda!.manos[ini] = parseCartas('2H 2C 2S 2D 5H 6H 7H 9C 9D 9S KH');
    await s.enviar(s.clientes.find((c) => c.jugadorId === ini)!, { t: 'cerrar' });
    await s.servicio.cerrar();
    const malo = await s.servicio.historial(s.codigo, 'nope');
    expect(malo.ok).toBe(false);
    const ok = await s.servicio.historial(s.codigo, s.host.token!);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.historial.rondas).toHaveLength(1);
      expect(ok.historial.rondas[0]!.manosIniciales).toEqual({});
      expect(JSON.stringify(ok.historial.eventos)).not.toContain('_privado');
      expect(ok.historial.eventos.some((e) => e.tipo === 'CIERRE_ACEPTADO')).toBe(true);
    }
  });
});

describe('Estilo (skins, mockup)', () => {
  it('los bots reciben una skin de cartas válida del catálogo', async () => {
    const s = await sala('CLASICA', 1, 4);
    const bots = s.host.vista!.jugadores.filter((j) => j.esBot);
    expect(bots).toHaveLength(4);
    for (const b of bots) expect(SKINS_CARTA.map((k) => k.id)).toContain(b.skinCartas);
  });
  it('el estilo de una cuenta no cambia durante la partida (se reaplica al volver a la sala)', async () => {
    const ctx = crearServicio();
    const a = new ClienteFalso();
    await ctx.enviar(a, { t: 'cuenta_abrir' });
    await ctx.enviar(a, { t: 'crear_sala', nombre: 'Ana', modalidad: 'CLASICA' });
    await ctx.enviar(a, { t: 'agregar_bot' });
    await ctx.enviar(a, { t: 'iniciar' });
    const antes = a.vista!.jugadores.find((j) => j.id === a.jugadorId)!.skinCartas;
    await ctx.enviar(a, { t: 'cuenta_recargar' });
    const cara = SKINS_CARTA.filter((k) => k.premium && k.id !== antes)[0]!;
    await ctx.enviar(a, { t: 'cuenta_comprar', tipo: 'carta', id: cara.id });
    expect(a.cuenta!.elegidas.carta).toBe(cara.id); // la cuenta sí cambia...
    expect(a.vista!.jugadores.find((j) => j.id === a.jugadorId)!.skinCartas).toBe(antes); // ...la mesa en curso no
  });
});
