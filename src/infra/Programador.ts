/**
 * TemporizadorTurno (InfraDomain, Entregable 2: ITemporizadorTurno): abstrae el paso del tiempo para los plazos de turno,
 * de votación y de pausa entre rondas, y para las jugadas diferidas de los bots.
 * Implementaciones: ProgramadorVirtual (serverless, ADR-13), ProgramadorReal (setTimeout) y ProgramadorFalso (pruebas).
 */
/** Clase de tarea: "reloj" = plazo real (turno, votación, pausa); "bot" = jugada de un bot; "cosmetico" = reacción de bot. */
export type TipoTarea = 'reloj' | 'bot' | 'cosmetico';

/** Puerto pTimer (game -> infra). */
export interface ITemporizadorTurno {
  ahora(): number;
  /** Ejecuta `fn` tras `ms`. Devuelve la función que la cancela. */
  programar(ms: number, fn: () => void, tipo?: TipoTarea): () => void;
}

export class ProgramadorReal implements ITemporizadorTurno {
  ahora(): number {
    return Date.now();
  }
  programar(ms: number, fn: () => void): () => void {
    const t = setTimeout(fn, Math.max(0, ms));
    return () => clearTimeout(t);
  }
}

/** Reloj virtual: `avanzar(ms)` dispara, en orden, las tareas vencidas. */
export class ProgramadorFalso implements ITemporizadorTurno {
  private t: number;
  private tareas: Array<{ en: number; fn: () => void; id: number }> = [];
  private contador = 0;
  constructor(inicio = 1_700_000_000_000) {
    this.t = inicio;
  }
  ahora(): number {
    return this.t;
  }
  programar(ms: number, fn: () => void): () => void {
    const id = ++this.contador;
    this.tareas.push({ en: this.t + Math.max(0, ms), fn, id });
    return () => {
      this.tareas = this.tareas.filter((x) => x.id !== id);
    };
  }
  pendientes(): number {
    return this.tareas.length;
  }
  avanzar(ms: number): void {
    const limite = this.t + ms;
    for (;;) {
      this.tareas.sort((a, b) => a.en - b.en || a.id - b.id);
      const sig = this.tareas[0];
      if (!sig || sig.en > limite) break;
      this.tareas.shift();
      this.t = sig.en;
      sig.fn();
    }
    this.t = limite;
  }
}
