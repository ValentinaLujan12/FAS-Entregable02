import type { MensajeCliente } from '../kernel/protocolo.js';

/*
 * Validación estricta del contrato de entrada (asyncapi.yaml). Nunca se confía en el cliente: cualquier campo con
 * tipo o longitud inesperados invalida el mensaje completo (devuelve null).
 */
type Crudo = Record<string, unknown>;
type Validador = (m: Crudo) => MensajeCliente | null;

const str = (v: unknown, max = 64): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const objetoOpcional = (v: unknown): v is object | undefined => v === undefined || (typeof v === 'object' && v !== null);
const strOpcional = (v: unknown, max: number): v is string | undefined => v === undefined || str(v, max);
const listaIds = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 12 && v.every((x) => str(x, 12));

/** Mensajes sin datos: basta con el tipo. */
const SIN_DATOS = new Set(['agregar_bot', 'iniciar', 'cerrar', 'continuar', 'nueva_partida', 'salir', 'retomar', 'cuenta_recargar', 'ping']);

const VALIDADORES: Readonly<Record<string, Validador>> = {
  crear_sala: (m) => (str(m.nombre, 40) && str(m.modalidad, 20) && objetoOpcional(m.parametros) ? ({ t: 'crear_sala', nombre: m.nombre, modalidad: m.modalidad, parametros: m.parametros } as MensajeCliente) : null),
  unirse: (m) => (str(m.codigo, 8) && str(m.nombre, 40) ? { t: 'unirse', codigo: m.codigo, nombre: m.nombre } : null),
  reconectar: (m) => (str(m.codigo, 8) && str(m.token, 100) ? { t: 'reconectar', codigo: m.codigo, token: m.token } : null),
  configurar: (m) => (strOpcional(m.modalidad, 20) && objetoOpcional(m.parametros) ? ({ t: 'configurar', modalidad: m.modalidad, parametros: m.parametros } as MensajeCliente) : null),
  quitar_jugador: (m) => (str(m.jugadorId, 40) ? { t: 'quitar_jugador', jugadorId: m.jugadorId } : null),
  robar: (m) => (m.origen === 'MAZO' || m.origen === 'POZO' ? { t: 'robar', origen: m.origen } : null),
  descartar: (m) => (str(m.cartaId, 12) ? { t: 'descartar', cartaId: m.cartaId } : null),
  validar: (m) => (listaIds(m.cartaIds) ? { t: 'validar', cartaIds: m.cartaIds } : null),
  cuenta_abrir: (m) => (strOpcional(m.clave, 100) ? { t: 'cuenta_abrir', clave: m.clave } : null),
  cuenta_comprar: (m) => (str(m.tipo, 20) && str(m.id, 40) ? ({ t: 'cuenta_comprar', tipo: m.tipo, id: m.id } as MensajeCliente) : null),
  cuenta_activar: (m) => (str(m.tipo, 20) && str(m.id, 40) ? ({ t: 'cuenta_activar', tipo: m.tipo, id: m.id } as MensajeCliente) : null),
  reaccion: (m) => (str(m.id, 20) ? { t: 'reaccion', id: m.id } : null),
  silenciar: (m) => (str(m.jugadorId, 40) && typeof m.activo === 'boolean' ? { t: 'silenciar', jugadorId: m.jugadorId, activo: m.activo } : null),
  iniciar_expulsion: (m) => (str(m.objetivoId, 40) ? { t: 'iniciar_expulsion', objetivoId: m.objetivoId } : null),
  votar: (m) => (typeof m.aFavor === 'boolean' ? { t: 'votar', aFavor: m.aFavor } : null),
};

function leerObjeto(crudo: string): Crudo | null {
  try {
    const v: unknown = JSON.parse(crudo);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Crudo) : null;
  } catch {
    return null;
  }
}

/** Devuelve el mensaje validado, o null si es inválido. */
export function parsearMensaje(crudo: string): MensajeCliente | null {
  const m = leerObjeto(crudo);
  if (!m || typeof m.t !== 'string') return null;
  if (SIN_DATOS.has(m.t)) return { t: m.t } as MensajeCliente;
  return Object.hasOwn(VALIDADORES, m.t) ? VALIDADORES[m.t]!(m) : null;
}
