import type { EventoJuego, VistaMesa } from '../kernel/protocolo.js';
import { etiqueta, type Carta } from '../kernel/cartas.js';

export interface SesionLocal {
  codigo: string;
  jugadorId: string;
  token: string;
}

const LS_SESION = 'apuntado.sesion';
const LS_NOMBRE = 'apuntado.nombre';
const LS_EFECTOS = 'apuntado.efectos';

const leer = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const escribir = (k: string, v: string | null): void => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* almacenamiento no disponible: la sesión simplemente no persiste */
  }
};

export interface LineaLog {
  id: number;
  texto: string;
  ts: number;
}

/** Estado de UI del cliente. La verdad del juego siempre es la última VistaMesa del servidor. */
export class Almacen {
  vista: VistaMesa | null = null;
  /** Diferencia (ms) entre el reloj del servidor y el local. */
  desfase = 0;
  sesion: SesionLocal | null = null;
  log: LineaLog[] = [];
  conectado = false;
  private contador = 0;

  constructor() {
    const s = leer(LS_SESION);
    if (s) {
      try {
        this.sesion = JSON.parse(s) as SesionLocal;
      } catch {
        this.sesion = null;
      }
    }
  }

  get nombre(): string {
    return leer(LS_NOMBRE) ?? '';
  }
  set nombre(v: string) {
    escribir(LS_NOMBRE, v);
  }
  get efectos(): string {
    return leer(LS_EFECTOS) ?? 'auto';
  }
  set efectos(v: string) {
    escribir(LS_EFECTOS, v);
  }

  guardarSesion(s: SesionLocal | null): void {
    this.sesion = s;
    escribir(LS_SESION, s ? JSON.stringify(s) : null);
  }

  aplicarVista(v: VistaMesa): void {
    this.vista = v;
    this.desfase = v.ahora - Date.now();
  }

  ahoraServidor(): number {
    return Date.now() + this.desfase;
  }

  nombreDe(id: string | undefined | null): string {
    if (!id) return '-';
    return this.vista?.jugadores.find((j) => j.id === id)?.nombre ?? 'Jugador';
  }

  agregarLog(texto: string): void {
    this.log.push({ id: ++this.contador, texto, ts: Date.now() });
    if (this.log.length > 40) this.log.shift();
  }

  /** Texto en español de un evento público para la bitácora de la mesa. */
  textoEvento(e: EventoJuego): string | null {
    const d = e.datos as Record<string, unknown>;
    const quien = this.nombreDe(d.jugadorId as string | undefined);
    switch (e.tipo) {
      case 'RONDA_INICIADA':
        return `Ronda ${String(d.ronda)} - reparto listo`;
      case 'CARTA_ROBADA':
        return d.origen === 'POZO' && d.carta ? `${quien} tomó ${etiqueta(d.carta as Carta)} del pozo` : `${quien} robó del mazo`;
      case 'CARTA_DESCARTADA':
        return `${quien} descartó ${d.carta ? etiqueta(d.carta as Carta) : 'una carta'}${d.forzado ? ' (automático)' : ''}`;
      case 'TURNO_EXPIRADO':
        return `Se agotó el tiempo de ${quien}`;
      case 'CIERRE_RECHAZADO':
        return `${quien} intentó cerrar sin éxito`;
      case 'CIERRE_ACEPTADO':
        return `${quien} cerró la ronda`;
      case 'MAZO_RECICLADO':
        return 'El pozo se barajó como nuevo mazo';
      case 'RONDA_TABLAS':
        return 'Tablas: se agotó el mazo';
      case 'JUGADOR_ELIMINADO':
        return `${this.nombreDe(d.jugadorId as string)} quedó eliminado`;
      case 'AUTOPILOTO':
        return d.activo ? `${quien} pasa a piloto automático` : `${quien} retomó el control`;
      case 'AUTOMATICO':
        return d.activo ? `${quien} pasa a modo automático (votación)` : `${quien} retomó el control`;
      case 'VOTACION_ABIERTA':
        return d.tipo === 'AUTOMATICO'
          ? `Votación: ¿pasar a ${this.nombreDe(d.objetivoId as string)} a modo automático?`
          : `Votación: ¿expulsar a ${this.nombreDe(d.objetivoId as string)}?`;
      case 'VOTACION_CERRADA': {
        const nom = this.nombreDe(d.objetivoId as string);
        if (d.resultado === 'CANCELADA') return `Votación sobre ${nom} cancelada`;
        return `Votación sobre ${nom}: ${d.resultado === 'APROBADA' ? 'aprobada' : 'rechazada'}`;
      }
      case 'JUGADOR_EXPULSADO':
        return `${String(d.nombre ?? this.nombreDe(d.jugadorId as string))} fue expulsado; un bot termina su mano`;
      case 'PARTIDA_FINALIZADA':
        return `Fin de la partida - ${this.nombreDe(d.ganadorId as string)} gana`;
      default:
        return null;
    }
  }
}

export const formatearTiempo = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
