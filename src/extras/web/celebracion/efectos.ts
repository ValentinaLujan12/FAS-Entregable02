/**
 * Efectos visuales de celebración (canvas 2D, sin dependencias). Cada efecto es una FÁBRICA registrada en `EFECTOS`
 * bajo el id que usan las skins en `skins.catalogo.ts` (`diseno.efecto`).
 *
 * Para agregar un efecto nuevo (solo desde código, nunca desde el cliente):
 *   1. Escribe una fábrica `(p: ParamsEfecto) => Efecto` (mira `serpentinas` como plantilla).
 *   2. Regístrala: `registrarEfecto('mi_efecto', miFabrica)`.
 *   3. Úsala en una skin: { "id": "celeb_mia", ..., "diseno": { "efecto": "mi_efecto", "colores": [...], "musica": "fanfarria" } }.
 * Los efectos reciben `modo`: 'pantalla' (el ganador soy yo: todo el escenario) o 'asiento' (gana otro: pequeño, nace
 * en su puesto y se abre hacia ARRIBA en cono invertido). Para quitar uno basta con no usarlo en ninguna skin.
 */
export interface ParamsEfecto {
  /** Tamaño del lienzo (px lógicos). */
  ancho: number;
  alto: number;
  modo: 'pantalla' | 'asiento';
  /** Punto de nacimiento del cono (modo asiento: sobre la placa del ganador). */
  origen: { x: number; y: number };
  colores: readonly string[];
  /** Duración total (s). */
  duracion: number;
  /** 0.3..1: cantidad relativa de partículas (rondas = menos, "sin animación" = menos). */
  intensidad: number;
  azar: () => number;
  /** Para efectos con sonido propio (p. ej. estallidos de los fuegos). */
  alSonar?: (id: 'estallido', volumen: number) => void;
}

export interface Efecto {
  /** Avanza `dt` s y dibuja; `t` = tiempo transcurrido. Devuelve false cuando terminó. */
  paso(dt: number, g: CanvasRenderingContext2D, t: number): boolean;
}
export type FabricaEfecto = (p: ParamsEfecto) => Efecto;

export const EFECTOS: Record<string, FabricaEfecto> = {};
export const registrarEfecto = (id: string, f: FabricaEfecto): void => {
  EFECTOS[id] = f;
};

const TAU = Math.PI * 2;
const rad = (g: number): number => (g * Math.PI) / 180;
const entre = (p: ParamsEfecto, a: number, b: number): number => a + p.azar() * (b - a);
const elige = <T>(p: ParamsEfecto, a: readonly T[]): T => a[Math.min(a.length - 1, Math.floor(p.azar() * a.length))]!;

interface Emisor {
  x: number;
  y: number;
  /** Ángulo central (rad, canvas: -π/2 = arriba). */
  ang: number;
  /** Semi-apertura (rad). */
  abre: number;
}

/** Emisores: pantalla = dos cañones inferiores que disparan hacia el centro; asiento = un cono hacia arriba desde el puesto. */
function emisores(p: ParamsEfecto): Emisor[] {
  if (p.modo === 'asiento') return [{ x: p.origen.x, y: p.origen.y, ang: -Math.PI / 2, abre: rad(40) }];
  return [
    { x: p.ancho * 0.08, y: p.alto * 1.02, ang: rad(-62), abre: rad(24) },
    { x: p.ancho * 0.92, y: p.alto * 1.02, ang: rad(-118), abre: rad(24) },
  ];
}

const escala = (p: ParamsEfecto): number => (p.modo === 'asiento' ? 0.5 : 1);
const velocidad = (p: ParamsEfecto, a: number, b: number): number => entre(p, a, b) * (p.modo === 'asiento' ? 0.5 : 1);

