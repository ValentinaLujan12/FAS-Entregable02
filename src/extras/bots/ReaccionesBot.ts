import type { EventoJuego } from '../../kernel/protocolo.js';
import type { PlanReaccion, ProbabilidadesBot } from '../../game/puertos.js';

export type { PlanReaccion, ProbabilidadesBot } from '../../game/puertos.js';

export const PROBABILIDADES_POR_DEFECTO: ProbabilidadesBot = {
  saludarAlEntrarBot: 0.5,
  saludarAlEntrarHumano: 0.45,
  responderSaludo: 0.4,
  alardearAlGanar: 0.55,
  comentarGanadorAjeno: 0.12,
  tomarPozo: 0.22,
  quejaMazoInutil: 0.14,
  celebrarMazoUtil: 0.07,
  ggFinal: 0.3,
  enfriamientoMs: 18_000,
  retardoMs: [700, 2400],
};

/** Decide (sin efectos) qué reacciones lanzan los bots ante cada suceso. `azar` devuelve un número en [0,1). */
export class PlanificadorReacciones {
  private readonly ultimoRobo = new Map<string, string>();
  private readonly ultima = new Map<string, number>();

  constructor(
    private readonly p: ProbabilidadesBot = PROBABILIDADES_POR_DEFECTO,
    private readonly azar: () => number = Math.random,
    private readonly reloj: () => number = Date.now,
  ) {}

  private elegir<T>(lista: readonly T[]): T {
    return lista[Math.min(lista.length - 1, Math.floor(this.azar() * lista.length))]!;
  }

  /** Reparte con pesos: [[valor, peso], ...] */
  private ponderado(opciones: ReadonlyArray<readonly [string, number]>): string {
    const total = opciones.reduce((a, [, w]) => a + w, 0);
    let x = this.azar() * total;
    for (const [v, w] of opciones) {
      x -= w;
      if (x < 0) return v;
    }
    return opciones[opciones.length - 1]![0];
  }

  private plan(botId: string, id: string): PlanReaccion | null {
    const ahora = this.reloj();
    if (ahora - (this.ultima.get(botId) ?? -Infinity) < this.p.enfriamientoMs) return null;
    this.ultima.set(botId, ahora);
    const [a, b] = this.p.retardoMs;
    return { jugadorId: botId, id, retrasoMs: Math.round(a + this.azar() * (b - a)) };
  }

  private con(prob: number): boolean {
    return this.azar() < prob;
  }

  /** Alguien entró a la sala. `botsPresentes` = ids de bots que ya estaban (sin contar a quien entra). */
  alEntrar(entra: { id: string; esBot: boolean }, botsPresentes: readonly string[]): PlanReaccion[] {
    const out: PlanReaccion[] = [];
    if (entra.esBot) {
      if (this.con(this.p.saludarAlEntrarBot)) {
        const r = this.plan(entra.id, 'hola');
        if (r) out.push(r);
      }
    } else if (botsPresentes.length && this.con(this.p.saludarAlEntrarHumano)) {
      const r = this.plan(this.elegir(botsPresentes), 'hola');
      if (r) out.push(r);
    }
    return out;
  }

  /** Un humano envió una reacción: si fue un saludo, a veces un bot responde. */
  alReaccionHumana(id: string, botsPresentes: readonly string[]): PlanReaccion[] {
    if (id !== 'hola' || !botsPresentes.length || !this.con(this.p.responderSaludo)) return [];
    const r = this.plan(this.elegir(botsPresentes), this.ponderado([['hola', 7], ['jaja', 2], ['gracias', 1]]));
    return r ? [r] : [];
  }

  /**
   * Eventos públicos+privados de la partida (los `_privado` los usa solo el servidor).
   * `esBot(id)`: bot real (no un humano en automático). `bots`: ids de bots vigentes en la mesa.
   */
  alEventos(eventos: readonly EventoJuego[], esBot: (id: string) => boolean, bots: readonly string[]): PlanReaccion[] {
    const out: PlanReaccion[] = [];
    const agregar = (r: PlanReaccion | null) => {
      if (r) out.push(r);
    };
    for (const e of eventos) {
      const d = e.datos as Record<string, any>;
      switch (e.tipo) {
        case 'CARTA_ROBADA': {
          const id = String(d.jugadorId);
          if (!esBot(id)) break;
          if (d.origen === 'POZO') {
            this.ultimoRobo.delete(id);
            if (this.con(this.p.tomarPozo)) agregar(this.plan(id, this.ponderado([['celebro', 6], ['sarcasmo', 3], ['facil', 1]])));
          } else {
            this.ultimoRobo.set(id, String(d._privado?.cartaId ?? ''));
          }
          break;
        }
        case 'CARTA_DESCARTADA': {
          const id = String(d.jugadorId);
          if (!esBot(id) || d.forzado) break;
          const robada = this.ultimoRobo.get(id);
          this.ultimoRobo.delete(id);
          if (!robada) break;
          if (d.carta?.id === robada) {
            if (this.con(this.p.quejaMazoInutil)) agregar(this.plan(id, this.ponderado([['queja', 7], ['uy', 3]])));
          } else if (this.con(this.p.celebrarMazoUtil)) agregar(this.plan(id, 'celebro'));
          break;
        }
        case 'RONDA_LIQUIDADA': {
          const g = String(d.ganadorId);
          if (esBot(g)) {
            if (this.con(this.p.alardearAlGanar)) agregar(this.plan(g, this.ponderado([['facil', 5], ['jaja', 3], ['sarcasmo', 2]])));
          } else {
            const otros = bots.filter((b) => b !== g);
            if (otros.length && this.con(this.p.comentarGanadorAjeno)) agregar(this.plan(this.elegir(otros), this.ponderado([['gg', 5], ['uy', 3], ['wow', 2]])));
          }
          break;
        }
        case 'PARTIDA_FINALIZADA': {
          const g = String(d.ganadorId);
          const otros = bots.filter((b) => b !== g);
          if (esBot(g)) agregar(this.plan(g, this.ponderado([['facil', 4], ['celebro', 4], ['jaja', 2]])));
          if (otros.length && this.con(this.p.ggFinal)) agregar(this.plan(this.elegir(otros), 'gg'));
          break;
        }
        default:
          break;
      }
    }
    return out;
  }
}
