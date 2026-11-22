import { RealtimeClient } from '@supabase/realtime-js';

/**
 * Aviso en tiempo real con Supabase Realtime (canal público "sala-<CODIGO>", evento "cambio").
 * El aviso no lleva datos del juego: solo indica que hay mensajes nuevos, que se piden al servidor con la sesión.
 */
export function suscribirSala(
  url: string,
  clavePublica: string,
  codigo: string,
  o: { alCambio(): void; alEstado(listo: boolean): void },
): { quitar(): void } {
  const cliente = new RealtimeClient(`${url.replace(/^http/, 'ws').replace(/\/+$/, '')}/realtime/v1`, { params: { apikey: clavePublica } });
  const canal = cliente.channel(`sala-${codigo}`, { config: { broadcast: { self: false } } });
  let espera: number | null = null;
  canal
    .on('broadcast', { event: 'cambio' }, () => {
      if (espera) window.clearTimeout(espera);
      espera = window.setTimeout(() => o.alCambio(), 60);
    })
    .subscribe((estado) => o.alEstado(estado === 'SUBSCRIBED'));
  return {
    quitar: () => {
      o.alEstado(false);
      void canal.unsubscribe();
      cliente.disconnect();
    },
  };
}
