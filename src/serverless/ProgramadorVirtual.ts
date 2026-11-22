import type { ITemporizadorTurno, TipoTarea } from '../infra/Programador.js';

/**
 * Reloj de una petición serverless. No hay procesos encendidos entre peticiones, así que el tiempo se "pone al día"
 * al atender cada una:
 *  - las tareas de tipo "reloj" (fin de turno, votación, pausa entre rondas) se ejecutan solo si su plazo ya pasó;
 *  - las jugadas de bots y sus reacciones se ejecutan en cadena de inmediato, adelantando el reloj virtual el
 *    retardo de cada una. El cliente reproduce después los mensajes en su momento (cada mensaje lleva su hora).
 * La primera tarea "reloj" pendiente al terminar es `proximoEn`: el cliente vuelve a llamar en ese instante.
 */
export class ProgramadorVirtual implements ITemporizadorTurno {
  private t: number;
  private tareas: Array<{ en: number; fn: () => void; id: number; tipo: TipoTarea }> = [];
  private contador = 0;

  constructor(inicio: number) {
    this.t = inicio;
  }

  ahora(): number {
    return this.t;
  }

  programar(ms: number, fn: () => void, tipo: TipoTarea = 'reloj'): () => void {
    const id = ++this.contador;
    this.tareas.push({ en: this.t + Math.max(0, ms), fn, id, tipo });
    return () => {
      this.tareas = this.tareas.filter((x) => x.id !== id);
    };
  }

  /**
   * Ejecuta, en orden de vencimiento, todo lo que ya debe haber ocurrido hasta `limiteReal`, más las cadenas de bots.
   * Devuelve cuántas tareas se ejecutaron (con tope para no entrar nunca en un ciclo infinito).
   */
  ponerAlDia(limiteReal: number, tope = 600): number {
    let n = 0;
    for (; n < tope; n++) {
      this.tareas.sort((a, b) => a.en - b.en || a.id - b.id);
      const limite = Math.max(limiteReal, this.t);
      const elegida = this.tareas.find((x) => x.tipo !== 'reloj' || x.en <= limite);
      if (!elegida) break;
      this.tareas = this.tareas.filter((x) => x.id !== elegida.id);
      this.t = Math.max(this.t, elegida.en);
      elegida.fn();
    }
    return n;
  }

  /** Vencimiento de la próxima tarea pendiente (null si no hay ninguna). */
  proximoEn(): number | null {
    const pend = this.tareas.filter((x) => x.tipo === 'reloj');
    return pend.length ? Math.min(...pend.map((x) => x.en)) : null;
  }

  descartarTodo(): void {
    this.tareas = [];
  }
}
