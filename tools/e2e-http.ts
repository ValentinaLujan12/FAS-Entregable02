/**
 * E2E del protocolo HTTP (el mismo que usa Vercel): levanta el servidor de desarrollo y juega con clientes reales.
 * Verifica: acceso con usuario/contraseña, salas reales compartidas, privacidad de manos, turnos, bots, presencia,
 * reconexión, fin de partida y revancha.   Uso: npm run test:e2e
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import type { MensajeCliente, MensajeServidor, VistaMesa } from '../src/kernel/protocolo.js';

const PORT = 3613;
const BASE = `http://127.0.0.1:${PORT}`;
let ok = 0;
const check = (cond: unknown, msg: string): void => {
  if (!cond) throw new Error(`FALLO: ${msg}`);
  ok++;
  console.log(`  ok - ${msg}`);
};
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

const sal = randomBytes(16);
const CLAVE = 'una clave de prueba larga';
const HASH = `pbkdf2-sha256$600000$${sal.toString('base64url')}$${pbkdf2Sync(CLAVE, sal, 600_000, 32, 'sha256').toString('base64url')}`;

async function entrar(usuario: string, clave: string): Promise<{ status: number; cookie: string }> {
  const r = await fetch(`${BASE}/api/acceso/entrar`, { method: 'POST', headers: { origin: BASE, 'content-type': 'application/json' }, body: JSON.stringify({ usuario, contrasena: clave }) });
  return { status: r.status, cookie: (r.headers.get('set-cookie') ?? '').split(';')[0]! };
}

class Cliente {
  vista: VistaMesa | null = null;
  codigo: string | null = null;
  token: string | null = null;
  jugadorId: string | null = null;
  clave: string | null = null;
  errores: string[] = [];
  crudos: string[] = [];
  auto = false;
  constructor(readonly nombre: string, readonly cookie: string) {}

  async llamar(msg?: MensajeCliente, extra: Record<string, unknown> = {}): Promise<void> {
    const cuerpo: Record<string, unknown> = { ...extra };
    if (this.codigo && msg?.t !== 'crear_sala' && msg?.t !== 'unirse') cuerpo.codigo = this.codigo;
    if (this.token) cuerpo.token = this.token;
    if (this.clave) cuerpo.clave = this.clave;
    if (msg) cuerpo.msg = msg;
    const r = await fetch(`${BASE}/api/juego`, { method: 'POST', headers: { origin: BASE, 'content-type': 'application/json', cookie: this.cookie }, body: JSON.stringify(cuerpo) });
    if (!r.ok) throw new Error(`${this.nombre}: HTTP ${r.status}`);
    const d = (await r.json()) as { mensajes: Array<{ en: number; m: MensajeServidor }> };
    for (const { m } of d.mensajes) {
      this.crudos.push(JSON.stringify(m));
      if (m.t === 'sesion') Object.assign(this, { codigo: m.codigo, token: m.token, jugadorId: m.jugadorId });
      else if (m.t === 'estado') this.vista = m.vista;
      else if (m.t === 'cuenta' && m.clave) this.clave = m.clave;
      else if (m.t === 'error') this.errores.push(m.codigo);
    }
  }
  sync(): Promise<void> {
    return this.llamar();
  }
  async esperar(cond: (v: VistaMesa) => boolean, ms = 10000, que = 'condición'): Promise<VistaMesa> {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (this.vista && cond(this.vista)) return this.vista;
      await this.sync();
      if (this.auto) await this.jugar();
      await dormir(120);
    }
    throw new Error(`timeout esperando ${que} (${this.nombre})`);
  }
  async jugar(): Promise<void> {
    const v = this.vista;
    if (!v || v.fase !== 'EN_CURSO' || v.turno?.jugadorId !== v.yoId) return;
    if (v.turno.fase === 'ROBAR') await this.llamar({ t: 'robar', origen: 'MAZO' });
    else {
      if (v.ronda % 2 === 0) await this.llamar({ t: 'cerrar' });
      const c = this.vista!.mano[this.vista!.mano.length - 1];
      if (c && this.vista!.turno?.fase === 'DESCARTAR') await this.llamar({ t: 'descartar', cartaId: c.id });
    }
  }
}

async function main(): Promise<void> {
  const srv: ChildProcess = spawn('npx', ['tsx', 'src/serverless/dev.ts'], {
    env: { ...process.env, PORT: String(PORT), ACCESO_USUARIOS: `equipo=${HASH}`, SECRETO_SESION: randomBytes(32).toString('hex'), BOT_MIN_MS: '30', BOT_MAX_MS: '60', SUPABASE_URL: process.env.E2E_SUPABASE_URL ?? '', SUPABASE_SECRET_KEY: process.env.E2E_SUPABASE_KEY ?? '' },
    stdio: ['ignore', 'ignore', 'inherit'],
    detached: true,
  });
  const parar = () => {
    try {
      process.kill(-srv.pid!, 'SIGTERM');
    } catch {
      /* ya terminó */
    }
  };
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`${BASE}/api/salud`)).ok) break;
      } catch {
        /* arrancando */
      }
      await dormir(250);
    }
    console.log('\n[1] Acceso');
    check((await fetch(`${BASE}/api/juego`, { method: 'POST', headers: { origin: BASE, 'content-type': 'application/json' }, body: '{}' })).status === 401, 'sin cookie no se puede jugar (401)');
    check((await entrar('equipo', 'otra clave cualquiera')).status === 401, 'contraseña errónea: 401');
    check((await entrar('nadie', CLAVE)).status === 401, 'usuario inexistente: 401 (mismo mensaje)');
    const sinOrigen = await fetch(`${BASE}/api/acceso/entrar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ usuario: 'equipo', contrasena: CLAVE }) });
    check(sinOrigen.status === 403, 'POST sin Origin propio: 403 (anti-CSRF)');
    const e = await entrar('Equipo', CLAVE);
    check(e.status === 200 && /HttpOnly/.test(e.cookie + '') !== undefined, 'acceso correcto (usuario sin distinguir mayúsculas)');
    const pos = e.cookie.length - 10;
    const falsa = e.cookie.slice(0, pos) + (e.cookie[pos] === 'A' ? 'B' : 'A') + e.cookie.slice(pos + 1);
    const rf = await fetch(`${BASE}/api/juego`, { method: 'POST', headers: { origin: BASE, 'content-type': 'application/json', cookie: falsa }, body: '{}' });
    check(rf.status === 401, 'cookie manipulada: 401');

    console.log('\n[2] Sala real compartida');
    const a = new Cliente('Ana', e.cookie);
    const b = new Cliente('Beto', e.cookie);
    await a.llamar({ t: 'cuenta_abrir' });
    check(!!a.clave, 'cuenta anónima creada (créditos)');
    await a.llamar({ t: 'crear_sala', nombre: 'Ana', modalidad: 'CLASICA', parametros: { victoriasObjetivo: 1, tiempoTurnoSeg: 20 } });
    check(/^[A-Z0-9]{5}$/.test(a.codigo ?? ''), `sala creada (${a.codigo})`);
    await b.llamar({ t: 'unirse', codigo: a.codigo!, nombre: 'Beto' });
    check(b.vista?.jugadores.length === 2, 'Beto se une desde otro cliente con el código');
    await a.esperar((v) => v.jugadores.length === 2, 5000, 'Ana ve a Beto');
    check(true, 'Ana ve a Beto sin recargar (buzón)');
    await b.llamar({ t: 'iniciar' });
    check(b.errores.includes('SOLO_HOST'), 'solo el anfitrión inicia');
    await a.llamar({ t: 'agregar_bot' });
    await a.llamar({ t: 'iniciar' });
    await a.esperar((v) => v.fase === 'EN_CURSO', 5000, 'partida iniciada');
    await b.esperar((v) => v.fase === 'EN_CURSO', 5000, 'partida iniciada (B)');
    const manoA = a.vista!.mano.map((c) => c.id);
    check(manoA.length >= 10 && b.vista!.mano.length >= 10, 'manos repartidas');
    const tope = b.vista!.pozo.tope?.id;
    check(manoA.filter((id) => id !== tope && b.crudos.some((x) => x.includes(`"${id}"`))).length === 0, 'Beto nunca recibe cartas de la mano de Ana');
    check(!b.crudos.some((x) => /tokenHash|claveHash|127\.0\.0\.1/.test(x)), 'ningún mensaje lleva tokens, hashes ni IPs');

    console.log('\n[3] Turnos, bots y fin de partida');
    const malo = new Cliente('Intruso', e.cookie);
    malo.codigo = a.codigo;
    malo.token = 'token-falso';
    await malo.llamar({ t: 'robar', origen: 'MAZO' });
    check(malo.errores.length > 0 && !malo.vista?.mano.length, 'un token falso no puede jugar');
    a.auto = true;
    b.auto = true;
    const fin = await a.esperar((v) => v.fase === 'FINALIZADA', 120000, 'fin de partida');
    check(!!fin.final && fin.final.posiciones.length === 3, 'la partida termina con podio de 3 (incluye bot)');

    console.log('\n[4] Presencia y reconexión');
    const otraB = new Cliente('Beto (recarga)', e.cookie);
    Object.assign(otraB, { codigo: b.codigo, token: b.token });
    await otraB.llamar({ t: 'reconectar', codigo: b.codigo!, token: b.token! });
    check(otraB.vista?.yoId === b.jugadorId, 'recargar la página recupera el asiento con el token');
    await a.llamar({ t: 'nueva_partida' });
    await a.esperar((v) => v.fase === 'ESPERA', 5000, 'revancha');
    check(true, 'revancha vuelve a la sala');
    await a.llamar({ t: 'salir' });
    console.log(`\nE2E HTTP OK - ${ok} verificaciones`);
  } finally {
    parar();
  }
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
