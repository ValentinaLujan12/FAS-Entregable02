// Captura pantallas del cliente (inicio, sala, mesa, liquidación...) con Chromium headless -> docs/mockups/*.png
// Uso: npm run build && node tools/capturas.mjs   (levanta su propio servidor de desarrollo en el puerto 3111)
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 3111;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = fileURLToPath(new URL('../docs/mockups/', import.meta.url));
mkdirSync(OUT, { recursive: true });

/** Levanta el servidor de desarrollo (el mismo código que corre en Vercel) en su propio grupo de procesos. */
const arrancar = (puerto, extra = {}) => spawn('npx', ['tsx', 'src/serverless/dev.ts'], {
  env: { ...process.env, PORT: String(puerto), ACCESO_USUARIOS: '', SECRETO_SESION: '', SUPABASE_URL: '', SUPABASE_SECRET_KEY: '', ...extra },
  stdio: ['ignore', 'ignore', 'inherit'],
  detached: true,
});
const parar = (p) => { try { process.kill(-p.pid, 'SIGTERM'); } catch { /* ya terminó */ } };
/** Pantalla de acceso: usuario y contraseña de desarrollo (los define dev.ts si no hay ACCESO_USUARIOS). */
const entrarAcceso = async (pg) => {
  await pg.waitForSelector('#in-usuario');
  await pg.fill('#in-usuario', 'prueba');
  await pg.fill('#in-contrasena', 'prueba-local-123');
  await pg.click('#btn-entrar');
  await pg.waitForSelector('#in-nombre');
};

const srv = arrancar(PORT, { BOT_MIN_MS: '700', BOT_MAX_MS: '1100' });
const esperar = async () => {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/api/salud`)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('servidor no arrancó');
};



try {
  await esperar();
  const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
  page.on('pageerror', (e) => errores.push(String(e)));
  const foto = async (n) => { await page.screenshot({ path: `${OUT}${n}.png` }); console.log('captura', n); };

  await page.goto(BASE);
  await page.waitForSelector('#in-usuario');
  await page.waitForTimeout(1200);
  await foto('00_acceso');
  await entrarAcceso(page);
  await page.waitForSelector('#in-nombre');
  await page.waitForTimeout(1200);
  await foto('01_inicio');
  await page.fill('#in-nombre', 'Luis');
  await page.click('#btn-crear');
  await page.waitForSelector('#codigo-sala');
  for (let i = 0; i < 3; i++) { await page.click('#btn-bot'); await page.waitForTimeout(150); }
  await page.waitForTimeout(500);
  await foto('02_sala');
  await page.click('#btn-iniciar');
  await page.waitForSelector('.capa-cartas .carta.mia');
  await page.waitForTimeout(2600);
  await foto('03_mesa_reparto');
  // esperar mi turno
  await page.waitForFunction(() => document.querySelector('#hint')?.classList.contains('mio'), null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await foto('04_mesa_mi_turno');
  console.log('errores de consola:', errores.length ? errores : 'ninguno');
  await browser.close();
} finally {
  parar(srv);
}
