/**
 * Auditoría diferencial de reglas: compara IReglaJuego.validarVictoria (lo que usan jugadores, bots y autopiloto)
 * contra un ORÁCULO independiente escrito desde cero con las reglas documentadas (Entregable 1 / PDF), sin comodines.
 * Uso: npx tsx tools/auditoria-reglas.ts [manos=30000]
 */
import { type Carta, PINTAS, VALORES, crearCarta, rangoNumerico, type ValorNatural } from '../src/kernel/cartas.js';
import { parametrosPorDefecto } from '../src/kernel/config.js';
import { Mano } from '../src/kernel/mano.js';
import { AleatorioSemilla } from '../src/deck/Baraja.js';
import { crearRegistroReglas } from '../src/rules/RegistroReglas.js';

const rng = new AleatorioSemilla(2026);
const motor = crearRegistroReglas();
const N = Number(process.argv[2] ?? 30000);

const val = (c: Carta, as: number) => (c.valor === 'A' ? as : ['J', 'Q', 'K'].includes(c.valor) ? 10 : Number(c.valor));

// -- Oráculo ------------------------------------------------------------------
function esGrupo(cs: Carta[]): boolean {
  return cs.length >= 3 && cs.every((c) => c.valor === cs[0]!.valor);
}
function esEscalera(cs: Carta[]): boolean {
  if (cs.length < 3 || !cs.every((c) => c.pinta === cs[0]!.pinta)) return false;
  for (const modo of ['BAJO', 'ALTO'] as const) {
    const r = cs.map((c) => rangoNumerico(c.valor as ValorNatural, modo)).sort((a, b) => a - b);
    if (r.every((x, i) => i === 0 || x === r[i - 1]! + 1)) return true;
  }
  return false;
}
const esCombo = (cs: Carta[]) => esGrupo(cs) || esEscalera(cs);

function subconjuntos(cs: Carta[], k: number): number[][] {
  const res: number[][] = [];
  const rec = (ini: number, act: number[]) => {
    if (act.length === k) return void res.push([...act]);
    for (let i = ini; i < cs.length; i++) rec(i + 1, [...act, i]);
  };
  rec(0, []);
  return res;
}

/** ¿Existen combinaciones disjuntas con los tamaños dados? Devuelve el menor puntaje de sobrantes o null. */
function mejorExacto(cs: Carta[], tamanos: number[], as: number): number | null {
  let mejor: number | null = null;
  const rec = (idx: number, usado: Set<number>) => {
    if (idx === tamanos.length) {
      const s = cs.reduce((a, c, i) => a + (usado.has(i) ? 0 : val(c, as)), 0);
      if (mejor === null || s < mejor) mejor = s;
      return;
    }
    for (const sub of subconjuntos(cs, tamanos[idx]!)) {
      if (sub.some((i) => usado.has(i))) continue;
      if (!esCombo(sub.map((i) => cs[i]!))) continue;
      rec(idx + 1, new Set([...usado, ...sub]));
    }
  };
  rec(0, new Set());
  return mejor;
}

/** Mejor partición libre (tamaños 3-5): mínimo de puntos sueltos. */
function mejorLibre(cs: Carta[], as: number): number {
  let mejor = Number.POSITIVE_INFINITY;
  const rec = (resto: number[], sueltos: number) => {
    if (resto.length === 0) return void (mejor = Math.min(mejor, sueltos));
    const primero = resto[0]!;
    const otros = resto.slice(1);
    rec(otros, sueltos + val(cs[primero]!, as)); // `primero` queda suelta
    for (const t of [3, 4, 5]) {
      if (otros.length < t - 1) continue;
      for (const sub of subconjuntos(otros.map((i) => cs[i]!), t - 1)) {
        const idxs = [primero, ...sub.map((k) => otros[k]!)];
        if (esCombo(idxs.map((i) => cs[i]!))) rec(resto.filter((i) => !idxs.includes(i)), sueltos);
      }
    }
  };
  rec(cs.map((_, i) => i), 0);
  return mejor;
}

