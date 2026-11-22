/**
 * Genera TODO el arte del juego (SVG vectorial) con la estética pastel del viejo oeste, y el manifest
 * public/assets/manifest.json. Los textos (logo, índices de las cartas, carteles) se convierten a trazados con las
 * fuentes Rye y Zilla Slab (licencia OFL), así se ven igual en cualquier navegador.
 *   npm run assets:generate
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import { CATALOGO } from '../src/extras/skins/catalogo.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', 'public', 'assets');
const escribir = (rel: string, contenido: string): void => {
  const ruta = join(RAIZ, rel);
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, contenido);
};

/* ============================== fuentes y texto como trazado ============================== */
const fuente = (pkg: string, archivo: string) => {
  const buf = readFileSync(join(AQUI, '..', 'node_modules', '@fontsource', pkg, 'files', archivo));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};
const RYE = fuente('rye', 'rye-latin-400-normal.woff');
const SLAB = fuente('zilla-slab', 'zilla-slab-latin-700-normal.woff');
const NUNITO = fuente('nunito', 'nunito-latin-800-normal.woff');

/** Texto convertido a <path>. `ancla`: start | middle | end. `espacio`: separación extra entre letras (px). */
function texto(f: opentype.Font, t: string, x: number, y: number, tam: number, o: { ancla?: 'start' | 'middle' | 'end'; espacio?: number; fill?: string; extra?: string } = {}): string {
  const esp = o.espacio ?? 0;
  const ancho = f.getAdvanceWidth(t, tam) + esp * (t.length - 1);
  let cx = o.ancla === 'middle' ? x - ancho / 2 : o.ancla === 'end' ? x - ancho : x;
  let d = '';
  for (const ch of t) {
    d += f.getPath(ch, cx, y, tam).toPathData(2);
    cx += f.getAdvanceWidth(ch, tam) + esp;
  }
  return `<path d="${d}" fill="${o.fill ?? 'currentColor'}"${o.extra ? ' ' + o.extra : ''}/>`;
}

/* ============================== paleta ============================== */
const C = {
  papel: '#fbf5ea', papel2: '#f3e8d6', arena: '#e9d7b9', madera: '#b88b6a', maderaOsc: '#8a6a52', tinta: '#5a4636',
  salvia: '#9db89a', salviaOsc: '#6f8f72', turquesa: '#86b6b1', terracota: '#d88e70', terracotaOsc: '#b86f53',
  mostaza: '#e7c27d', mostazaOsc: '#c9a15a', denim: '#8ea1bd', lavanda: '#a9a3c9',
};

/* ============================== utilidades ============================== */
const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mezcla = (h: string, otro: string, p: number) => {
  const a = hexRgb(h);
  const b = hexRgb(otro);
  return '#' + a.map((v, i) => Math.round(v + (b[i]! - v) * p).toString(16).padStart(2, '0')).join('');
};
const claro = (h: string, p = 0.55) => mezcla(h, '#ffffff', p);
const oscuro = (h: string, p = 0.5) => mezcla(h, '#000000', p);
function azar(semilla: number) {
  let s = semilla >>> 0 || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
const hash = (txt: string) => [...txt].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 7);
const svg = (w: number, h: number, cuerpo: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${cuerpo}</svg>`;

/* ============================== medidas (fuente de verdad) ============================== */
const MEDIDAS = {
  escenario: { ancho: 1920, alto: 1080 },
  carta: { ancho: 280, alto: 392, displayAncho: 140, displayAlto: 196, radio: 24 },
  mesa: { ancho: 1640, alto: 800 },
  slot: { ancho: 280, alto: 392 },
  marcadorTurno: { ancho: 256, alto: 256 },
  placa: { ancho: 480, alto: 120 },
  fondo: { ancho: 1920, alto: 1080 },
  avatar: { ancho: 256, alto: 256, display: 128, cantidad: 8 },
  logo: { ancho: 1280, alto: 512 },
  icono: { ancho: 96, alto: 96, display: 48 },
};

/* ============================== palos y motivos del oeste (caja 100x100) ============================== */
const PALOS: Record<string, (c: string) => string> = {
  H: (c) => `<path d="M50 90 C10 62 4 36 20 19 C34 6 50 15 50 29 C50 15 66 6 80 19 C96 36 90 62 50 90 Z" fill="${c}"/>`,
  D: (c) => `<path d="M50 6 Q66 26 88 50 Q66 74 50 94 Q34 74 12 50 Q34 26 50 6 Z" fill="${c}"/>`,
  C: (c) => `<g fill="${c}"><circle cx="50" cy="30" r="21"/><circle cx="28" cy="61" r="21"/><circle cx="72" cy="61" r="21"/><path d="M50 50 Q47 80 34 95 L66 95 Q53 80 50 50 Z"/></g>`,
  S: (c) => `<path d="M50 5 C50 5 7 38 7 62 C7 79 30 85 44 70 C42 84 38 91 30 96 L70 96 C62 91 58 84 56 70 C70 85 93 79 93 62 C93 38 50 5 50 5 Z" fill="${c}"/>`,
};
const MOTIVO: Record<string, (c: string, crema: string) => string> = {
  sombrero: (c, k) => `<path d="M30 60 Q27 30 40 25 Q50 33 60 25 Q73 30 70 60 Z" fill="${c}"/><rect x="31" y="50" width="38" height="7" rx="3" fill="${k}" fill-opacity=".85"/><path d="M6 60 Q50 76 94 60 Q96 69 86 74 Q50 88 14 74 Q4 69 6 60 Z" fill="${c}"/>`,
  cactus: (c, k) => `<path d="M43 94 L43 30 Q43 14 50 14 Q57 14 57 30 L57 94 Z M43 60 L33 60 Q23 60 23 50 L23 38 Q23 31 29 31 Q35 31 35 38 L35 50 L43 50 Z M57 52 L66 52 L66 41 Q66 34 72 34 Q78 34 78 41 L78 54 Q78 64 68 64 L57 64 Z" fill="${c}"/><circle cx="50" cy="14" r="7" fill="${k}"/><circle cx="50" cy="14" r="3" fill="${c}"/><path d="M28 94 H72" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`,
  estrella: (c, k) => {
    const pts: string[] = [];
    const puntas: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 19 : 42;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(52 + r * Math.sin(a)).toFixed(1)}`);
      if (i % 2 === 0) puntas.push(`<circle cx="${(50 + 44 * Math.cos(a)).toFixed(1)}" cy="${(52 + 44 * Math.sin(a)).toFixed(1)}" r="5.5" fill="${c}"/>`);
    }
    return `<polygon points="${pts.join(' ')}" fill="${c}" stroke="${c}" stroke-width="3" stroke-linejoin="round"/>${puntas.join('')}<circle cx="50" cy="52" r="11" fill="${k}" fill-opacity=".9"/>`;
  },
  herradura: (c) => `<path d="M24 22 L24 52 Q24 82 50 82 Q76 82 76 52 L76 22" fill="none" stroke="${c}" stroke-width="13" stroke-linecap="round"/><g fill="${c}"><circle cx="18" cy="22" r="3"/></g><g fill="#fff" fill-opacity=".55"><circle cx="24" cy="36" r="2.4"/><circle cx="26" cy="56" r="2.4"/><circle cx="38" cy="74" r="2.4"/><circle cx="62" cy="74" r="2.4"/><circle cx="74" cy="56" r="2.4"/><circle cx="76" cy="36" r="2.4"/></g>`,
};
const dibujo = (nombre: string, fn: (c: string, k: string) => string, cx: number, cy: number, tam: number, c: string, k = C.papel, giro = false) =>
  `<g transform="translate(${cx - tam / 2} ${cy - tam / 2}) scale(${tam / 100})${giro ? ' rotate(180 50 50)' : ''}" data-m="${nombre}">${fn(c, k)}</g>`;

/* ============================== caras de las cartas ============================== */
const PALETAS = {
  normal: { H: '#c4604f', D: '#c4604f', C: '#3f4a59', S: '#3f4a59' } as Record<string, string>,
  daltonico: { H: '#c8611c', D: '#2f74a6', C: '#2e7d5f', S: '#363c47' } as Record<string, string>,
};
let paleta = PALETAS.normal;
const palo = (p: string, cx: number, cy: number, tam: number, giro = false, color?: string) =>
  `<g transform="translate(${cx - tam / 2} ${cy - tam / 2}) scale(${tam / 100})${giro ? ' rotate(180 50 50)' : ''}">${PALOS[p]!(color ?? paleta[p]!)}</g>`;

