import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import type { EventoJuego } from '../kernel/protocolo.js';
import type { Cuenta } from './IRepositorioCuentas.js';
import type { DatosSala, FilaSala, IAlmacen, MensajeBuzon } from './IAlmacen.js';

/**
 * Almacén en Supabase (PostgreSQL) por su API HTTPS, con la clave SECRETA (solo vive en el servidor de Vercel).
 * Las tablas tienen RLS sin políticas: la clave pública del navegador no puede leerlas.
 */
export class SupabaseStateRepository implements IAlmacen {
  private readonly db: SupabaseClient;

  constructor(url: string, claveSecreta: string, opciones: { fetch?: typeof fetch } = {}) {
    this.db = createClient(url, claveSecreta, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      ...(opciones.fetch ? { global: { fetch: opciones.fetch } } : {}),
    });
  }

  private static falla(op: string, error: { message: string; code?: string } | null): void {
    if (error) throw new Error(`Supabase ${op}: ${error.code ?? ''} ${error.message}`);
  }

  async leerSala(codigo: string): Promise<FilaSala | null> {
    const { data, error } = await this.db.from('sala').select('codigo, datos, version, proximo_en').eq('codigo', codigo).maybeSingle();
    SupabaseStateRepository.falla('leerSala', error);
    if (!data) return null;
    return { codigo: data.codigo, datos: data.datos as DatosSala, version: data.version, proximoEn: data.proximo_en === null ? null : Number(data.proximo_en) };
  }

  async guardarAtomico(
    codigo: string,
    versionEsperada: number,
    datos: DatosSala,
    proximoEn: number | null,
    mensajes: Array<{ jugadorId: string } & MensajeBuzon>,
    eventos: readonly EventoJuego[],
  ): Promise<boolean> {
    // Una sola llamada RPC: guardar_sala_atomica (esquema.sql) escribe sala, buzon y evento en una transaccion.
    const payload = mensajes.map((x) => ({ jugadorId: x.jugadorId, en: x.en, m: x.m }));
    const { data, error } = await this.db.rpc('guardar_sala_atomica', {
      p_codigo: codigo,
      p_version_esperada: versionEsperada,
      p_datos: datos,
      p_proximo_en: proximoEn,
      p_mensajes: payload,
      p_eventos: eventos,
    });
    SupabaseStateRepository.falla('guardarAtomico', error);
    return data === true;
  }

  async borrarSala(codigo: string): Promise<void> {
    const { error } = await this.db.from('sala').delete().eq('codigo', codigo);
    SupabaseStateRepository.falla('borrarSala', error);
  }

  async tocarPresencia(codigo: string, jugadorId: string, en: number): Promise<void> {
    const { error } = await this.db.from('presencia').upsert({ codigo, jugador_id: jugadorId, visto_en: en }, { onConflict: 'codigo,jugador_id' });
    // Si la sala acaba de borrarse (clave foránea), no es un error para el jugador.
    if (error?.code === '23503') return;
    SupabaseStateRepository.falla('tocarPresencia', error);
  }

  async leerPresencias(codigo: string): Promise<Map<string, number>> {
    const { data, error } = await this.db.from('presencia').select('jugador_id, visto_en').eq('codigo', codigo);
    SupabaseStateRepository.falla('leerPresencias', error);
    return new Map((data ?? []).map((r) => [r.jugador_id as string, Number(r.visto_en)]));
  }

  async sacarBuzon(codigo: string, jugadorId: string): Promise<MensajeBuzon[]> {
    const { data, error } = await this.db.from('buzon').delete().eq('codigo', codigo).eq('jugador_id', jugadorId).select('id, en, mensaje');
    SupabaseStateRepository.falla('sacarBuzon', error);
    return (data ?? [])
      .sort((a, b) => Number(a.id) - Number(b.id))
      .map((r) => ({ en: Number(r.en), m: r.mensaje }));
  }

  async cargarCuenta(claveHash: string): Promise<Cuenta | null> {
    const { data, error } = await this.db.from('cuenta').select('*').eq('clave_hash', claveHash).maybeSingle();
    SupabaseStateRepository.falla('cargarCuenta', error);
    if (!data) return null;
    return { id: data.id, claveHash: data.clave_hash, saldo: Number(data.saldo), inventario: data.inventario, elegidas: data.elegidas, creadaEn: new Date(data.creada_en).getTime() };
  }

  async guardarCuenta(c: Cuenta): Promise<void> {
    const { error } = await this.db
      .from('cuenta')
      .upsert({ clave_hash: c.claveHash, id: c.id, saldo: c.saldo, inventario: c.inventario, elegidas: c.elegidas, creada_en: new Date(c.creadaEn).toISOString() }, { onConflict: 'clave_hash' });
    SupabaseStateRepository.falla('guardarCuenta', error);
  }

  async contarIntento(clave: string, ventanaSeg: number): Promise<number> {
    const { data, error } = await this.db.rpc('contar_intento', { p_clave: clave, p_ventana_seg: ventanaSeg });
    SupabaseStateRepository.falla('contarIntento', error);
    return Number(data);
  }

  async purgar(antesDe: number): Promise<void> {
    const { error } = await this.db.from('sala').delete().lt('actualizada_en', new Date(antesDe).toISOString());
    SupabaseStateRepository.falla('purgar', error);
  }
}
