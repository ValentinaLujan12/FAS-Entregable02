/* Simula partidas completas solo con bots para medir duración y detectar bloqueos. Uso: npx tsx tools/simular-bots.ts */
import { ClienteFalso, crearServicio } from '../tests/utilsServicio.js';
import type { ModalidadId } from '../src/kernel/config.js';

async function jugar(modalidad: ModalidadId, jugadores: number, semilla: number, extra: Record<string, unknown> = {}) {
  const { servicio, programador, enviar } = crearServicio({ semilla, retardoBot: [10, 10] });
  const host = new ClienteFalso();
  await enviar(host, { t: 'crear_sala', nombre: 'Host', modalidad, parametros: { pausaLiquidacionSeg: 3, ...extra } as never });
  for (let i = 1; i < jugadores; i++) await enviar(host, { t: 'agregar_bot' });
  const codigo = host.codigo!;
  // el host humano se marca autopiloto abandonando a bot: simulamos con salir? -> usamos timeouts (autopiloto) avanzando tiempo
  await enviar(host, { t: 'iniciar' });
  let rondas = 0;
  let turnos = 0;
  const t0 = performance.now();
  for (let i = 0; i < 400000; i++) {
    programador.avanzar(1000);
    const ses = servicio.inspeccionar(codigo)!;
    const p = ses.partida!;
    if (p.contarCartas() !== 52 * p.estado.mazosEnJuego + p.estado.parametros.comodines) throw new Error('cartas perdidas');
    rondas = p.estado.numeroRonda;
    turnos = p.estado.ronda?.turnoN ?? 0;
    if (p.estado.fase === 'FINALIZADA') {
      return { ok: true, rondas, turnos, virtualSeg: i, ms: Math.round(performance.now() - t0), ganador: p.estado.final!.ganadorId, motivo: p.estado.final!.motivo };
    }
  }
  return { ok: false, rondas, turnos };
}

for (const mod of ['CLASICA', 'APUNTADO'] as ModalidadId[]) {
  for (const n of [2, 4, 6]) {
    const r = await jugar(mod, n, 11 + n);
    console.log(mod.padEnd(11), `${n}j`, JSON.stringify(r));
  }
}
process.exit(0);
