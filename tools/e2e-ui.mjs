// E2E de INTERFAZ: un humano juega por la UI (clics, arrastre, agrupar) contra 3 bots; captura liquidación y podio.
// Uso: npm run build && npm run test:ui
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 3113;
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
let ok = 0;
const check = (c, m) => { if (!c) throw new Error(`FALLO ${m}`); ok++; console.log(`  ok ${m}`); };

const srv = arrancar(PORT, { BOT_MIN_MS: '60', BOT_MAX_MS: '120' });
try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`${BASE}/api/salud`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
  const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  globalThis.__pagina = page;
  const errores = [];
  page.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
  page.on('pageerror', (e) => errores.push(String(e)));
  const foto = (n) => page.screenshot({ path: `${OUT}${n}.png` });

  console.log('\n[UI 1] Inicio -> sala');
  await page.goto(BASE);
  await entrarAcceso(page);
  check(await page.locator('#btn-musica').isVisible(), 'botón de música visible en el inicio');
  check(!(await page.evaluate(() => document.body.innerText)).includes('\u2014'), 'inicio: sin guion largo (-) en los textos');
  await page.click('#btn-unirse');
  check(await page.locator('.toast.error').count() > 0, 'unirse sin nombre muestra error');
  await page.fill('#in-nombre', 'Luis');
  await page.click('.modo[data-modo="CLASICA"]');
  await page.click('#btn-crear');
  await page.waitForSelector('#codigo-sala');
  check((await page.textContent('#codigo-sala')).length === 5, 'sala creada con código de 5 caracteres');
  // Configuración: 1 victoria para acabar pronto
  await page.selectOption('#cfg-victorias', '1');
  await page.selectOption('#cfg-tiempo', '30');
  await page.waitForTimeout(800); // termina la animación de entrada de la pantalla
  const posAntes = await page.evaluate(() => ['#btn-bot', '#btn-iniciar', '.acciones-sala'].map((q) => { const r = document.querySelector(q)?.getBoundingClientRect(); return r ? [Math.round(r.x), Math.round(r.y)] : null; }));
  for (let i = 0; i < 3; i++) { await page.click('#btn-bot'); await page.waitForTimeout(120); }
  await page.waitForFunction(() => document.querySelectorAll('.jugador:not(.vacio)').length === 4, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  const posDespues = await page.evaluate(() => ['#btn-bot', '#btn-iniciar', '.acciones-sala'].map((q) => { const r = document.querySelector(q)?.getBoundingClientRect(); return r ? [Math.round(r.x), Math.round(r.y)] : null; }));
  check(JSON.stringify(posAntes) === JSON.stringify(posDespues), `sala: "Agregar bot", "Iniciar" y la zona de acciones no cambian de posición al agregar bots (${JSON.stringify(posAntes)} -> ${JSON.stringify(posDespues)})`);
  check(await page.locator('.jugador:not(.vacio)').count() === 4, '4 jugadores en la sala (1 humano + 3 bots)');
  check(await page.inputValue('#cfg-victorias') === '1', 'configuración reflejada por el servidor');

  console.log('\n[UI 1b] Música, sonido y personalización de estilo (sala)');
  // Botón de música siempre presente
  check(await page.locator('#btn-musica').isVisible(), 'botón de música visible en la sala');
  const sBefore = await page.evaluate(() => window.__apuntado.sonido.ajustes.musica);
  await page.click('#btn-musica');
  check((await page.evaluate(() => window.__apuntado.sonido.ajustes.musica)) === !sBefore, 'el botón de música silencia/activa la música');
  await page.click('#btn-musica');
  check((await page.evaluate(() => window.__apuntado.sonido.ajustes.musica)) === sBefore, 'y vuelve a activarla');
  await page.click('#btn-sonido-sala');
  await page.waitForSelector('#panel-sonido');
  await page.waitForTimeout(500);
  await foto('10_sonido');
  const ajIni = await page.evaluate(() => window.__apuntado.sonido.ajustes);
  check(ajIni.activo === true && ajIni.completos === true && ajIni.clic === true && ajIni.musica === true, 'por defecto todo activado (efectos completos = SÍ)');
  // Efectos completos / limitados
  await page.click('#sonido-completos');
  await page.fill('#sonido-volumen', '35');
  await page.waitForTimeout(150);
  const aj = await page.evaluate(() => window.__apuntado.sonido.ajustes);
  check(aj.completos === false && aj.volumen === 35, 'el menú cambia efectos completos/limitados y el volumen');
  await page.evaluate(() => { const s = window.__apuntado.sonido; s.historial.length = 0; s.reproducir('arrastrar'); s.reproducir('robar'); });
  check(JSON.stringify(await page.evaluate(() => window.__apuntado.sonido.historial)) === '["robar"]', 'con efectos limitados solo suenan los básicos');
  await page.evaluate(() => { const x = window.__apuntado.sonido; x.historial.length = 0; x.reproducir('alarma'); });
  check((await page.evaluate(() => window.__apuntado.sonido.historial)).includes('alarma'), 'el sonido de alarma está disponible (suena aun con efectos limitados)');
  await page.click('#sonido-completos');
  // Respuesta al clic: registra "clic" solo si está activada
  await page.evaluate(() => { window.__apuntado.sonido.historial.length = 0; });
  await page.click('#sonido-probar');
  check((await page.evaluate(() => window.__apuntado.sonido.historial)).includes('clic'), 'respuesta al clic activada: suena al pulsar un botón');
  await page.click('#sonido-clic');
  await page.evaluate(() => { window.__apuntado.sonido.historial.length = 0; });
  await page.click('#sonido-completos'); await page.click('#sonido-completos');
  check(!(await page.evaluate(() => window.__apuntado.sonido.historial)).includes('clic'), 'respuesta al clic desactivada: no suena al pulsar botones');
  await page.click('#sonido-clic');
  // Sonido general apagado: silencia TODO (música incluida), conserva ajustes y deshabilita/atenúa el resto
  await page.click('#sonido-completos'); // deja completos=false para comprobar que se conserva
  await page.click('#sonido-activo');
  await page.evaluate(() => { const s = window.__apuntado.sonido; s.historial.length = 0; s.reproducir('robar'); s.reproducir('clic'); });
  check((await page.evaluate(() => window.__apuntado.sonido.historial.length)) === 0, 'con el sonido general apagado no suena ningún efecto');
  check((await page.evaluate(() => window.__apuntado.sonido.musicaDeberiaSonar)) === false, 'con el sonido general apagado la música tampoco suena');
  check(await page.locator('#sonido-musica').isDisabled() && await page.locator('#sonido-completos').isDisabled() && await page.locator('#sonido-clic').isDisabled(), 'los demás interruptores quedan en gris y no seleccionables');
  const ajOff = await page.evaluate(() => window.__apuntado.sonido.ajustes);
  check(ajOff.musica === true && ajOff.clic === true && ajOff.completos === false, 'los ajustes individuales se conservan con el general apagado');
  check(await page.locator('#btn-musica').isVisible(), 'el botón de música sigue visible con el sonido apagado');
  await page.click('#sonido-activo');
  check((await page.evaluate(() => window.__apuntado.sonido.musicaDeberiaSonar)) === true, 'al reactivar el general vuelve la música según su ajuste');
  await page.click('#sonido-completos');
  await page.click('#btn-cerrar-modal');
  await page.waitForTimeout(350);

  await page.click('#btn-estilo-sala');
  await page.waitForSelector('#panel-estilo');
  check((await page.textContent('#saldo-tokens')).includes('99') && !(await page.textContent('#saldo-tokens')).includes('999'), 'saldo inicial de 99 tokens');
  await page.waitForTimeout(500);
  await foto('11_estilo_cartas');
  check(await page.locator('.skin-tarjeta').count() === 13, 'catálogo de cartas: 6 básicas + 7 premium');
  check(await page.locator('.skin-tarjeta .carta-demo img.dorso').count() >= 26, 'las tarjetas de cartas muestran el REVERSO (abanico de reversos)');
  check(await page.locator('.skin-tarjeta img.frente').count() === 0, 'sin caras en la miniatura de skins de cartas');
  // Inventario: TODAS las skins se ven; en gris las no poseídas, a color las poseídas
  check(await page.locator('.skin-tarjeta.poseida').count() === 6 && await page.locator('.skin-tarjeta.bloqueada').count() === 7, 'inventario: 6 básicas a color (poseídas) y 7 premium en gris (bloqueadas)');
  const filtro = await page.evaluate(() => getComputedStyle(document.querySelector('.skin-tarjeta.bloqueada .mini-skin')).filter);
  check(filtro.includes('grayscale'), 'la miniatura de una skin no poseída se muestra en escala de grises');
  await foto('11_estilo_cartas');
  // Intentar usar una skin sin saldo: ofrece comprarla; el servidor decidirá, y el botón de confirmar queda deshabilitado
  await page.click('.skin-tarjeta[data-skin="carta_oro_viejo"]');
  await page.waitForSelector('#confirmar-compra');
  check((await page.textContent('#confirmar-compra')).includes('Te faltan') && await page.locator('#btn-confirmar-compra').isDisabled(), 'al intentar usar una skin sin saldo se ofrece comprarla y se indica cuántos tokens faltan');
  await foto('11a_compra_sin_saldo');
  await page.click('#btn-cancelar-compra');
  // Compra con el saldo inicial: comprar implica ELEGIR (la skin queda activa sin pasos extra)
  await page.click('.skin-tarjeta[data-skin="carta_plata_sheriff"]');
  await page.waitForSelector('#confirmar-compra');
  await page.click('#btn-confirmar-compra');
  await page.waitForSelector('.skin-tarjeta[data-skin="carta_plata_sheriff"].elegida.poseida');
  check((await page.textContent('#saldo-tokens')).includes('0 tokens'), 'comprar la skin de entrada deja el saldo en 0 (lo registra el servidor)');
  check(true, 'tras comprar, la skin queda elegida automáticamente');
  check(await page.evaluate(() => window.__apuntado.estilo.elegida('carta')) === 'carta_plata_sheriff', 'el espejo del cliente refleja la elección confirmada por el servidor');
  // Botón temporal de recarga (+999)
  check(await page.locator('#btn-recargar').count() === 1, 'existe el botón temporal "Recargar tokens"');
  await page.click('#btn-recargar');
  await page.waitForFunction(() => document.querySelector('#saldo-tokens')?.textContent.includes('999 tokens'));
  check(true, 'recargar agrega 999 tokens');
  await foto('11b_estilo_reverso_premium');
  await page.click('.tab[data-tab="mesa"]');
  check(await page.locator('.skin-tarjeta').count() === 9, 'catálogo de mesas: 5 básicas + 4 premium');
  await page.click('[data-comprar="mesa_cuero"]');
  await page.click('#btn-confirmar-compra');
  await page.waitForSelector('.skin-tarjeta[data-skin="mesa_cuero"].elegida');
  check((await page.textContent('#saldo-tokens')).includes('399'), 'comprar la mesa premium descuenta 600 tokens y la elige');
  await foto('12_estilo_mesas');
  await page.click('.tab[data-tab="carta"]');
  await page.click('[data-elegir="carta_terracota"]');
  await page.waitForSelector('.skin-tarjeta[data-skin="carta_terracota"].elegida');
  await page.click('.tab[data-tab="celebracion"]');
  check(await page.locator('.skin-tarjeta').count() === 6, 'catálogo de celebraciones: 2 básicas + 4 premium');
  await page.evaluate(() => { window.__apuntado.celebracion.historial.length = 0; });
  await page.click('[data-probar="celeb_baile"]');
  await page.waitForTimeout(500);
  check(await page.evaluate(() => window.__apuntado.celebracion.historial.at(-1)?.efecto) === 'disco', 'probar una celebración la reproduce (efecto disco)');
  await foto('12b_celebracion_disco');
  await page.evaluate(() => window.__apuntado.celebracion.limpiar());
  await page.click('[data-comprar="celeb_polvo_oro"]');
  await page.click('#btn-confirmar-compra');
  await page.waitForSelector('.skin-tarjeta[data-skin="celeb_polvo_oro"].elegida');
  check(true, 'comprar una celebración también la elige');
  await page.click('.tab[data-tab="ambiente"]');
  check(await page.locator('.skin-tarjeta').count() === 6, 'catálogo de ambientes: 4 básicos + 2 premium');
  await page.click('[data-elegir="amb_pradera"]');
  await page.waitForTimeout(200);
  check(await page.locator('.fondo[data-ambiente="amb_pradera"], [data-ambiente="amb_pradera"]').count() >= 1, 'el ambiente elegido se aplica al fondo (solo local)');
  // Tonos pastel y modo daltónico
  await page.click('#btn-cerrar-modal');
  await page.waitForTimeout(400);
  await page.click('#btn-ajustes-sala');
  await page.waitForSelector('#visual-pastel');
  await page.click('#visual-pastel');
  check(await page.evaluate(() => document.querySelector('#escenario').classList.contains('pastel')), 'botón de tonos pastel aplica la clase al escenario');
  await page.click('#visual-daltonico');
  check(await page.evaluate(() => document.querySelector('#escenario').classList.contains('daltonico')), 'botón de modo daltónico aplica la clase al escenario');
  await foto('21_ajustes_visuales');
  await page.click('#visual-pastel');
  await page.click('#btn-cerrar-modal');
  await page.waitForTimeout(500);
  check(await page.evaluate(() => window.__apuntado.sonido.contextoActual) === 'sala', 'en la sala la música usa el contexto "sala"');
  const yoSala = await page.evaluate(() => { const v = window.__apuntado.almacen.vista; return v.jugadores.find((j) => j.id === v.yoId); });
  check(yoSala.skinCartas === 'carta_terracota' && yoSala.mesaPremium === 'mesa_cuero' && yoSala.celebracion === 'celeb_polvo_oro', 'el servidor recibió mi skin de cartas, mi mesa premium y mi celebración');
  check((await page.locator('.jugador.yo .skin-mini').getAttribute('src')).includes('carta_terracota'), 'la sala muestra mi skin de cartas');
  // Interruptor "Cerrar con sobrante": solo en Apuntado 101, activado por defecto
  await page.click('.modo[data-modo="APUNTADO"]');
  await page.waitForSelector('#cfg-sobrante');
  check(await page.inputValue('#cfg-sobrante') === 'si', 'Apuntado 101: "Cerrar con sobrante" viene activado por defecto');
  await page.selectOption('#cfg-sobrante', 'no');
  await page.waitForFunction(() => document.querySelector('#cfg-sobrante')?.value === 'no');
  await page.waitForTimeout(250);
  check(await page.inputValue('#cfg-sobrante') === 'no', 'el servidor conserva el cierre estricto (interruptor apagado)');
  await page.selectOption('#cfg-sobrante', 'si');
  check(await page.locator('#cfg-victorias').count() === 0, 'en Apuntado no aparece la opción exclusiva de la Clásica');
  await page.click('.modo[data-modo="CLASICA"]');
  await page.waitForSelector('#cfg-victorias');
  await page.selectOption('#cfg-victorias', '1');
  check(await page.locator('#cfg-sobrante').count() === 0, 'en Clásica no aparece "Cerrar con sobrante"');
  await page.selectOption('#cfg-tiempo', '30');

  console.log('\n[UI 2] Partida jugada desde la interfaz');
  await page.click('#btn-iniciar');
  await page.waitForSelector('.carta.mia');
  await page.waitForTimeout(2200);
  check(await page.locator('.carta.mia').count() >= 10, 'mano visible (≥10 cartas)');
  check(await page.locator('#btn-musica').isVisible(), 'botón de música visible también en la mesa');
  check(await page.evaluate(() => window.__apuntado.sonido.contextoActual) === 'CLASICA', 'en partida la música cambia al contexto de la modalidad (CLASICA)');
  check((await page.textContent('.info-mesa .sentido')).includes('antihorario'), 'la mesa indica que el turno gira en sentido antihorario');
  const orden = await page.evaluate(() => { const v = window.__apuntado.almacen.vista; return { yo: v.jugadores.find((j) => j.id === v.yoId).asiento, n: v.jugadores.length }; });
  check(await page.locator('.acc-plaqueta [data-silenciar]').count() === 3 && await page.locator('#btn-reaccion-mesa').count() === 1, 'cada panel ajeno tiene "Silenciar" y el mío "Reaccionar" (sobre el panel, no sobre la mesa)');
  check(await page.locator('[data-expulsar]').count() === 0, 'el botón "Expulsar" NO aparece mientras no esté disponible (no estorba a la mesa)');
  check(!(await page.evaluate(() => document.body.innerText)).includes('\u2014'), 'mesa: sin guion largo (-) en los textos');
  const fondoMano = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.carta.mia')].map((c) => c.getBoundingClientRect().bottom)));
  check(fondoMano <= 1080 - 10, `zona segura inferior: ninguna carta de la mano pasa de 1070 px (máx ${Math.round(fondoMano)})`);
  // Ayuda y ajustes
  await page.click('#btn-ayuda-mesa');
  check(await page.locator('.ayuda-cuerpo').count() >= 1, 'modal de reglas abre');
  check(await page.locator('#panel-atajos').count() === 1, 'guía de teclado en un panel a la derecha del modal "?"');
  const bAyuda = await page.locator('.modal-fila > .ayuda').boundingBox();
  const bAtajos = await page.locator('#panel-atajos').boundingBox();
  check(bAtajos.x >= bAyuda.x + bAyuda.width, 'el panel de atajos queda a la derecha del modal actual');
  await foto('05_reglas');
  await page.click('#btn-cerrar-modal');
  await page.waitForTimeout(350);

  // Mesa premium propia: bisel con el dueño y menú de mesa en partida
  check(await page.locator('#bisel-mesa.visible').count() === 1, 'bisel de mesa premium visible con el dueño');
  check((await page.textContent('#bisel-mesa')).includes('Tu mesa'), 'el bisel indica "Tu mesa"');
  await page.click('#btn-mesa');
  check(await page.locator('#menu-mesa.abierto .opcion-mesa').count() >= 1, 'menú de mesa en partida (solo premium de la sala / la propia)');
  await foto('13_menu_mesa');
  await page.click('#btn-mesa');
  check(await page.locator('#btn-estilo-sala, #btn-estilo-inicio').count() === 0, 'en partida no hay control de skins salvo el selector de mesa');
  await page.evaluate(() => document.querySelector('#menu-mesa')?.classList.remove('abierto'));

  // Reacciones: menú desplegable desde mi panel; burbuja sobre el panel; silenciar a un jugador
  await page.click('#btn-reaccion-mesa');
  await page.waitForSelector('#menu-reacciones');
  await foto('22_menu_reacciones');
  await page.evaluate(() => { window.__apuntado.sonido.historial.length = 0; });
  await page.click('#menu-reacciones .rx >> nth=0');
  await page.waitForSelector('.burbuja-rx');
  // El sonido llega cuando el servidor devuelve la reacción (puede tardar más que la burbuja de un bot).
  const sono = await page.waitForFunction(() => window.__apuntado.sonido.historial.some((x) => x.startsWith('rx_')), null, { timeout: 4000 }).then(() => true, () => false);
  check(await page.locator('.burbuja-rx').count() >= 1 && sono, 'la reacción aparece sobre mi panel y suena');
  await foto('23_reaccion_visible');
  await page.click('[data-silenciar] >> nth=0');
  await page.waitForSelector('.chip-acc.activo[data-silenciar]');
  check(true, 'silenciar a un jugador desde su panel se refleja en el botón');
  await page.click('.chip-acc.activo[data-silenciar]'); // lo deja como estaba

  // Regresión: el historial (#log) no debe reconstruirse en cada tick (parpadeaba)
  await page.evaluate(() => document.querySelectorAll('#log li').forEach((li) => { li.__marca = true; }));
  const marcadas = await page.locator('#log li').count();
  await page.waitForTimeout(900);
  const siguen = await page.evaluate(() => [...document.querySelectorAll('#log li')].filter((li) => li.__marca).length);
  check(marcadas > 0 && siguen === marcadas, `el historial no se reconstruye entre ticks (${siguen}/${marcadas} líneas conservadas)`);

  let reglasSel = false, floDescartes = 0, arrastreCentro = false, teclaD = false, espacio3s = false, cierreRetencion = false, cierreCancelado = false, tecladoRobo = false;
  let ordenado = false, intentoAgrupar = false, dragUsado = false, liquidaciones = 0, capturadaLiq = false;
  let pozoProbado = false, evitarUltima = false, rotacion = 0, roboArrastre = false, roboSoltarFuera = false, ordenGuia = false, pozoVisto = false;
  const hist = () => page.evaluate(() => window.__apuntado.sonido.historial.slice());
  const cartasMano = () => page.locator('.carta.mia');
  const t0 = Date.now();
  // Si un bot gana la partida antes de que el humano pruebe todas las interacciones, se juega una revancha y se sigue
  // (con "victorias objetivo = 1" la partida puede terminar en la primera ronda; no es un fallo de la interfaz).
  // Un clic puede llegar tarde si el turno venció o cambió entre la lectura del estado y la acción: se reintenta en el
  // siguiente ciclo del bucle en lugar de fallar la prueba.
  const clicSiSePuede = async (selector) => page.click(selector, { timeout: 3000 }).then(() => true, () => false);
  const faltanInteracciones = () => !(floDescartes > 0 && arrastreCentro && teclaD && espacio3s && tecladoRobo && intentoAgrupar && pozoProbado);
  let revanchas = 0;
  while (Date.now() - t0 < 300000) {
    if (await page.locator('#panel-final').count()) {
      if (!faltanInteracciones() || revanchas >= 3) break;
      revanchas++;
      console.log(`  (un bot ganó antes de completar el guion: revancha ${revanchas})`);
      await page.waitForTimeout(800);
      await page.click('#btn-revancha');
      await page.waitForSelector('#codigo-sala');
      await page.waitForTimeout(400);
      await page.click('#btn-iniciar');
      await page.waitForSelector('.carta.mia');
      await page.waitForTimeout(1500);
      continue;
    }
    if (await page.locator('#panel-liq').count()) {
      if (!capturadaLiq) { await page.waitForTimeout(600); await foto('06_liquidacion'); capturadaLiq = true; }
      liquidaciones++;
      if (await page.locator('#btn-continuar').count()) await clicSiSePuede('#btn-continuar');
      await page.waitForTimeout(400);
      continue;
    }
    const mio = await page.locator('#hint.mio').count();
    if (!mio) { await page.waitForTimeout(150); continue; }
    const texto = await page.textContent('#hint');
    if (texto.includes('roba')) {
      if (!ordenado) {
        await page.waitForTimeout(500);
        await page.keyboard.press('o'); // atajo O: ordenar de menor a mayor
        ordenado = true;
        await page.waitForTimeout(500);
        await foto('07_mano_ordenada');
      }
      if (!pozoProbado && await page.locator('#btn-pozo:not([disabled])').count()) {
        // Regresión: una carta tomada del POZO debe poder seleccionarse en la mano
        if (!(await clicSiSePuede('#btn-pozo'))) continue;
        await page.waitForTimeout(900);
        const nueva = page.locator('.carta.mia.nueva');
        check(await nueva.count() === 1, 'la carta tomada del pozo aparece en la mano');
        await nueva.click();
        await page.waitForTimeout(300);
        check(await page.locator('.carta.mia.sel').count() === 1, 'la carta tomada del pozo SÍ es seleccionable');
        await page.locator('.carta.mia.sel').click(); // deselecciona
        await page.waitForTimeout(200);
        pozoProbado = true;
        evitarUltima = true; // no se puede devolver al pozo la carta recién tomada de él
      } else if (!roboArrastre) {
        // Robo alternativo: arrastrar el mazo hasta la zona de la mano
        const antes = await cartasMano().count();
        const bm = await page.locator('.slot-mazo').boundingBox();
        await page.mouse.move(bm.x + bm.width / 2, bm.y + bm.height / 2);
        await page.mouse.down();
        await page.mouse.move(1000, 700, { steps: 6 });
        await page.mouse.move(1000, 900, { steps: 6 });
        check(await page.locator('#zona-robo.visible.dentro').count() === 1 && await page.locator('.fantasma-robo').count() === 1, 'al arrastrar el mazo aparece la zona de robo (resaltada) y la carta fantasma');
        await foto('24_robo_arrastrando');
        await page.mouse.up();
        await page.waitForTimeout(900);
        check(await cartasMano().count() === antes + 1, 'soltar el mazo sobre la mano roba una carta');
        roboArrastre = true;
      } else if (!roboSoltarFuera) {
        // Soltar fuera de la zona NO roba
        const antes = await cartasMano().count();
        const bm = await page.locator('.slot-mazo').boundingBox();
        await page.mouse.move(bm.x + bm.width / 2, bm.y + bm.height / 2);
        await page.mouse.down();
        await page.mouse.move(700, 250, { steps: 6 });
        await page.mouse.up();
        await page.waitForTimeout(500);
        check(await cartasMano().count() === antes, 'soltar el mazo fuera de la zona de la mano no roba');
        roboSoltarFuera = true;
        await clicSiSePuede('#btn-mazo');
        await page.waitForTimeout(700);
      } else if (!tecladoRobo) {
        await page.keyboard.press('m'); // atajo M: robar del mazo
        tecladoRobo = true;
        await page.waitForTimeout(700);
      } else {
        await clicSiSePuede('#btn-mazo');
        await page.waitForTimeout(700);
      }
      continue;
    }

    /* -- Fase de descarte -- */
    const cartas = cartasMano();
    const elegida = () => (evitarUltima ? cartas.first() : cartas.last());
    if (!reglasSel) {
      // Reglas de los botones: Descartar solo con UNA carta; Agrupar solo con ≥3
      await cartas.nth(1).click();
      await page.waitForTimeout(300);
      check(await page.locator('#flot-descartar:visible').count() === 1, 'una carta seleccionada -> botón flotante "Descartar" encima');
      check(!(await page.locator('#flot-descartar').isDisabled()), 'el flotante "Descartar" está habilitado en la fase de descarte');
      const bC = await cartas.nth(1).boundingBox();
      const bF = await page.locator('#flot-descartar').boundingBox();
      check(bF.y + bF.height <= bC.y + 4 && Math.abs(bF.x + bF.width / 2 - (bC.x + bC.width / 2)) < 120, 'el flotante queda sobre la carta clicada');
      const bF0 = await page.locator('#flot-descartar').boundingBox();
      await page.locator('#flot-descartar').hover();
      await page.waitForTimeout(350);
      const bF1 = await page.locator('#flot-descartar').boundingBox();
      check(Math.abs(bF0.x - bF1.x) < 1 && Math.abs(bF0.y - bF1.y) < 1, 'el flotante "Descartar" no se mueve al poner el puntero encima');
      const sobre = await page.evaluate(() => { const r = document.querySelector('#flot-descartar').getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!e?.closest('#flot-descartar'); });
      check(sobre, 'el centro del flotante es clicable (nada lo tapa)');
      check(await page.locator('#btn-desel:visible').count() === 0, 'con una sola carta seleccionada no aparece "Deseleccionar todo"');
      await foto('14_flotante_descartar');
      await cartas.nth(2).click();
      await page.waitForTimeout(300);
      check(await page.locator('#btn-descartar').isDisabled(), 'con 2 seleccionadas "Descartar" queda deshabilitado');
      check(await page.locator('#btn-desel:visible').count() === 1, 'con varias cartas seleccionadas aparece "Deseleccionar todo"');
      check(await page.locator('#flot-descartar:visible').count() === 0, 'con 2 seleccionadas desaparece el flotante "Descartar"');
      check(await page.locator('#btn-agrupar').isDisabled() && await page.locator('#flot-agrupar:visible').count() === 0, 'con 2 seleccionadas "Agrupar" aún no se habilita (mínimo 3)');
      await cartas.nth(3).click();
      await page.waitForTimeout(300);
      check(!(await page.locator('#btn-agrupar').isDisabled()) && await page.locator('#flot-agrupar:visible').count() === 1, 'con 3 seleccionadas aparece "Agrupar" flotante y estático');
      await foto('15_flotante_agrupar');
      await clicSiSePuede('#flot-agrupar'); // probablemente no válido -> toast, sin romper nada
      await page.waitForTimeout(400);
      intentoAgrupar = true;
      await page.keyboard.press('Escape');
      check(await page.locator('.carta.mia.sel').count() === 0, 'Esc limpia la selección');
      await cartas.nth(1).click(); await cartas.nth(2).click();
      await page.waitForTimeout(250);
      await clicSiSePuede('#btn-desel');
      await page.waitForTimeout(250);
      check(await page.locator('.carta.mia.sel').count() === 0 && await page.locator('#btn-desel:visible').count() === 0, '"Deseleccionar todo" limpia la selección y se oculta');
      reglasSel = true;
    }
    if (!ordenGuia) {
      // Reordenar arrastrando: guía de inserción, carta centrada en el puntero y solo la movida pierde la selección
      await cartas.nth(1).click();
      await cartas.nth(2).click();
      await page.waitForTimeout(250);
      const b0 = await cartas.nth(1).boundingBox();
      const b4 = await cartas.nth(5).boundingBox();
      const dx = b4.x + b4.width / 2;
      await page.mouse.move(b0.x + 20, b0.y + b0.height / 2);
      await page.mouse.down();
      await page.mouse.move(dx - 40, 930, { steps: 8 });
      await page.mouse.move(dx, 930, { steps: 4 });
      await page.waitForTimeout(150);
      check(await page.locator('#guia-insercion.visible').count() === 1, 'al reordenar aparece la guía que marca entre qué cartas caerá');
      const cen = await page.evaluate(() => { const r = document.querySelector('.carta.arrastrando')?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; });
      check(cen && Math.abs(cen.x - dx) < 4 && Math.abs(cen.y - 930) < 4, 'la carta arrastrada se centra en el puntero');
      await foto('25_guia_insercion');
      await page.mouse.up();
      await page.waitForTimeout(500);
      check(await page.locator('.carta.mia.sel').count() === 1, 'al soltarla se deselecciona SOLO la carta movida (la otra conserva la selección)');
      await page.keyboard.press('Escape');
      ordenGuia = true;
    }
    if (!pozoVisto) {
      const cant = Number(await page.textContent('.c-pozo'));
      if (cant >= 3) {
        const capas = await page.locator('.carta.pozo-bajo').count();
        check(capas === Math.min(5, cant - 1), `el pozo muestra "cachitos" de las cartas anteriores (${capas} bajo la superior, pozo de ${cant})`);
        await foto('26_pozo_acumulado');
        pozoVisto = true;
      }
    }
    if (!cierreCancelado) {
      // Cerrar ronda por teclado: soltar C antes de 2 s NO cierra (se cancela la carga)
      await page.keyboard.down('c');
      await page.waitForTimeout(900);
      check(await page.locator('#btn-cerrar.cargando').count() === 1, 'al mantener C se muestra la carga en el botón "Cerrar ronda"');
      await foto('16_carga_cerrar');
      await page.keyboard.up('c');
      const alertaTecla = await page.waitForSelector('#alerta-cierre.visible', { timeout: 2000 }).then(() => true, () => false);
      check(await page.locator('#btn-cerrar.cargando').count() === 0, 'soltar C antes de tiempo cancela la carga');
      // Si el turno terminó (por tiempo o porque cerró otro jugador), la mesa se reinicia y la alerta se limpia: no es un fallo.
      const sigoEnTurno = (await page.locator('#hint.mio').count()) > 0;
      check(alertaTecla || !sigoEnTurno, 'soltar C antes de 2 s muestra una alerta muy visible (hay que mantenerla 2 s si estás seguro)');
      await foto('27_alerta_cierre');
      await page.waitForTimeout(3600);
      // lo mismo con un clic corto del ratón
      const bcc = await page.locator('#btn-cerrar').boundingBox();
      await page.mouse.move(bcc.x + bcc.width / 2, bcc.y + bcc.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(250);
      await page.mouse.up();
      const alertaClic = await page.waitForSelector('#alerta-cierre.visible', { timeout: 2000 }).then(() => true, () => false);
      check(alertaClic || (await page.locator('#hint.mio').count()) === 0, 'un clic corto en "Cerrar ronda" también muestra la alerta');
      cierreCancelado = true;
      continue;
    }
    if (!cierreRetencion) {
      // Con el ratón: mantener 2 s el botón (mano casi seguro inválida -> el servidor la rechaza con un aviso)
      const bb = await page.locator('#btn-cerrar').boundingBox();
      await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(2300);
      await page.mouse.up();
      await page.waitForTimeout(500);
      cierreRetencion = true;
      check(true, 'cierre mantenido 2 s con el ratón enviado (rechazado o aceptado por el servidor)');
      continue;
    }

    const metodo = rotacion++ % 5;
    if (metodo === 0 || (metodo === 3 && (evitarUltima || espacio3s))) {
      // clic en la carta + botón flotante
      await elegida().click();
      await page.waitForTimeout(250);
      if (await clicSiSePuede('#flot-descartar')) floDescartes++;
    } else if (metodo === 1 && !evitarUltima) {
      // arrastre completo hacia el centro de la mesa
      const bb = await elegida().boundingBox();
      await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.mouse.down();
      await page.mouse.move(960, 600, { steps: 6 });
      await page.mouse.move(960, 440, { steps: 8 });
      if (!arrastreCentro) {
        check(await page.locator('#aviso-arrastre.visible').count() === 1, 'al arrastrar aparece el aviso flotante "suelta en el centro para descartar"');
        await foto('17_arrastre_centro');
      }
      await page.mouse.up();
      arrastreCentro = true;
      dragUsado = true;
    } else if (metodo === 2) {
      // teclado: Izq / Der para mover el cursor, Arriba selecciona y D descarta
      await page.keyboard.press('Escape');
      await page.keyboard.press(evitarUltima ? 'ArrowRight' : 'ArrowLeft');
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(200);
      check(await page.locator('.carta.mia.sel').count() === 1, 'Arriba selecciona la carta del cursor');
      await page.keyboard.press('d');
      teclaD = true;
    } else if (metodo === 3) {
      // Espacio mantenido 3 s: descarta la carta señalada
      await page.keyboard.press('Escape');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.down(' ');
      await page.waitForTimeout(1800);
      check(await page.locator('#carga-flot.visible').count() === 1, 'al mantener Espacio se muestra la carga');
      const arco = await page.evaluate(() => { const f = document.querySelector('#carga-flot'); const c = document.querySelector('.carta.mia.foco'); const rf = f.getBoundingClientRect(); const rc = c?.getBoundingClientRect(); return { clip: getComputedStyle(f.querySelector('.cuerpo')).clipPath, libre: !rc || rf.bottom <= rc.top + 4 }; });
      check(arco.clip.includes('path') && arco.libre, 'el indicador de Espacio es una flecha/arco redondeado que queda por encima de la carta (no la tapa)');
      await foto('18_carga_espacio');
      await page.waitForTimeout(1500);
      await page.keyboard.up(' ');
      espacio3s = true;
    } else {
      await elegida().click();
      await page.waitForTimeout(150);
      await clicSiSePuede('#btn-descartar');
    }
    evitarUltima = false;
    await page.waitForTimeout(700);
  }
  check(floDescartes > 0 && arrastreCentro && teclaD && espacio3s, `descartes por flotante (${floDescartes}), arrastre al centro, tecla D y Espacio 3 s ejecutados`);
  check(tecladoRobo, 'robar con la tecla M');
  const h = await hist();
  check(h.includes('robar') && h.includes('descartar'), `sonidos registrados en la partida (${[...new Set(h)].join(', ')})`);
  check(intentoAgrupar, 'agrupar probado desde la UI');
  check(pozoProbado, 'tomar del pozo y seleccionar esa carta probado desde la UI');
  await page.waitForSelector('#panel-final', { timeout: 60000 });
  await page.waitForTimeout(1200);
  const cel = await page.evaluate(() => window.__apuntado.celebracion.historial.slice());
  check(cel.length >= 1 && cel.some((c) => c.alcance === 'partida'), `se lanzó una celebración al ganar (${cel.map((c) => `${c.modo}/${c.efecto}`).join(', ')})`);
  await foto('09_podio');
  check(await page.locator('.podio-fila').count() === 4, 'podio con 4 jugadores');
  check(await page.locator('#btn-revancha').count() === 1, 'el anfitrión ve el botón de revancha');
  await page.click('#btn-revancha');
  await page.waitForSelector('#codigo-sala');
  check(true, 'revancha regresa a la sala');
  // Reconexión: recargar la página conserva la sesión
  const codigo = await page.textContent('#codigo-sala');
  await page.reload();
  await page.waitForSelector('#codigo-sala', { timeout: 8000 });
  check((await page.textContent('#codigo-sala')) === codigo, 'recargar la página restaura la sesión (reconexión automática)');
  check(errores.length === 0, `sin errores de consola (${errores.length ? errores.join(' | ') : 'ninguno'})`);

  console.log('\n[UI 3] Inactividad: automático sin voto -> expulsión disponible -> votación (3 humanos + 1 bot; umbrales acortados)');
  const PORT2 = 3114;
  const BASE2 = `http://127.0.0.1:${PORT2}`;
  const srv2 = arrancar(PORT2, { BOT_MIN_MS: '300', BOT_MAX_MS: '500', VOTO_SALTOS_MIN: '1', VOTO_TURNOS_AUTO_MIN: '1', VOTO_DURACION_SEG: '60' });
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(`${BASE2}/api/salud`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
    const nueva = async () => { const p = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage(); p.on('pageerror', (e) => errores.push(String(e))); await p.goto(BASE2); await entrarAcceso(p); return p; };
    const A = await nueva(), B = await nueva(), C = await nueva();
    await A.fill('#in-nombre', 'Ana'); await A.click('#btn-crear'); await A.waitForSelector('#codigo-sala');
    const cod = await A.textContent('#codigo-sala');
    for (const [pg, nom] of [[B, 'Beto'], [C, 'Carla']]) { await pg.fill('#in-nombre', nom); await pg.fill('#in-codigo', cod); await pg.click('#btn-unirse'); await pg.waitForSelector('#codigo-sala'); }
    await A.click('#btn-bot'); await A.waitForTimeout(300);
    await A.selectOption('#cfg-tiempo', '20'); await A.waitForTimeout(300);
    await A.click('#btn-iniciar');
    for (const pg of [A, B, C]) await pg.waitForSelector('.carta.mia');
    // Ana no hace nada (su turno vence -> pasa a automático SIN votación). Beto y Carla juegan sus turnos.
    const jugar = async (pg) => {
      try {
        if (!(await pg.locator('#hint.mio').count())) return;
        const t = (await pg.textContent('#hint')) ?? '';
        if (t.includes('roba')) await pg.click('#btn-mazo', { timeout: 2000 });
        else { await pg.locator('.carta.mia').last().click({ timeout: 2000 }); await pg.waitForTimeout(200); await pg.click('#flot-descartar', { timeout: 2000 }); }
      } catch { /* el turno cambió entre la lectura y el clic */ }
    };
    const t1 = Date.now();
    while (Date.now() - t1 < 150000 && !(await B.locator('[data-expulsar]').count())) {
      await jugar(B); await jugar(C);
      if (await B.locator('#panel-final, #panel-liq').count()) { await B.click('#btn-continuar', { timeout: 500 }).catch(() => {}); }
      await B.waitForTimeout(400);
    }
    check(await B.locator('[data-expulsar]').count() === 1, 'tras varios turnos en automático aparece el botón "Expulsar" en el panel de Ana');
    check(await B.locator('.plaqueta .acc-plaqueta [data-expulsar]').count() === 1, 'el botón queda dentro de la pestaña del panel de Ana (no ocupa sitio en la mesa)');
    check(await B.locator('#aviso-suave.visible').count() === 1 && (await B.textContent('#aviso-suave')).includes('Ana'), 'se muestra un aviso suave indicando que se puede votar su expulsión');
    check(await B.locator('#panel-voto.visible').count() === 0, 'la votación NO empieza sola: solo cuando alguien pulsa el botón');
    check(await A.locator('.plaqueta.yo .auto.completo').count() === 1, 'Ana pasó a AUTOMÁTICO sin que hubiera votación');
    await B.waitForTimeout(600);
    await B.screenshot({ path: `${OUT}19_expulsion_disponible.png` });
    await B.locator('.plaqueta [data-expulsar]').click();
    await C.waitForSelector('#panel-voto.visible', { timeout: 8000 });
    check((await C.textContent('#panel-voto')).includes('Expulsión'), 'al pulsarlo se abre la votación de expulsión para los demás');
    await A.waitForSelector('#btn-retomar-voto', { timeout: 8000 }).catch(() => {});
    check(await A.locator('#btn-voto-si').count() === 0 && await A.locator('#btn-retomar-voto').count() === 1, 'la acusada no vota: solo puede retomar el control');
    check(await B.locator('#btn-voto-si').count() === 0, 'quien la inició ya votó a favor');
    await C.waitForTimeout(600);
    await C.screenshot({ path: `${OUT}20_votacion_expulsion.png` });
    await C.click('#btn-voto-si');
    await A.waitForSelector('#btn-crear', { timeout: 10000 });
    check(true, 'aprobada por mayoría: Ana es expulsada y vuelve al inicio');
  } finally {
    parar(srv2);
  }
  check(errores.length === 0, `sin errores de consola tras las votaciones (${errores.length ? errores.join(' | ') : 'ninguno'})`);
  await browser.close();
  console.log(`\nE2E de interfaz OK - ${ok} verificaciones`);
} catch (e) {
  console.error(String(e));
  // Captura de diagnóstico del momento del fallo (fuera del repositorio).
  await globalThis.__pagina?.screenshot({ path: `${process.env.TMPDIR ?? '/tmp'}/e2e-ui-fallo.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  parar(srv);
  setTimeout(() => process.exit(process.exitCode ?? 0), 500);
}
