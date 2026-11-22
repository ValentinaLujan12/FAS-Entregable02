/**
 * Servidor de DESARROLLO local (no se usa en Vercel): sirve public/ y envía /api/* al mismo manejador que la función
 * de Vercel. Sin variables de Supabase usa un almacén en memoria.
 *   npm run build && npm run dev   ->  http://localhost:3000
 * Si no defines ACCESO_USUARIOS, crea el usuario de prueba "prueba" con contraseña "prueba-local-123" (solo local).
 */
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { crearContexto, manejar } from './manejador.js';

const PUERTO = Number(process.env.PORT ?? 3000);
const RAIZ = resolve(process.env.PUBLIC_DIR ?? 'public');
const CABECERAS = JSON.parse(readFileSync(resolve('vercel.json'), 'utf8')).headers[0].headers as Array<{ key: string; value: string }>;

const env = { ...process.env };
if (!env.ACCESO_USUARIOS) {
  const sal = randomBytes(16);
  const hash = pbkdf2Sync('prueba-local-123', sal, 600_000, 32, 'sha256');
  env.ACCESO_USUARIOS = `prueba=pbkdf2-sha256$600000$${sal.toString('base64url')}$${hash.toString('base64url')}`;
  console.log('Acceso de desarrollo: usuario "prueba", contraseña "prueba-local-123"');
}
env.SECRETO_SESION ||= randomBytes(32).toString('base64url');
delete env.VERCEL_ENV;
const ctx = crearContexto(env);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

async function servirApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const trozos: Buffer[] = [];
  for await (const t of req) trozos.push(t as Buffer);
  const sinCuerpo = req.method === 'GET' || req.method === 'HEAD';
  const r = await manejar(new Request(url, { method: req.method, headers: req.headers as Record<string, string>, body: sinCuerpo ? undefined : Buffer.concat(trozos) }), ctx);
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}

function archivoEstatico(pathname: string): string | null {
  const rel = decodeURIComponent(pathname);
  const archivo = normalize(join(RAIZ, rel === '/' ? '/index.html' : rel));
  return archivo.startsWith(RAIZ + sep) && existsSync(archivo) && statSync(archivo).isFile() ? archivo : null;
}

function servirEstatico(res: ServerResponse, url: URL): void {
  const archivo = archivoEstatico(url.pathname);
  if (!archivo) {
    res.writeHead(404).end('No encontrado');
    return;
  }
  const h: Record<string, string> = Object.fromEntries(CABECERAS.map((c) => [c.key, c.value.replace(' upgrade-insecure-requests;', '')]));
  h['content-type'] = MIME[extname(archivo)] ?? 'application/octet-stream';
  res.writeHead(200, h);
  res.end(readFileSync(archivo));
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return servirApi(req, res, url);
  servirEstatico(res, url);
}).listen(PUERTO, () => console.log(`El Apuntado (desarrollo) en http://localhost:${PUERTO}`));
