import { randomInt } from 'node:crypto';
import { type Carta, PINTAS, VALORES, crearCarta } from '../kernel/cartas.js';

/** Fuente de aleatoriedad inyectable: criptográfica en producción, con semilla en pruebas (Testability). */
export interface Aleatorio {
  /** Entero en [0, maxExclusivo). */
  entero(maxExclusivo: number): number;
}

export class AleatorioSeguro implements Aleatorio {
  entero(maxExclusivo: number): number {
    return maxExclusivo <= 1 ? 0 : randomInt(maxExclusivo);
  }
}

/** mulberry32: determinista para pruebas y reproducción de disputas. */
export class AleatorioSemilla implements Aleatorio {
  private s: number;
  constructor(semilla: number) {
    this.s = semilla >>> 0;
  }
  private siguiente(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  entero(maxExclusivo: number): number {
    return Math.floor(this.siguiente() * maxExclusivo);
  }
}

export interface ConfigBaraja {
  mazos: 1 | 2;
  comodines: 0 | 2 | 4;
}

/** Inicializa la baraja estándar de 52 cartas x mazos (+ comodines opcionales). */
export function crearBaraja({ mazos, comodines }: ConfigBaraja): Carta[] {
  const cartas: Carta[] = [];
  for (let m = 0; m < mazos; m++) {
    for (const pinta of PINTAS) for (const valor of VALORES) cartas.push(crearCarta(valor, pinta, m));
  }
  for (let j = 0; j < comodines; j++) cartas.push(crearCarta('JK', null, j));
  return cartas;
}

/** Fisher-Yates. No muta la entrada. */
export function barajar<T>(entrada: readonly T[], rng: Aleatorio): T[] {
  const a = [...entrada];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.entero(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
