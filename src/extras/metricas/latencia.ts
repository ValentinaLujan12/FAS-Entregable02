/**
 * Métricas de experiencia para las pruebas con usuarios (extra, ADR-11). Cada comando de juego deja una muestra de
 * latencia que se guarda con la sala en la tabla `evento`; al terminar la partida, la base de datos la resume en
 * `partida_registro` (supabase/esquema.sql). La muestra no se envía a los clientes.
 */
import type { EventoJuego } from '../../kernel/protocolo.js';
import type { IMetricas, MuestraLatencia } from '../../game/puertos.js';

/** Comandos que el jugador percibe como "jugada" (los latidos y la tienda no cuentan). */
const COMANDOS_MEDIDOS: ReadonlySet<string> = new Set(['iniciar', 'robar', 'descartar', 'validar', 'cerrar', 'continuar']);

/** Ida y vuelta máxima aceptada desde el navegador (más allá se considera un dato inválido). */
export const RTT_MAXIMO_MS = 60_000;

export const metricasLatencia: IMetricas = {
  eventoLatencia(m: MuestraLatencia, ahora: number): EventoJuego | null {
    if (!COMANDOS_MEDIDOS.has(m.comando)) return null;
    return {
      seq: 0,
      tipo: 'METRICA_LATENCIA',
      ronda: 0,
      ts: ahora,
      datos: { comando: m.comando, jugadorId: m.jugadorId, servidorMs: Math.round(m.servidorMs), clienteMs: m.clienteMs },
    };
  },
};
