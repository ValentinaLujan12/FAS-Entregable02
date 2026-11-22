/**
 * Tipos y valores por defecto de las skins que necesita el nucleo (ADR-11). El catalogo visual vive en
 * `src/extras/skins/`; `tests/skins.test.ts` comprueba que cada defecto exista en el catalogo.
 */
export type TipoSkin = 'carta' | 'mesa' | 'ambiente' | 'celebracion';

export const SKIN_CARTA_DEFECTO = 'carta_salvia';
export const SKIN_MESA_DEFECTO = 'mesa_salvia';
export const SKIN_AMBIENTE_DEFECTO = 'amb_desierto';
export const SKIN_CELEBRACION_DEFECTO = 'celeb_confeti';
