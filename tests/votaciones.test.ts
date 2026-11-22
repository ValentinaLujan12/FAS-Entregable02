import { describe, expect, it } from 'vitest';
import type { PartidaEnCurso } from '../src/game/PartidaEnCurso.js';
import { PartidaEnCurso as P } from '../src/game/PartidaEnCurso.js';
import { parametrosPorDefecto } from '../src/kernel/config.js';
import { deps, jugadores, nuevaPartida } from './utils.js';

/** El jugador con el turno juega normalmente (robar + descartar) salvo el ausente, cuyo turno vence. */
function avanzar(partida: PartidaEnCurso, ausente: string, auto = false): void {
  const r = partida.estado.ronda!;
  const id = r.turnoId;
  if (id === ausente) {
    if (auto) {
      if (r.fase === 'ROBAR') partida.robar(id, 'MAZO', true);
      const mano = partida.manoDe(id);
      partida.descartar(id, mano[mano.length - 1]!.id, true);
    } else partida.expirarTurno(r.turnoN);
    return;
  }
  if (r.fase === 'ROBAR') partida.robar(id, 'MAZO');
  const mano = partida.manoDe(id);
  partida.descartar(id, mano[mano.length - 1]!.id);
}

/** Avanza hasta que el ausente acumula `n` saltos. */
function saltar(partida: PartidaEnCurso, ausente: string, n: number, auto = false): void {
  const j = partida.jugador(ausente)!;
  const objetivo = j.saltos + n;
  for (let i = 0; i < 100 && j.saltos < objetivo; i++) avanzar(partida, ausente, auto);
}

const evs = (r: { ok: boolean; eventos?: { tipo: string }[] }) => (r.eventos ?? []).map((e) => e.tipo);

/** Deja a j1 en automático y con la expulsión disponible (3 turnos jugados por el sistema). */
function hastaDisponible(partida: PartidaEnCurso): void {
  saltar(partida, 'j1', 4);
  saltar(partida, 'j1', 3, true);
}