const COLS = { L: 92, C: 140, R: 188 } as const;
const FILAS4 = [100, 167, 227, 294];
const PIPS: Record<string, Array<[keyof typeof COLS, number]>> = {
  2: [['C', 100], ['C', 292]],
  3: [['C', 100], ['C', 196], ['C', 292]],
  4: [['L', 100], ['R', 100], ['L', 292], ['R', 292]],
  5: [['L', 100], ['R', 100], ['C', 196], ['L', 292], ['R', 292]],
  6: [['L', 100], ['R', 100], ['L', 196], ['R', 196], ['L', 292], ['R', 292]],
  7: [['L', 100], ['R', 100], ['C', 148], ['L', 196], ['R', 196], ['L', 292], ['R', 292]],
  8: [['L', 100], ['R', 100], ['C', 148], ['L', 196], ['R', 196], ['C', 244], ['L', 292], ['R', 292]],
  9: [...FILAS4.flatMap((y): Array<[keyof typeof COLS, number]> => [['L', y], ['R', y]]), ['C', 196]],
  10: [...FILAS4.flatMap((y): Array<[keyof typeof COLS, number]> => [['L', y], ['R', y]]), ['C', 134], ['C', 258]],
};

const papelCarta = (borde: string) => `
  <defs><linearGradient id="papel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffcf5"/><stop offset="1" stop-color="#f6ecda"/></linearGradient></defs>
  <rect x="3" y="3" width="274" height="386" rx="24" fill="url(#papel)" stroke="#cdbb9c" stroke-width="3"/>
  <rect x="13" y="13" width="254" height="366" rx="16" fill="none" stroke="${borde}" stroke-opacity=".28" stroke-width="2" stroke-dasharray="1 7" stroke-linecap="round"/>`;

function indice(valor: string, pinta: string): string {
  const c = paleta[pinta]!;
  const tam = valor === '10' ? 46 : 56;
  const esp = valor === '10' ? -3 : 0;
  const uno = `${texto(SLAB, valor, 36, 64, tam, { ancla: 'middle', espacio: esp, fill: c })}${palo(pinta, 36, 96, 32)}`;
  return `${uno}<g transform="rotate(180 140 196)">${uno}</g>`;
}

function svgCarta(valor: string, pinta: string): string {
  const c = paleta[pinta]!;
  let centro = '';
  if (valor === 'A') {
    centro = `<circle cx="140" cy="196" r="84" fill="${c}" fill-opacity=".06" stroke="${c}" stroke-opacity=".35" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round"/>${palo(pinta, 140, 196, 118)}`;
  } else if (valor === 'J' || valor === 'Q' || valor === 'K') {
    const motivo = valor === 'J' ? MOTIVO.sombrero! : valor === 'Q' ? MOTIVO.cactus! : MOTIVO.estrella!;
    centro = `<rect x="58" y="78" width="164" height="236" rx="18" fill="${c}" fill-opacity=".08" stroke="${c}" stroke-width="3"/>
      <rect x="66" y="86" width="148" height="220" rx="12" fill="none" stroke="${c}" stroke-opacity=".3" stroke-width="1.5"/>
      ${dibujo(valor, motivo, 140, 152, 96, c)}
      ${texto(RYE, valor, 140, 290, 104, { ancla: 'middle', fill: c })}
      ${palo(pinta, 84, 104, 22)}${palo(pinta, 196, 288, 22, true)}`;
  } else {
    centro = PIPS[valor]!.map(([col, y]) => palo(pinta, COLS[col], y, 52, y > 196)).join('');
  }
  return svg(280, 392, `${papelCarta(c)}${indice(valor, pinta)}${centro}`);
}

function svgJoker(): string {
  const c = paleta === PALETAS.normal ? '#5f8f8a' : '#2f74a6';
  return svg(280, 392, `${papelCarta(c)}
  <rect x="40" y="70" width="200" height="252" rx="20" fill="${c}" fill-opacity=".1" stroke="${c}" stroke-width="3"/>
  ${dibujo('estrella', MOTIVO.estrella!, 140, 168, 128, C.mostazaOsc)}
  <path d="M70 250 Q140 222 210 250" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 9"/>
  ${texto(RYE, 'JOKER', 140, 296, 44, { ancla: 'middle', espacio: 2, fill: c })}
  ${dibujo('e', MOTIVO.estrella!, 38, 46, 40, c)}<g transform="rotate(180 140 196)">${dibujo('e', MOTIVO.estrella!, 38, 46, 40, c)}</g>`);
}

/* ============================== reversos (skins de cartas) ============================== */
interface SkinCarta { id: string; diseno: { fondo: [string, string]; trazo: string; motivo: string; tinta?: string; paleta?: string[] } }

function patronMotivo(motivo: string, t: string, fondo: string): string {
  const os = oscuro(fondo, 0.18);
  switch (motivo) {
    case 'cuerda':
      return `<pattern id="p" width="34" height="34" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 17H34M17 0V34" stroke="${t}" stroke-opacity=".22" stroke-width="2"/><circle cx="17" cy="17" r="2.6" fill="${t}" fill-opacity=".35"/></pattern>`;
    case 'herraduras':
      return `<pattern id="p" width="46" height="46" patternUnits="userSpaceOnUse"><g transform="translate(11 9) scale(.24)" opacity=".42">${MOTIVO.herradura!(t, t)}</g><g transform="translate(34 32) scale(.12)" opacity=".3"><circle cx="50" cy="50" r="30" fill="${t}"/></g></pattern>`;
    case 'sarape':
      return `<pattern id="p" width="60" height="60" patternUnits="userSpaceOnUse"><rect width="60" height="8" fill="${t}" fill-opacity=".5"/><rect y="14" width="60" height="4" fill="${C.mostaza}" fill-opacity=".55"/><rect y="24" width="60" height="10" fill="${os}" fill-opacity=".35"/><rect y="40" width="60" height="4" fill="${C.terracota}" fill-opacity=".45"/><path d="M0 52 L6 47 L12 52 L18 47 L24 52 L30 47 L36 52 L42 47 L48 52 L54 47 L60 52" fill="none" stroke="${t}" stroke-opacity=".55" stroke-width="2"/></pattern>`;
    case 'cactus':
      return `<pattern id="p" width="52" height="58" patternUnits="userSpaceOnUse"><g transform="translate(10 8) scale(.32)" opacity=".4">${MOTIVO.cactus!(t, t)}</g></pattern>`;
    case 'estrellas':
      return `<pattern id="p" width="44" height="44" patternUnits="userSpaceOnUse"><g transform="translate(8 7) scale(.28)" opacity=".42">${MOTIVO.estrella!(t, fondo)}</g></pattern>`;
    case 'dunas':
      return `<pattern id="p" width="60" height="26" patternUnits="userSpaceOnUse"><path d="M0 18 Q15 6 30 18 T60 18" fill="none" stroke="${t}" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/></pattern>`;
    case 'repujado':
      return `<pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M20 2 L38 20 L20 38 L2 20 Z" fill="none" stroke="${t}" stroke-opacity=".5" stroke-width="2"/><circle cx="20" cy="20" r="5" fill="none" stroke="${t}" stroke-opacity=".6" stroke-width="2"/><circle cx="20" cy="20" r="1.8" fill="${t}" fill-opacity=".7"/></pattern>`;
    default:
      return '<pattern id="p" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="none"/></pattern>';
  }
}

