import { createHash, randomBytes } from 'node:crypto';
import type { CuentaVista } from '../../kernel/protocolo.js';
import {
  RECARGA,
  SALDO_INICIAL,
  SKIN_AMBIENTE_DEFECTO,
  SKIN_CARTA_DEFECTO,
  SKIN_CELEBRACION_DEFECTO,
  SKIN_MESA_DEFECTO,
  TIPOS_SKIN,
  catalogoDe,
  type TipoSkin,
} from '../skins/skins.js';
import type { Cuenta, IRepositorioCuentas } from '../../persistence/IRepositorioCuentas.js';

import type { ErrorCuenta, ResultadoCuenta } from '../../game/puertos.js';

export type { ErrorCuenta, ResultadoCuenta };

export const hashClave = (clave: string): string => createHash('sha256').update(clave).digest('hex');

/**
 * Cuentas y tienda (mockup). Todas las decisiones (¿alcanza el saldo? ¿es suya la skin?) se toman AQUÍ;
 * el cliente solo pide "comprar" / "activar" / "recargar" y muestra lo que el servidor responde.
 * Para el sistema real: reemplazar `abrir` por autenticación, `recargar` por "Comprar monedas" y tokens -> créditos
 * (ver docs/TRABAJO_FUTURO.md, parte 2).
 */
export class ServicioCuentas {
  private readonly cache = new Map<string, Cuenta>();
  private readonly cargando = new Map<string, Promise<Cuenta | null>>();
  /** Cola de escrituras por cuenta (conserva el orden). */
  private readonly colas = new Map<string, Promise<void>>();

  constructor(
    private readonly repo: IRepositorioCuentas,
    private readonly reloj: () => number = Date.now,
    private readonly opciones: { saldoInicial?: number; recarga?: { activa: boolean; tokens: number }; alError?: (err: unknown) => void } = {},
  ) {}

  private get recarga() {
    return this.opciones.recarga ?? RECARGA;
  }

  private porDefecto(): Cuenta['elegidas'] {
    return { carta: SKIN_CARTA_DEFECTO, mesa: SKIN_MESA_DEFECTO, ambiente: SKIN_AMBIENTE_DEFECTO, celebracion: SKIN_CELEBRACION_DEFECTO };
  }

  /** Carga la cuenta de una clave existente (sin crear ninguna). La deja lista para `obtener(hash)`. */
  async cargarPorClave(clave: unknown): Promise<Cuenta | null> {
    if (typeof clave !== 'string' || clave.length < 16 || clave.length > 100) return null;
    return this.cargar(hashClave(clave));
  }

  /**
   * Abre la cuenta de la clave dada; si no existe (o no se envía) crea una nueva y devuelve su clave nueva.
   * La clave es un secreto aleatorio de 192 bits; el servidor solo conserva su hash.
   */
  async abrir(clave?: string): Promise<{ cuenta: Cuenta; clave?: string }> {
    if (clave && clave.length >= 16 && clave.length <= 100) {
      const h = hashClave(clave);
      const c = await this.cargar(h);
      if (c) return { cuenta: c };
    }
    const nueva = randomBytes(24).toString('base64url');
    const cuenta: Cuenta = {
      id: `c${randomBytes(5).toString('hex')}`,
      claveHash: hashClave(nueva),
      saldo: this.opciones.saldoInicial ?? SALDO_INICIAL,
      inventario: [],
      elegidas: this.porDefecto(),
      creadaEn: this.reloj(),
    };
    this.cache.set(cuenta.claveHash, cuenta);
    this.persistir(cuenta);
    return { cuenta, clave: nueva };
  }

