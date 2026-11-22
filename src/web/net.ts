import type { MensajeCliente, MensajeServidor } from '../kernel/protocolo.js';

type Escucha = (m: MensajeServidor) => void;

interface RespuestaJuego {
  ahora: number;
  mensajes: Array<{ en: number; m: MensajeServidor }>;
  proximoEn: number | null;
}

export interface OpcionesRed {
  /** Clave anónima de la cuenta de este navegador (créditos y skins). */
  clave(): string | null;
  /** El servidor dice que hay que volver a iniciar sesión (cookie vencida). */
  sinAcceso(): void;
}

/**
 * Canal con el servidor sin WebSocket propio (apto para Vercel):
 *  - cada jugada viaja por POST /api/juego y la respuesta trae los mensajes de este jugador, cada uno con la hora a la
 *    que debe mostrarse (las jugadas de los bots se reproducen con su ritmo);
 *  - Supabase Realtime avisa "la sala cambió" y entonces se piden los mensajes pendientes; si no está disponible,
 *    se consulta cada pocos segundos. También se vuelve a consultar cuando vence el próximo plazo (fin de turno, etc.).
 * Interfaz: conectar / enviar / cerrar.
 */
/** Estado de la conexión en tiempo real (lo lee la sala para mostrar el indicador). */
export const estadoConexion = { tiempoReal: false };
export const textoConexion = (): string => (estadoConexion.tiempoReal ? 'Conexión: en vivo' : 'Conexión: consulta cada 1,5 s');
export function pintarEstadoConexion(): void {
  const el = document.getElementById('estado-conexion');
  if (!el) return;
  el.textContent = textoConexion();
  el.classList.toggle('en-vivo', estadoConexion.tiempoReal);
}

export class Red {
  conectado = false;
  private codigo: string | null = null;
  private token: string | null = null;
  private cola: Array<{ msg?: MensajeCliente; vista?: boolean }> = [];
  private ocupado = false;
  private cerrado = true;
  private timerSync: number | null = null;
  private timerLatido: number | null = null;
  private fallos = 0;
  /** Ida y vuelta de la última petición (ms): se envía con la siguiente jugada para las métricas de latencia. */
  private ultimaRttMs: number | null = null;
  /** Reproducción ordenada: hora local en la que se puede mostrar el siguiente mensaje. */
  private reproduccion: Promise<void> = Promise.resolve();
  private tiempoReal: { quitar(): void } | null = null;
  private tiempoRealListo = false;
  private configTiempoReal: { url: string; clave: string } | null | undefined;

  constructor(
    private readonly alMensaje: Escucha,
    private readonly alEstado: (conectado: boolean) => void,
    private readonly alAbrir: () => void,
    private readonly o: OpcionesRed,
  ) {}

  conectar(): void {
    this.cerrado = false;
    this.conectado = true;
    this.alEstado(true);
    void this.cargarConfig();
    this.alAbrir();
    this.programarLatido();
  }

  cerrar(): void {
    this.cerrado = true;
    this.cola = [];
    this.fijarSala(null, null);
    if (this.timerLatido) window.clearInterval(this.timerLatido);
    this.timerLatido = null;
    this.alEstado(true);
  }

  enviar(m: MensajeCliente): void {
    if (this.cerrado || m.t === 'ping') return;
    if (m.t === 'reconectar') this.fijarSala(m.codigo, m.token);
    this.cola.push({ msg: m });
    void this.bombear();
    if (m.t === 'salir') this.fijarSala(null, null);
  }

  /** Pide los mensajes pendientes (sin jugada). `vista`: además, la vista completa actual. */
  sincronizar(vista = false): void {
    if (this.cerrado || !this.codigo) return;
    if (this.cola.some((x) => !x.msg)) return;
    this.cola.push(vista ? { vista: true } : {});
    void this.bombear();
  }

  private fijarSala(codigo: string | null, token: string | null): void {
    const cambio = codigo !== this.codigo;
    this.codigo = codigo;
    this.token = token;
    if (cambio) this.suscribir();
    if (!codigo && this.timerSync) window.clearTimeout(this.timerSync);
  }

  private async bombear(): Promise<void> {
    if (this.ocupado) return;
    this.ocupado = true;
    try {
      while (this.cola.length && !this.cerrado) {
        const sig = this.cola[0]!;
        const salir = sig.msg?.t === 'salir';
        const ok = await this.peticion(sig);
        if (!ok) {
          // Error de red: se reintenta con espera creciente (la jugada no se pierde).
          this.fallos++;
          if (this.fallos >= 2 && this.conectado) {
            this.conectado = false;
            this.alEstado(false);
          }
          await new Promise((r) => setTimeout(r, Math.min(8000, 500 * 2 ** this.fallos)));
          continue;
        }
        this.cola.shift();
        if (salir) this.fijarSala(null, null);
      }
    } finally {
      this.ocupado = false;
    }
  }