/** Mezcla un color #rrggbb con blanco (k>0) o negro (k<0). */
export function mezclar(hex: string, k: number): string {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/* --------------------------- serpentinas y confeti --------------------------- */
interface Papel {
  x: number; y: number; vx: number; vy: number;
  rot: number; vr: number; fase: number; vf: number;
  w: number; h: number; color: string; tira: boolean; vida: number;
}

registrarEfecto('serpentinas', (p) => {
  const lista: Papel[] = [];
  const ems = emisores(p);
  const rafaga = Math.round((p.modo === 'asiento' ? 70 : 110) * p.intensidad);
  let lanzados = 0;
  let lluvia = 0;
  const nuevo = (x: number, y: number, ang: number, vel: number): void => {
    const tira = p.azar() < 0.4;
    lista.push({
      x, y, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel,
      rot: p.azar() * TAU, vr: entre(p, -7, 7), fase: p.azar() * TAU, vf: entre(p, 6, 13),
      w: (tira ? entre(p, 4, 6) : entre(p, 9, 16)) * escala(p) * 1.2, h: (tira ? entre(p, 36, 84) : entre(p, 6, 11)) * escala(p) * 1.2,
      color: elige(p, p.colores), tira, vida: 0,
    });
  };
  return {
    paso(dt, g, t) {
      // ráfaga inicial (primer 0.7 s) desde cada emisor
      if (t < 0.7) {
        const objetivo = Math.floor((t / 0.7) * rafaga);
        while (lanzados < objetivo) {
          lanzados++;
          for (const e of ems) nuevo(e.x, e.y, e.ang + (p.azar() * 2 - 1) * e.abre, velocidad(p, 800, 1500));
        }
      }
      // lluvia desde arriba (solo a pantalla completa)
      if (p.modo === 'pantalla' && t < p.duracion * 0.65) {
        lluvia += dt * 70 * p.intensidad;
        while (lluvia >= 1) {
          lluvia--;
          nuevo(entre(p, 0, p.ancho), -20, rad(90) + entre(p, -0.3, 0.3), entre(p, 80, 220));
        }
      }
      let vivas = 0;
      for (const q of lista) {
        q.vida += dt;
        q.vy += 880 * dt * (p.modo === 'asiento' ? 0.8 : 1);
        const arrastre = Math.exp(-1.5 * dt);
        q.vx *= arrastre;
        q.vy = Math.min(q.vy * Math.exp(-0.9 * dt), 520);
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.rot += q.vr * dt;
        q.fase += q.vf * dt;
        const fuera = q.y > p.alto + 80 || q.x < -80 || q.x > p.ancho + 80;
        if (fuera) continue;
        vivas++;
        const alfa = Math.max(0, Math.min(1, (p.duracion + 1.2 - t) / 1.2));
        g.globalAlpha = alfa;
        g.save();
        g.translate(q.x, q.y);
        g.rotate(q.rot);
        if (q.tira) {
          g.strokeStyle = q.color;
          g.lineWidth = q.w;
          g.lineCap = 'round';
          g.beginPath();
          const n = 7;
          for (let i = 0; i <= n; i++) {
            const u = (i / n - 0.5) * q.h;
            const v = Math.sin(q.fase + i * 0.9) * q.h * 0.18;
            if (i === 0) g.moveTo(v, u);
            else g.lineTo(v, u);
          }
          g.stroke();
        } else {
          g.fillStyle = q.color;
          g.scale(Math.abs(Math.cos(q.fase)) * 0.85 + 0.15, 1);
          g.fillRect(-q.w / 2, -q.h / 2, q.w, q.h);
        }
        g.restore();
      }
      g.globalAlpha = 1;
      return t < p.duracion + 1.2 && (vivas > 0 || t < 0.8);
    },
  };
});

/* --------------------------- lluvia de estrellas --------------------------- */
interface Estrella { x: number; y: number; vx: number; vy: number; r: number; rot: number; vr: number; fase: number; color: string; pico: number }

function trazoEstrella(g: CanvasRenderingContext2D, r: number, puntas: number, hondo: number): void {
  g.beginPath();
  for (let i = 0; i < puntas * 2; i++) {
    const rr = i % 2 === 0 ? r : r * hondo;
    const a = (i * Math.PI) / puntas - Math.PI / 2;
    if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
}

registrarEfecto('estrellas', (p) => {
  const lista: Estrella[] = [];
  const ems = emisores(p);
  let acum = 0;
  const nueva = (x: number, y: number, ang: number, vel: number): void =>
    void lista.push({ x, y, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel, r: entre(p, 9, 24) * escala(p) * 1.15, rot: p.azar() * TAU, vr: entre(p, -2, 2), fase: p.azar() * TAU, color: elige(p, p.colores), pico: entre(p, 0.35, 0.5) });
  return {
    paso(dt, g, t) {
      const emite = t < p.duracion * 0.6;
      if (emite) {
        acum += dt * (p.modo === 'asiento' ? 38 : 70) * p.intensidad;
        while (acum >= 1) {
          acum--;
          if (p.modo === 'pantalla' && p.azar() < 0.5) nueva(entre(p, 0, p.ancho), -20, rad(90) + entre(p, -0.25, 0.25), entre(p, 90, 200));
          else {
            const e = elige(p, ems);
            nueva(e.x, e.y, e.ang + (p.azar() * 2 - 1) * e.abre, velocidad(p, 520, 980));
          }
        }
      }
      let vivas = 0;
      const alfaGlobal = Math.max(0, Math.min(1, (p.duracion + 1.4 - t) / 1.4));
      g.shadowBlur = 14;
      for (const s of lista) {
        s.vy += 360 * dt;
        s.vx *= Math.exp(-0.9 * dt);
        s.vy = Math.min(s.vy * Math.exp(-0.7 * dt), 260);
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.rot += s.vr * dt;
        s.fase += dt * 6;
        if (s.y > p.alto + 40) continue;
        vivas++;
        g.globalAlpha = alfaGlobal * (0.65 + 0.35 * Math.sin(s.fase));
        g.fillStyle = s.color;
        g.shadowColor = s.color;
        g.save();
        g.translate(s.x, s.y);
        g.rotate(s.rot);
        trazoEstrella(g, s.r, 5, 0.45);
        g.fill();
        g.restore();
      }
      g.shadowBlur = 0;
      g.globalAlpha = 1;
      return t < p.duracion + 1.4 && (vivas > 0 || emite);
    },
  };
});

/* --------------------------- salpicaduras de tinta --------------------------- */
interface Mancha { x: number; y: number; r: number; nace: number; vive: number; color: string; blob: number[]; gotas: Array<{ a: number; d: number; r: number }>; rayos: Array<{ a: number; l: number }> }

registrarEfecto('tinta', (p) => {
  const manchas: Mancha[] = [];
  const total = Math.round((p.modo === 'asiento' ? 9 : 18) * p.intensidad);
  const tiempos = Array.from({ length: total }, (_, i) => (i / total) * p.duracion * 0.7 + entre(p, 0, 0.12));
  let siguiente = 0;
  const posicion = (): { x: number; y: number; r: number } => {
    if (p.modo === 'asiento') {
      const a = -Math.PI / 2 + entre(p, -0.62, 0.62); // cono hacia arriba
      const d = entre(p, 60, 330);
      return { x: p.origen.x + Math.cos(a) * d, y: p.origen.y + Math.sin(a) * d, r: entre(p, 26, 58) * (0.6 + d / 600) };
    }
    return { x: entre(p, 80, p.ancho - 80), y: entre(p, 80, p.alto - 80), r: entre(p, 70, 170) };
  };
  const crear = (t: number): void => {
    const pos = posicion();
    const n = 14;
    manchas.push({
      ...pos, nace: t, vive: entre(p, 1.6, 2.4), color: elige(p, p.colores),
      blob: Array.from({ length: n }, () => entre(p, 0.72, 1.12)),
      gotas: Array.from({ length: 8 + Math.floor(p.azar() * 7) }, () => ({ a: p.azar() * TAU, d: entre(p, 1.25, 2.0), r: entre(p, 0.05, 0.17) })),
      rayos: Array.from({ length: 5 + Math.floor(p.azar() * 4) }, () => ({ a: p.azar() * TAU, l: entre(p, 1.3, 1.9) })),
    });
  };
  const dibujar = (g: CanvasRenderingContext2D, m: Mancha, t: number): void => {
    const e = t - m.nace;
    const k = Math.min(1, e / 0.28);
    const crece = 1 - (1 - k) ** 3 * (1 + (1 - k)); // ease-out con pequeño rebote
    const alfa = Math.min(1, (m.vive - e) / 0.7);
    if (alfa <= 0 || crece <= 0) return;
    g.save();
    g.globalAlpha = alfa;
    g.translate(m.x, m.y);
    const R = m.r * crece;
    const grad = g.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.05, 0, 0, R * 1.5);
    grad.addColorStop(0, mezclar(m.color, 0.7));
    grad.addColorStop(0.35, m.color);
    grad.addColorStop(1, mezclar(m.color, -0.45));
    g.fillStyle = grad;
    g.strokeStyle = mezclar(m.color, -0.6);
    g.lineWidth = Math.max(1.5, R * 0.03);
    g.lineJoin = 'round';
    // mancha central: contorno suavizado con curvas
    g.beginPath();
    const n = m.blob.length;
    const pt = (i: number): [number, number] => {
      const a = (i / n) * TAU;
      return [Math.cos(a) * R * m.blob[i % n]!, Math.sin(a) * R * m.blob[i % n]!];
    };
    const [x0, y0] = pt(0);
    const [x1, y1] = pt(1);
    g.moveTo((x0 + x1) / 2, (y0 + y1) / 2);
    for (let i = 1; i <= n; i++) {
      const [cx, cy] = pt(i);
      const [nx, ny] = pt(i + 1);
      g.quadraticCurveTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2);
    }
    g.closePath();
    g.fill();
    g.stroke();
    // gotas satélite y chorros de tinta
    for (const d of m.gotas) {
      const dd = R * (1 + (d.d - 1) * crece);
      g.beginPath();
      g.arc(Math.cos(d.a) * dd, Math.sin(d.a) * dd, Math.max(1.5, R * d.r), 0, TAU);
      g.fill();
    }
    g.lineCap = 'round';
    g.strokeStyle = m.color;
    for (const r of m.rayos) {
      g.lineWidth = Math.max(1.5, R * 0.05);
      g.beginPath();
      g.moveTo(Math.cos(r.a) * R * 0.85, Math.sin(r.a) * R * 0.85);
      g.lineTo(Math.cos(r.a) * R * (0.85 + (r.l - 0.85) * crece), Math.sin(r.a) * R * (0.85 + (r.l - 0.85) * crece));
      g.stroke();
    }
    g.restore();
  };
  return {
    paso(_dt, g, t) {
      while (siguiente < tiempos.length && tiempos[siguiente]! <= t) {
        crear(t);
        siguiente++;
      }
      let vivas = 0;
      for (const m of manchas) {
        if (t - m.nace < m.vive) vivas++;
        dibujar(g, m, t);
      }
      return siguiente < tiempos.length || vivas > 0;
    },
  };
});

