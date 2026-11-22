/**
 * Modelo de la carta (Entregable 1, Sección 4.4 / PDF "Modelo del dominio: la carta").
 * Principio de diseño del PDF: la identidad de la carta es valor + pinta;
 * el PUNTAJE pertenece a las reglas del juego (ver server/rules/valoracion.ts), no a la carta.
 */
export const PINTAS = ['H', 'D', 'C', 'S'] as const;
export type Pinta = (typeof PINTAS)[number];

export const VALORES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
export type ValorNatural = (typeof VALORES)[number];
export type Valor = ValorNatural | 'JK';

export interface Carta {
  /** Identificador único físico: `${valor}${pinta}#${indiceMazo}` (ej. "10H#0", "JK#1"). */
  readonly id: string;
  readonly valor: Valor;
  /** null solo para el comodín. */
  readonly pinta: Pinta | null;
  readonly esComodin: boolean;
}

export type Color = 'rojo' | 'negro';

export const SIMBOLO_PINTA: Record<Pinta, string> = { H: '♥', D: '♦', C: '♣', S: '♠' };
export const NOMBRE_PINTA: Record<Pinta, string> = {
  H: 'Corazones',
  D: 'Diamantes',
  C: 'Tréboles',
  S: 'Picas',
};

export function colorDe(carta: Carta): Color | null {
  if (carta.pinta === null) return null;
  return carta.pinta === 'H' || carta.pinta === 'D' ? 'rojo' : 'negro';
}

export function crearCarta(valor: Valor, pinta: Pinta | null, mazo = 0): Carta {
  if (valor === 'JK') return Object.freeze({ id: `JK#${mazo}`, valor, pinta: null, esComodin: true });
  if (pinta === null) throw new Error(`La carta ${valor} requiere pinta`);
  return Object.freeze({ id: `${valor}${pinta}#${mazo}`, valor, pinta, esComodin: false });
}

/** Clave de asset visual (manifest de assets): "AH", "10S", "JOKER". */
export function claveAsset(carta: Carta): string {
  return carta.esComodin ? 'JOKER' : `${carta.valor}${carta.pinta}`;
}

export function etiqueta(carta: Carta): string {
  return carta.esComodin ? 'JK' : `${carta.valor}${SIMBOLO_PINTA[carta.pinta as Pinta]}`;
}

/** Rango numérico para escaleras. El As puede ser bajo (1) o alto (14). */
export function rangoNumerico(valor: ValorNatural, asComo: 'BAJO' | 'ALTO'): number {
  switch (valor) {
    case 'A':
      return asComo === 'BAJO' ? 1 : 14;
    case 'J':
      return 11;
    case 'Q':
      return 12;
    case 'K':
      return 13;
    default:
      return Number(valor);
  }
}

/** Orden de presentación (solo UI): por valor y luego por pinta. */
export function ordenPresentacion(a: Carta, b: Carta): number {
  const ra = a.esComodin ? 99 : rangoNumerico(a.valor as ValorNatural, 'BAJO');
  const rb = b.esComodin ? 99 : rangoNumerico(b.valor as ValorNatural, 'BAJO');
  if (ra !== rb) return ra - rb;
  return PINTAS.indexOf((a.pinta ?? 'H') as Pinta) - PINTAS.indexOf((b.pinta ?? 'H') as Pinta);
}

export function ordenPorPinta(a: Carta, b: Carta): number {
  const pa = a.pinta === null ? 9 : PINTAS.indexOf(a.pinta);
  const pb = b.pinta === null ? 9 : PINTAS.indexOf(b.pinta);
  if (pa !== pb) return pa - pb;
  return ordenPresentacion(a, b);
}

/** Notación compacta para pruebas y logs: "7H", "10S", "JK". */
export function parseCarta(texto: string, mazo = 0): Carta {
  const t = texto.trim().toUpperCase();
  if (t === 'JK') return crearCarta('JK', null, mazo);
  const pinta = t.slice(-1) as Pinta;
  const valor = t.slice(0, -1) as ValorNatural;
  if (!PINTAS.includes(pinta) || !VALORES.includes(valor)) throw new Error(`Carta inválida: "${texto}"`);
  return crearCarta(valor, pinta, mazo);
}

/** "7H 7C 7S" -> Carta[] (asigna índice de mazo incremental a duplicados). */
export function parseCartas(texto: string): Carta[] {
  const vistos = new Map<string, number>();
  return texto
    .trim()
    .split(/[\s,-]+/)
    .filter(Boolean)
    .map((t) => {
      const k = t.toUpperCase();
      const n = vistos.get(k) ?? 0;
      vistos.set(k, n + 1);
      return parseCarta(k, n);
    });
}
