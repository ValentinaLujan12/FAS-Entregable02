/**
 * Gateway de tiempo real (entregable 2: GatewayTiempoReal / ICanalTiempoReal). Tras confirmar la persistencia,
 * avisa a los clientes de la sala por Supabase Realtime. El aviso no lleva datos del juego: cada cliente pide
 * su vista al servidor. Si no hay canal, los clientes consultan periodicamente.
 */
export interface ICanalTiempoReal {
  avisarCambio(codigo: string): Promise<void>;
}

export class GatewayTiempoReal implements ICanalTiempoReal {
  constructor(
    private readonly url: string,
    private readonly claveSecreta: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async avisarCambio(codigo: string): Promise<void> {
    const r = await this.fetchFn(`${this.url.replace(/\/+$/, '')}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: this.claveSecreta, 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic: `sala-${codigo}`, event: 'cambio', payload: { t: Date.now() } }] }),
    });
    if (!r.ok) throw new Error(`realtime ${r.status}`);
  }
}
