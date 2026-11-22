import { type Carta, type ValorNatural, rangoNumerico } from '../kernel/cartas.js';
import type { AceEscalera } from '../kernel/config.js';
import type { Combinacion, Particion, TipoCombinacion } from './IReglaJuego.js';

export type { Combinacion, Particion, TipoCombinacion } from './IReglaJuego.js';

/**
 * HandEvaluator (HandEvaluatorComponent): núcleo COMPARTIDO por todas las modalidades. El cambio de modalidad no
 * modifica la validación de combinaciones (terna, cuarta, escalera).
 *
 * Combinación válida:
 *  - GRUPO:    mismo valor, mínimo 3 cartas (cualquier pinta).
 *  - ESCALERA: valores consecutivos, MISMA pinta, mínimo 3 cartas (el orden en la mano no importa).
 *  - El comodín (si la mesa lo permite) sustituye cualquier carta; se exigen al menos 2 cartas naturales.
 *
 * Clase pura: sin base de datos, sin interfaz, sin reloj (driver Testability). Cada método tiene complejidad
 * ciclomática <= 4 (regla G3 del Entregable 2 para los evaluadores).
 */
export interface OpcionesCombinacion {
  aceEscalera: AceEscalera;
}

export interface RequisitoTamano {
  readonly tamano: number;
  readonly cantidad: number;
}

type Modo = 'BAJO' | 'ALTO';

interface Candidato {
  readonly mask: number;
  readonly tamano: number;
  readonly combinacion: Combinacion;
}

interface Nodo {
  readonly costo: number;
  readonly elegido: Candidato | null;
}

const MIN_COMBINACION = 3;
const MIN_NATURALES = 2;
const TAMANOS_LIBRES: readonly number[] = [3, 4, 5];
const NODO_VACIO: Nodo = { costo: 0, elegido: null };

/** Modos del As y límites de la ventana de una escalera según la configuración de la mesa. */
const MODOS: Readonly<Record<AceEscalera, readonly Modo[]>> = { AMBOS: ['BAJO', 'ALTO'], BAJO: ['BAJO'], ALTO: ['ALTO'] };
const PISO: Readonly<Record<AceEscalera, number>> = { AMBOS: 1, BAJO: 1, ALTO: 2 };
const TECHO: Readonly<Record<AceEscalera, number>> = { AMBOS: 14, BAJO: 13, ALTO: 14 };

const popcount = (n: number): number => {
  let c = 0;
  for (let x = n; x; x &= x - 1) c++;
  return c;
};
const bajoBit = (mask: number): number => 31 - Math.clz32(mask & -mask);
const bit = (i: number): number => 1 << i;
const contiene = (mask: number, i: number): boolean => (mask & bit(i)) !== 0;
const esNatural = (c: Carta): boolean => !c.esComodin;
/** Costo de una carta suelta: sus puntos pesan más que la cantidad de sueltas (desempate). */
const costoSuelta = (puntos: number): number => puntos * 16 + 1;
const subconjunto = (cartas: readonly Carta[], mask: number): Carta[] => cartas.filter((_, i) => contiene(mask, i));

function mismaPinta(naturales: readonly Carta[]): boolean {
  const pinta = naturales[0]!.pinta;
  return naturales.every((c) => c.pinta === pinta);
}

function sinRepetidos(naturales: readonly Carta[]): boolean {
  return new Set(naturales.map((c) => c.valor)).size === naturales.length;
}

/** ¿Caben las posiciones en una ventana de `tamano` casillas consecutivas dentro de [piso, techo]? */
function cabeEnVentana(pos: readonly number[], tamano: number, piso: number, techo: number): boolean {
  const min = Math.min(...pos);
  const max = Math.max(...pos);
  if (max - min + 1 > tamano) return false;
  return Math.max(max - tamano + 1, piso) <= Math.min(min, techo - tamano + 1);
}

/** Comodines que rellenan el hueco entre dos cartas naturales consecutivas de la escalera. */
function huecoEntre(actual: Carta, siguiente: Carta | undefined, rango: (c: Carta) => number): number {
  return siguiente ? rango(siguiente) - rango(actual) - 1 : 0;
}

function agruparPorBajo(cands: readonly Candidato[], n: number): Candidato[][] {
  const grupos: Candidato[][] = Array.from({ length: n }, () => []);
  for (const c of cands) grupos[bajoBit(c.mask)]!.push(c);
  return grupos;
}

function agruparPorTamano(cands: readonly Candidato[], tamanos: readonly number[]): Map<number, Candidato[]> {
  return new Map(tamanos.map((t) => [t, cands.filter((c) => c.tamano === t)]));
}

/** Lista de casillas a llenar, de mayor a menor tamaño (ej. 4-3-3 => [4, 3, 3]). */
function expandirCasillas(requisitos: readonly RequisitoTamano[]): number[] {
  return [...requisitos]
    .sort((a, b) => b.tamano - a.tamano)
    .flatMap((r) => Array.from({ length: r.cantidad }, () => r.tamano));
}

