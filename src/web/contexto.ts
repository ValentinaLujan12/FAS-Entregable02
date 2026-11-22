import type { MensajeCliente } from '../kernel/protocolo.js';
import type { Celebraciones } from '../extras/web/celebracion/index.js';
import type { Estilo } from './estilo.js';
import type { Almacen } from './estado.js';
import type { Fondo } from '../extras/web/fondo.js';
import type { Reacciones } from '../extras/reacciones/vista.js';
import type { Sonido } from '../extras/web/sonido.js';
import type { Visual } from './visual.js';

/** Dependencias compartidas entre pantallas (inyección simple, sin globales). */
export interface Contexto {
  almacen: Almacen;
  fondo: Fondo;
  sonido: Sonido;
  /** Espejo de la cuenta del servidor (saldo, inventario, skins elegidas). El cliente solo pide; el servidor decide. */
  estilo: Estilo;
  visual: Visual;
  celebracion: Celebraciones;
  reacciones: Reacciones;
  enviar(m: MensajeCliente): void;
  toast(texto: string, tipo?: 'info' | 'error' | 'ok'): void;
  abrirAyuda(): void;
  /** Efectos visuales: animación de fondo, tonos pastel y modo daltónico. */
  abrirAjustes(): void;
  abrirSonido(): void;
  abrirEstilo(): void;
  /** Cierra la sesión de acceso al sitio. */
  salirDelSitio(): void;
}
