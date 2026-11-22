/**
 * Música generativa por CONTEXTO: módulo PURO (sin WebAudio ni DOM) que compone eventos de notas a partir de "recetas".
 * `Sonido` solo traduce esos eventos a síntesis, así que todo lo musical se puede probar con vitest.
 *
 * Contextos:
 *  - `sala`: inicio y sala de espera/configuración (3 recetas calmadas).
 *  - `CLASICA` - `APUNTADO`: música de partida, 5 recetas por modalidad (cada una con otro carácter:
 *    tonalidad/modo, tempo, ritmo, instrumentos y percusión). Al empezar cada ronda y cada partida se elige UNA receta
 *    del modo actual (distinta de la anterior) y la música se reinicia.
 *  - Celebraciones: piezas cortas (`RECETAS_CELEBRACION`) que referencia cada skin de celebración (`diseno.musica`).
 *
 * Añadir una receta = agregar un objeto a `RECETAS` (nada más). Cuadrícula: 1 paso = una semicorchea (1/16).
 */
export type ContextoMusica = 'sala' | 'CLASICA' | 'APUNTADO';
export type Onda = 'triangle' | 'square' | 'pulso' | 'sine' | 'sawtooth';
export type VozMusica = 'bajo' | 'arp' | 'pad' | 'mel' | 'kick' | 'caja' | 'hat' | 'tic' | 'clap' | 'boom';

export interface EventoNota {
  voz: VozMusica;
  /** Altura MIDI (solo voces melódicas). */
  midi?: number;
  /** Duración en pasos de 1/16. */
  dur: number;
  /** 0..~1.4 (1.4 = acento). */
  vol: number;
  onda?: Onda;
}

export interface Receta {
  id: string;
  contexto: ContextoMusica | 'celebracion';
  nombre: string;
  descripcion: string;
  bpm: readonly [number, number];
  /** Pulsos por compás: 4 (4/4) ó 3 (3/4). Cada pulso son 4 pasos. */
  pulsos: 3 | 4;
  /** 0..0.4: retraso de las corcheas "y" (0.33 ≈ tresillo de jazz). */
  swing: number;
  /** MIDI de posibles tónicas (octava 3). */
  tonicas: readonly number[];
  /** Escala (semitonos de los 7 grados). */
  escala: readonly number[];
  /** Progresiones de 4 compases (grados 0-based de la escala). */
  progresiones: readonly (readonly number[])[];
  acorde: 'triada' | 'septima' | 'quinta' | 'sus';
  /** Patrón por paso: r raíz - f quinta - t tercera - s séptima - o octava - w "caminando" - . silencio. */
  bajo?: { onda: Onda; patron: string; vol: number };
  /** Patrón por paso: dígito = nota del acorde (0-3, 4 = raíz en octava, 5 = tercera en octava) - . silencio. */
  arp?: { onda: Onda; patron: string; octava: number; vol: number; eco: number; dur: number };
  pad?: { onda: Onda; vol: number };
  /** Melodía: `grados` permitidos (mod 7), `salto` máximo entre notas (en grados), `rejilla` (1, 2 ó 4 pasos). */
  mel?: { onda: Onda; densidad: number; vol: number; octava: number; salto: number; grados: readonly number[]; rejilla: 1 | 2 | 4; eco: number };
  /** Percusión: una cadena por paso ('x' normal, 'X' acento, '.' nada). */
  perc?: { kick?: string; caja?: string; hat?: string; tic?: string; clap?: string; boom?: string; vol: number };
  /** Melodía fija (una cadena por compás; dígito base-36 = grado 0..11, '.' silencio, '-' sostener). Si existe no se improvisa. */
  motivoFijo?: readonly string[];
  /** Solo celebraciones: nº de compases que dura la pieza. */
  compases?: number;
}