/* --------------------------- bola disco --------------------------- */
registrarEfecto('disco', (p) => {
  const asiento = p.modo === 'asiento';
  const R = asiento ? 30 : 78;
  const cx = asiento ? p.origen.x : p.ancho / 2;
  const cy = asiento ? p.origen.y - 120 : 170;
  const rayos = Array.from({ length: asiento ? 6 : 9 }, (_, i) => ({ color: p.colores[i % p.colores.length]!, fase: p.azar() * TAU, vel: entre(p, 0.5, 1.1) * (i % 2 ? 1 : -1), ancho: entre(p, 0.09, 0.15) }));
  const chispas = Array.from({ length: Math.round((asiento ? 26 : 70) * p.intensidad) }, () => {
    if (asiento) {
      const a = -Math.PI / 2 + entre(p, -0.7, 0.7);
      const d = entre(p, 40, 340);
      return { x: p.origen.x + Math.cos(a) * d, y: p.origen.y + Math.sin(a) * d, r: entre(p, 2, 5), f: p.azar() * TAU, c: elige(p, p.colores) };
    }
    return { x: entre(p, 20, p.ancho - 20), y: entre(p, 260, p.alto - 20), r: entre(p, 3, 8), f: p.azar() * TAU, c: elige(p, p.colores) };
  });
  return {
    paso(_dt, g, t) {
      const entra = Math.min(1, t / 0.5);
      const sale = Math.min(1, (p.duracion + 0.8 - t) / 0.8);
      const a = Math.max(0, Math.min(entra, sale));
      if (a <= 0 && t > 1) return false;
      g.save();
      g.globalAlpha = a;
      // haces de luz
      g.globalCompositeOperation = 'lighter';
      const largo = asiento ? 380 : 1500;
      for (const r of rayos) {
        const ang = asiento ? -Math.PI / 2 + Math.sin(t * r.vel + r.fase) * 1.15 : r.fase + t * r.vel;
        const grad = g.createRadialGradient(cx, cy, R * 0.8, cx, cy, largo);
        grad.addColorStop(0, `${r.color}aa`);
        grad.addColorStop(1, `${r.color}00`);
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, largo, ang - r.ancho, ang + r.ancho);
        g.closePath();
        g.fill();
      }
      // chispas de luz repartidas
      for (const c of chispas) {
        const b = 0.5 + 0.5 * Math.sin(t * 7 + c.f);
        g.globalAlpha = a * b * 0.9;
        g.fillStyle = c.c;
        g.beginPath();
        g.arc(c.x, c.y, c.r * (0.6 + b * 0.6), 0, TAU);
        g.fill();
      }
      g.restore();
      g.save();
      g.globalAlpha = a;
      // hilo y bola
      g.strokeStyle = '#8a8fa0';
      g.lineWidth = asiento ? 1.5 : 3;
      g.beginPath();
      g.moveTo(cx, asiento ? cy - R - 40 : -10);
      g.lineTo(cx, cy - R);
      g.stroke();
      const grad = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      grad.addColorStop(0, '#f4f7ff');
      grad.addColorStop(0.55, '#a9b2c8');
      grad.addColorStop(1, '#4b5367');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, R, 0, TAU);
      g.fill();
      // espejitos: rejilla sobre la esfera que gira
      g.save();
      g.beginPath();
      g.arc(cx, cy, R, 0, TAU);
      g.clip();
      const giro = t * 1.4;
      for (let lat = -70; lat <= 70; lat += 20) {
        for (let lon = 0; lon < 360; lon += 20) {
          const lo = rad(lon) + giro;
          const front = Math.cos(lo);
          if (front <= 0.05) continue;
          const la = rad(lat);
          const x = cx + R * Math.cos(la) * Math.sin(lo);
          const y = cy + R * Math.sin(la);
          const w = R * 0.22 * front;
          const hh = R * 0.2 * Math.cos(la);
          const brillo = 0.5 + 0.5 * Math.sin(t * 5 + lat * 0.7 + lon * 0.3);
          g.fillStyle = brillo > 0.8 ? '#ffffff' : brillo > 0.45 ? '#c9d2e8' : '#7a859f';
          g.fillRect(x - w / 2, y - hh / 2, w * 0.9, hh * 0.9);
        }
      }
      g.restore();
      g.restore();
      return t < p.duracion + 0.8;
    },
  };
});

