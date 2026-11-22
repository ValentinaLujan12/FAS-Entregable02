import type { Mano } from '../kernel/mano.js';
import type { RequisitoTamano } from './HandEvaluator.js';
import type { Combinacion, EntradaEvaluacion, Particion, ResultadoCierre, ResultadoPartida } from './IReglaJuego.js';
import { ReglaBase, menorPor } from './ReglaBase.js';

/** Formas de 3 combinaciones: una cuarta o una quinta cuenta como UNA combinación (no como terna + carta suelta). */
const FORMAS_TRES: readonly (readonly number[])[] = [[3, 3, 3], [4, 3, 3], [4, 4, 3], [5, 3, 3]];
/** Lectura literal de la guía ("3 ternas"): solo 3 combinaciones de 3 cartas. */
const SOLO_TERNAS: readonly (readonly number[])[] = [[3, 3, 3]];

const RECHAZO_SIN_TERNAS = 'Cierre rechazado: se requieren 3 combinaciones válidas (ternas; una puede ser cuarta o quinta).';
const RECHAZO_SOLO_TERNAS = 'Cierre rechazado: se requieren exactamente 3 ternas (en esta mesa una cuarta no cuenta como terna).';
const RECHAZO_ESTRICTO = 'Cierre rechazado: con el cierre estricto se requiere 1 cuarta + 2 ternas + 1 carta de descarte (no se permite cerrar con sobrantes).';

const NOMBRES: Readonly<Record<number, readonly [string, string]>> = { 3: ['terna', 'ternas'], 4: ['cuarta', 'cuartas'], 5: ['quinta', 'quintas'] };

const suma = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

function requisitosDe(forma: readonly number[]): RequisitoTamano[] {
  return [...new Set(forma)].map((tamano) => ({ tamano, cantidad: forma.filter((x) => x === tamano).length }));
}

function nombreCombinacion(tamano: number, n: number): string {
  const par = NOMBRES[tamano];
  if (!par) return `${n} combinación de ${tamano}`;
  return `${n} ${n === 1 ? par[0] : par[1]}`;
}

function contarPorTamano(combs: readonly Combinacion[]): Map<number, number> {
  const cuenta = new Map<number, number>();
  for (const c of combs) cuenta.set(c.cartas.length, (cuenta.get(c.cartas.length) ?? 0) + 1);
  return cuenta;
}

/** Texto corto de una partición: "3 ternas", "1 cuarta + 2 ternas", etc. */
function descripcion(p: Particion): string {
  return [...contarPorTamano(p.combinaciones)]
    .sort((a, b) => b[0] - a[0])
    .map(([t, n]) => nombreCombinacion(t, n))
    .join(' + ');
}

/**
 * Modalidad Apuntado a 101 - CU-02 / CU-03, RF10, RF13-RF16.
 * Cierre: 11 cartas = 3 combinaciones + sobrantes cuya suma sea ESTRICTAMENTE menor a 5.
 * Los perdedores suman el valor de sus cartas sueltas; quien llega a 101 queda eliminado; gana el último en pie.
 */
export class ReglaApuntado101Puntos extends ReglaBase {
  getModalidad() {
    return 'APUNTADO' as const;
  }

  tamanosObjetivo(): readonly number[] {
    // Con cierre estricto los bots y el descarte automático persiguen cuarta + 2 ternas (como la Clásica).
    if (!this.p.permitirCierreConSobrante) return [3, 4];
    return this.p.cuartaCuentaComoTerna ? [3, 4, 5] : [3];
  }

  validarVictoria(mano: Mano): ResultadoCierre {
    const incompleta = this.manoIncompleta(mano);
    if (incompleta) return incompleta;
    if (!this.p.permitirCierreConSobrante) return this.cierreCuartaDosTernas(mano, 'APUNTADO_3_TERNAS', RECHAZO_ESTRICTO);
    return this.cierreConSobrante(mano);
  }