  private async cargar(claveHash: string): Promise<Cuenta | null> {
    const enCache = this.cache.get(claveHash);
    if (enCache) return enCache;
    let p = this.cargando.get(claveHash);
    if (!p) {
      p = this.repo.cargarCuenta(claveHash).finally(() => this.cargando.delete(claveHash));
      this.cargando.set(claveHash, p);
    }
    const c = await p;
    if (!c) return null;
    const ya = this.cache.get(claveHash);
    if (ya) return ya;
    // Normaliza cuentas guardadas antes de que existiera algún tipo de skin.
    c.elegidas = { ...this.porDefecto(), ...c.elegidas };
    this.cache.set(claveHash, c);
    return c;
  }

  obtener(claveHash: string | null): Cuenta | null {
    return (claveHash && this.cache.get(claveHash)) || null;
  }

  posee(c: Cuenta, tipo: TipoSkin, id: string): boolean {
    const sk = catalogoDe(tipo).find((s) => s.id === id);
    return !!sk && (!sk.premium || c.inventario.includes(id));
  }

  /** Compra y ACTIVA automáticamente (comprar implica elegir). Todo el cálculo ocurre en el servidor. */
  comprar(c: Cuenta, tipo: unknown, id: unknown): ResultadoCuenta {
    const sk = this.buscar(tipo, id);
    if (!sk) return { ok: false, codigo: 'SKIN_INVALIDA', mensaje: 'Esa skin no existe.' };
    if (!sk.def.premium || c.inventario.includes(sk.def.id)) return { ok: false, codigo: 'YA_LA_TIENES', mensaje: 'Ya tienes esa skin.' };
    if (c.saldo < sk.def.precio) {
      return { ok: false, codigo: 'SALDO_INSUFICIENTE', mensaje: `Te faltan ${sk.def.precio - c.saldo} tokens para comprar "${sk.def.nombre}".` };
    }
    c.saldo -= sk.def.precio;
    c.inventario.push(sk.def.id);
    c.elegidas[sk.tipo] = sk.def.id;
    this.persistir(c);
    return { ok: true };
  }

  activar(c: Cuenta, tipo: unknown, id: unknown): ResultadoCuenta {
    const sk = this.buscar(tipo, id);
    if (!sk) return { ok: false, codigo: 'SKIN_INVALIDA', mensaje: 'Esa skin no existe.' };
    if (!this.posee(c, sk.tipo, sk.def.id)) return { ok: false, codigo: 'NO_LA_TIENES', mensaje: `Aún no tienes "${sk.def.nombre}": cómprala para usarla.` };
    c.elegidas[sk.tipo] = sk.def.id;
    this.persistir(c);
    return { ok: true };
  }

  /** TEMPORAL (mockup): suma `recarga.tokens` gratis. En el sistema real se reemplaza por "Comprar monedas". */
  recargar(c: Cuenta): ResultadoCuenta {
    if (!this.recarga.activa) return { ok: false, codigo: 'RECARGA_NO_DISPONIBLE', mensaje: 'La recarga de prueba está desactivada.' };
    c.saldo += this.recarga.tokens;
    this.persistir(c);
    return { ok: true };
  }

  vista(c: Cuenta): CuentaVista {
    return { saldo: c.saldo, inventario: [...c.inventario], elegidas: { ...c.elegidas }, recargaDisponible: this.recarga.activa };
  }

  private buscar(tipo: unknown, id: unknown) {
    if (typeof tipo !== 'string' || !(TIPOS_SKIN as readonly string[]).includes(tipo) || typeof id !== 'string') return null;
    const def = catalogoDe(tipo as TipoSkin).find((s) => s.id === id);
    return def ? { tipo: tipo as TipoSkin, def } : null;
  }

  private persistir(c: Cuenta): void {
    const copia = structuredClone(c);
    const previa = this.colas.get(c.claveHash) ?? Promise.resolve();
    const sig = previa.then(() => this.repo.guardarCuenta(copia)).catch((err) => this.opciones.alError?.(err));
    this.colas.set(c.claveHash, sig);
  }

  /** Espera a que se vacíen las escrituras pendientes (pruebas y apagado). */
  async vaciar(): Promise<void> {
    await Promise.all([...this.colas.values()]);
  }
}