/* --------- escalas y progresiones --------- */
const MAYOR = [0, 2, 4, 5, 7, 9, 11];
const MENOR = [0, 2, 3, 5, 7, 8, 10];
const DORICA = [0, 2, 3, 5, 7, 9, 10];
const MIXOLIDIA = [0, 2, 4, 5, 7, 9, 10];
const LIDIA = [0, 2, 4, 6, 7, 9, 11];
const FRIGIA = [0, 1, 3, 5, 7, 8, 10];
const MENOR_ARMONICA = [0, 2, 3, 5, 7, 8, 11];
const FRIGIA_DOMINANTE = [0, 1, 4, 5, 7, 8, 10];

/** Pentatónicas expresadas en grados de cada escala. */
const G_PENTA_MAYOR = [0, 1, 2, 4, 5];
const G_PENTA_MENOR = [0, 2, 3, 4, 6];
const G_TODOS = [0, 1, 2, 3, 4, 5, 6];

export const RECETAS: readonly Receta[] = [
  /* =========== SALA: esperar, configurar =========== */
  {
    id: 'sala_espera', contexto: 'sala', nombre: 'Sala de espera', descripcion: 'Colchón lento y luminoso; cajita de música muy espaciada.',
    bpm: [60, 70], pulsos: 4, swing: 0, tonicas: [48, 50, 53, 55], escala: LIDIA,
    progresiones: [[0, 1, 0, 4], [0, 3, 0, 1], [0, 5, 1, 0]], acorde: 'septima',
    bajo: { onda: 'triangle', patron: 'r...............', vol: 0.14 },
    pad: { onda: 'sine', vol: 0.05 },
    mel: { onda: 'sine', densidad: 0.22, vol: 0.075, octava: 1, salto: 2, grados: G_PENTA_MAYOR, rejilla: 4, eco: 0.75 },
  },
  {
    id: 'sala_lounge', contexto: 'sala', nombre: 'Lounge de preparativos', descripcion: 'Bossa suave de fondo mientras se arma la mesa.',
    bpm: [84, 94], pulsos: 4, swing: 0.2, tonicas: [48, 50, 53, 55, 57], escala: MAYOR,
    progresiones: [[1, 4, 0, 0], [0, 5, 1, 4], [0, 2, 3, 4]], acorde: 'septima',
    bajo: { onda: 'triangle', patron: 'r.....f.r.....f.', vol: 0.14 },
    arp: { onda: 'sine', patron: '..1...2...1...3.', octava: 1, vol: 0.07, eco: 0.4, dur: 3 },
    mel: { onda: 'triangle', densidad: 0.3, vol: 0.06, octava: 1, salto: 2, grados: G_PENTA_MAYOR, rejilla: 2, eco: 0.55 },
    perc: { hat: 'x.x.x.x.x.x.x.x.', tic: '..x..x...x..x...', vol: 0.45 },
  },
  {
    id: 'sala_cajita', contexto: 'sala', nombre: 'Cajita de música', descripcion: 'Vals de cuna: arpegio delicado en tres tiempos.',
    bpm: [70, 82], pulsos: 3, swing: 0, tonicas: [50, 53, 55, 48], escala: MAYOR,
    progresiones: [[0, 3, 4, 0], [0, 5, 3, 4], [0, 4, 5, 0]], acorde: 'triada',
    bajo: { onda: 'triangle', patron: 'r...........', vol: 0.12 },
    arp: { onda: 'sine', patron: '0.1.2.4.2.1.', octava: 1, vol: 0.07, eco: 0.5, dur: 2 },
    mel: { onda: 'triangle', densidad: 0.28, vol: 0.06, octava: 2, salto: 2, grados: G_PENTA_MAYOR, rejilla: 4, eco: 0.7 },
  },

  /* =========== CLÁSICA 4-3-3: elegante, pensada =========== */
  {
    id: 'cl_salon', contexto: 'CLASICA', nombre: 'Salón de terciopelo', descripcion: 'Jazz de salón con bajo caminando y escobillas.',
    bpm: [92, 104], pulsos: 4, swing: 0.3, tonicas: [48, 50, 53, 55], escala: DORICA,
    progresiones: [[0, 3, 0, 4], [1, 4, 0, 0], [0, 5, 1, 4]], acorde: 'septima',
    bajo: { onda: 'triangle', patron: 'rwwwrwwwrwwwrwww', vol: 0.15 },
    arp: { onda: 'sine', patron: '.......1.......2', octava: 1, vol: 0.07, eco: 0.35, dur: 3 },
    mel: { onda: 'triangle', densidad: 0.42, vol: 0.065, octava: 1, salto: 2, grados: G_PENTA_MENOR, rejilla: 2, eco: 0.5 },
    perc: { hat: '..x...x...x...x.', caja: '....x.......x...', vol: 0.4 },
  },
  {
    id: 'cl_ajedrez', contexto: 'CLASICA', nombre: 'Tarde de ajedrez', descripcion: 'Menor pensativa y despacio, notas largas.',
    bpm: [64, 76], pulsos: 4, swing: 0, tonicas: [45, 48, 50, 52], escala: MENOR,
    progresiones: [[0, 5, 3, 4], [0, 3, 6, 4], [0, 2, 5, 4]], acorde: 'triada',
    bajo: { onda: 'triangle', patron: 'r.......f.......', vol: 0.15 },
    arp: { onda: 'pulso', patron: '0...1...2...1...', octava: 1, vol: 0.04, eco: 0.5, dur: 6 },
    pad: { onda: 'sine', vol: 0.04 },
    mel: { onda: 'triangle', densidad: 0.34, vol: 0.075, octava: 1, salto: 2, grados: G_PENTA_MENOR, rejilla: 4, eco: 0.65 },
  },
  {
    id: 'cl_cuarteto', contexto: 'CLASICA', nombre: 'Cuarteto de cuerdas 8-bit', descripcion: 'Barroco en miniatura: arpegios en alberti y melodía por grados.',
    bpm: [100, 112], pulsos: 4, swing: 0, tonicas: [48, 50, 53, 55], escala: MAYOR,
    progresiones: [[0, 3, 4, 0], [0, 5, 3, 4], [5, 1, 4, 0], [0, 2, 5, 4]], acorde: 'triada',
    bajo: { onda: 'triangle', patron: 'r.f.r.f.r.f.r.f.', vol: 0.13 },
    arp: { onda: 'pulso', patron: '0212021202120212', octava: 1, vol: 0.05, eco: 0.25, dur: 1 },
    mel: { onda: 'square', densidad: 0.5, vol: 0.06, octava: 1, salto: 1, grados: G_TODOS, rejilla: 2, eco: 0.4 },
  },
  {
    id: 'cl_habanera', contexto: 'CLASICA', nombre: 'Habanera de cantina', descripcion: 'Ritmo de habanera en menor armónica con guitarra staccato.',
    bpm: [86, 98], pulsos: 4, swing: 0, tonicas: [45, 48, 50, 52], escala: MENOR_ARMONICA,
    progresiones: [[0, 3, 4, 0], [0, 5, 4, 0], [0, 3, 6, 0]], acorde: 'triada',
    bajo: { onda: 'triangle', patron: 'r..fr.r.r..fr.r.', vol: 0.15 },
    arp: { onda: 'pulso', patron: '..1.2...1.2.....', octava: 1, vol: 0.06, eco: 0.3, dur: 1 },
    mel: { onda: 'pulso', densidad: 0.42, vol: 0.06, octava: 1, salto: 2, grados: [0, 2, 3, 4, 6], rejilla: 2, eco: 0.45 },
    perc: { caja: 'x..xx.x.x..xx.x.', vol: 0.35 },
  },
  {
    id: 'cl_vals', contexto: 'CLASICA', nombre: 'Vals del naipe', descripcion: 'Vals (3/4): "un-dos-tres" con acompañamiento oom-pah-pah.',
    bpm: [104, 118], pulsos: 3, swing: 0, tonicas: [48, 50, 53, 55], escala: MAYOR,
    progresiones: [[0, 3, 4, 0], [0, 5, 1, 4], [0, 4, 0, 4]], acorde: 'triada',
    bajo: { onda: 'triangle', patron: 'r...........', vol: 0.15 },
    arp: { onda: 'pulso', patron: '....1...2...', octava: 1, vol: 0.055, eco: 0.2, dur: 2 },
    mel: { onda: 'square', densidad: 0.5, vol: 0.06, octava: 1, salto: 2, grados: G_PENTA_MAYOR, rejilla: 2, eco: 0.4 },
    perc: { caja: '....x...x...', vol: 0.25 },
  },

  /* =========== APUNTADO a 101: tensión, eliminación =========== */
  {
    id: 'ap_cuenta', contexto: 'APUNTADO', nombre: 'Cuenta regresiva', descripcion: 'Bajo martilleante en menor y batería que empuja.',
    bpm: [116, 128], pulsos: 4, swing: 0, tonicas: [45, 48, 50, 52], escala: MENOR,
    progresiones: [[0, 0, 5, 4], [0, 5, 3, 4], [0, 6, 5, 4]], acorde: 'quinta',
    bajo: { onda: 'square', patron: 'r.r.r.r.r.r.r.r.', vol: 0.09 },
    arp: { onda: 'pulso', patron: '0120012001200124', octava: 1, vol: 0.04, eco: 0.2, dur: 1 },
    mel: { onda: 'square', densidad: 0.38, vol: 0.055, octava: 1, salto: 2, grados: G_PENTA_MENOR, rejilla: 2, eco: 0.35 },
    perc: { kick: 'x...x...x...x...', hat: '..x...x...x...x.', caja: '....x.......x...', vol: 0.5 },
  },
  {
    id: 'ap_neon', contexto: 'APUNTADO', nombre: 'Persecución neón', descripcion: 'Synthwave: arpegios sierra y bombo a negras.',
    bpm: [106, 118], pulsos: 4, swing: 0, tonicas: [45, 48, 50, 53], escala: MENOR,
    progresiones: [[0, 5, 2, 6], [0, 3, 5, 4], [0, 6, 5, 6]], acorde: 'triada',
    bajo: { onda: 'sawtooth', patron: 'r.rr.rr.r.rr.rr.', vol: 0.07 },
    arp: { onda: 'sawtooth', patron: '0123210301232103', octava: 1, vol: 0.03, eco: 0.55, dur: 1 },
    pad: { onda: 'sawtooth', vol: 0.02 },
    mel: { onda: 'pulso', densidad: 0.4, vol: 0.06, octava: 2, salto: 2, grados: G_PENTA_MENOR, rejilla: 2, eco: 0.6 },
    perc: { kick: 'x...x...x...x...', clap: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', vol: 0.45 },
  },
  {
    id: 'ap_desierto', contexto: 'APUNTADO', nombre: 'Duelo en el desierto', descripcion: 'Frigia dominante, silencios largos y un reloj lejano.',
    bpm: [70, 82], pulsos: 4, swing: 0, tonicas: [45, 47, 50, 52], escala: FRIGIA_DOMINANTE,
    progresiones: [[0, 0, 1, 0], [0, 1, 0, 6], [0, 0, 5, 1]], acorde: 'quinta',
    bajo: { onda: 'triangle', patron: 'r.......f.......', vol: 0.15 },
    arp: { onda: 'pulso', patron: '0...............', octava: 1, vol: 0.06, eco: 0.7, dur: 8 },
    mel: { onda: 'pulso', densidad: 0.3, vol: 0.075, octava: 1, salto: 2, grados: [0, 1, 2, 4, 5], rejilla: 4, eco: 0.75 },
    perc: { tic: 'x...............', vol: 0.3 },
  },
  {
    id: 'ap_reloj', contexto: 'APUNTADO', nombre: 'Reloj de arena', descripcion: 'Un tic por pulso y acordes disminuidos: el tiempo se acaba.',
    bpm: [96, 108], pulsos: 4, swing: 0, tonicas: [45, 47, 50, 52], escala: MENOR_ARMONICA,
    progresiones: [[0, 0, 5, 4], [0, 6, 5, 4], [0, 3, 6, 0]], acorde: 'septima',
    bajo: { onda: 'triangle', patron: 'r.......r.......', vol: 0.15 },
    arp: { onda: 'sine', patron: '.1.2.1.3.1.2.1.0', octava: 1, vol: 0.06, eco: 0.45, dur: 2 },
    mel: { onda: 'sine', densidad: 0.3, vol: 0.085, octava: 2, salto: 3, grados: G_TODOS, rejilla: 4, eco: 0.7 },
    perc: { tic: 'X...x...x...x...', vol: 0.4 },
  },
  {
    id: 'ap_noir', contexto: 'APUNTADO', nombre: 'Casino noir', descripcion: 'Jazz negro: bajo caminando y acordes sincopados.',
    bpm: [88, 100], pulsos: 4, swing: 0.28, tonicas: [45, 48, 50, 52], escala: MENOR_ARMONICA,
    progresiones: [[0, 3, 4, 0], [0, 5, 4, 0], [1, 4, 0, 0]], acorde: 'septima',
    bajo: { onda: 'triangle', patron: 'rwwwrwwwrwwwrwww', vol: 0.15 },
    arp: { onda: 'sine', patron: '.......1.....2..', octava: 1, vol: 0.07, eco: 0.3, dur: 3 },
    mel: { onda: 'triangle', densidad: 0.4, vol: 0.07, octava: 1, salto: 3, grados: G_TODOS, rejilla: 2, eco: 0.5 },
    perc: { hat: '..x...x...x...x.', vol: 0.35 },
  },

];

/** Música de las skins de celebración (`diseno.musica` en skins.catalogo.ts). */
export const RECETAS_CELEBRACION: Record<string, Receta> = {
  fanfarria: {
    id: 'fanfarria', contexto: 'celebracion', nombre: 'Fanfarria', descripcion: 'Trompetas de victoria.',
    bpm: [132, 132], pulsos: 4, swing: 0, tonicas: [55], escala: MAYOR, progresiones: [[0, 3, 4, 0]], acorde: 'triada', compases: 4,
    bajo: { onda: 'triangle', patron: 'r.r.f.r.r.r.f.r.', vol: 0.14 },
    mel: { onda: 'square', densidad: 0, vol: 0.085, octava: 1, salto: 2, grados: G_TODOS, rejilla: 2, eco: 0.35 },
    perc: { kick: 'x.......x.......', caja: '....x.......x.xx', vol: 0.45 },
    // sol-do'-mi' ascendente, nota larga, remate
    motivoFijo: ['7.7.7.9-----a---', 'b-------a.9.7.9.', '7.7.7.9-----a---', 'b-------7-------'],
  },
  campanas: {
    id: 'campanas', contexto: 'celebracion', nombre: 'Campanas', descripcion: 'Repique brillante.',
    bpm: [100, 100], pulsos: 4, swing: 0, tonicas: [57], escala: MAYOR, progresiones: [[0, 5, 3, 4]], acorde: 'triada', compases: 4,
    arp: { onda: 'sine', patron: '0.1.2.4.5.4.2.1.', octava: 2, vol: 0.1, eco: 0.6, dur: 5 },
    mel: { onda: 'sine', densidad: 0, vol: 0.1, octava: 2, salto: 2, grados: G_PENTA_MAYOR, rejilla: 2, eco: 0.7 },
    motivoFijo: ['7...9...b...9...', '7...9...b...a...', 'b...9...7...9...', '7-------........'],
  },
  disco: {
    id: 'disco', contexto: 'celebracion', nombre: 'Disco', descripcion: 'Bombo a negras, bajo octavado y cuerdas picadas.',
    bpm: [122, 122], pulsos: 4, swing: 0, tonicas: [45], escala: DORICA, progresiones: [[0, 3, 0, 4]], acorde: 'septima', compases: 4,
    bajo: { onda: 'sawtooth', patron: 'r.o.r.o.r.o.r.o.', vol: 0.07 },
    arp: { onda: 'pulso', patron: '.1.1.2.1.1.1.2..', octava: 1, vol: 0.05, eco: 0.2, dur: 1 },
    mel: { onda: 'square', densidad: 0, vol: 0.06, octava: 2, salto: 2, grados: G_TODOS, rejilla: 2, eco: 0.3 },
    perc: { kick: 'x...x...x...x...', hat: '..x...x...x...x.', clap: '....x.......x...', vol: 0.55 },
    motivoFijo: ['7.9.a.9.7.....7.', '9.a.b.a.9.....9.', '7.9.a.9.7.5.7.9.', 'a---9---7-------'],
  },
  synthwave: {
    id: 'synthwave', contexto: 'celebracion', nombre: 'Synthwave', descripcion: 'Arpegios sierra y bombo de carretera nocturna.',
    bpm: [116, 116], pulsos: 4, swing: 0, tonicas: [45], escala: MENOR, progresiones: [[0, 5, 2, 6]], acorde: 'triada', compases: 4,
    bajo: { onda: 'sawtooth', patron: 'r.rr.rr.r.rr.rr.', vol: 0.07 },
    arp: { onda: 'sawtooth', patron: '0123210301232103', octava: 1, vol: 0.03, eco: 0.5, dur: 1 },
    pad: { onda: 'sawtooth', vol: 0.02 },
    mel: { onda: 'pulso', densidad: 0, vol: 0.06, octava: 2, salto: 2, grados: G_TODOS, rejilla: 2, eco: 0.5 },
    perc: { kick: 'x...x...x...x...', clap: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', vol: 0.5 },
    motivoFijo: ['7...9...a...9...', '7...9...b...a...', 'a...9...7...9...', 'a-------7-------'],
  },
};

export const CONTEXTOS_MUSICA: readonly ContextoMusica[] = ['sala', 'CLASICA', 'APUNTADO'];

export const recetasDe = (c: ContextoMusica): readonly Receta[] => RECETAS.filter((r) => r.contexto === c);

/** Elige una receta del contexto, distinta de `evitarId` si hay más de una. */
export function elegirReceta(c: ContextoMusica, evitarId: string | null, rnd: () => number = Math.random): Receta {
  const lista = recetasDe(c);
  const opciones = lista.length > 1 ? lista.filter((r) => r.id !== evitarId) : lista;
  return opciones[Math.min(opciones.length - 1, Math.floor(rnd() * opciones.length))]!;
}

/* --------- compositor --------- */
const GRADOS_EXTRA: Record<Receta['acorde'], number[]> = {
  triada: [0, 2, 4, 7],
  septima: [0, 2, 4, 6],
  quinta: [0, 4, 7, 11],
  sus: [0, 3, 4, 7],
};

export interface PasoMusical {
  /** Retraso (en pasos, p. ej. por swing) respecto de la cuadrícula. */
  retraso: number;
  eventos: EventoNota[];
}

/** Genera de forma determinista (dado `rnd`) las notas de cada paso; se pide en orden creciente. */
export class Compositor {
  readonly bpm: number;
  readonly tonica: number;
  progresion: readonly number[];
  readonly pasosCompas: number;
  private motivo: string[] = [];

  constructor(
    readonly receta: Receta,
    private readonly rnd: () => number = Math.random,
  ) {
    const [a, b] = receta.bpm;
    this.bpm = Math.round(a + rnd() * (b - a));
    this.tonica = receta.tonicas[Math.min(receta.tonicas.length - 1, Math.floor(rnd() * receta.tonicas.length))]!;
    this.progresion = this.elegirProgresion();
    this.pasosCompas = receta.pulsos * 4;
    this.motivo = receta.motivoFijo ? [...receta.motivoFijo] : this.nuevoMotivo();
  }

  /** Duración (s) de un paso de 1/16. */
  get segundosPaso(): number {
    return 60 / this.bpm / 4;
  }

  /** Nº de pasos de una pieza de celebración (compases x pasos por compás). */
  get pasosTotales(): number {
    return (this.receta.compases ?? 0) * this.pasosCompas;
  }

  private elegirProgresion(): readonly number[] {
    const ps = this.receta.progresiones;
    return ps[Math.min(ps.length - 1, Math.floor(this.rnd() * ps.length))]!;
  }

  private azarEntre<T>(a: readonly T[]): T {
    return a[Math.min(a.length - 1, Math.floor(this.rnd() * a.length))]!;
  }

  /** MIDI del grado `d` de la escala (puede pasar de 6: siguiente octava). */
  nota(d: number): number {
    const o = Math.floor(d / 7);
    return this.tonica + this.receta.escala[((d % 7) + 7) % 7]! + 12 * o;
  }

  acorde(grado: number): number[] {
    return GRADOS_EXTRA[this.receta.acorde].map((o) => this.nota(grado + o));
  }

  /* - melodía - */
  private nuevoMotivo(): string[] {
    const m = this.receta.mel;
    if (!m) return Array.from({ length: 4 }, () => '.'.repeat(this.pasosCompas || 16));
    const pasos = this.receta.pulsos * 4;
    const gen = (compases: number): string[] => {
      let idx = this.azarEntre([7, 8, 9]); // grado actual en la escala (7 = tónica una octava arriba de la base)
      idx = Math.min(11, idx);
      const filas: string[] = [];
      for (let c = 0; c < compases; c++) {
        const f: string[] = Array.from({ length: pasos }, () => '.');
        for (let s = 0; s < pasos; s += m.rejilla) {
          if (f[s] !== '.') continue;
          const fuerte = s % 4 === 0;
          if (this.rnd() < m.densidad * (fuerte ? 1.35 : 0.8)) {
            idx = this.moverGrado(idx, m);
            f[s] = idx.toString(36);
            if (this.rnd() < 0.45) for (let k = 1; k < m.rejilla * (this.rnd() < 0.5 ? 1 : 2) && s + k < pasos; k++) f[s + k] = '-';
          }
        }
        filas.push(f.join(''));
      }
      return filas;
    };
    const a = gen(2);
    // 2.ª mitad: variación de la 1.ª (misma forma, algunas notas movidas un grado) y cadencia final sobre la tónica
    const b = a.map((fila) =>
      fila.replace(/[0-9a-z]/g, (ch) => {
        const g = parseInt(ch, 36);
        return this.rnd() < 0.3 ? Math.max(0, Math.min(11, g + this.azarEntre([-1, 1]))).toString(36) : ch;
      }),
    );
    const ultima = b[1]!.split('');
    let pos = ultima.findIndex((ch, i) => i >= pasos / 2 && ch !== '.' && ch !== '-');
    if (pos < 0) pos = Math.min(pasos / 2, pasos - 2);
    for (let i = pos; i < pasos; i++) ultima[i] = i === pos ? '7' : i < pos + 4 ? '-' : '.';
    b[1] = ultima.join('');
    return [...a, ...b];
  }

  private moverGrado(idx: number, m: NonNullable<Receta['mel']>): number {
    for (let intento = 0; intento < 8; intento++) {
      const paso = this.azarEntre([-m.salto, -1, -1, 0, 1, 1, m.salto]);
      const cand = Math.max(0, Math.min(11, idx + paso));
      if (m.grados.includes(cand % 7)) return cand;
    }
    // sin candidato permitido: el grado permitido más cercano
    let mejor = idx;
    let d = 99;
    for (let g = 0; g <= 11; g++) if (m.grados.includes(g % 7) && Math.abs(g - idx) < d) {
      d = Math.abs(g - idx);
      mejor = g;
    }
    return mejor;
  }

  /** Cada 4 compases la melodía se renueva o se varía; cada 16 cambia la progresión (solo piezas improvisadas). */
  private alInicioDeFrase(compas: number): void {
    if (this.receta.motivoFijo) return;
    if (compas % 16 === 0) this.progresion = this.elegirProgresion();
    if (this.rnd() < 0.4) this.motivo = this.nuevoMotivo();
    else {
      this.motivo = this.motivo.map((fila) =>
        fila.replace(/[0-9a-z]/g, (ch) => (this.rnd() < 0.2 ? Math.max(0, Math.min(11, parseInt(ch, 36) + this.azarEntre([-1, 1]))).toString(36) : ch)),
      );
    }
  }

  /** Eventos del paso global `n` (llamar en orden creciente: 0, 1, 2, ...). */
  paso(n: number): PasoMusical {
    const R = this.receta;
    const compas = Math.floor(n / this.pasosCompas);
    const s = n % this.pasosCompas;
    if (s === 0 && compas > 0 && compas % 4 === 0) this.alInicioDeFrase(compas);
    const iC = compas % 4;
    const grado = this.progresion[iC % this.progresion.length]!;
    const sig = this.progresion[(iC + 1) % this.progresion.length]!;
    const ev: EventoNota[] = [];
    const pasosHasta = (patron: string, desde: number): number => {
      for (let k = 1; k < patron.length; k++) if (patron[(desde + k) % patron.length] !== '.') return k;
      return patron.length;
    };

    // bajo
    if (R.bajo) {
      const p = R.bajo.patron;
      const ch = p[s % p.length]!;
      if (ch !== '.') {
        const offs: Record<string, number> = { r: 0, f: 4, t: 2, s: 6, o: 7 };
        let g = grado + (offs[ch] ?? 0);
        if (ch === 'w') {
          const k = Math.floor(s / 4); // pulso dentro del compás
          const ult = k === this.receta.pulsos - 1;
          g = ult ? sig + this.azarEntre([-1, 1]) : grado + this.azarEntre([2, 4, 1, 3, 5]);
        }
        ev.push({ voz: 'bajo', midi: this.nota(g) - 12, dur: Math.max(1, pasosHasta(p, s) * 0.92), vol: R.bajo.vol, onda: R.bajo.onda });
      }
    }
    // arpegio / comping
    if (R.arp) {
      const p = R.arp.patron;
      const ch = p[s % p.length]!;
      if (ch !== '.' && /[0-9]/.test(ch)) {
        const tonos = [...this.acorde(grado), this.nota(grado + 7), this.nota(grado + 9)];
        ev.push({ voz: 'arp', midi: tonos[Number(ch) % tonos.length]! + 12 * R.arp.octava, dur: R.arp.dur, vol: R.arp.vol, onda: R.arp.onda });
      }
    }
    // pad
    if (R.pad && s === 0) {
      for (const m of this.acorde(grado)) ev.push({ voz: 'pad', midi: m, dur: this.pasosCompas, vol: R.pad.vol, onda: R.pad.onda });
    }
    // melodía
    if (R.mel) {
      const fila = this.motivo[iC % this.motivo.length]!;
      const ch = fila[s];
      if (ch && ch !== '.' && ch !== '-') {
        let dur = 1;
        while (fila[s + dur] === '-') dur++;
        let g = parseInt(ch, 36);
        // en el primer tiempo de compás las notas fuertes se acercan al acorde (solo improvisadas)
        if (!R.motivoFijo && s === 0) g = this.alAcorde(g, grado);
        ev.push({ voz: 'mel', midi: this.nota(g) + 12 * (R.mel.octava - 1), dur, vol: R.mel.vol, onda: R.mel.onda });
      }
    }
    // percusión
    if (R.perc) {
      const v = R.perc.vol;
      const pon = (voz: VozMusica, p: string | undefined): void => {
        const ch = p?.[s % (p?.length ?? 1)];
        if (ch === 'x' || ch === 'X') ev.push({ voz, dur: 1, vol: v * (ch === 'X' ? 1.4 : 1) });
      };
      pon('kick', R.perc.kick);
      pon('caja', R.perc.caja);
      pon('hat', R.perc.hat);
      pon('tic', R.perc.tic);
      pon('clap', R.perc.clap);
      pon('boom', R.perc.boom);
    }
    const retraso = R.swing > 0 && s % 4 === 2 ? R.swing * 2 : 0;
    return { retraso, eventos: ev };
  }

  /** Acerca el grado `g` al grado más cercano del acorde (mismo o cualquier octava). */
  private alAcorde(g: number, grado: number): number {
    const tonos = GRADOS_EXTRA[this.receta.acorde].slice(0, 3).map((o) => grado + o);
    let mejor = g;
    let d = 99;
    for (const base of tonos) {
      for (const k of [-7, 0, 7]) {
        const c = base + k;
        if (c >= 0 && c <= 11 && Math.abs(c - g) < d) {
          d = Math.abs(c - g);
          mejor = c;
        }
      }
    }
    return mejor;
  }
}