/* --------------------------- fuegos artificiales --------------------------- */
interface Cohete { x: number; y: number; vy: number; objetivo: number; color: string }
interface Chispa { x: number; y: number; vx: number; vy: number; vida: number; max: number; color: string; r: number; rastro: Array<[number, number]> }

registrarEfecto('fuegos', (p) => {
  const cohetes: Cohete[] = [];
  const chispas: Chispa[] = [];
  let reloj = 0;
  let siguiente = 0;
  const asiento = p.modo === 'asiento';
  const lanzar = (): void => {
    const x = asiento ? p.origen.x + entre(p, -50, 50) : entre(p, p.ancho * 0.12, p.ancho * 0.88);
    const y0 = asiento ? p.origen.y : p.alto + 10;
    cohetes.push({ x, y: y0, vy: -(asiento ? entre(p, 340, 460) : entre(p, 820, 1080)), objetivo: asiento ? p.origen.y - entre(p, 150, 300) : entre(p, p.alto * 0.14, p.alto * 0.46), color: elige(p, p.colores) });
  };
  const estallar = (c: Cohete): void => {
    const n = Math.round((asiento ? 26 : 70) * p.intensidad) + 8;
    const color2 = elige(p, p.colores);
    const vel = asiento ? entre(p, 90, 190) : entre(p, 220, 480);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + entre(p, -0.05, 0.05);
      const v = vel * entre(p, 0.55, 1);
      chispas.push({ x: c.x, y: c.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida: 0, max: entre(p, 1.0, 1.7), color: i % 3 === 0 ? color2 : c.color, r: asiento ? 2 : 3.2, rastro: [] });
    }
    p.alSonar?.('estallido', asiento ? 0.4 : 0.8);
  };
  return {
    paso(dt, g, t) {
      reloj += dt;
      const lanza = t < p.duracion * 0.8;
      if (lanza && reloj >= siguiente) {
        lanzar();
        siguiente = reloj + (asiento ? entre(p, 0.45, 0.8) : entre(p, 0.22, 0.5)) / Math.max(0.5, p.intensidad);
      }
      g.lineCap = 'round';
      for (let i = cohetes.length - 1; i >= 0; i--) {
        const c = cohetes[i]!;
        c.y += c.vy * dt;
        c.vy *= Math.exp(-0.6 * dt);
        g.fillStyle = '#fff6d8';
        g.globalAlpha = 0.95;
        g.beginPath();
        g.arc(c.x, c.y, asiento ? 2 : 3.5, 0, TAU);
        g.fill();
        g.globalAlpha = 0.35;
        g.fillRect(c.x - 1, c.y, 2, asiento ? 14 : 28);
        if (c.y <= c.objetivo) {
          estallar(c);
          cohetes.splice(i, 1);
        }
      }
      g.globalAlpha = 1;
      for (let i = chispas.length - 1; i >= 0; i--) {
        const s = chispas[i]!;
        s.vida += dt;
        if (s.vida > s.max) {
          chispas.splice(i, 1);
          continue;
        }
        s.vy += 340 * dt;
        s.vx *= Math.exp(-1.2 * dt);
        s.vy *= Math.exp(-0.5 * dt);
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.rastro.push([s.x, s.y]);
        if (s.rastro.length > 6) s.rastro.shift();
        const a = 1 - s.vida / s.max;
        g.strokeStyle = s.color;
        g.fillStyle = s.color;
        g.globalAlpha = a * 0.5;
        g.lineWidth = s.r * 0.9;
        g.beginPath();
        s.rastro.forEach(([x, y], k) => (k === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
        g.stroke();
        g.globalAlpha = a;
        g.beginPath();
        g.arc(s.x, s.y, s.r * (0.5 + a * 0.6), 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
      return lanza || cohetes.length > 0 || chispas.length > 0;
    },
  };
});
