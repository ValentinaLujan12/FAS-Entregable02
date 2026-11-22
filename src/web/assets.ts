/**
 * Carga del manifest de assets (public/assets/manifest.json).
 * El arte real reemplaza a los mockups con el MISMO nombre y tamaño en píxeles; si cambia el formato
 * (svg -> png/webp) basta con actualizar "ext" en el manifest. Ver docs/GUIA_ASSETS.md.
 */
import type { Carta } from '../kernel/cartas.js';
import { claveAsset } from '../kernel/cartas.js';

interface Manifest {
  cartas: { carpeta: string; ext: string; displayAncho: number; displayAlto: number };
  tablero: { carpeta: string; ext: string };
  fondos: { carpeta: string; ext: string; capas: { archivo: string; paralaje: number }[] };
  avatares: { carpeta: string; ext: string; prefijo: string; cantidad: number };
  ui: { carpeta: string; ext: string; iconos: { prefijo: string } };
  skins?: { carpeta: string; ext: string };
}

let manifest: Manifest | null = null;

const POR_DEFECTO: Manifest = {
  cartas: { carpeta: 'assets/cards/', ext: 'svg', displayAncho: 140, displayAlto: 196 },
  tablero: { carpeta: 'assets/board/', ext: 'svg' },
  fondos: {
    carpeta: 'assets/bg/',
    ext: 'svg',
    capas: [
      { archivo: 'bg_far', paralaje: 0.012 },
      { archivo: 'bg_mid', paralaje: 0.028 },
      { archivo: 'bg_near', paralaje: 0.05 },
    ],
  },
  avatares: { carpeta: 'assets/avatars/', ext: 'svg', prefijo: 'avatar_', cantidad: 8 },
  ui: { carpeta: 'assets/ui/', ext: 'svg', iconos: { prefijo: 'icon_' } },
  skins: { carpeta: 'assets/skins/', ext: 'svg' },
};

export async function cargarManifest(): Promise<void> {
  try {
    const r = await fetch('assets/manifest.json', { cache: 'no-cache' });
    if (r.ok) manifest = (await r.json()) as Manifest;
  } catch {
    /* se usan los valores por defecto */
  }
}

const m = (): Manifest => manifest ?? POR_DEFECTO;

let daltonico = false;
/** Modo daltónico: las caras se piden a `assets/cards-cb/` (misma nomenclatura; ver tools/generate-assets.ts). */
export const establecerDaltonico = (v: boolean): void => {
  daltonico = v;
};
export const esDaltonico = (): boolean => daltonico;
export const urlCarta = (c: Carta): string => `${daltonico ? 'assets/cards-cb/' : m().cartas.carpeta}${claveAsset(c)}.${m().cartas.ext}`;
export const urlDorso = (): string => `${m().cartas.carpeta}back.${m().cartas.ext}`;
export const urlTablero = (archivo: string): string => `${m().tablero.carpeta}${archivo}.${m().tablero.ext}`;
export const urlAvatar = (i: number): string => {
  const a = m().avatares;
  return `${a.carpeta}${a.prefijo}${((i % a.cantidad) + a.cantidad) % a.cantidad}.${a.ext}`;
};
/* Skins (mockup): rutas por id del catálogo (src/extras/skins/catalogo.ts). */
const sk = (): { carpeta: string; ext: string } => m().skins ?? POR_DEFECTO.skins!;
export const urlDorsoSkin = (id: string): string => `${sk().carpeta}cards/back_${id}.${sk().ext}`;
export const urlMesaSkin = (id: string): string => `${sk().carpeta}tables/${id}.${sk().ext}`;
export const urlAmbienteSkin = (id: string, capa: 'far' | 'mid' | 'near'): string => `${sk().carpeta}ambients/${id}_${capa}.${sk().ext}`;
export const urlUi = (archivo: string): string => `${m().ui.carpeta}${archivo}.${m().ui.ext}`;
export const urlIcono = (nombre: string): string => `${m().ui.carpeta}${m().ui.iconos.prefijo}${nombre}.${m().ui.ext}`;
export const capasFondo = (): { url: string; paralaje: number }[] =>
  m().fondos.capas.map((c) => ({ url: `${m().fondos.carpeta}${c.archivo}.${m().fondos.ext}`, paralaje: c.paralaje }));
export const cartaDisplay = (): { w: number; h: number } => ({ w: m().cartas.displayAncho, h: m().cartas.displayAlto });

/** Precarga (best-effort) para evitar parpadeos al repartir. */
export function precargar(urls: string[]): void {
  for (const u of urls) {
    const i = new Image();
    i.decoding = 'async';
    i.src = u;
  }
}