function svgReversoSkin(sk: SkinCarta): string {
  const d = sk.diseno;
  const [c0, c1] = d.fondo;
  const t = d.trazo;
  const tinta = d.tinta ?? null;
  const rnd = azar(hash(sk.id));
  const neon = tinta === 'neon';
  const pintura = tinta === 'metal' ? 'url(#tinta)' : tinta === 'holo' ? 'url(#holo)' : t;
  const defs: string[] = [patronMotivo(d.motivo, t, c1)];
  if (neon) defs.push('<filter id="glow" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="6" result="b1"/><feGaussianBlur stdDeviation="2" result="b2"/><feMerge><feMergeNode in="b1"/><feMergeNode in="b2"/><feMergeNode in="SourceGraphic"/></feMerge></filter>');
  if (tinta === 'metal') defs.push(`<linearGradient id="tinta" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${claro(t, 0.6)}"/><stop offset=".3" stop-color="${t}"/><stop offset=".5" stop-color="${oscuro(t, 0.3)}"/><stop offset=".72" stop-color="${t}"/><stop offset="1" stop-color="${claro(t, 0.6)}"/></linearGradient>`);
  if (tinta === 'holo') defs.push('<linearGradient id="holo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9fd7d1"/><stop offset=".25" stop-color="#b9b0dc"/><stop offset=".5" stop-color="#efb9a2"/><stop offset=".75" stop-color="#f0d79a"/><stop offset="1" stop-color="#9fd7d1"/></linearGradient><linearGradient id="holoFondo" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#9fd7d1" stop-opacity=".5"/><stop offset=".33" stop-color="#b9b0dc" stop-opacity=".45"/><stop offset=".66" stop-color="#efb9a2" stop-opacity=".45"/><stop offset="1" stop-color="#f0d79a" stop-opacity=".5"/></linearGradient>');
  let capa = '';
  if (tinta === 'marmol') {
    const [a, b, c] = d.paleta ?? ['#f6efe0', '#4f8f8a', '#c79d7b'];
    const lyr = (col: string, seed: number, fx: number, fy: number, off: number) => {
      const [r, g, bl] = hexRgb(col).map((v) => (v / 255).toFixed(3));
      return `<filter id="m${seed}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${fx} ${fy}" numOctaves="4" seed="${seed}" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${bl}  4 0 0 0 ${off}"/></filter>`;
    };
    defs.push(lyr(a!, 3, 0.009, 0.022, -2.0), lyr(b!, 11, 0.011, 0.018, -2.2), lyr(c!, 21, 0.008, 0.024, -2.35));
    capa = '<g clip-path="url(#tarjeta)"><rect width="280" height="392" fill="#fff" filter="url(#m3)" opacity=".8"/><rect width="280" height="392" fill="#fff" filter="url(#m11)" opacity=".7"/><rect width="280" height="392" fill="#fff" filter="url(#m21)" opacity=".7"/></g>';
  } else if (tinta === 'salpicado') {
    const pal = d.paleta ?? [C.terracota, C.salvia, C.lavanda];
    let s = '';
    for (let i = 0; i < 14; i++) {
      const col = pal[i % pal.length]!;
      const x = 20 + rnd() * 240;
      const y = 20 + rnd() * 352;
      s += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(26 + rnd() * 34).toFixed(1)}" ry="${(20 + rnd() * 28).toFixed(1)}" fill="${col}" fill-opacity=".55"/>`;
    }
    defs.push('<filter id="acuarela" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="9"/></filter>');
    capa = `<g clip-path="url(#tarjeta)" filter="url(#acuarela)">${s}</g>`;
  } else if (tinta === 'holo') {
    capa = '<rect x="3" y="3" width="274" height="386" rx="24" fill="url(#holoFondo)"/>';
  }
  const fx = neon ? ' filter="url(#glow)"' : '';
  const emblema = d.motivo === 'herraduras' ? MOTIVO.herradura! : d.motivo === 'cactus' ? MOTIVO.cactus! : d.motivo === 'cuerda' ? MOTIVO.sombrero! : MOTIVO.estrella!;
  const centro = oscuro(c1, 0.12);
  return svg(280, 392, `<defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c0}"/><stop offset="1" stop-color="${c1}"/></linearGradient>
    <clipPath id="tarjeta"><rect x="3" y="3" width="274" height="386" rx="24"/></clipPath>${defs.join('')}</defs>
  <rect x="3" y="3" width="274" height="386" rx="24" fill="url(#g)"/>
  ${capa}
  <rect x="3" y="3" width="274" height="386" rx="24" fill="none" stroke="${oscuro(c1, 0.25)}" stroke-opacity=".55" stroke-width="3"/>
  <rect x="17" y="17" width="246" height="358" rx="15" fill="url(#p)" stroke="${pintura}" stroke-width="6"${fx}/>
  <rect x="17" y="17" width="246" height="358" rx="15" fill="none" stroke="${oscuro(c1, 0.3)}" stroke-opacity=".35" stroke-width="6" stroke-dasharray="3 6"/>
  <circle cx="140" cy="196" r="62" fill="${centro}" fill-opacity=".55" stroke="${pintura}" stroke-width="4"${fx}/>
  <circle cx="140" cy="196" r="52" fill="none" stroke="${pintura}" stroke-opacity=".6" stroke-width="2" stroke-dasharray="1 6" stroke-linecap="round"/>
  <g${fx}>${dibujo('emblema', emblema, 140, 196, 74, pintura, c1)}</g>`);
}

/* ============================== tablero ============================== */
function svgMesaSkin(d: { fieltro: [string, string, string]; borde: [string, string, string]; filete: string; efecto?: string }): string {
  const { ancho: w, alto: h } = MEDIDAS.mesa;
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2 - 20;
  const ry = h / 2 - 16;
  const topeBorde = 34;
  const baseBorde = 72;
  const ladoBorde = 54;
  const rxF = rx - ladoBorde;
  const arriba = cy - ry + topeBorde;
  const abajo = cy + ry - baseBorde;
  const cyF = (arriba + abajo) / 2;
  const ryF = (abajo - arriba) / 2;
  const [f0, f1, f2] = d.fieltro;
  const [b0, b1, b2] = d.borde;
  const efecto = d.efecto ?? null;
  const tachas = efecto === 'tachas'
    ? Array.from({ length: 44 }, (_, i) => {
        const t = (i / 44) * Math.PI * 2;
        return `<circle cx="${(cx + (rx - ladoBorde / 2) * Math.cos(t)).toFixed(1)}" cy="${(cy + (ry - (baseBorde + topeBorde) / 4) * Math.sin(t)).toFixed(1)}" r="6" fill="#fff4d0"/><circle cx="${(cx + (rx - ladoBorde / 2) * Math.cos(t)).toFixed(1)}" cy="${(cy + (ry - (baseBorde + topeBorde) / 4) * Math.sin(t)).toFixed(1)}" r="3" fill="#c9a15a"/>`;
      }).join('')
    : '';
  const neon = efecto === 'neon'
    ? `<ellipse cx="${cx}" cy="${cy}" rx="${rx - 6}" ry="${ry - 4}" fill="none" stroke="${d.filete}" stroke-opacity=".9" stroke-width="3" filter="url(#glow)"/><ellipse cx="${cx}" cy="${cyF}" rx="${rxF}" ry="${ryF}" fill="none" stroke="${d.filete}" stroke-opacity=".85" stroke-width="3" filter="url(#glow)"/>`
    : '';
  const vetas = efecto === 'vetas'
    ? `<clipPath id="recFieltro"><ellipse cx="${cx}" cy="${cyF}" rx="${rxF}" ry="${ryF}"/></clipPath><g clip-path="url(#recFieltro)"><rect width="${w}" height="${h}" fill="#fff" filter="url(#veta)" opacity=".22"/></g>`
    : '';
  return svg(w, h, `<defs>
    <radialGradient id="fieltro" cx="50%" cy="42%" r="64%"><stop offset="0" stop-color="${f0}"/><stop offset=".6" stop-color="${f1}"/><stop offset="1" stop-color="${f2}"/></radialGradient>
    <linearGradient id="madera" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b0}"/><stop offset=".5" stop-color="${b1}"/><stop offset="1" stop-color="${b2}"/></linearGradient>
    <filter id="tela" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .08 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
    <filter id="vetaMadera" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".004 .09" numOctaves="2" seed="12" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.22  0 0 0 0 0.12  0 0 0 .22 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
    <filter id="sombra" x="-10%" y="-10%" width="120%" height="135%"><feDropShadow dx="0" dy="22" stdDeviation="24" flood-color="#5a4636" flood-opacity=".32"/></filter>
    <filter id="glow" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="9" result="b1"/><feGaussianBlur stdDeviation="3" result="b2"/><feMerge><feMergeNode in="b1"/><feMergeNode in="b2"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="veta" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".004 .012" numOctaves="5" seed="9" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0 0 0 0 1 0 0 0 0 0"/></feComponentTransfer></filter>
    <linearGradient id="sombraInterior" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a4636" stop-opacity=".22"/><stop offset=".28" stop-color="#5a4636" stop-opacity="0"/></linearGradient>
  </defs>
  <g filter="url(#sombra)"><ellipse cx="${cx}" cy="${cy + 9}" rx="${rx}" ry="${ry}" fill="${b2}"/></g>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#madera)"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#000" filter="url(#vetaMadera)"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${d.filete}" stroke-opacity=".6" stroke-width="3"/>
  ${neon}${tachas}
  <ellipse cx="${cx}" cy="${cyF}" rx="${rxF}" ry="${ryF}" fill="url(#fieltro)"/>
  <ellipse cx="${cx}" cy="${cyF}" rx="${rxF}" ry="${ryF}" fill="#000" filter="url(#tela)"/>
  <ellipse cx="${cx}" cy="${cyF}" rx="${rxF}" ry="${ryF}" fill="url(#sombraInterior)"/>
  ${vetas}
  <ellipse cx="${cx}" cy="${cyF}" rx="${rxF}" ry="${ryF}" fill="none" stroke="${d.filete}" stroke-opacity=".8" stroke-width="3"/>
  <ellipse cx="${cx}" cy="${cyF}" rx="${rxF - 36}" ry="${ryF - 36}" fill="none" stroke="${d.filete}" stroke-opacity=".45" stroke-width="2.5" stroke-dasharray="2 12" stroke-linecap="round"/>`);
}

