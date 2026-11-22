/**
 * Catálogo de skins (MOCKUP) compartido por cliente y servidor. La fuente de datos es `skins.catalogo.ts`:
 * agregar una skin = agregar un objeto allí (ver `_ayuda` en el archivo). Nada más en el código cambia.
 *
 * - Cartas: se ven en la mesa de TODOS (la mano rival muestra el reverso del rival).
 * - Mesas: solo las ve quien la elige, salvo las PREMIUM: la más cara de la sala se muestra a todos por defecto.
 * - Ambientes: solo los ve quien los elige.
 * - Celebraciones: el efecto de victoria del jugador (lo ven todos).
 * - Compras e inventario viven SOLO en el servidor (src/extras/cuentas); el cliente pide comprar/activar y el servidor decide.
 */
import catalogo from './catalogo.js';
import { SKIN_AMBIENTE_DEFECTO, SKIN_CARTA_DEFECTO, SKIN_CELEBRACION_DEFECTO, SKIN_MESA_DEFECTO, type TipoSkin } from '../../kernel/skins.js';

export type { TipoSkin };
export { SKIN_AMBIENTE_DEFECTO, SKIN_CARTA_DEFECTO, SKIN_CELEBRACION_DEFECTO, SKIN_MESA_DEFECTO };

export interface SkinCartaDiseno {
  fondo: [string, string];
  trazo: string;
  motivo: 'cuerda' | 'herraduras' | 'sarape' | 'cactus' | 'estrellas' | 'dunas' | 'repujado' | 'liso';
  /** Acabado de TINTA (brillo de tinta, no de luz) del reverso; solo premium. */
  tinta?: 'metal' | 'neon' | 'marmol' | 'salpicado' | 'holo';
  /** Colores extra para 'marmol' y 'salpicado'. */
  paleta?: string[];
  /** Marco de la carta; `tinta` = acabado de la tinta del marco (metal o neón). */
  marco: { color: string; ancho: number; tinta?: 'metal' | 'neon' } | null;
}
export interface SkinMesaDiseno {
  fieltro: [string, string, string];
  borde: [string, string, string];
  filete: string;
  /** Detalle del borde/fieltro: tachas doradas, borde de tinta neón o vetas de piedra. */
  efecto?: 'tachas' | 'neon' | 'vetas';
}
export interface SkinAmbienteDiseno {
  pared: [string, string, string];
  luz: string;
  estilo: 'desierto' | 'pradera' | 'canon' | 'saloon' | 'pueblo';
  /** Variante premium del estilo: 'noche' (luna, estrellas y fogata) o 'faroles' (faroles encendidos). */
  variante?: 'noche' | 'faroles';
  /** Colores "r,g,b" de las partículas bokeh del fondo animado. */
  particulas: string[];
}

export interface SkinCelebracionDiseno {
  /** Id del efecto registrado en `src/extras/web/celebracion/efectos.ts`. */
  efecto: string;
  colores: string[];
  /** Receta de victoria registrada en `RECETAS_CELEBRACION` (`src/extras/web/musica.ts`). */
  musica: string;
}

export interface SkinDef<D> {
  id: string;
  nombre: string;
  descripcion: string;
  premium: boolean;
  /** Tokens (0 si es básica; máximo 999). */
  precio: number;
  diseno: D;
}

export const SKINS_CARTA = catalogo.cartas as SkinDef<SkinCartaDiseno>[];
export const SKINS_MESA = catalogo.mesas as SkinDef<SkinMesaDiseno>[];
export const SKINS_AMBIENTE = catalogo.ambientes as SkinDef<SkinAmbienteDiseno>[];
export const SKINS_CELEBRACION = catalogo.celebraciones as SkinDef<SkinCelebracionDiseno>[];
export const SALDO_INICIAL: number = catalogo.saldoInicial;
export const PRECIO_MAXIMO = 999;
/** Botón temporal "Recargar tokens" (mockup). Ver `_recarga` en skins.catalogo.ts. */
export const RECARGA: { activa: boolean; tokens: number } = catalogo.recarga;


type Cualquiera = SkinDef<SkinCartaDiseno> | SkinDef<SkinMesaDiseno> | SkinDef<SkinAmbienteDiseno> | SkinDef<SkinCelebracionDiseno>;

export function catalogoDe(tipo: TipoSkin): readonly Cualquiera[] {
  return tipo === 'carta' ? SKINS_CARTA : tipo === 'mesa' ? SKINS_MESA : tipo === 'ambiente' ? SKINS_AMBIENTE : SKINS_CELEBRACION;
}

export const skinCarta = (id: string | null | undefined): SkinDef<SkinCartaDiseno> =>
  SKINS_CARTA.find((s) => s.id === id) ?? SKINS_CARTA[0]!;
export const skinMesa = (id: string | null | undefined): SkinDef<SkinMesaDiseno> =>
  SKINS_MESA.find((s) => s.id === id) ?? SKINS_MESA[0]!;
export const skinAmbiente = (id: string | null | undefined): SkinDef<SkinAmbienteDiseno> =>
  SKINS_AMBIENTE.find((s) => s.id === id) ?? SKINS_AMBIENTE[0]!;

export const skinCelebracion = (id: string | null | undefined): SkinDef<SkinCelebracionDiseno> =>
  SKINS_CELEBRACION.find((s) => s.id === id) ?? SKINS_CELEBRACION[0]!;

export const TIPOS_SKIN: readonly TipoSkin[] = ['carta', 'mesa', 'ambiente', 'celebracion'];

export const esSkinValida = (tipo: TipoSkin, id: unknown): id is string =>
  typeof id === 'string' && catalogoDe(tipo).some((s) => s.id === id);

/** Mesa premium (las básicas nunca se comparten con la sala). */
export const esMesaPremium = (id: string | null | undefined): boolean => !!id && skinMesa(id).id === id && skinMesa(id).premium;

/** Mesa premium MÁS CARA entre las de la sala (empate: la primera de la lista, es decir, la del asiento más bajo). */
export function mesaPremiumMasCara(candidatas: ReadonlyArray<string | null | undefined>): string | null {
  let mejor: string | null = null;
  for (const id of candidatas) {
    if (!esMesaPremium(id)) continue;
    if (mejor === null || skinMesa(id).precio > skinMesa(mejor).precio) mejor = id!;
  }
  return mejor;
}
