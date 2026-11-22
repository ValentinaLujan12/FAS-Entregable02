import type { TipoSkin } from '../kernel/skins.js';

/**
 * Cuenta anónima (MOCKUP del sistema real con cuentas de usuario). El servidor es la ÚNICA fuente de verdad
 * del saldo, el inventario y lo elegido; el cliente solo conserva la `clave` (el servidor guarda su SHA-256).
 * Al migrar a cuentas reales: `claveHash` pasa a ser la identidad de la cuenta (usuario/OAuth) y `saldo` a "créditos".
 */
export interface Cuenta {
  id: string;
  claveHash: string;
  saldo: number;
  /** Ids de skins PREMIUM compradas. */
  inventario: string[];
  elegidas: Record<TipoSkin, string>;
  creadaEn: number;
}

/** Puerto de persistencia de cuentas (adaptadores: memoria y PostgreSQL). */
export interface IRepositorioCuentas {
  cargarCuenta(claveHash: string): Promise<Cuenta | null>;
  guardarCuenta(cuenta: Cuenta): Promise<void>;
}