describe('Inactividad: automático (sin votación) y expulsión (a petición)', () => {
  it('con 3 turnos saltados no pasa a automático; con el 4.º (más de 3 seguidos) pasa SOLO, sin votación', () => {
    const { partida } = nuevaPartida('CLASICA', 4);
    saltar(partida, 'j1', 3);
    expect(partida.jugador('j1')!.automatico).toBe(false);
    saltar(partida, 'j1', 1);
    expect(partida.jugador('j1')!.automatico).toBe(true);
    expect(partida.estado.votacion).toBeNull();
    expect(partida.jugador('j1')!.expulsionDisponible).toBe(false);
  });
  it('en automático el sistema juega; tras 3 turnos queda DISPONIBLE la expulsión (flag + evento), sin abrir votación', () => {
    const { partida } = nuevaPartida('CLASICA', 4);
    saltar(partida, 'j1', 4);
    saltar(partida, 'j1', 2, true);
    expect(partida.jugador('j1')!.expulsionDisponible).toBe(false);
    const j = partida.jugador('j1')!;
    // el tercer turno automático dispara el aviso
    let visto = false;
    for (let i = 0; i < 40 && !visto; i++) {
      const r = partida.estado.ronda!;
      const id = r.turnoId;
      if (id === 'j1') {
        if (r.fase === 'ROBAR') partida.robar(id, 'MAZO', true);
        const res = partida.descartar(id, partida.manoDe(id).at(-1)!.id, true);
        visto = res.ok && res.eventos.some((e) => e.tipo === 'EXPULSION_DISPONIBLE');
      } else avanzar(partida, 'j1');
    }
    expect(visto).toBe(true);
    expect(j.expulsionDisponible).toBe(true);
    expect(partida.estado.votacion).toBeNull();
  });
  it('solo cuando alguien pulsa el botón se abre la votación de expulsión y su voto cuenta a favor', () => {
    const { partida } = nuevaPartida('CLASICA', 4);
    hastaDisponible(partida);
    expect(partida.puedeIniciarExpulsion('j2', 'j1')).toBe(true);
    expect(partida.puedeIniciarExpulsion('j1', 'j1')).toBe(false); // el acusado no
    const r = partida.iniciarExpulsion('j2', 'j1');
    expect(r.ok && evs(r)).toContain('VOTACION_ABIERTA');
    const v = partida.votacionVista('j3')!;
    expect(v.tipo).toBe('EXPULSION');
    expect(v.elegibles).toBe(3);
    expect(v.necesarios).toBe(2);
    expect(v.aFavor).toBe(1);
    expect(partida.votacionVista('j2')!.puedoVotar).toBe(false); // ya votó al iniciar
  });
  it('no se puede iniciar sin estar disponible, ni hay votación automática previa', () => {
    const { partida } = nuevaPartida('CLASICA', 4);
    saltar(partida, 'j1', 4);
    expect(partida.iniciarExpulsion('j2', 'j1').ok).toBe(false);
    expect(partida.iniciarExpulsion('j2', 'j2').ok).toBe(false);
  });
  it('mayoría = floor(N/2)+1 de los elegibles: aprobado -> el jugador pasa a bot y se informa', () => {
    const { partida } = nuevaPartida('CLASICA', 4);
    hastaDisponible(partida);
    partida.iniciarExpulsion('j2', 'j1');
    expect(partida.votar('j2', true).ok).toBe(false); // voto repetido
    const r = partida.votar('j4', true);
    expect(r.ok && r.expulsado).toBe('j1');
    expect(partida.jugador('j1')!.esBot).toBe(true);
    expect(partida.jugador('j1')!.automatico).toBe(false);
    expect(partida.jugador('j1')!.expulsionDisponible).toBe(false);
    expect(r.ok && evs(r)).toContain('JUGADOR_EXPULSADO');
  });
  it('un bot no vota y el acusado tampoco', () => {
    const { partida } = nuevaPartida('CLASICA', 3);
    estadoDe(partida).jugadores[2]!.esBot = true; // j3 es bot -> solo j2 vota
    hastaDisponible(partida);
    expect(partida.jugador('j1')!.expulsionDisponible).toBe(true);
    expect(partida.iniciarExpulsion('j3', 'j1').ok).toBe(false);
    const r = partida.iniciarExpulsion('j2', 'j1');
    expect(r.ok && r.expulsado).toBe('j1'); // 1 elegible, 1 voto: mayoría
    expect(partida.votar('j1', true).ok).toBe(false);
  });
  it('rechazo anticipado cuando ya no se alcanza la mayoría; se enfría antes de volver a avisar', () => {
    const d = { ...deps(), votacion: { saltosMin: 2, turnosAutoMin: 1, enfriamientoSaltos: 2 } };
    const r0 = P.iniciar('T', parametrosPorDefecto('CLASICA'), jugadores(4), d);
    if (!r0.ok) throw new Error(r0.mensaje);
    const partida = r0.partida;
    saltar(partida, 'j1', 2);
    saltar(partida, 'j1', 1, true);
    expect(partida.jugador('j1')!.expulsionDisponible).toBe(true);
    partida.iniciarExpulsion('j2', 'j1'); // elegibles 3 -> necesarios 2
    partida.votar('j3', false);
    const r = partida.votar('j4', false);
    expect(r.ok && r.eventos.find((e) => e.tipo === 'VOTACION_CERRADA')!.datos.resultado).toBe('RECHAZADA');
    expect(partida.estado.votacion).toBeNull();
    expect(partida.jugador('j1')!.expulsionDisponible).toBe(false);
    expect(partida.jugador('j1')!.automatico).toBe(true); // sigue en automático
    saltar(partida, 'j1', 1, true);
    expect(partida.jugador('j1')!.expulsionDisponible).toBe(false); // enfriando
    saltar(partida, 'j1', 1, true);
    expect(partida.jugador('j1')!.expulsionDisponible).toBe(true);
  });
  it('si vence el plazo sin mayoría se rechaza', () => {
    const { partida } = nuevaPartida('CLASICA', 4);
    hastaDisponible(partida);
    partida.iniciarExpulsion('j2', 'j1');
    const id = partida.estado.votacion!.id;
    const r = partida.expirarVotacion(id);
    expect(r.ok && r.eventos[0]!.datos.resultado).toBe('RECHAZADA');
    expect(partida.jugador('j1')!.esBot).toBe(false);
  });
  it('si el humano actúa (retoma) sale del automático, se oculta el botón y se cancela la votación', () => {
    const { partida } = nuevaPartida('CLASICA', 4);
    hastaDisponible(partida);
    partida.iniciarExpulsion('j2', 'j1');
    const r = partida.retomar('j1');
    expect(r.ok && r.eventos.map((e) => e.datos.resultado)).toContain('CANCELADA');
    expect(partida.estado.votacion).toBeNull();
    expect(partida.jugador('j1')!.automatico).toBe(false);
    expect(partida.jugador('j1')!.expulsionDisponible).toBe(false);
    expect(partida.jugador('j1')!.saltos).toBe(0);
  });
  it('reconectar equivale a retomar el control', () => {
    const { partida } = nuevaPartida('CLASICA', 4);
    hastaDisponible(partida);
    partida.iniciarExpulsion('j2', 'j1');
    const ev = partida.setConectado('j1', false);
    void ev;
    const ev2 = partida.setConectado('j1', true);
    expect(ev2.some((e) => e.tipo === 'VOTACION_CERRADA') || partida.estado.votacion === null).toBe(true);
    expect(partida.jugador('j1')!.expulsionDisponible).toBe(false);
  });
  it('sin votantes elegibles (solo bots alrededor) nunca queda disponible la expulsión', () => {
    const d = deps();
    const r = P.iniciar('T', parametrosPorDefecto('CLASICA'), [...jugadores(1), { id: 'b1', nombre: 'B1', esBot: true }, { id: 'b2', nombre: 'B2', esBot: true }], d);
    if (!r.ok) throw new Error(r.mensaje);
    saltar(r.partida, 'j1', 5);
    saltar(r.partida, 'j1', 6, true);
    expect(r.partida.jugador('j1')!.expulsionDisponible).toBe(false);
    expect(r.partida.estado.votacion).toBeNull();
  });
  it('los umbrales son configurables por dependencia (pruebas / futuras opciones de sala)', () => {
    const d = { ...deps(), votacion: { saltosMin: 2, turnosAutoMin: 1 } };
    const r = P.iniciar('T', parametrosPorDefecto('CLASICA'), jugadores(3), d);
    if (!r.ok) throw new Error(r.mensaje);
    saltar(r.partida, 'j1', 2);
    expect(r.partida.jugador('j1')!.automatico).toBe(true);
    saltar(r.partida, 'j1', 1, true);
    expect(r.partida.jugador('j1')!.expulsionDisponible).toBe(true);
  });
});

function estadoDe(p: PartidaEnCurso) {
  return p.estado as import('../src/game/tipos.js').EstadoPartida;
}