const svgSlot = (titulo: string) =>
  svg(280, 392, `<rect x="6" y="6" width="268" height="380" rx="24" fill="#fffaf0" fill-opacity=".28" stroke="${C.maderaOsc}" stroke-opacity=".55" stroke-width="4" stroke-dasharray="2 12" stroke-linecap="round"/>
  ${texto(SLAB, titulo, 140, 210, 38, { ancla: 'middle', espacio: 6, fill: C.maderaOsc, extra: 'fill-opacity=".6"' })}`);

const svgMarcadorTurno = () =>
  svg(256, 256, `<defs><radialGradient id="r"><stop offset=".6" stop-color="${C.mostaza}" stop-opacity="0"/><stop offset=".8" stop-color="${C.mostaza}" stop-opacity=".85"/><stop offset="1" stop-color="${C.mostaza}" stop-opacity="0"/></radialGradient></defs><circle cx="128" cy="128" r="124" fill="url(#r)"/>`);

function svgPlaca(): string {
  const { ancho: w, alto: h } = MEDIDAS.placa;
  const clavo = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="5" fill="${C.madera}"/><circle cx="${x - 1.5}" cy="${y - 1.5}" r="1.8" fill="#fff" fill-opacity=".6"/>`;
  return svg(w, h, `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf1"/><stop offset="1" stop-color="#f1e4cd"/></linearGradient><filter id="s" x="-5%" y="-10%" width="110%" height="140%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#5a4636" flood-opacity=".25"/></filter></defs>
  <rect x="5" y="4" width="${w - 10}" height="${h - 12}" rx="24" fill="url(#g)" stroke="${C.madera}" stroke-width="3" filter="url(#s)"/>
  <rect x="14" y="13" width="${w - 28}" height="${h - 30}" rx="16" fill="none" stroke="${C.madera}" stroke-opacity=".4" stroke-width="2" stroke-dasharray="1 7" stroke-linecap="round"/>
  ${clavo(26, 24)}${clavo(w - 26, 24)}${clavo(26, h - 30)}${clavo(w - 26, h - 30)}`);
}

/* ============================== ambientes (3 capas de paralaje) ============================== */
interface SkinAmbiente { id: string; diseno: { pared: [string, string, string]; luz: string; estilo: string; variante?: string } }
const W = 1920;
const H = 1080;

function cresta(base: number, amp: number, sem: number, color: string, op = 1, paso = 140): string {
  const r = azar(sem);
  let d = `M0 ${H} L0 ${base}`;
  for (let x = 0; x <= W + paso; x += paso) d += ` Q${x + paso / 2} ${(base - amp * (0.3 + r() * 0.7)).toFixed(0)} ${x + paso} ${(base - amp * 0.2 * r()).toFixed(0)}`;
  return `<path d="${d} L${W} ${H} Z" fill="${color}" fill-opacity="${op}"/>`;
}
const meseta = (x: number, base: number, ancho: number, alto: number, color: string, op = 1) =>
  `<path d="M${x} ${base} L${x + ancho * 0.12} ${base - alto * 0.85} Q${x + ancho * 0.16} ${base - alto} ${x + ancho * 0.24} ${base - alto} L${x + ancho * 0.78} ${base - alto} Q${x + ancho * 0.85} ${base - alto} ${x + ancho * 0.88} ${base - alto * 0.86} L${x + ancho} ${base} Z" fill="${color}" fill-opacity="${op}"/><path d="M${x + ancho * 0.2} ${base - alto * 0.62} H${x + ancho * 0.8}" stroke="#fff" stroke-opacity=".18" stroke-width="5"/>`;
const saguaro = (x: number, base: number, alto: number, color: string) =>
  `<g transform="translate(${x - alto * 0.5} ${base - alto}) scale(${alto / 100})">${MOTIVO.cactus!(color, color).replace(/<circle[^>]*>/g, '')}</g>`;
const nubes = (lista: Array<[number, number, number]>, op = 0.75) =>
  lista.map(([x, y, s]) => `<g transform="translate(${x} ${y}) scale(${s})" fill="#fffdf8" fill-opacity="${op}"><ellipse cx="0" cy="20" rx="120" ry="34"/><ellipse cx="-50" cy="6" rx="60" ry="40"/><ellipse cx="30" cy="-6" rx="70" ry="52"/><ellipse cx="90" cy="12" rx="50" ry="34"/></g>`).join('');
const estrellas = (n: number, sem: number) => {
  const r = azar(sem);
  return Array.from({ length: n }, () => `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * H * 0.55).toFixed(0)}" r="${(1 + r() * 2.2).toFixed(1)}" fill="#fffbea" fill-opacity="${(0.45 + r() * 0.5).toFixed(2)}"/>`).join('');
};
const cielo = (d: SkinAmbiente['diseno']) => `<defs>
  <linearGradient id="cielo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${d.pared[0]}"/><stop offset=".55" stop-color="${d.pared[1]}"/><stop offset="1" stop-color="${d.pared[2]}"/></linearGradient>
  <radialGradient id="luz" cx="72%" cy="30%" r="55%"><stop offset="0" stop-color="${d.luz}" stop-opacity=".55"/><stop offset=".5" stop-color="${d.luz}" stop-opacity=".12"/><stop offset="1" stop-color="${d.luz}" stop-opacity="0"/></radialGradient>
  <filter id="suave"><feGaussianBlur stdDeviation="12"/></filter>
</defs><rect width="${W}" height="${H}" fill="url(#cielo)"/>`;
const vineta = (color = '#6b4a34', op = 0.24) => `<defs><radialGradient id="v" cx="50%" cy="48%" r="75%"><stop offset=".55" stop-color="${color}" stop-opacity="0"/><stop offset="1" stop-color="${color}" stop-opacity="${op}"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#v)"/>`;
const cerca = (y: number, desde: number, hasta: number, color: string) => {
  let s = '';
  for (let x = desde; x <= hasta; x += 120) s += `<rect x="${x}" y="${y - 90}" width="18" height="110" rx="5" fill="${color}"/>`;
  return `${s}<rect x="${desde - 20}" y="${y - 70}" width="${hasta - desde + 60}" height="12" rx="5" fill="${color}"/><rect x="${desde - 20}" y="${y - 32}" width="${hasta - desde + 60}" height="12" rx="5" fill="${color}"/>`;
};
const matas = (lista: Array<[number, number, number]>, color: string) =>
  lista.map(([x, y, s]) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"><path d="M0 0 Q-10 -40 -30 -60 M0 0 Q0 -50 4 -80 M0 0 Q14 -40 34 -56 M0 0 Q-20 -24 -46 -30 M0 0 Q22 -20 48 -24"/></g>`).join('');
const farol = (x: number, y: number, luz: string) =>
  `<circle cx="${x}" cy="${y}" r="70" fill="${luz}" fill-opacity=".25"/><circle cx="${x}" cy="${y}" r="30" fill="${luz}" fill-opacity=".35"/><rect x="${x - 14}" y="${y - 20}" width="28" height="38" rx="6" fill="${luz}"/><path d="M${x - 16} ${y - 22} H${x + 16} M${x} ${y - 22} V${y - 34}" stroke="${C.maderaOsc}" stroke-width="4" stroke-linecap="round"/>`;

function svgAmbienteCapa(sk: SkinAmbiente, capa: 'far' | 'mid' | 'near'): string {
  const d = sk.diseno;
  const noche = d.variante === 'noche';
  const faroles = d.variante === 'faroles';
  if (d.estilo === 'desierto') {
    if (capa === 'far') {
      const astro = noche
        ? `${estrellas(160, 5)}<circle cx="1440" cy="250" r="190" fill="${d.luz}" fill-opacity=".14"/><circle cx="1440" cy="250" r="86" fill="#fff6e0"/><circle cx="1414" cy="230" r="14" fill="#efe2c4" fill-opacity=".7"/><circle cx="1466" cy="276" r="10" fill="#efe2c4" fill-opacity=".6"/>`
        : `<circle cx="1440" cy="300" r="260" fill="${d.luz}" fill-opacity=".28"/><circle cx="1440" cy="300" r="112" fill="#fff4dc"/>${nubes([[380, 210, 1], [900, 140, 0.7], [1700, 420, 0.6]])}`;
      const m1 = noche ? '#7c7ea2' : '#e6c3aa';
      const m2 = noche ? '#6a6c91' : '#d9ae96';
      return svg(W, H, `${cielo(d)}<rect width="${W}" height="${H}" fill="url(#luz)"/>${astro}
        ${meseta(-60, 720, 520, 210, m1)}${meseta(520, 720, 360, 150, m1, 0.9)}${meseta(1180, 720, 620, 240, m1)}${meseta(1700, 720, 360, 130, m1, 0.9)}
        ${meseta(160, 760, 420, 120, m2)}${meseta(1340, 760, 480, 150, m2)}
        <rect y="700" width="${W}" height="80" fill="#fff" fill-opacity="${noche ? 0.05 : 0.22}" filter="url(#suave)"/>`);
    }
    if (capa === 'mid') {
      const d1 = noche ? '#8a87a4' : '#eccda4';
      const d2 = noche ? '#77769a' : '#e3bd90';
      const cac = noche ? '#56627a' : C.salviaOsc;
      const cac2 = noche ? '#4b566d' : '#86a882';
      return svg(W, H, `${cresta(820, 90, 3, d1, 1, 320)}${cresta(900, 70, 9, d2, 1, 280)}
        ${saguaro(240, 880, 300, cac)}${saguaro(420, 900, 170, cac2)}${saguaro(1560, 890, 340, cac)}${saguaro(1750, 910, 190, cac2)}${saguaro(1300, 880, 110, cac2)}
        <ellipse cx="760" cy="905" rx="70" ry="22" fill="${noche ? '#6a6888' : '#cfa57c'}"/><ellipse cx="1120" cy="915" rx="44" ry="14" fill="${noche ? '#6a6888' : '#cfa57c'}"/>`);
    }
    const suelo = noche ? '#5f5d7e' : '#d9ae7e';
    const fogata = noche ? `<defs><radialGradient id="fogata"><stop offset="0" stop-color="${d.luz}" stop-opacity=".45"/><stop offset="1" stop-color="${d.luz}" stop-opacity="0"/></radialGradient></defs><circle cx="300" cy="990" r="260" fill="url(#fogata)"/>` : '';
    return svg(W, H, `${fogata}<path d="M0 ${H} L0 930 Q240 880 560 ${H} Z" fill="${suelo}"/><path d="M${W} ${H} L${W} 920 Q${W - 260} 870 ${W - 600} ${H} Z" fill="${suelo}"/>
      ${matas([[120, 1000, 1], [1820, 990, 1.1], [1680, 1040, 0.8]], noche ? '#4f5a70' : C.salviaOsc)}${vineta(noche ? '#1f2338' : '#6b4a34', noche ? 0.35 : 0.22)}`);
  }
  if (d.estilo === 'pradera') {
    if (capa === 'far') {
      return svg(W, H, `${cielo(d)}<rect width="${W}" height="${H}" fill="url(#luz)"/><circle cx="1500" cy="220" r="80" fill="#fffbe6"/>${nubes([[300, 200, 1.1], [820, 120, 0.8], [1250, 300, 0.7], [1760, 160, 0.9]], 0.85)}
        ${cresta(700, 90, 5, '#cfe0c6', 1, 360)}${cresta(760, 70, 12, '#bfd5b2', 1, 300)}`);
    }
    if (capa === 'mid') {
      const molino = `<g transform="translate(1540 520)" stroke="${C.maderaOsc}" stroke-width="10" stroke-linecap="round"><path d="M-60 360 L-10 0 M60 360 L10 0 M-40 200 H40 M-50 280 H50" fill="none"/><g transform="translate(0 -10)"><circle r="16" fill="${C.maderaOsc}"/>${Array.from({ length: 8 }, (_, i) => `<path d="M0 0 L${(110 * Math.cos((i * Math.PI) / 4)).toFixed(1)} ${(110 * Math.sin((i * Math.PI) / 4)).toFixed(1)}" stroke-width="7"/>`).join('')}<circle r="110" fill="none" stroke-width="5" stroke-opacity=".6"/></g></g>`;
      const granero = `<g transform="translate(260 640)"><path d="M0 120 L0 40 L90 -20 L180 40 L180 120 Z" fill="#dc9f86"/><path d="M-10 44 L90 -28 L190 44" fill="none" stroke="#fbf5ea" stroke-width="10" stroke-linejoin="round"/><rect x="62" y="60" width="56" height="60" fill="#c98b72" stroke="#fbf5ea" stroke-width="6"/><path d="M62 60 L118 120 M118 60 L62 120" stroke="#fbf5ea" stroke-width="5"/></g>`;
      return svg(W, H, `${cresta(820, 110, 7, '#b4cfa6', 1, 400)}${granero}${molino}${cresta(900, 80, 15, '#a3c494', 1, 340)}`);
    }
    return svg(W, H, `${cerca(1010, 40, 520, '#c49a76')}${cerca(1010, 1420, 1900, '#c49a76')}${matas([[600, 1060, 1], [1300, 1070, 0.9], [90, 1075, 1.2], [1850, 1075, 1.1]], C.salviaOsc)}${vineta('#5f6b4a', 0.2)}`);
  }
  if (d.estilo === 'canon') {
    if (capa === 'far') {
      const estratos = (x: number, ancho: number, alto: number, color: string) => `<path d="M${x} ${H} L${x} ${H - alto} Q${x + ancho * 0.5} ${H - alto - 40} ${x + ancho} ${H - alto + 30} L${x + ancho} ${H} Z" fill="${color}"/>${[0.2, 0.38, 0.55, 0.7].map((f) => `<path d="M${x} ${H - alto * (1 - f)} H${x + ancho}" stroke="#fff" stroke-opacity=".16" stroke-width="6"/>`).join('')}`;
      return svg(W, H, `${cielo(d)}<rect width="${W}" height="${H}" fill="url(#luz)"/>${nubes([[960, 160, 0.9], [1500, 260, 0.6]], 0.7)}
        <path d="M760 760 Q760 560 960 540 Q1160 560 1160 760 L1100 760 Q1100 620 960 610 Q820 620 820 760 Z" fill="#e7b69c"/>
        ${estratos(-40, 520, 760, '#e9b79d')}${estratos(1440, 540, 800, '#e9b79d')}`);
    }
    if (capa === 'mid') {
      const pilar = (x: number, alto: number, ancho: number, col: string) => `<path d="M${x} ${H} L${x + ancho * 0.15} ${H - alto} Q${x + ancho * 0.5} ${H - alto - 26} ${x + ancho * 0.85} ${H - alto} L${x + ancho} ${H} Z" fill="${col}"/><ellipse cx="${x + ancho / 2}" cy="${H - alto - 6}" rx="${ancho * 0.42}" ry="18" fill="${oscuro(col, 0.08)}"/>`;
      return svg(W, H, `${pilar(80, 560, 240, '#d79a7e')}${pilar(360, 380, 160, '#cf9175')}${pilar(1520, 600, 260, '#d79a7e')}${pilar(1380, 340, 150, '#cf9175')}${cresta(940, 50, 4, '#e4b08f', 1, 260)}`);
    }
    return svg(W, H, `<ellipse cx="160" cy="1040" rx="260" ry="90" fill="#c98a6e"/><ellipse cx="1760" cy="1050" rx="300" ry="100" fill="#c98a6e"/><ellipse cx="380" cy="1060" rx="120" ry="40" fill="#bd7f64"/>${matas([[520, 1070, 0.9], [1480, 1072, 1]], '#a07a5e')}${vineta('#7a4a34', 0.22)}`);
  }
  if (d.estilo === 'saloon') {
    if (capa === 'far') {
      let tablas = '';
      for (let x = 0; x < W; x += 96) tablas += `<rect x="${x}" y="0" width="96" height="${H}" fill="${x % 192 ? '#e3caa6' : '#dcc09a'}"/><path d="M${x} 0 V${H}" stroke="#c4a27f" stroke-width="3"/>`;
      const cartel = (x: number, y: number, giro: number) => `<g transform="translate(${x} ${y}) rotate(${giro})"><rect x="-90" y="-120" width="180" height="240" rx="6" fill="#f8efdc" stroke="#cdb48f" stroke-width="3"/>${texto(SLAB, 'SE BUSCA', 0, -76, 30, { ancla: 'middle', espacio: 2, fill: C.tinta })}<rect x="-54" y="-58" width="108" height="100" rx="6" fill="#e6d4b4"/><circle cx="0" cy="-14" r="26" fill="#cdb48f"/><path d="M-40 40 Q0 10 40 40" fill="#cdb48f"/><path d="M-60 70 H60 M-60 90 H40" stroke="#cdb48f" stroke-width="6" stroke-linecap="round"/></g>`;
      return svg(W, H, `${tablas}<rect y="760" width="${W}" height="${H - 760}" fill="#c9a681"/><path d="M0 760 H${W}" stroke="#b28e6a" stroke-width="10"/>
        <rect x="760" y="120" width="400" height="300" rx="16" fill="#cfe3e1" stroke="#b28e6a" stroke-width="16"/><path d="M960 120 V420 M760 270 H1160" stroke="#b28e6a" stroke-width="10"/><circle cx="1060" cy="200" r="40" fill="#fff4dc"/>
        ${cartel(330, 330, -4)}${cartel(1590, 340, 3)}
        <rect width="${W}" height="${H}" fill="url(#luzSaloon)"/><defs><radialGradient id="luzSaloon" cx="50%" cy="20%" r="70%"><stop offset="0" stop-color="${d.luz}" stop-opacity=".45"/><stop offset="1" stop-color="${d.luz}" stop-opacity="0"/></radialGradient></defs>`);
    }
    if (capa === 'mid') {
      const lampara = (x: number) => `<line x1="${x}" y1="0" x2="${x}" y2="110" stroke="${C.maderaOsc}" stroke-width="4"/><circle cx="${x}" cy="160" r="150" fill="${d.luz}" fill-opacity=".25"/><path d="M${x - 50} 150 Q${x} 100 ${x + 50} 150 Z" fill="#9b7a5f"/><ellipse cx="${x}" cy="152" rx="36" ry="9" fill="#fff1cc"/>`;
      const repisa = (x: number) => `<rect x="${x}" y="560" width="300" height="16" rx="4" fill="#a8835f"/>${[0, 50, 100, 150, 200, 250].map((dx, i) => `<rect x="${x + 16 + dx}" y="${560 - 60 - (i % 3) * 14}" width="${22 + (i % 2) * 6}" height="${60 + (i % 3) * 14}" rx="6" fill="${[C.salvia, C.terracota, C.turquesa, C.mostaza][i % 4]}" fill-opacity=".85"/>`).join('')}`;
      return svg(W, H, `${lampara(560)}${lampara(960)}${lampara(1360)}${repisa(60)}${repisa(1560)}`);
    }
    return svg(W, H, `<path d="M0 ${H} L0 820 Q90 800 150 840 L150 ${H} Z" fill="#a8835f"/><path d="M${W} ${H} L${W} 820 Q${W - 90} 800 ${W - 150} 840 L${W - 150} ${H} Z" fill="#a8835f"/>${vineta('#6b4a34', 0.28)}`);
  }
  // pueblo
  if (capa === 'far') return svg(W, H, `${cielo(d)}<rect width="${W}" height="${H}" fill="url(#luz)"/>${faroles ? estrellas(60, 8) : ''}<circle cx="1500" cy="560" r="160" fill="#ffe0b8" fill-opacity=".6"/>${cresta(720, 70, 6, '#c9b0b4', 1, 360)}`);
  if (capa === 'mid') {
    const edificio = (x: number, ancho: number, alto: number, rotulo: string, col: string) => {
      const ventanas = Array.from({ length: Math.floor(ancho / 80) }, (_, i) => `<rect x="${x + 26 + i * 80}" y="${H - alto + 90}" width="40" height="54" rx="4" fill="#ffd8a0" fill-opacity="${faroles ? 0.95 : 0.6}"/>`).join('');
      return `<path d="M${x} ${H} V${H - alto} H${x + ancho} V${H} Z" fill="${col}"/><rect x="${x - 10}" y="${H - alto - 50}" width="${ancho + 20}" height="60" rx="6" fill="${oscuro(col, 0.08)}"/>${texto(SLAB, rotulo, x + ancho / 2, H - alto - 10, 34, { ancla: 'middle', espacio: 4, fill: '#fbf1dc' })}${ventanas}<rect x="${x + ancho / 2 - 30}" y="${H - 150}" width="60" height="150" fill="${oscuro(col, 0.2)}"/>`;
    };
    return svg(W, H, `${edificio(40, 380, 470, 'SALOON', '#a99aa6')}${edificio(470, 300, 380, 'BANCO', '#b6a59c')}${edificio(1180, 320, 420, 'SHERIFF', '#a99aa6')}${edificio(1540, 360, 500, 'HOTEL', '#b6a59c')}`);
  }
  let luces = '';
  for (let i = 0; i < 9; i++) luces += farol(130 + i * 210, 120 + Math.sin(i) * 26, d.luz);
  return svg(W, H, `<path d="M0 100 Q480 180 960 120 T1920 110" fill="none" stroke="${C.maderaOsc}" stroke-width="4"/>${luces}<rect y="1010" width="${W}" height="70" fill="#a8835f"/>${vineta('#4a3a50', 0.26)}`);
}

/* ============================== avatares, logo, iconos ============================== */
const FONDOS_AVATAR = [C.salvia, C.terracota, C.denim, C.mostaza, C.turquesa, C.lavanda, '#c9b08f', '#d9a79a'];
const PIEL = ['#f1d3b8', '#e3b897', '#c99878', '#a87b5d'];
function svgAvatar(i: number): string {
  const fondo = FONDOS_AVATAR[i]!;
  const piel = PIEL[i % PIEL.length]!;
  const camisa = mezcla(FONDOS_AVATAR[(i + 3) % 8]!, '#000000', 0.08);
  const sombreros: string[] = [
    `<path d="M88 92 Q86 58 104 52 Q128 62 152 52 Q170 58 168 92 Z" fill="${C.madera}"/><path d="M52 94 Q128 116 204 94 Q206 106 192 112 Q128 130 64 112 Q50 106 52 94 Z" fill="${C.madera}"/><rect x="88" y="80" width="80" height="10" fill="${C.terracotaOsc}"/>`,
    `<ellipse cx="128" cy="96" rx="70" ry="14" fill="#5f6b80"/><path d="M84 96 Q84 50 128 50 Q172 50 172 96 Z" fill="#6f7c93"/>`,
    `<path d="M70 100 Q128 70 186 100 Q186 70 128 58 Q70 70 70 100 Z" fill="${C.terracota}"/><circle cx="180" cy="108" r="10" fill="${C.terracota}"/>`,
    `<ellipse cx="128" cy="98" rx="88" ry="18" fill="#e3c88d"/><path d="M90 98 Q92 60 128 58 Q164 60 166 98 Z" fill="#ecd59e"/><path d="M92 86 H164" stroke="${C.terracota}" stroke-width="6"/>`,
    `<path d="M92 94 Q88 56 108 52 Q128 60 148 52 Q168 56 164 94 Z" fill="#6f8f72"/><path d="M58 96 Q128 116 198 96 Q200 108 186 112 Q128 128 70 112 Q56 108 58 96 Z" fill="#6f8f72"/>`,
    `<path d="M86 98 Q86 56 128 56 Q170 56 170 98 Z" fill="#8a6a52"/><path d="M80 98 H196 Q200 106 190 108 H80 Z" fill="#7a5c46"/>`,
    `<path d="M92 92 Q90 54 108 50 Q128 58 148 50 Q166 54 164 92 Z" fill="#cdb7a0"/><path d="M50 94 Q128 118 206 94 Q208 108 192 114 Q128 132 64 114 Q48 108 50 94 Z" fill="#cdb7a0"/>`,
    `<path d="M88 92 Q86 58 104 52 Q128 62 152 52 Q170 58 168 92 Z" fill="#9aa0aa"/><path d="M52 94 Q128 116 204 94 Q206 106 192 112 Q128 130 64 112 Q50 106 52 94 Z" fill="#9aa0aa"/><g transform="translate(116 62) scale(.24)">${MOTIVO.estrella!(C.mostaza, C.papel)}</g>`,
  ];
  return svg(256, 256, `<defs><clipPath id="c"><circle cx="128" cy="128" r="120"/></clipPath></defs>
  <circle cx="128" cy="128" r="122" fill="${fondo}" stroke="${C.papel}" stroke-width="7"/>
  <g clip-path="url(#c)">
    <circle cx="128" cy="128" r="120" fill="#fff" fill-opacity=".14"/>
    <path d="M40 256 C46 190 92 170 128 170 C164 170 210 190 216 256 Z" fill="${camisa}"/>
    <path d="M104 172 L128 204 L152 172" fill="${C.papel}" fill-opacity=".8"/>
    <circle cx="128" cy="124" r="46" fill="${piel}"/>
    <circle cx="112" cy="128" r="4.5" fill="${C.tinta}"/><circle cx="144" cy="128" r="4.5" fill="${C.tinta}"/>
    <path d="M116 146 Q128 154 140 146" fill="none" stroke="${C.tinta}" stroke-width="4" stroke-linecap="round"/>
    <circle cx="104" cy="142" r="7" fill="#e8a08a" fill-opacity=".45"/><circle cx="152" cy="142" r="7" fill="#e8a08a" fill-opacity=".45"/>
    ${sombreros[i]}
  </g>`);
}

function svgLogo(): string {
  const tabla = '#ecd2ab';
  const tabla2 = '#e0c095';
  const clavo = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="9" fill="${C.maderaOsc}"/><circle cx="${x - 2.5}" cy="${y - 2.5}" r="3" fill="#fff" fill-opacity=".55"/>`;
  return svg(1280, 512, `<defs>
    <linearGradient id="tabla" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tabla}"/><stop offset="1" stop-color="${tabla2}"/></linearGradient>
    <filter id="s" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#5a4636" flood-opacity=".25"/></filter>
  </defs>
  <path d="M420 0 L452 96 M860 0 L828 96" stroke="${C.maderaOsc}" stroke-width="8" stroke-linecap="round"/>
  <g filter="url(#s)">
    <rect x="190" y="86" width="900" height="290" rx="40" fill="url(#tabla)" stroke="${C.maderaOsc}" stroke-width="7"/>
    <path d="M196 182 H1084 M196 280 H1084" stroke="#c9a47c" stroke-width="4" stroke-opacity=".75"/>
    <rect x="214" y="110" width="852" height="242" rx="26" fill="none" stroke="${C.maderaOsc}" stroke-opacity=".35" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round"/>
  </g>
  ${clavo(236, 132)}${clavo(1044, 132)}${clavo(236, 330)}${clavo(1044, 330)}
  ${texto(RYE, 'EL', 640, 170, 56, { ancla: 'middle', espacio: 8, fill: C.terracotaOsc })}
  ${texto(RYE, 'APUNTADO', 646, 314, 136, { ancla: 'middle', espacio: 2, fill: '#fbf1dc' })}
  ${texto(RYE, 'APUNTADO', 640, 308, 136, { ancla: 'middle', espacio: 2, fill: C.tinta })}
  <path d="M380 404 L900 404 L880 432 L900 460 L380 460 L400 432 Z" fill="${C.terracota}" stroke="${C.terracotaOsc}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M380 404 L350 390 L362 432 L350 470 L380 460 Z M900 404 L930 390 L918 432 L930 470 L900 460 Z" fill="${C.terracotaOsc}"/>
  ${texto(NUNITO, 'JUEGO DE CARTAS', 640, 444, 32, { ancla: 'middle', espacio: 6, fill: C.papel })}
  ${saguaro(140, 470, 230, C.salviaOsc)}<path d="M70 470 H210" stroke="${C.madera}" stroke-width="8" stroke-linecap="round"/>
  <g transform="translate(1066 330)">${dibujo('estrella', MOTIVO.estrella!, 0, 0, 132, C.mostazaOsc, C.papel)}${dibujo('estrella', MOTIVO.estrella!, -3, -3, 124, C.mostaza, C.papel)}</g>`);
}

const ICONOS: Record<string, string> = {
  turno: '<path d="M32 22 L70 48 L32 74 Z" fill="currentColor" fill-opacity=".2" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/>',
  reloj: '<circle cx="48" cy="52" r="27" fill="currentColor" fill-opacity=".15" stroke="currentColor" stroke-width="7"/><path d="M48 38 V54 L59 61" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><path d="M38 14 H58" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>',
  corona: `<g transform="translate(6 6) scale(.84)">${MOTIVO.estrella!('currentColor', '#fbf5ea')}</g>`,
  bot: '<rect x="20" y="32" width="56" height="42" rx="14" fill="currentColor" fill-opacity=".15" stroke="currentColor" stroke-width="7"/><circle cx="38" cy="52" r="6" fill="currentColor"/><circle cx="58" cy="52" r="6" fill="currentColor"/><path d="M48 32 V18" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><circle cx="48" cy="13" r="5.5" fill="currentColor"/>',
  desconectado: '<path d="M14 42 Q48 10 82 42 M28 56 Q48 38 68 56" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><circle cx="48" cy="72" r="6" fill="currentColor"/><path d="M18 84 L80 16" stroke="#c4604f" stroke-width="8" stroke-linecap="round"/>',
  ajustes: '<circle cx="48" cy="48" r="15" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width="7"/><path d="M48 12 V22 M48 74 V84 M12 48 H22 M74 48 H84 M23 23 L30 30 M66 66 L73 73 M23 73 L30 66 M66 30 L73 23" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>',
  ronda: '<path d="M70 32 A28 28 0 1 0 74 56" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><path d="M76 18 V36 H58" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>',
  eliminado: '<circle cx="48" cy="48" r="32" fill="currentColor" fill-opacity=".15" stroke="currentColor" stroke-width="7"/><path d="M34 34 L62 62 M62 34 L34 62" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>',
  mazo: '<rect x="24" y="18" width="42" height="58" rx="9" fill="currentColor" fill-opacity=".15" stroke="currentColor" stroke-width="6"/><rect x="33" y="26" width="42" height="58" rx="9" fill="none" stroke="currentColor" stroke-width="6" stroke-opacity=".6"/>',
  pozo: '<rect x="24" y="22" width="48" height="54" rx="9" fill="none" stroke="currentColor" stroke-width="6" stroke-dasharray="2 9" stroke-linecap="round"/><path d="M48 34 V62 M36 52 L48 64 L60 52" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>',
  ayuda: '<circle cx="48" cy="48" r="32" fill="currentColor" fill-opacity=".15" stroke="currentColor" stroke-width="7"/><path d="M38 40 Q38 28 48 28 Q60 28 60 40 Q60 47 52 52 Q48 55 48 62" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><circle cx="48" cy="72" r="4.5" fill="currentColor"/>',
  mesa: '<ellipse cx="48" cy="50" rx="36" ry="24" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width="7"/><ellipse cx="48" cy="46" rx="20" ry="11" fill="currentColor" fill-opacity=".35"/>',
  sonido: '<path d="M18 38 H32 L52 22 V74 L32 58 H18 Z" fill="currentColor" fill-opacity=".85" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M62 36 Q72 48 62 60 M70 26 Q88 48 70 70" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>',
  paleta: '<path d="M48 14 C28 14 12 30 12 50 C12 68 26 82 44 82 C52 82 54 76 50 70 C46 64 50 58 58 58 H68 C80 58 86 50 86 42 C86 26 70 14 48 14 Z" fill="currentColor" fill-opacity=".15" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/><circle cx="32" cy="44" r="5" fill="#d88e70"/><circle cx="46" cy="32" r="5" fill="#e7c27d"/><circle cx="64" cy="34" r="5" fill="#9db89a"/>',
  copiar: '<rect x="30" y="30" width="42" height="48" rx="9" fill="currentColor" fill-opacity=".15" stroke="currentColor" stroke-width="7"/><path d="M22 62 V24 Q22 16 30 16 H60" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>',
  salir: '<path d="M40 18 H24 Q18 18 18 24 V72 Q18 78 24 78 H40" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><path d="M42 48 H82 M66 32 L82 48 L66 64" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>',
};
const svgIcono = (trazo: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" color="${C.tinta}">${trazo}</svg>`;
const svgFavicon = () => svg(64, 64, `<circle cx="32" cy="32" r="30" fill="${C.papel}" stroke="${C.madera}" stroke-width="3"/><g transform="translate(9 8) scale(.46)">${MOTIVO.estrella!(C.mostazaOsc, C.papel)}</g>`);

/* ============================== escritura ============================== */
const PINTAS = ['H', 'D', 'C', 'S'];
const VALORES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
for (const p of PINTAS) for (const v of VALORES) escribir(`cards/${v}${p}.svg`, svgCarta(v, p));
paleta = PALETAS.daltonico;
for (const p of PINTAS) for (const v of VALORES) escribir(`cards-cb/${v}${p}.svg`, svgCarta(v, p));
escribir('cards-cb/JOKER.svg', svgJoker());
paleta = PALETAS.normal;
escribir('cards/JOKER.svg', svgJoker());
escribir('cards/back.svg', svgReversoSkin(CATALOGO.cartas[0]));

escribir('board/mesa.svg', svgMesaSkin(CATALOGO.mesas[0].diseno));
escribir('board/slot_mazo.svg', svgSlot('MAZO'));
escribir('board/slot_pozo.svg', svgSlot('POZO'));
escribir('board/marcador_turno.svg', svgMarcadorTurno());
escribir('board/placa_jugador.svg', svgPlaca());

for (const sk of CATALOGO.cartas) escribir(`skins/cards/back_${sk.id}.svg`, svgReversoSkin(sk));
for (const sk of CATALOGO.mesas) escribir(`skins/tables/${sk.id}.svg`, svgMesaSkin(sk.diseno));
for (const sk of CATALOGO.ambientes) for (const capa of ['far', 'mid', 'near'] as const) escribir(`skins/ambients/${sk.id}_${capa}.svg`, svgAmbienteCapa(sk, capa));
const base = CATALOGO.ambientes[0];
escribir('bg/bg_far.svg', svgAmbienteCapa(base, 'far'));
escribir('bg/bg_mid.svg', svgAmbienteCapa(base, 'mid'));
escribir('bg/bg_near.svg', svgAmbienteCapa(base, 'near'));

for (let i = 0; i < MEDIDAS.avatar.cantidad; i++) escribir(`avatars/avatar_${i}.svg`, svgAvatar(i));
escribir('ui/logo.svg', svgLogo());
escribir('ui/favicon.svg', svgFavicon());
for (const [n, t] of Object.entries(ICONOS)) escribir(`ui/icon_${n}.svg`, svgIcono(t));

// Fuentes de la interfaz (OFL): Rye para títulos, Nunito para el texto.
mkdirSync(join(AQUI, '..', 'public', 'fonts'), { recursive: true });
for (const [pkg, archivo] of [['rye', 'rye-latin-400-normal.woff2'], ['nunito', 'nunito-latin-400-normal.woff2'], ['nunito', 'nunito-latin-700-normal.woff2'], ['nunito', 'nunito-latin-800-normal.woff2']] as const) {
  copyFileSync(join(AQUI, '..', 'node_modules', '@fontsource', pkg, 'files', archivo), join(AQUI, '..', 'public', 'fonts', archivo));
}

// Licencias de las fuentes (OFL 1.1): se publican junto a ellas.
writeFileSync(
  join(AQUI, '..', 'public', 'fonts', 'OFL.txt'),
  ['rye', 'nunito', 'zilla-slab'].map((pkg) => `===== ${pkg} =====\n` + readFileSync(join(AQUI, '..', 'node_modules', '@fontsource', pkg, 'LICENSE'), 'utf8')).join('\n\n'),
);

const manifest = {
  version: 2,
  nota: 'Arte vectorial generado por tools/generate-assets.ts. Para reemplazar una imagen, usa el MISMO nombre y tamaño; si cambias el formato, actualiza "ext".',
  escenario: { ...MEDIDAS.escenario, nota: 'Lienzo lógico 16:9. El juego lo escala (letterbox) a cualquier ventana.' },
  cartas: { carpeta: 'assets/cards/', ext: 'svg', ancho: 280, alto: 392, displayAncho: 140, displayAlto: 196, radioEsquina: 24, nombre: '{valor}{pinta} (AH, 10S, KD...), JOKER, back' },
  tablero: {
    carpeta: 'assets/board/',
    ext: 'svg',
    mesa: { archivo: 'mesa', ancho: MEDIDAS.mesa.ancho, alto: MEDIDAS.mesa.alto, centro: [960, 470] },
    slotMazo: { archivo: 'slot_mazo', ...MEDIDAS.slot, centro: [855, 440] },
    slotPozo: { archivo: 'slot_pozo', ...MEDIDAS.slot, centro: [1065, 440] },
    marcadorTurno: { archivo: 'marcador_turno', ...MEDIDAS.marcadorTurno },
    placaJugador: { archivo: 'placa_jugador', ...MEDIDAS.placa, display: [360, 90] },
  },
  fondos: { carpeta: 'assets/bg/', ext: 'svg', capas: [{ archivo: 'bg_far', ...MEDIDAS.fondo, paralaje: 0.012 }, { archivo: 'bg_mid', ...MEDIDAS.fondo, paralaje: 0.028 }, { archivo: 'bg_near', ...MEDIDAS.fondo, paralaje: 0.05 }] },
  avatares: { carpeta: 'assets/avatars/', ext: 'svg', prefijo: 'avatar_', cantidad: MEDIDAS.avatar.cantidad, ancho: 256, alto: 256, display: MEDIDAS.avatar.display },
  skins: {
    carpeta: 'assets/skins/',
    ext: 'svg',
    cartas: { ruta: 'cards/back_{id}', ...MEDIDAS.carta },
    mesas: { ruta: 'tables/{id}', ancho: MEDIDAS.mesa.ancho, alto: MEDIDAS.mesa.alto },
    ambientes: { ruta: 'ambients/{id}_{far|mid|near}', ...MEDIDAS.fondo },
  },
  ui: { carpeta: 'assets/ui/', ext: 'svg', logo: { archivo: 'logo', ...MEDIDAS.logo, display: [640, 256] }, iconos: { prefijo: 'icon_', nombres: Object.keys(ICONOS), ...MEDIDAS.icono } },
};
escribir('manifest.json', JSON.stringify(manifest, null, 2));
console.log('Arte generado en public/assets.');
