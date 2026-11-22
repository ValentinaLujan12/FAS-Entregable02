import { MODALIDADES, parametrosPorDefecto } from '../kernel/config.js';
import type { InfoModalidadDTO } from '../kernel/protocolo.js';
import { parsearMensaje } from '../infra/mensajes.js';
import type { Logger } from '../game/TurnOrchestrator.js';
import { cookieSesion, firmarSesion, leerCookie, leerUsuarios, validarSesion, verificarAcceso, type UsuarioAcceso } from './acceso.js';
import { AlmacenMemoria } from '../persistence/AlmacenMemoria.js';
import { SupabaseStateRepository } from '../persistence/SupabaseStateRepository.js';
import { GatewayTiempoReal } from '../infra/GatewayTiempoReal.js';
import type { IAlmacen } from '../persistence/IAlmacen.js';
import { type OpcionesProcesador, Procesador, idAnonimo } from './Procesador.js';
import { extrasPorDefecto } from '../extras/composicion.js';

/**
 * Punto de entrada HTTP del juego (Web Request -> Response). Lo usan la función de Vercel (api/index.ts) y el
 * servidor de desarrollo local. No hay WebSocket: el cliente envía cada jugada por POST /api/juego y recibe sus
 * mensajes; Supabase Realtime solo avisa "la sala cambió" para que los demás pidan los suyos.
 */
export interface Entorno {
  ACCESO_USUARIOS?: string;
  SECRETO_SESION?: string;
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  VERCEL_ENV?: string;
  VERCEL?: string;
  /** Solo pruebas: acorta umbrales y bots. */
  BOT_MIN_MS?: string;
  BOT_MAX_MS?: string;
  VOTO_SALTOS_MIN?: string;
  VOTO_TURNOS_AUTO_MIN?: string;
  VOTO_DURACION_SEG?: string;
}

export interface Contexto {
  env: Entorno;
  almacen: IAlmacen;
  procesador: Procesador;
  usuarios: UsuarioAcceso[];
  secreto: string;
  configError: string | null;
  /** Envía una difusión de prueba a Supabase Realtime (null si no está configurado). */
  probarTiempoReal: (() => Promise<void>) | null;
}

const consola: Logger = {
  info: (msg, extra) => console.log(JSON.stringify({ nivel: 'info', msg, ...extra })),
  error: (msg, extra) => console.error(JSON.stringify({ nivel: 'error', msg, ...extra })),
};

const numero = (v: string | undefined): number | undefined => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);

function errorDeConfiguracion(env: Entorno, usuarios: UsuarioAcceso[], secreto: string, conAlmacen: boolean): string | null {
  if (!usuarios.length) return 'Falta ACCESO_USUARIOS (usuarios de acceso con su hash).';
  if (secreto.length < 32) return 'Falta SECRETO_SESION (mínimo 32 caracteres).';
  if (env.VERCEL_ENV && !conAlmacen) return 'Faltan SUPABASE_URL y SUPABASE_SECRET_KEY.';
  return null;
}

/** Umbrales de votación acortados (solo pruebas y demostraciones). */
function votacionDe(env: Entorno): OpcionesProcesador['votacion'] {
  const pares: Array<[string, number | undefined]> = [
    ['saltosMin', numero(env.VOTO_SALTOS_MIN)],
    ['turnosAutoMin', numero(env.VOTO_TURNOS_AUTO_MIN)],
    ['duracionSeg', numero(env.VOTO_DURACION_SEG)],
  ];
  const definidos = pares.filter(([, v]) => v);
  return definidos.length ? Object.fromEntries(definidos) : undefined;
}

/** Rango de "pensar" de los bots (solo pruebas). */
function retardoDe(env: Entorno): readonly [number, number] | undefined {
  const min = numero(env.BOT_MIN_MS);
  return min === undefined ? undefined : [min, numero(env.BOT_MAX_MS) ?? min];
}

/** Opciones del procesador: composición de los extras (ADR-11), el almacén, el canal y los ajustes de prueba. */
function opcionesDe(env: Entorno, almacen: IAlmacen, canal: GatewayTiempoReal | null): OpcionesProcesador {
  const votacion = votacionDe(env);
  const retardoBotMs = retardoDe(env);
  return {
    extras: extrasPorDefecto,
    almacen,
    logger: consola,
    ...(canal ? { canal } : {}),
    ...(retardoBotMs ? { retardoBotMs } : {}),
    ...(votacion ? { votacion } : {}),
  };
}