  private cierreConSobrante(mano: Mano): ResultadoCierre {
    const particion = this.mejorTresCombinaciones(mano);
    if (!particion) return { valido: false, motivo: 'SIN_COMBINACION_VALIDA', detalle: this.p.cuartaCuentaComoTerna ? RECHAZO_SIN_TERNAS : RECHAZO_SOLO_TERNAS };
    const sobrante = this.calcularPuntos(particion.sobrantes);
    return sobrante >= this.p.sobranteMaxApuntado ? this.rechazoPorSobrante(particion, sobrante) : this.cierreValido(particion, sobrante);
  }

  private rechazoPorSobrante(particion: Particion, sobrante: number): ResultadoCierre {
    const detalle = `Tus 3 combinaciones son válidas, pero el sobrante suma ${sobrante} puntos (debe ser menor a ${this.p.sobranteMaxApuntado}).`;
    return { valido: false, motivo: 'SOBRANTE_EXCEDE_LIMITE', detalle, particion, sobrante };
  }

  private cierreValido(particion: Particion, sobrante: number): ResultadoCierre {
    const detalle = `Cierre válido: ${descripcion(particion)} con sobrante de ${sobrante} punto(s).`;
    return { valido: true, tipo: 'APUNTADO_3_TERNAS', detalle, particion, descarte: null, sobrante, deltaCerrador: 0 };
  }

  /** Las 3 combinaciones que dejan el MENOR sobrante (3+3+3 con 2 sueltas, 4+3+3 con 1, 4+4+3 y 5+3+3 sin sueltas). */
  private mejorTresCombinaciones(mano: Mano): Particion | null {
    const formas = this.p.cuartaCuentaComoTerna ? FORMAS_TRES : SOLO_TERNAS;
    const candidatas = formas.filter((f) => suma(f) <= mano.tamano)
      .map((f) => this.evaluador.buscarParticionExacta(mano.cartas, requisitosDe(f), this.valoracion.puntosDe))
      .filter((p): p is Particion => p !== null);
    return menorPor(candidatas, (p) => this.calcularPuntos(p.sobrantes) * 16 + p.sobrantes.length);
  }

  /** Solo los perdedores acumulan (CU-03, pasos 1 a 3). */
  protected deltaRonda(esGanador: boolean, puntosSobrantes: number): number {
    return esGanador ? 0 : puntosSobrantes;
  }

  evaluarPartida(e: EntradaEvaluacion): ResultadoPartida {
    const pts = (id: string) => e.marcador.puntos[id] ?? 0;
    const eliminados = e.activos.filter((id) => pts(id) >= this.p.umbralEliminacion);
    const restantes = e.activos.filter((id) => !eliminados.includes(id));
    return this.finPorSupervivientes(e.activos, restantes, eliminados, pts) ?? this.finPorTope(e.ronda, restantes, eliminados, pts) ?? { finalizada: false, eliminados };
  }

  private finPorSupervivientes(activos: readonly string[], restantes: readonly string[], eliminados: readonly string[], pts: (id: string) => number): ResultadoPartida | null {
    if (restantes.length === 1) return { finalizada: true, ganadorId: restantes[0]!, eliminados, motivoFin: 'Único jugador activo restante' };
    if (restantes.length > 0) return null;
    const mejor = menorPor(activos, pts)!;
    return { finalizada: true, ganadorId: mejor, eliminados: eliminados.filter((id) => id !== mejor), motivoFin: 'Todos superaron el umbral: gana el de menor puntaje' };
  }

  private finPorTope(ronda: number, restantes: readonly string[], eliminados: readonly string[], pts: (id: string) => number): ResultadoPartida | null {
    if (!this.alcanzoTope(ronda)) return null;
    return { finalizada: true, ganadorId: menorPor(restantes, pts)!, eliminados, motivoFin: `Tope de ${this.p.rondasMax} rondas: gana el de menos puntos` };
  }
}