function costoLibres(usado: number, pts: readonly number[]): number {
  return pts.reduce((acc, p, i) => (contiene(usado, i) ? acc : acc + costoSuelta(p)), 0);
}

function particionDe(cartas: readonly Carta[], elegidos: readonly Candidato[]): Particion {
  const usado = elegidos.reduce((m, c) => m | c.mask, 0);
  return { combinaciones: elegidos.map((c) => c.combinacion), sobrantes: cartas.filter((_, i) => !contiene(usado, i)) };
}

/**
 * Mejor partición libre: minimiza los puntos de las cartas sueltas y, a igual puntaje, la cantidad de sueltas.
 * Programación dinámica sobre máscaras (2^n estados, n <= 12): determinista y por debajo de 100 ms.
 */
class ParticionMinima {
  private readonly memo = new Map<number, Nodo>();

  constructor(
    private readonly porBajo: readonly Candidato[][],
    private readonly pts: readonly number[],
  ) {}

  resolver(mask: number): Nodo {
    if (mask === 0) return NODO_VACIO;
    return this.memo.get(mask) ?? this.calcular(mask);
  }

  private calcular(mask: number): Nodo {
    const low = bajoBit(mask);
    let mejor: Nodo = { costo: costoSuelta(this.pts[low]!) + this.resolver(mask & ~bit(low)).costo, elegido: null };
    for (const cand of this.porBajo[low]!) mejor = this.mejorEntre(mejor, cand, mask);
    this.memo.set(mask, mejor);
    return mejor;
  }

  private mejorEntre(mejor: Nodo, cand: Candidato, mask: number): Nodo {
    if ((cand.mask & mask) !== cand.mask) return mejor;
    const costo = this.resolver(mask & ~cand.mask).costo;
    return costo < mejor.costo ? { costo, elegido: cand } : mejor;
  }

  /** Recorre las decisiones óptimas desde la mano completa y devuelve las combinaciones elegidas. */
  elegidos(n: number): Candidato[] {
    const salida: Candidato[] = [];
    let mask = bit(n) - 1;
    while (mask) {
      const { elegido } = this.resolver(mask);
      if (elegido) salida.push(elegido);
      mask &= ~(elegido ? elegido.mask : bit(bajoBit(mask)));
    }
    return salida;
  }
}

/** Partición EXACTA: combinaciones disjuntas que llenan todas las casillas; gana la de menor puntaje de sobrantes. */
class BusquedaExacta {
  private mejor: { costo: number; elegidos: Candidato[] } | null = null;
  private readonly elegidos: Candidato[] = [];

  constructor(
    private readonly casillas: readonly number[],
    private readonly porTamano: ReadonlyMap<number, Candidato[]>,
    private readonly pts: readonly number[],
  ) {}

  ejecutar(): Candidato[] | null {
    this.explorar(0, 0, 0);
    return this.mejor ? this.mejor.elegidos : null;
  }

  private explorar(casilla: number, usado: number, desde: number): void {
    if (casilla === this.casillas.length) return this.registrar(usado);
    const lista = this.porTamano.get(this.casillas[casilla]!)!;
    for (let i = this.inicio(casilla, desde); i < lista.length; i++) this.probar(lista[i]!, casilla, usado, i);
  }

  /** Casillas iguales consecutivas: se evita repetir la misma combinación en otro orden. */
  private inicio(casilla: number, desde: number): number {
    return casilla > 0 && this.casillas[casilla - 1] === this.casillas[casilla] ? desde : 0;
  }

  private probar(cand: Candidato, casilla: number, usado: number, i: number): void {
    if (cand.mask & usado) return;
    this.elegidos.push(cand);
    this.explorar(casilla + 1, usado | cand.mask, i + 1);
    this.elegidos.pop();
  }

  private registrar(usado: number): void {
    const costo = costoLibres(usado, this.pts);
    if (!this.mejor || costo < this.mejor.costo) this.mejor = { costo, elegidos: [...this.elegidos] };
  }
}

export class HandEvaluator {
  constructor(private readonly opciones: OpcionesCombinacion) {}

  /** Devuelve la combinación si `cartas` forma un grupo o escalera válidos (>= 3 cartas); si no, null. */
  clasificar(cartas: readonly Carta[]): Combinacion | null {
    const naturales = cartas.filter(esNatural);
    if (cartas.length < MIN_COMBINACION || naturales.length < MIN_NATURALES) return null;
    const tipo = this.tipoDe(naturales, cartas.length);
    return tipo === null ? null : this.armar(tipo, cartas, naturales.length);
  }

  esValida(cartas: readonly Carta[]): boolean {
    return this.clasificar(cartas) !== null;
  }

