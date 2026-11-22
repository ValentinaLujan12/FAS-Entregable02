/**
 * FF-16 (G7): latencia de validación y cómputo de una mano de 11 cartas (presupuesto: < 100 ms en p99 y en el peor caso).
 * Mide, por mano, validarVictoria + particionResidual + calcularPuntos con la estrategia de cada modalidad, sobre manos
 * aleatorias (semilla fija, 2 mazos con 4 comodines: el caso con más combinaciones posibles) y manos adversas.
 *   npx tsx tools/medir-latencia.ts [--json archivo]
 */
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { AleatorioSemilla, barajar, crearBaraja } from '../src/deck/Baraja.js';
import { type Carta, parseCartas } from '../src/kernel/cartas.js';
import { type ParametrosModalidad, parametrosPorDefecto } from '../src/kernel/config.js';
import { Mano } from '../src/kernel/mano.js';
import { crearRegistroReglas } from '../src/rules/RegistroReglas.js';

export interface ResultadoLatencia {
  escenario: string;
  manos: number;
  p50: number;
  p99: number;
  max: number;
}

/** Manos difíciles: muchas combinaciones superpuestas, comodines y escaleras largas. */
export const MANOS_ADVERSAS = [
  '2H 3H 4H 5H 6H 7H 8H 9H 10H JH QH',
  '7H 7C 7S 7D 7H 7C 8H 9H 8C 9C 10C',
  'AH 2H 3H 4H AC 2C 3C 4C AS 2S 3S',
  'JK JK JK JK 5H 6H 7H 5C 6C 7C 9D',
  '9H 9C 9S 9D 10H 10C 10S 10D JH JC JS',
];

function percentil(ordenados: readonly number[], p: number): number {
  return ordenados[Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1)]!;
}

function medirMano(regla: ReturnType<ReturnType<typeof crearRegistroReglas>['reglaPara']>, cartas: readonly Carta[]): number {
  const t0 = performance.now();
  regla.validarVictoria(Mano.de(cartas));
  regla.calcularPuntos(regla.particionResidual(cartas).sobrantes);
  return performance.now() - t0;
}

function resumir(escenario: string, tiempos: number[]): ResultadoLatencia {
  const o = [...tiempos].sort((a, b) => a - b);
  return { escenario, manos: o.length, p50: percentil(o, 50), p99: percentil(o, 99), max: o[o.length - 1]! };
}

export function medirLatencia(manosAleatorias = 2000, semilla = 2026): ResultadoLatencia[] {
  const motor = crearRegistroReglas();
  const configuraciones: Array<[string, ParametrosModalidad]> = [
    ['CLASICA', parametrosPorDefecto('CLASICA')],
    ['APUNTADO', parametrosPorDefecto('APUNTADO')],
    ['APUNTADO estricto', { ...parametrosPorDefecto('APUNTADO'), permitirCierreConSobrante: false }],
  ];
  const resultados: ResultadoLatencia[] = [];
  for (const [nombre, p] of configuraciones) {
    const regla = motor.reglaPara({ ...p, comodines: 4 });
    const rng = new AleatorioSemilla(semilla);
    const baraja = crearBaraja({ mazos: 2, comodines: 4 });
    for (let i = 0; i < 20; i++) medirMano(regla, barajar(baraja, rng).slice(0, 11)); // calentamiento del JIT
    const aleatorias = Array.from({ length: manosAleatorias }, () => medirMano(regla, barajar(baraja, rng).slice(0, 11)));
    resultados.push(resumir(`${nombre} - aleatorias`, aleatorias));
    resultados.push(resumir(`${nombre} - adversas`, MANOS_ADVERSAS.map((m) => medirMano(regla, parseCartas(m)))));
  }
  return resultados;
}

const esCli = process.argv[1]?.endsWith('medir-latencia.ts');
if (esCli) {
  const r = medirLatencia();
  console.log('Escenario                         Manos   p50 (ms)  p99 (ms)  máx (ms)');
  for (const x of r) console.log(`${x.escenario.padEnd(32)} ${String(x.manos).padStart(6)}  ${x.p50.toFixed(3).padStart(8)}  ${x.p99.toFixed(3).padStart(8)}  ${x.max.toFixed(3).padStart(8)}`);
  const i = process.argv.indexOf('--json');
  if (i > 0) writeFileSync(process.argv[i + 1]!, JSON.stringify({ fecha: new Date().toISOString(), presupuestoMs: 100, resultados: r }, null, 2));
}
