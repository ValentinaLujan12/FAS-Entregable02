/**
 * FF-32 (G7): monitoreo de la latencia en producción. Lee las últimas partidas de partida_registro (Supabase) y compara
 * el p99 de cada partida con la línea base del Entregable 2 (Responsiveness < 300 ms en difusión). Se ejecuta a mano,
 * después de las sesiones con usuarios; no forma parte del pipeline bloqueante (decisión del equipo D42).
 *   SUPABASE_URL=... SUPABASE_SECRET_KEY=... npm run ff32 -- [--partidas 100] [--linea-base 300]
 * Alerta cuando la mediana de los p99 por partida supera la línea base: un arranque en frío aislado no la dispara,
 * una regresión sostenida sí. Código de salida: 0 si cumple o si aún no hay datos suficientes, 1 si hay alerta.
 */
import { createClient } from '@supabase/supabase-js';

export const LINEA_BASE_MS = 300;
export const MIN_MUESTRAS = 20;

export interface FilaLatencia {
  codigo: string;
  partida: number;
  servidor_p99_ms: number | null;
  cliente_p99_ms: number | null;
  muestras_latencia: number | null;
}

export interface MedidaFF32 {
  medianaMs: number | null;
  peorMs: number | null;
  partidasSobreLineaBase: number;
}

export interface ResultadoFF32 {
  estado: 'CUMPLE' | 'ALERTA' | 'SIN_DATOS';
  partidas: number;
  muestras: number;
  lineaBaseMs: number;
  servidor: MedidaFF32;
  cliente: MedidaFF32;
}

function mediana(ordenados: readonly number[]): number | null {
  if (ordenados.length === 0) return null;
  const m = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 1 ? ordenados[m]! : (ordenados[m - 1]! + ordenados[m]!) / 2;
}

function medir(valores: ReadonlyArray<number | null>, lineaBaseMs: number): MedidaFF32 {
  const v = valores.filter((x): x is number => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  return { medianaMs: mediana(v), peorMs: v.at(-1) ?? null, partidasSobreLineaBase: v.filter((x) => x > lineaBaseMs).length };
}

const supera = (m: MedidaFF32, lineaBaseMs: number): boolean => m.medianaMs !== null && m.medianaMs > lineaBaseMs;

/** Evalúa FF-32 sobre las filas de partida_registro (función pura: la prueba no necesita Supabase). */
export function evaluarFF32(filas: readonly FilaLatencia[], lineaBaseMs = LINEA_BASE_MS): ResultadoFF32 {
  const muestras = filas.reduce((s, f) => s + (f.muestras_latencia ?? 0), 0);
  const servidor = medir(filas.map((f) => f.servidor_p99_ms), lineaBaseMs);
  const cliente = medir(filas.map((f) => f.cliente_p99_ms), lineaBaseMs);
  const base = { partidas: filas.length, muestras, lineaBaseMs, servidor, cliente };
  if (muestras < MIN_MUESTRAS) return { estado: 'SIN_DATOS', ...base };
  return { estado: supera(servidor, lineaBaseMs) || supera(cliente, lineaBaseMs) ? 'ALERTA' : 'CUMPLE', ...base };
}

function argumento(nombre: string, defecto: number): number {
  const i = process.argv.indexOf(nombre);
  const v = i > 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : defecto;
}

async function main(): Promise<number> {
  const url = process.env.SUPABASE_URL;
  const clave = process.env.SUPABASE_SECRET_KEY;
  if (!url || !clave) {
    console.error('FF-32: faltan SUPABASE_URL y SUPABASE_SECRET_KEY (las mismas variables del despliegue).');
    return 2;
  }
  const db = createClient(url, clave, { auth: { persistSession: false } });
  const { data, error } = await db
    .from('partida_registro')
    .select('codigo, partida, servidor_p99_ms, cliente_p99_ms, muestras_latencia')
    .order('fin', { ascending: false })
    .limit(argumento('--partidas', 100));
  if (error) {
    console.error(`FF-32: no se pudo leer partida_registro: ${error.message}`);
    return 2;
  }
  const filas = (data ?? []).map((f) => ({
    ...f,
    servidor_p99_ms: f.servidor_p99_ms === null ? null : Number(f.servidor_p99_ms),
    cliente_p99_ms: f.cliente_p99_ms === null ? null : Number(f.cliente_p99_ms),
  })) as FilaLatencia[];
  const r = evaluarFF32(filas, argumento('--linea-base', LINEA_BASE_MS));
  const ms = (x: number | null) => (x === null ? 's/d' : `${Math.round(x)} ms`);
  console.log(`FF-32: ${r.partidas} partidas, ${r.muestras} jugadas medidas, línea base p99 < ${r.lineaBaseMs} ms`);
  for (const [nombre, m] of [['Servidor', r.servidor], ['Cliente (ida y vuelta)', r.cliente]] as const) {
    console.log(`  ${nombre.padEnd(24)} mediana p99 ${ms(m.medianaMs).padStart(7)}   peor ${ms(m.peorMs).padStart(7)}   partidas sobre la línea base: ${m.partidasSobreLineaBase}`);
  }
  console.log(`Resultado: ${r.estado}${r.estado === 'SIN_DATOS' ? ` (se necesitan al menos ${MIN_MUESTRAS} jugadas medidas)` : ''}`);
  return r.estado === 'ALERTA' ? 1 : 0;
}

if (process.argv[1]?.endsWith('ff32-latencia-produccion.ts')) {
  main().then((codigo) => process.exit(codigo), (e: unknown) => {
    console.error(e);
    process.exit(2);
  });
}
