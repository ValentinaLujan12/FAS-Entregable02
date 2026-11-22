import { createHmac, pbkdf2, timingSafeEqual } from 'node:crypto';

/**
 * Acceso común al sitio: uno o varios usuarios fijos definidos por el administrador.
 * Las contraseñas NUNCA están en el código ni en GitHub: la variable de entorno ACCESO_USUARIOS (en Vercel) guarda
 * solo su hash PBKDF2-SHA256 (600 000 iteraciones, sal aleatoria), generado con herramientas/generar-acceso.html.
 *   ACCESO_USUARIOS = "ana=pbkdf2-sha256$600000$<sal>$<hash>;equipo=pbkdf2-sha256$600000$<sal>$<hash>"
 * Tras entrar, el navegador recibe una cookie de sesión firmada (HMAC) HttpOnly + Secure + SameSite=Strict.
 */

export interface UsuarioAcceso {
  usuario: string;
  iteraciones: number;
  sal: Buffer;
  hash: Buffer;
}

export function leerUsuarios(env: string | undefined): UsuarioAcceso[] {
  return (env ?? '')
    .split(/[;\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((linea): UsuarioAcceso | null => {
      const i = linea.indexOf('=');
      const usuario = linea.slice(0, i).trim().toLowerCase();
      const [alg, it, sal, hash] = linea.slice(i + 1).trim().split('$');
      if (i < 1 || alg !== 'pbkdf2-sha256' || !sal || !hash || !Number(it)) return null;
      return { usuario, iteraciones: Number(it), sal: Buffer.from(sal, 'base64url'), hash: Buffer.from(hash, 'base64url') };
    })
    .filter((x: UsuarioAcceso | null): x is UsuarioAcceso => !!x && x.iteraciones >= 100_000 && x.hash.length >= 32);
}

const derivar = (clave: string, sal: Buffer, it: number, largo: number): Promise<Buffer> =>
  new Promise((ok, mal) => pbkdf2(clave.normalize('NFKC'), sal, it, largo, 'sha256', (e, k) => (e ? mal(e) : ok(k))));

const SENUELO: UsuarioAcceso = { usuario: '', iteraciones: 600_000, sal: Buffer.alloc(16, 7), hash: Buffer.alloc(32) };

/** Verifica usuario + contraseña. Si el usuario no existe se calcula igual un hash señuelo (mismo tiempo de respuesta). */
export async function verificarAcceso(usuarios: UsuarioAcceso[], usuario: unknown, contrasena: unknown): Promise<string | null> {
  if (typeof usuario !== 'string' || typeof contrasena !== 'string' || usuario.length > 64 || contrasena.length > 256) return null;
  const u = usuarios.find((x) => x.usuario === usuario.trim().toLowerCase());
  const ref = u ?? SENUELO;
  const k = await derivar(contrasena, ref.sal, ref.iteraciones, ref.hash.length);
  const ok = timingSafeEqual(k, ref.hash);
  return u && ok ? u.usuario : null;
}

/* --------- cookie de sesión firmada --------- */

export const NOMBRE_COOKIE = '__Host-apuntado';
export const NOMBRE_COOKIE_DEV = 'apuntado_acceso';
const DURACION_MS = 7 * 24 * 3600_000;

export function firmarSesion(usuario: string, secreto: string, ahora = Date.now()): string {
  const datos = Buffer.from(JSON.stringify({ u: usuario, exp: ahora + DURACION_MS })).toString('base64url');
  const firma = createHmac('sha256', secreto).update(datos).digest('base64url');
  return `${datos}.${firma}`;
}

export function validarSesion(valor: string | null | undefined, secreto: string, usuarios: UsuarioAcceso[], ahora = Date.now()): string | null {
  if (!valor || valor.length > 400) return null;
  const [datos, firma] = valor.split('.');
  if (!datos || !firma || !firmaValida(datos, firma, secreto)) return null;
  return usuarioVigente(datos, usuarios, ahora);
}

/** Se compara el texto exacto de la firma (no los bytes decodificados) para no aceptar variantes con bits de relleno. */
function firmaValida(datos: string, firma: string, secreto: string): boolean {
  const esperada = Buffer.from(createHmac('sha256', secreto).update(datos).digest('base64url'));
  const dada = Buffer.from(firma);
  return dada.length === esperada.length && timingSafeEqual(dada, esperada);
}

/** Usuario de la sesión si no venció y sigue en ACCESO_USUARIOS (si el administrador lo quita, deja de valer al instante). */
function usuarioVigente(datos: string, usuarios: UsuarioAcceso[], ahora: number): string | null {
  try {
    const { u, exp } = JSON.parse(Buffer.from(datos, 'base64url').toString('utf8')) as { u: string; exp: number };
    if (typeof exp !== 'number' || exp < ahora || !usuarios.some((x) => x.usuario === u)) return null;
    return u;
  } catch {
    return null;
  }
}

export function cookieSesion(valor: string | null, segura: boolean): string {
  const nombre = segura ? NOMBRE_COOKIE : NOMBRE_COOKIE_DEV;
  const base = `${nombre}=${valor ?? ''}; Path=/; HttpOnly; SameSite=Strict${segura ? '; Secure' : ''}`;
  return valor ? `${base}; Max-Age=${DURACION_MS / 1000}` : `${base}; Max-Age=0`;
}

export function leerCookie(cabecera: string | null, segura: boolean): string | null {
  const nombre = segura ? NOMBRE_COOKIE : NOMBRE_COOKIE_DEV;
  for (const parte of (cabecera ?? '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nombre) return parte.slice(i + 1).trim();
  }
  return null;
}
