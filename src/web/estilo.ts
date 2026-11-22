/**
 * Estilo del jugador: espejo de SOLO LECTURA de su cuenta en el servidor.
 *
 * El cliente NUNCA es fuente de verdad: no calcula saldos, no decide si una skin se posee ni la "activa" por su cuenta.
 * Solo PIDE (comprar / activar / recargar) y pinta lo que el servidor responde (`{t:'cuenta'}`). La única cosa que guarda
 * el navegador es la `clave` anónima que identifica su cuenta (mockup del sistema real con usuarios; ver docs/TRABAJO_FUTURO.md, parte 2).
 */
import type { CuentaVista, MensajeCliente } from '../kernel/protocolo.js';
import { SKIN_AMBIENTE_DEFECTO, SKIN_CARTA_DEFECTO, SKIN_CELEBRACION_DEFECTO, SKIN_MESA_DEFECTO, catalogoDe, type TipoSkin } from '../extras/skins/skins.js';

const LS_CLAVE = 'apuntado.clave';

const DEFECTOS: Record<TipoSkin, string> = {
  carta: SKIN_CARTA_DEFECTO,
  mesa: SKIN_MESA_DEFECTO,
  ambiente: SKIN_AMBIENTE_DEFECTO,
  celebracion: SKIN_CELEBRACION_DEFECTO,
};

export class Estilo {
  private cuenta: CuentaVista | null = null;
  private escuchas: Array<() => void> = [];

  constructor(private readonly enviar: (m: MensajeCliente) => void) {}

  /** Clave anónima guardada en este navegador (null si aún no hay). */
  get clave(): string | null {
    try {
      return localStorage.getItem(LS_CLAVE);
    } catch {
      return null;
    }
  }

  guardarClave(c: string): void {
    try {
      localStorage.setItem(LS_CLAVE, c);
    } catch {
      /* sin almacenamiento: la cuenta durará lo que dure la pestaña */
    }
  }

  /** Pide al servidor abrir (o crear) la cuenta. Debe ir ANTES de crear/unirse a una sala. */
  abrir(): void {
    const c = this.clave;
    this.enviar({ t: 'cuenta_abrir', ...(c ? { clave: c } : {}) });
  }

  /** Respuesta del servidor: reemplaza TODO el estado local. */
  recibir(cuenta: CuentaVista, claveNueva?: string): void {
    if (claveNueva) this.guardarClave(claveNueva);
    this.cuenta = cuenta;
    for (const fn of this.escuchas) fn();
  }

  alCambiar(fn: () => void): void {
    this.escuchas.push(fn);
  }

  get lista(): boolean {
    return this.cuenta !== null;
  }

  get saldo(): number {
    return this.cuenta?.saldo ?? 0;
  }

  get recargaDisponible(): boolean {
    return this.cuenta?.recargaDisponible ?? false;
  }

  get inventario(): readonly string[] {
    return this.cuenta?.inventario ?? [];
  }

  elegida(tipo: TipoSkin): string {
    return this.cuenta?.elegidas[tipo] ?? DEFECTOS[tipo];
  }

  /** Solo para PINTAR (gris/color): la autoridad es el servidor, que vuelve a validar al pedir activar. */
  posee(tipo: TipoSkin, id: string): boolean {
    const sk = catalogoDe(tipo).find((s) => s.id === id);
    return !!sk && (!sk.premium || this.inventario.includes(id));
  }

  pedirActivar(tipo: TipoSkin, id: string): void {
    this.enviar({ t: 'cuenta_activar', tipo, id });
  }

  pedirComprar(tipo: TipoSkin, id: string): void {
    this.enviar({ t: 'cuenta_comprar', tipo, id });
  }

  /**
   * <<< TEMPORAL: QUITAR AL IMPLEMENTAR "COMPRAR MONEDAS" >>>
   * Pide al servidor +RECARGA.tokens gratis. En el sistema real se elimina junto con el botón de overlays.ts.
   */
  pedirRecarga(): void {
    this.enviar({ t: 'cuenta_recargar' });
  }
}
