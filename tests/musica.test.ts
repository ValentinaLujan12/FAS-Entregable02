import { describe, expect, it } from 'vitest';
import { CONTEXTOS_MUSICA, Compositor, RECETAS, RECETAS_CELEBRACION, elegirReceta, recetasDe, type Receta } from '../src/extras/web/musica.js';

/** mulberry32: azar determinista para las pruebas. */
const semilla = (n: number) => {
  let s = n >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const todas: Receta[] = [...RECETAS, ...Object.values(RECETAS_CELEBRACION)];

describe('Música por contexto', () => {
  it('hay 3 recetas para sala y 5 por cada modalidad; ids únicos', () => {
    expect(recetasDe('sala')).toHaveLength(3);
    for (const c of ['CLASICA', 'APUNTADO'] as const) expect(recetasDe(c)).toHaveLength(5);
    expect(new Set(todas.map((r) => r.id)).size).toBe(todas.length);
    expect(CONTEXTOS_MUSICA).toHaveLength(3);
  });
  it('cada modalidad suena distinta: tempos y tonalidades no son los mismos entre las 5 recetas', () => {
    for (const c of ['CLASICA', 'APUNTADO'] as const) {
      const rs = recetasDe(c);
      expect(new Set(rs.map((r) => r.nombre)).size).toBe(5);
      expect(new Set(rs.map((r) => r.bpm.join('-'))).size).toBeGreaterThanOrEqual(4);
      expect(new Set(rs.map((r) => (r.bajo?.patron ?? '') + (r.perc?.kick ?? ''))).size).toBeGreaterThanOrEqual(4);
    }
    // el ambiente de la sala es más lento que el de las partidas
    const tempoMedio = (c: Parameters<typeof recetasDe>[0]) => recetasDe(c).reduce((a, r) => a + (r.bpm[0] + r.bpm[1]) / 2, 0) / recetasDe(c).length;
    expect(tempoMedio('sala')).toBeLessThan(tempoMedio('CLASICA'));
    expect(tempoMedio('sala')).toBeLessThan(tempoMedio('APUNTADO'));
  });
  it('los patrones tienen el largo del compás y los motivos fijos también', () => {
    for (const r of todas) {
      const n = r.pulsos * 4;
      for (const p of [r.bajo?.patron, r.arp?.patron, r.perc?.kick, r.perc?.caja, r.perc?.hat, r.perc?.tic, r.perc?.clap]) if (p) expect(`${r.id}:${p.length}`).toBe(`${r.id}:${n}`);
      for (const f of r.motivoFijo ?? []) expect(`${r.id}:${f.length}`).toBe(`${r.id}:${n}`);
    }
  });
  it('determinista con la misma semilla y variada entre semillas', () => {
    const gen = (sem: number, r: Receta) => {
      const c = new Compositor(r, semilla(sem));
      return JSON.stringify([c.bpm, c.tonica, Array.from({ length: 128 }, (_, i) => c.paso(i))]);
    };
    for (const r of RECETAS) {
      expect(gen(5, r)).toBe(gen(5, r));
      expect(new Set([1, 2, 3, 4, 5, 6].map((s) => gen(s, r))).size).toBeGreaterThan(1);
    }
  });
  it('todas las notas caen en un rango audible y suenan cosas en cada compás (sin silencios largos)', () => {
    for (const r of RECETAS) {
      const c = new Compositor(r, semilla(11));
      const porCompas = new Array<number>(32).fill(0);
      for (let i = 0; i < c.pasosCompas * 32; i++) {
        const { eventos, retraso } = c.paso(i);
        expect(retraso).toBeGreaterThanOrEqual(0);
        expect(retraso).toBeLessThan(1);
        for (const e of eventos) {
          if (e.midi !== undefined) {
            expect(e.midi).toBeGreaterThanOrEqual(30);
            expect(e.midi).toBeLessThanOrEqual(100);
          }
          expect(e.dur).toBeGreaterThan(0);
          expect(e.vol).toBeGreaterThan(0);
          porCompas[Math.floor(i / c.pasosCompas)]!++;
        }
      }
      expect(porCompas.every((n) => n > 0), r.id).toBe(true);
    }
  });
  it('elegirReceta nunca repite la anterior (si hay más de una) y respeta el contexto', () => {
    for (let i = 0; i < 40; i++) {
      const previa = recetasDe('APUNTADO')[i % 5]!.id;
      const r = elegirReceta('APUNTADO', previa, semilla(i + 1));
      expect(r.contexto).toBe('APUNTADO');
      expect(r.id).not.toBe(previa);
    }
    // con semillas distintas salen todas las recetas del modo
    const vistos = new Set(Array.from({ length: 60 }, (_, i) => elegirReceta('CLASICA', null, semilla(i + 100)).id));
    expect(vistos.size).toBe(5);
  });
  it('las celebraciones tienen compases y melodía fija completa', () => {
    for (const [id, r] of Object.entries(RECETAS_CELEBRACION)) {
      expect(r.id).toBe(id);
      expect(r.compases).toBeGreaterThan(0);
      expect(r.motivoFijo!.length).toBe(4);
      const c = new Compositor(r, semilla(3));
      const notas = Array.from({ length: c.pasosTotales }, (_, i) => c.paso(i).eventos.filter((e) => e.voz === 'mel').length).reduce((a, b) => a + b, 0);
      expect(notas).toBeGreaterThan(6);
    }
  });
  it('el swing solo retrasa las corcheas "y"', () => {
    const r = RECETAS.find((x) => x.id === 'cl_salon')!;
    const c = new Compositor(r, semilla(2));
    const retrasos = Array.from({ length: 16 }, (_, i) => c.paso(i).retraso);
    expect(retrasos.filter((x) => x > 0)).toHaveLength(4);
    expect(retrasos[2]).toBeCloseTo(0.6);
  });
});