const oraculo = {
  CLASICA: (m: Carta[], _as: number) => mejorExacto(m, [4, 3, 3], _as) !== null,
  // Regla por defecto (guía del curso, cuartaCuentaComoTerna = false): exactamente 3 ternas y sobrante estrictamente menor a 5.
  APUNTADO: (m: Carta[], as: number) => cierraConFormas(m, as, [[3, 3, 3]]),
  // Parámetro cuartaCuentaComoTerna = true: una cuarta o una quinta cuenta como UNA de las 3 combinaciones
  // (formas 3-3-3, 4-3-3, 4-4-3 y 5-3-3).
  APUNTADO_CUARTA_TERNA: (m: Carta[], as: number) => cierraConFormas(m, as, [[3, 3, 3], [4, 3, 3], [4, 4, 3], [5, 3, 3]]),
} as const;

function cierraConFormas(m: Carta[], as: number, formas: number[][]): boolean {
  return formas.some((forma) => {
    const s = mejorExacto(m, forma, as);
    return s !== null && s < 5;
  });
}

// -- Manos aleatorias (sesgadas para que haya cierres reales) ------------------
const mazo = (): Carta[] => PINTAS.flatMap((p) => VALORES.map((v) => crearCarta(v, p, 0)));
function manoAleatoria(): Carta[] {
  const m = mazo();
  for (let i = m.length - 1; i > 0; i--) {
    const j = rng.entero(i + 1);
    [m[i], m[j]] = [m[j]!, m[i]!];
  }
  const modo = rng.entero(3);
  if (modo === 0) return m.slice(0, 11); // pura suerte
  // construye 3 combos reales (grupo o escalera) + resto aleatorio -> muchos casos "casi cierre"
  const usadas = new Set<string>();
  const mano: Carta[] = [];
  const tomar = (c: Carta) => { usadas.add(c.id); mano.push(c); };
  for (let k = 0; k < 3; k++) {
    const largo = 3 + (modo === 2 && k === 0 ? 1 : 0);
    if (rng.entero(2) === 0) {
      const v = VALORES[rng.entero(13)]!;
      const c = PINTAS.map((p) => crearCarta(v, p, 0)).filter((x) => !usadas.has(x.id));
      if (c.length >= largo) c.slice(0, largo).forEach(tomar); else k--;
    } else {
      const p = PINTAS[rng.entero(4)]!;
      const ini = 1 + rng.entero(14 - largo);
      const c = Array.from({ length: largo }, (_, i) => crearCarta(VALORES[ini - 1 + i]!, p, 0));
      if (c.every((x) => !usadas.has(x.id))) c.forEach(tomar); else k--;
    }
  }
  for (const c of m) if (mano.length < 11 && !usadas.has(c.id)) tomar(c);
  return mano.slice(0, 11);
}

// -- Comparación --------------------------------------------------------------
let fallos = 0;
const stats: Record<string, { ok: number; validas: number }> = {};
const VARIANTES = [
  ['CLASICA', 'CLASICA', {}],
  ['APUNTADO', 'APUNTADO', {}],
  ['APUNTADO_CUARTA_TERNA', 'APUNTADO', { cuartaCuentaComoTerna: true }],
] as const;
for (const [modalidad, base, ajuste] of VARIANTES) {
  const p = { ...parametrosPorDefecto(base), ...ajuste, aceEscalera: 'AMBOS' as const, comodines: 0 as const };
  const regla = motor.reglaPara(p);
  stats[modalidad] = { ok: 0, validas: 0 };
  const as = p.valorAs;
  for (let i = 0; i < N; i++) {
    const m = manoAleatoria();
    const real = regla.validarVictoria(Mano.de(m)).valido;
    const esperado = oraculo[modalidad](m, as);
    if (esperado) stats[modalidad]!.validas++;
    if (real !== esperado) {
      fallos++;
      if (fallos <= 6) console.log(`FALLO ${modalidad}: motor=${real} oráculo=${esperado} mano=${m.map((c) => c.valor + c.pinta).join(' ')}`);
    } else stats[modalidad]!.ok++;
  }
}
for (const [k, v] of Object.entries(stats)) console.log(`${k.padEnd(22)} coincide ${v.ok}/${N}  (manos válidas según oráculo: ${v.validas})`);
console.log(fallos === 0 ? '\nOK: el validador coincide con el oráculo independiente.' : `\nFALLAS: ${fallos}`);
process.exit(fallos ? 1 : 0);