export function crearContexto(env: Entorno, almacenForzado?: IAlmacen): Contexto {
  const usuarios = leerUsuarios(env.ACCESO_USUARIOS);
  const secreto = env.SECRETO_SESION ?? '';
  const supabase = env.SUPABASE_URL && env.SUPABASE_SECRET_KEY ? { url: env.SUPABASE_URL, clave: env.SUPABASE_SECRET_KEY } : null;
  const configError = errorDeConfiguracion(env, usuarios, secreto, !!(supabase || almacenForzado));
  const almacen = almacenForzado ?? (supabase ? new SupabaseStateRepository(supabase.url, supabase.clave) : new AlmacenMemoria());
  const canal = supabase && !almacenForzado ? new GatewayTiempoReal(supabase.url, supabase.clave) : null;
  const procesador = new Procesador(opcionesDe(env, almacen, canal));
  return { env, almacen, procesador, usuarios, secreto, configError, probarTiempoReal: canal ? () => canal.avisarCambio('PRUEBA') : null };
}

const SEGURIDAD: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
};

function json(estado: number, cuerpo: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...SEGURIDAD, ...extra } });
}

/**
 * IP del cliente SOLO para el identificador anónimo de los límites (nunca se guarda en claro).
 * En Vercel se usan las cabeceras que pone la propia plataforma; `x-forwarded-for` solo se acepta en local,
 * porque un cliente podría inventarla.
 */
function ipDe(req: Request, env: Entorno): string {
  const h = req.headers;
  const enVercel = !!(env.VERCEL || env.VERCEL_ENV);
  const ip = h.get('x-vercel-forwarded-for') ?? h.get('x-real-ip') ?? (enVercel ? null : h.get('x-forwarded-for')) ?? 'desconocida';
  return ip.split(',')[0]!.trim().slice(0, 64);
}