  private async peticion(p: { msg?: MensajeCliente; vista?: boolean }): Promise<boolean> {
    const cuerpo: Record<string, unknown> = {};
    if (this.codigo && p.msg?.t !== 'crear_sala' && p.msg?.t !== 'unirse') cuerpo.codigo = this.codigo;
    if (this.token) cuerpo.token = this.token;
    const clave = this.o.clave();
    if (clave) cuerpo.clave = clave;
    if (p.msg) cuerpo.msg = p.msg;
    if (p.vista) cuerpo.vista = true;
    if (p.msg && this.ultimaRttMs !== null) cuerpo.rttMs = this.ultimaRttMs;
    const t0 = performance.now();
    let r: Response;
    try {
      r = await fetch('/api/juego', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
    } catch {
      return false;
    }
    if (r.status === 401) {
      this.cerrado = true;
      this.o.sinAcceso();
      return true;
    }
    if (r.status >= 500) return false;
    this.ultimaRttMs = Math.round(performance.now() - t0);
    this.fallos = 0;
    if (!this.conectado) {
      this.conectado = true;
      this.alEstado(true);
    }
    if (!r.ok) return true;
    const d = (await r.json()) as RespuestaJuego;
    this.reproducir(d);
    return true;
  }

  /** Muestra cada mensaje cuando le toca (la hora `en` es del servidor; `ahora` permite convertirla a la local). */
  private reproducir(d: RespuestaJuego): void {
    const recibido = Date.now();
    for (const { en, m } of d.mensajes) {
      if (m.t === 'sesion') this.fijarSala(m.codigo, m.token);
      if (m.t === 'error' && (m.codigo === 'TOKEN_INVALIDO' || m.codigo === 'SALA_INEXISTENTE' || m.codigo === 'EXPULSADO')) this.fijarSala(null, null);
      const cuando = recibido + Math.max(0, en - d.ahora);
      this.reproduccion = this.reproduccion.then(async () => {
        const espera = cuando - Date.now();
        if (espera > 0) await new Promise((r) => setTimeout(r, Math.min(espera, 15_000)));
        if (!this.cerrado) this.alMensaje(m);
      });
    }
    if (this.timerSync) window.clearTimeout(this.timerSync);
    if (d.proximoEn !== null && this.codigo) {
      const ms = Math.max(200, d.proximoEn - d.ahora + 250);
      this.timerSync = window.setTimeout(() => this.sincronizar(), Math.min(ms, 120_000));
    }
  }

  /** Latido: mantiene la presencia (si dejas de enviarlo 30 s, los demás te ven desconectado) y recoge mensajes. */
  private programarLatido(): void {
    if (this.timerLatido) window.clearInterval(this.timerLatido);
    let n = 0;
    this.timerLatido = window.setInterval(() => {
      if (!this.codigo || this.cerrado) return;
      n++;
      // Con aviso en tiempo real basta un latido cada ~9 s; sin él, se consulta cada 1,5 s.
      if (!this.tiempoRealListo || n % 6 === 0) this.sincronizar();
    }, 1500);
  }

  private async cargarConfig(): Promise<void> {
    if (this.configTiempoReal !== undefined) return;
    try {
      const r = await fetch('/api/config', { credentials: 'same-origin', cache: 'no-store' });
      // Sin sesión (401) o error: se vuelve a pedir en la próxima conexión.
      if (!r.ok) return;
      this.configTiempoReal = ((await r.json()) as { tiempoReal: { url: string; clave: string } | null }).tiempoReal;
    } catch {
      return;
    }
    this.suscribir();
  }

  /** Suscripción al aviso "la sala cambió" de Supabase Realtime (no transporta datos del juego). */
  private suscribir(): void {
    this.tiempoReal?.quitar();
    this.tiempoReal = null;
    this.marcarTiempoReal(false);
    const cfg = this.configTiempoReal;
    const codigo = this.codigo;
    if (!cfg || !codigo) return;
    void import('./tiempoReal.js')
      .then(({ suscribirSala }) => {
        if (this.codigo !== codigo) return;
        this.tiempoReal = suscribirSala(cfg.url, cfg.clave, codigo, {
          alCambio: () => this.sincronizar(),
          alEstado: (ok) => this.marcarTiempoReal(ok),
        });
      })
      .catch(() => this.marcarTiempoReal(false));
  }

  /** Estado del aviso en tiempo real, visible en la sala ("En vivo" o "Consulta cada 1,5 s") para verificar el despliegue. */
  private marcarTiempoReal(ok: boolean): void {
    this.tiempoRealListo = ok;
    estadoConexion.tiempoReal = ok;
    pintarEstadoConexion();
  }
}