  private tipoDe(naturales: readonly Carta[], tamano: number): TipoCombinacion | null {
    if (naturales.every((c) => c.valor === naturales[0]!.valor)) return 'GRUPO';
    return this.modoFactible(naturales, tamano) !== null ? 'ESCALERA' : null;
  }

  private armar(tipo: TipoCombinacion, cartas: readonly Carta[], naturales: number): Combinacion {
    const ordenadas = tipo === 'ESCALERA' ? this.ordenarEscalera(cartas) : cartas;
    return { tipo, cartas: ordenadas, comodines: cartas.length - naturales };
  }

  /**
   * Modo del As (bajo/alto) con el que las cartas naturales caben en una ventana de `tamano` posiciones consecutivas
   * de la MISMA pinta y sin repetidos (los comodines completan huecos y extremos). Sin vuelta de esquina: K-A-2 no es escalera.
   */
  private modoFactible(naturales: readonly Carta[], tamano: number): Modo | null {
    if (!mismaPinta(naturales) || !sinRepetidos(naturales)) return null;
    const cfg = this.opciones.aceEscalera;
    const valores = naturales.map((c) => c.valor as ValorNatural);
    const cabe = (modo: Modo) => cabeEnVentana(valores.map((v) => rangoNumerico(v, modo)), tamano, PISO[cfg], TECHO[cfg]);
    return MODOS[cfg].find(cabe) ?? null;
  }

  /** Presenta la escalera en orden ascendente (naturales) con los comodines rellenando huecos y extremos. */
  private ordenarEscalera(cartas: readonly Carta[]): readonly Carta[] {
    const naturales = cartas.filter(esNatural);
    const cola = cartas.filter((c) => c.esComodin);
    const modo = this.modoFactible(naturales, cartas.length) ?? 'BAJO';
    const rango = (c: Carta) => rangoNumerico(c.valor as ValorNatural, modo);
    const orden = [...naturales].sort((a, b) => rango(a) - rango(b));
    const salida = orden.flatMap((c, i) => [c, ...cola.splice(0, Math.max(0, huecoEntre(c, orden[i + 1], rango)))]);
    return [...salida, ...cola];
  }

  /** Todas las combinaciones válidas con los tamaños permitidos (máscaras de bits sobre `cartas`). */
  private candidatos(cartas: readonly Carta[], tamanos: readonly number[]): Candidato[] {
    const permitidos = new Set(tamanos);
    const res: Candidato[] = [];
    for (let mask = 1; mask < bit(cartas.length); mask++) {
      const cand = permitidos.has(popcount(mask)) ? this.candidato(cartas, mask) : null;
      if (cand) res.push(cand);
    }
    return res;
  }

  private candidato(cartas: readonly Carta[], mask: number): Candidato | null {
    const combinacion = this.clasificar(subconjunto(cartas, mask));
    return combinacion ? { mask, tamano: popcount(mask), combinacion } : null;
  }

  /**
   * Si TODAS las cartas caben en combinaciones de 3 a 5 (p. ej. cuarta + cuarta + terna con 11 cartas), devuelve esa
   * partición sin sobrantes; si no, null. Sirve para MOSTRAR el cierre sin inventar un sobrante artificial.
   */
  particionSinSobrantes(cartas: readonly Carta[], puntosDe: (c: Carta) => number): Particion | null {
    const p = this.mejorParticion(cartas, TAMANOS_LIBRES, puntosDe);
    return p.sobrantes.length === 0 ? p : null;
  }

  /** Mejor partición libre (mínimo puntaje de sueltas; a igual puntaje, menos sueltas). */
  mejorParticion(cartas: readonly Carta[], tamanos: readonly number[], puntosDe: (c: Carta) => number): Particion {
    const porBajo = agruparPorBajo(this.candidatos(cartas, tamanos), cartas.length);
    const dp = new ParticionMinima(porBajo, cartas.map(puntosDe));
    return particionDe(cartas, dp.elegidos(cartas.length));
  }

  /**
   * Partición EXACTA: combinaciones disjuntas que cumplen el multiconjunto de tamaños
   * (ej. Clásica 4-3-3 => [{4,1},{3,2}]; Apuntado => [{3,3}]). Devuelve la de menor puntaje de sobrantes, o null.
   */
  buscarParticionExacta(cartas: readonly Carta[], requisitos: readonly RequisitoTamano[], puntosDe: (c: Carta) => number): Particion | null {
    const casillas = expandirCasillas(requisitos);
    const tamanos = [...new Set(casillas)];
    const porTamano = agruparPorTamano(this.candidatos(cartas, tamanos), tamanos);
    const ganadores = new BusquedaExacta(casillas, porTamano, cartas.map(puntosDe)).ejecutar();
    return ganadores ? particionDe(cartas, ganadores) : null;
  }
}