/** Anti-CSRF: un POST solo se acepta desde la propia página (cabecera Origin = mismo host). */
function mismoOrigen(req: Request): boolean {
  const origen = req.headers.get('origin');
  if (!origen) return false;
  try {
    return new URL(origen).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

async function cuerpoJson(req: Request, limite = 8192): Promise<Record<string, unknown> | null> {
  if (!/^application\/json\b/i.test(req.headers.get('content-type') ?? '')) return null;
  const texto = await req.text();
  if (texto.length > limite) return null;
  try {
    const v = JSON.parse(texto);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** Datos de una petición ya enrutada. */
interface Peticion {
  req: Request;
  ctx: Contexto;
  url: URL;
  segura: boolean;
  usuario: string | null;
}
type Ruta = (p: Peticion) => Response | Promise<Response>;

/** vercel.json reescribe /api/<ruta> a /api?__ruta=<ruta>: si la plataforma entrega la ruta ya reescrita, se recupera de ahí. */
function rutaDe(url: URL): string {
  const ruta = url.pathname.replace(/\/+$/, '') || '/';
  const reescrita = url.searchParams.get('__ruta');
  if (ruta === '/api' && reescrita !== null && /^[a-z/]{0,40}$/.test(reescrita)) return `/api/${reescrita}`.replace(/\/+$/, '');
  return ruta;
}

function salud(ctx: Contexto): Response {
  const e = ctx.env;
  return json(200, {
    estado: ctx.configError ? 'configuracion-incompleta' : 'ok',
    detalle: ctx.configError,
    baseDatos: e.SUPABASE_URL && e.SUPABASE_SECRET_KEY ? 'supabase' : 'memoria',
    tiempoReal: !!(e.SUPABASE_URL && e.SUPABASE_SECRET_KEY && e.SUPABASE_PUBLISHABLE_KEY),
  });
}

async function entrar({ req, ctx, segura }: Peticion): Promise<Response> {
  const id = idAnonimo(ipDe(req, ctx.env), ctx.secreto);
  if ((await ctx.almacen.contarIntento(`acceso:${id}`, 900)) > 10) {
    return json(429, { error: 'DEMASIADOS_INTENTOS', mensaje: 'Demasiados intentos. Espera 15 minutos.' });
  }
  const d = await cuerpoJson(req, 1024);
  const u = d ? await verificarAcceso(ctx.usuarios, d.usuario, d.contrasena) : null;
  if (!u) return json(401, { error: 'CREDENCIALES', mensaje: 'Usuario o contraseña incorrectos.' });
  return json(200, { acceso: true, usuario: u }, { 'set-cookie': cookieSesion(firmarSesion(u, ctx.secreto), segura) });
}

async function configuracion({ ctx, url }: Peticion): Promise<Response> {
  const e = ctx.env;
  const tiempoReal = e.SUPABASE_URL && e.SUPABASE_PUBLISHABLE_KEY ? { url: e.SUPABASE_URL, clave: e.SUPABASE_PUBLISHABLE_KEY } : null;
  if (url.searchParams.get('prueba') !== '1') return json(200, { tiempoReal });
  // ?prueba=1: el servidor envía una difusión de prueba y dice si Supabase Realtime la aceptó.
  const prueba = ctx.probarTiempoReal ? await ctx.probarTiempoReal().then(() => 'ok', (err) => `error: ${String(err).slice(0, 80)}`) : 'sin-configurar';
  return json(200, { tiempoReal, prueba });
}

function modalidades(): Response {
  const dto: InfoModalidadDTO[] = MODALIDADES.map((m) => ({ id: m.id, nombre: m.nombre, resumen: m.resumen, sentidoPuntaje: m.sentidoPuntaje, parametros: parametrosPorDefecto(m.id) }));
  return json(200, dto);
}

const texto = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : undefined);

/** Ida y vuelta reportada por el navegador (métricas de latencia); se ignora si no es un número razonable. */
function rttDe(v: unknown): { rttMs?: number } {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 60_000 ? { rttMs: Math.round(v) } : {};
}

async function juego({ req, ctx }: Peticion): Promise<Response> {
  const d = await cuerpoJson(req);
  if (!d) return json(400, { error: 'CUERPO_INVALIDO' });
  const msg = d.msg === undefined ? undefined : parsearMensaje(JSON.stringify(d.msg));
  if (msg === null) return json(400, { error: 'MENSAJE_INVALIDO' });
  const r = await ctx.procesador.atender({
    codigo: texto(d.codigo, 8),
    token: texto(d.token, 100),
    clave: texto(d.clave, 100),
    ...(msg ? { msg } : {}),
    vista: d.vista === true,
    idCliente: idAnonimo(ipDe(req, ctx.env), ctx.secreto),
    ...rttDe(d.rttMs),
  });
  return json(200, r);
}

/** Rutas que no exigen haber entrado. */
const PUBLICAS: Readonly<Record<string, Ruta>> = {
  'GET /api/acceso': ({ usuario }) => json(200, usuario ? { acceso: true, usuario } : { acceso: false }),
  'POST /api/acceso/entrar': entrar,
  'POST /api/acceso/salir': ({ segura }) => json(200, { acceso: false }, { 'set-cookie': cookieSesion(null, segura) }),
};

/** Rutas que exigen la sesión de acceso (ADR-10). */
const PRIVADAS: Readonly<Record<string, Ruta>> = {
  'GET /api/config': configuracion,
  'GET /api/modalidades': modalidades,
  'POST /api/juego': juego,
};

const rutaDeTabla = (tabla: Readonly<Record<string, Ruta>>, clave: string): Ruta | undefined => (Object.hasOwn(tabla, clave) ? tabla[clave] : undefined);

async function enrutar(req: Request, ctx: Contexto, url: URL, ruta: string): Promise<Response> {
  if (ruta === '/api/salud') return salud(ctx);
  if (ctx.configError) return json(503, { error: 'CONFIGURACION', mensaje: ctx.configError });
  const segura = url.protocol === 'https:';
  const p: Peticion = { req, ctx, url, segura, usuario: validarSesion(leerCookie(req.headers.get('cookie'), segura), ctx.secreto, ctx.usuarios) };
  if (req.method === 'POST' && !mismoOrigen(req)) return json(403, { error: 'ORIGEN_NO_PERMITIDO' });
  const clave = `${req.method} ${ruta}`;
  const publica = rutaDeTabla(PUBLICAS, clave);
  if (publica) return publica(p);
  if (!p.usuario) return json(401, { error: 'SIN_ACCESO', mensaje: 'Inicia sesión para jugar.' });
  const privada = rutaDeTabla(PRIVADAS, clave);
  return privada ? privada(p) : json(404, { error: 'NO_ENCONTRADO' });
}

export async function manejar(req: Request, ctx: Contexto): Promise<Response> {
  const url = new URL(req.url);
  const ruta = rutaDe(url);
  try {
    return await enrutar(req, ctx, url, ruta);
  } catch (err) {
    consola.error('error en la API', { ruta, err: String(err) });
    return json(500, { error: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor.' });
  }
}
