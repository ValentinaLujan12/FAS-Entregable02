import type { MensajeCliente, MensajeServidor, VistaMesa } from '../kernel/protocolo.js';
import type { ContextoMusica } from '../extras/web/musica.js';
import { cargarManifest, precargar, urlDorso, urlTablero, capasFondo } from './assets.js';
import type { Contexto } from './contexto.js';
import { h } from './dom.js';
import { Almacen } from './estado.js';
import { Estilo } from './estilo.js';
import { Celebraciones } from '../extras/web/celebracion/index.js';
import '../extras/web/celebracion/efectos.js';
import { Reacciones } from '../extras/reacciones/vista.js';
import { Visual } from './visual.js';
import { Sonido } from '../extras/web/sonido.js';
import { Fondo, type Efectos } from '../extras/web/fondo.js';
import { PantallaInicio } from './inicio.js';
import { PantallaMesa, ESC_H, ESC_W } from './mesa.js';
import { Overlays } from './overlays.js';
import { Red } from './net.js';
import { PantallaSala } from './sala.js';
import { PantallaAcceso, apiAcceso } from './acceso.js';

type Pantalla = 'acceso' | 'inicio' | 'sala' | 'mesa';

async function arrancar(): Promise<void> {
  await cargarManifest();
  precargar([urlDorso(), urlTablero('mesa'), ...capasFondo().map((c) => c.url)]);

  const almacen = new Almacen();
  const raiz = document.getElementById('escenario')!;
  const fondoEl = h('div', { class: 'fondo' });
  const capaPantalla = h('div', { class: 'pantallas' });
  const toasts = h('div', { class: 'toasts' });
  const banner = h('div', { class: 'banner-red', id: 'banner-red' }, 'Reconectando con el servidor...');
  banner.style.display = 'none';
  raiz.append(fondoEl, capaPantalla, toasts, banner);

  const fondo = new Fondo(fondoEl);
  fondo.establecer((almacen.efectos as Efectos) || 'auto');

  const sonido = new Sonido();
  const visual = new Visual(raiz);
  const reacciones = new Reacciones();
  const capaCelebracion = h('div', { class: 'capa-celebracion' });
  const celebracion = new Celebraciones(capaCelebracion, sonido);

  let red: Red;
  // El estilo es un ESPEJO de la cuenta del servidor: solo pide (comprar/activar/recargar), nunca decide.
  const estilo = new Estilo((m) => red.enviar(m));
  fondo.establecerAmbiente(estilo.elegida('ambiente'));
  const ctx: Contexto = {
    almacen,
    fondo,
    sonido,
    estilo,
    visual,
    celebracion,
    reacciones,
    enviar: (m: MensajeCliente) => red.enviar(m),
    toast: (texto, tipo = 'info') => {
      if (tipo === 'error') sonido.reproducir('error');
      const t = h('div', { class: `toast ${tipo}` }, texto);
      toasts.append(t);
      window.setTimeout(() => t.classList.add('saliendo'), 3800);
      window.setTimeout(() => t.remove(), 4200);
      while (toasts.children.length > 4) toasts.firstElementChild?.remove();
    },
    abrirAyuda: () => overlays.ayuda(),
    abrirAjustes: () => overlays.ajustes(),
    abrirSonido: () => overlays.sonido(),
    abrirEstilo: () => overlays.estilo(),
    salirDelSitio: () => void apiAcceso.salir().then(() => mostrarAcceso()),
  };
  reacciones.enlazar(ctx);
  estilo.alCambiar(() => fondo.establecerAmbiente(estilo.elegida('ambiente')));

  const overlays = new Overlays(ctx);
  raiz.append(overlays.el, reacciones.capa, capaCelebracion);
  const acceso = new PantallaAcceso({ toast: (t, k) => ctx.toast(t, k), abrirAyuda: () => overlays.ayuda(), alEntrar: () => entrar() });
  const inicio = new PantallaInicio(ctx);
  const sala = new PantallaSala(ctx);
  const mesa = new PantallaMesa(ctx);
  let actual: Pantalla | null = null;

  /**
   * Música por contexto: sala/inicio -> generadores de sala; partida -> generadores de la modalidad. La pieza se
   * REINICIA al empezar cada ronda y cada partida (y al volver a la sala), tomando otra receta del contexto.
   */
  let claveMusica = '';
  const actualizarMusica = (v: VistaMesa | null): void => {
    let clave = 'sala';
    let contexto: ContextoMusica = 'sala';
    if (v && v.fase !== 'ESPERA') {
      contexto = v.modalidad as ContextoMusica;
      clave = `${v.codigo}|${v.modalidad}|${v.ronda}`;
      // la liquidación y el podio conservan la pieza de la ronda que acaba de terminar
    }
    if (clave === claveMusica) return;
    claveMusica = clave;
    sonido.iniciarPieza(contexto);
  };

  const mostrar = (p: Pantalla): void => {
    if (actual === p) return;
    if (actual === 'mesa') mesa.desmontado();
    if (p !== 'mesa') celebracion.limpiar();
    reacciones.limpiar();
    actual = p;
    capaPantalla.replaceChildren(p === 'acceso' ? acceso.el : p === 'inicio' ? inicio.el : p === 'sala' ? sala.el : mesa.el);
    if (p === 'mesa') mesa.montado();
    raiz.dataset.pantalla = p;
  };

  const alMensaje = (m: MensajeServidor): void => {
    switch (m.t) {
      case 'sesion':
        almacen.guardarSesion({ codigo: m.codigo, jugadorId: m.jugadorId, token: m.token });
        break;
      case 'cuenta':
        estilo.recibir(m.cuenta, m.clave);
        break;
      case 'reaccion':
        ctx.reacciones.mostrar(m.jugadorId, m.id, almacen.vista?.yoId);
        break;
      case 'estado': {
        const v = m.vista;
        almacen.aplicarVista(v);
        if (v.fase === 'ESPERA') {
          mesa.reiniciar();
          mostrar('sala');
          sala.actualizar(v);
        } else {
          mostrar('mesa');
          mesa.actualizar(v);
        }
        overlays.actualizar(v);
        actualizarMusica(v);
        break;
      }
      case 'eventos':
        mesa.eventos(m.eventos);
        break;
      case 'validacion':
        mesa.mensaje(m);
        break;
      case 'error':
        if (m.codigo === 'EXPULSADO') {
          // Me sacaron de la sala (anfitrión o votación): se olvida la sesión y se vuelve al inicio.
          almacen.guardarSesion(null);
          almacen.vista = null;
          mesa.reiniciar();
          overlays.actualizar({ fase: 'ESPERA' } as never);
          mostrar('inicio');
          actualizarMusica(null);
        }
        if (m.codigo === 'TOKEN_INVALIDO' || m.codigo === 'SALA_INEXISTENTE' || m.codigo === 'SESION_INVALIDA') {
          if (almacen.sesion && !almacen.vista) {
            almacen.guardarSesion(null);
            mostrar('inicio');
          }
        }
        ctx.toast(m.mensaje, 'error');
        break;
      case 'pong':
        break;
    }
    // Salida de sala (el servidor deja de enviar estado): se detecta con el mensaje de sesión finalizada
  };

  red = new Red(
    alMensaje,
    (ok) => {
      almacen.conectado = ok;
      banner.style.display = ok ? 'none' : '';
    },
    () => {
      // Primero la cuenta (el servidor la usa al crear/unirse/reconectar y mantiene el orden de los mensajes).
      estilo.abrir();
      if (almacen.sesion) red.enviar({ t: 'reconectar', codigo: almacen.sesion.codigo, token: almacen.sesion.token });
    },
    { clave: () => estilo.clave, sinAcceso: () => mostrarAcceso() },
  );

  let dentro = false;
  function entrar(): void {
    if (dentro) return;
    dentro = true;
    mostrar('inicio');
    red.conectar();
  }
  function mostrarAcceso(): void {
    dentro = false;
    red.cerrar();
    almacen.vista = null;
    mesa.reiniciar();
    overlays.cerrarModal();
    overlays.actualizar({ fase: 'ESPERA' } as never);
    mostrar('acceso');
    actualizarMusica(null);
  }

  // "salir": vuelve al inicio y olvida la sesión
  const enviarOriginal = ctx.enviar;
  ctx.enviar = (m) => {
    enviarOriginal(m);
    if (m.t === 'salir') {
      almacen.guardarSesion(null);
      almacen.vista = null;
      mesa.reiniciar();
      overlays.actualizar({ fase: 'ESPERA' } as never);
      mostrar('inicio');
      actualizarMusica(null);
    }
  };

  // Respuesta de clic en TODOS los botones (inicio, sala, mesa y paneles), controlada por el interruptor "clic" del menú de sonido.
  raiz.addEventListener(
    'click',
    (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b && !(b as HTMLButtonElement).disabled) sonido.reproducir('clic');
    },
    true,
  );

  // Botón de música SIEMPRE presente (encima de los paneles); su posición se adapta a cada pantalla (ver styles.css).
  const iconoMusica = (silencio: boolean): string =>
    `<svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true"><path d="M20 10v21.2a6.5 6.5 0 1 0 3 5.5V18h13v-8H20z" fill="currentColor"/>${silencio ? '<path d="M8 40 40 8" stroke="#c9604f" stroke-width="4.5" stroke-linecap="round"/>' : ''}</svg>`;
  const btnMusica = h('button', { class: 'btn-musica', id: 'btn-musica', type: 'button' });
  const pintarMusica = (): void => {
    const a = sonido.ajustes;
    const suena = a.musica && a.activo;
    btnMusica.innerHTML = iconoMusica(!a.musica);
    btnMusica.classList.toggle('apagada', !a.musica);
    btnMusica.classList.toggle('gris', !a.activo);
    btnMusica.setAttribute('aria-pressed', String(a.musica));
    btnMusica.title = !a.activo ? 'Sonido general apagado (la música está ' + (a.musica ? 'activada' : 'silenciada') + ')' : suena ? 'Silenciar música' : 'Activar música';
  };
  btnMusica.addEventListener('click', () => sonido.cambiar({ musica: !sonido.ajustes.musica }));
  sonido.alCambiar(pintarMusica);
  pintarMusica();
  raiz.append(btnMusica);

  // ¿Ya hay sesión de acceso? (la cookie HttpOnly la envía el navegador; este código no puede leerla)
  const tieneAcceso = await apiAcceso.estado();
  if (tieneAcceso === true) entrar();
  else {
    mostrar('acceso');
    if (tieneAcceso === 'sin-red') ctx.toast('No se pudo contactar al servidor. Recarga en unos segundos.', 'error');
  }

  /* Escalado letterbox del escenario 1920x1080 */
  const ajustar = (): void => {
    const s = Math.min(window.innerWidth / ESC_W, window.innerHeight / ESC_H);
    raiz.style.transform = `translate(-50%, -50%) scale(${s})`;
    raiz.dataset.escala = s.toFixed(3);
  };
  window.addEventListener('resize', ajustar);
  ajustar();

  // Hook para pruebas E2E (solo lectura)
  (window as unknown as { __apuntado: unknown }).__apuntado = { almacen, sonido, estilo, visual, celebracion };
}

arrancar().catch((e) => {
  console.error(e);
  document.body.append(h('pre', { style: { color: '#f88', padding: '1rem' } }, `Error al iniciar: ${String(e)}`));
});
