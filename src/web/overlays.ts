import type { Carta } from '../kernel/cartas.js';
import { MODALIDADES } from '../kernel/config.js';
import type { LiquidacionVista, VistaMesa } from '../kernel/protocolo.js';
import { RECARGA, SKINS_AMBIENTE, SKINS_CARTA, SKINS_CELEBRACION, SKINS_MESA, skinCarta, skinCelebracion, type SkinDef, type TipoSkin } from '../extras/skins/skins.js';
import { crearCarta } from '../kernel/cartas.js';
import { urlAmbienteSkin, urlAvatar, urlCarta, urlDorsoSkin, urlIcono, urlMesaSkin } from './assets.js';
import { recetasDe } from '../extras/web/musica.js';
import type { Contexto } from './contexto.js';
import { agregar, h, img, vaciar } from './dom.js';
import { formatearTiempo } from './estado.js';
import type { Efectos } from '../extras/web/fondo.js';

const miniCarta = (c: Carta, extra = ''): HTMLElement => h('span', { class: `mini-carta ${extra}` }, img(urlCarta(c), '', `${c.valor}${c.pinta ?? ''}`));

/** Capa de modales sobre el escenario: liquidación de ronda, podio final, reglas y ajustes de efectos. */
export class Overlays {
  readonly el = h('div', { class: 'overlays' });
  private liq: HTMLElement | null = null;
  private fin: HTMLElement | null = null;
  private modal: HTMLElement | null = null;
  private cuenta: number | null = null;
  private claveLiq = '';

  constructor(private readonly ctx: Contexto) {
    window.addEventListener('keydown', (e) => e.key === 'Escape' && this.cerrarModal());
  }

  actualizar(v: VistaMesa): void {
    if (v.fase === 'LIQUIDACION' && v.liquidacion) this.mostrarLiquidacion(v, v.liquidacion);
    else this.quitar('liq');
    if (v.fase === 'FINALIZADA' && v.final) this.mostrarFinal(v);
    else this.quitar('fin');
    if (v.fase === 'FINALIZADA' && v.liquidacion && !this.liq) {
      /* al terminar la partida el resumen de la última ronda queda dentro del podio */
    }
  }

  private quitar(cual: 'liq' | 'fin'): void {
    const el = cual === 'liq' ? this.liq : this.fin;
    if (!el) return;
    el.classList.add('saliendo');
    window.setTimeout(() => el.remove(), 250);
    if (cual === 'liq') {
      this.liq = null;
      this.claveLiq = '';
      if (this.cuenta !== null) window.clearInterval(this.cuenta);
      this.cuenta = null;
    } else this.fin = null;
  }

  /* --------- liquidación --------- */
  private mostrarLiquidacion(v: VistaMesa, l: LiquidacionVista): void {
    const clave = `${v.codigo}:${l.ronda}:${l.jugadores.length}`;
    if (this.liq && this.claveLiq === clave) return;
    this.quitar('liq');
    this.claveLiq = clave;
    const soyHost = v.hostId === v.yoId;
    const nombre = (id: string | null): string => v.jugadores.find((j) => j.id === id)?.nombre ?? '-';
    const info = MODALIDADES.find((m) => m.id === v.modalidad)!;
    const filas = l.jugadores.map((r) => {
      const j = v.jugadores.find((x) => x.id === r.jugadorId);
      const esGanador = r.jugadorId === l.ganadorId;
      const grupos = r.combinaciones.map((c) => h('span', { class: 'grupo-mini', title: c.tipo === 'ESCALERA' ? 'Escalera' : 'Grupo' }, ...c.cartas.map((k) => miniCarta(k))));
      const sueltas = r.sobrantes.length ? h('span', { class: 'grupo-mini sueltas', title: 'Cartas sueltas' }, ...r.sobrantes.map((k) => miniCarta(k, 'suelta'))) : null;
      const signo = info.sentidoPuntaje === 'VICTORIAS' ? '' : r.delta > 0 ? '+' : '';
      return h('div', { class: `fila-liq${esGanador ? ' ganador' : ''}${r.eliminado ? ' eliminado' : ''}` },
        h('div', { class: 'quien' },
          img(urlAvatar(j?.asiento ?? 0), 'avatar'),
          h('div', {}, h('strong', {}, j?.nombre ?? '-'), esGanador ? h('span', { class: 'chip' }, img(urlIcono('corona'), 'ic'), 'Ganó la ronda') : r.eliminado ? h('span', { class: 'chip rojo' }, 'Eliminado') : null),
        ),
        h('div', { class: 'cartas-liq' }, ...grupos, sueltas),
        info.sentidoPuntaje === 'VICTORIAS'
          ? h('div', { class: 'pts' }, h('strong', {}, `${r.victorias}`), h('span', {}, r.victorias === 1 ? 'victoria' : 'victorias'))
          : h('div', { class: 'pts' }, h('strong', { class: r.delta < 0 ? 'neg' : r.delta > 0 ? 'pos' : '' }, `${signo}${r.delta}`), h('span', {}, `acum. ${r.acumulado}`)),
      );
    });

    const cuenta = h('span', { class: 'cuenta', id: 'cuenta-liq' });
    const el = h('div', { class: 'velo' },
      h('div', { class: 'panel liquidacion', id: 'panel-liq' },
        h('h2', {}, l.tablas ? `Ronda ${l.ronda} - Tablas` : `Ronda ${l.ronda} - gana ${nombre(l.ganadorId)}`),
        h('p', { class: 'detalle' }, l.detalle),
        h('div', { class: 'filas-liq' }, ...filas),
        h('div', { class: 'fila pie-liq' },
          l.siguienteEn ? h('span', {}, 'Siguiente ronda en ', cuenta) : null,
          soyHost && l.siguienteEn ? h('button', { class: 'btn primario', id: 'btn-continuar', type: 'button', onclick: () => this.ctx.enviar({ t: 'continuar' }) }, 'Continuar ya') : null,
        ),
      ),
    );
    this.liq = el;
    this.el.append(el);
    const tick = (): void => {
      if (l.siguienteEn) cuenta.textContent = formatearTiempo(l.siguienteEn - this.ctx.almacen.ahoraServidor());
    };
    tick();
    this.cuenta = window.setInterval(tick, 250);
  }

  /* --------- final --------- */
  private mostrarFinal(v: VistaMesa): void {
    const f = v.final!;
    if (this.fin && this.fin.dataset.k === `${v.codigo}:${f.ganadorId}:${v.ronda}`) return;
    this.quitar('fin');
    const soyHost = v.hostId === v.yoId;
    const info = MODALIDADES.find((m) => m.id === v.modalidad)!;
    const medalla = ['🥇', '🥈', '🥉'];
    const filas = [...f.posiciones].sort((a, b) => a.posicion - b.posicion).map((p) => {
      const j = v.jugadores.find((x) => x.id === p.jugadorId);
      const score = info.sentidoPuntaje === 'VICTORIAS' ? `${p.victorias} ${p.victorias === 1 ? 'victoria' : 'victorias'}` : `${p.puntos} pts`;
      return h('li', { class: `podio-fila pos-${p.posicion}${p.jugadorId === f.ganadorId ? ' campeon' : ''}` },
        h('span', { class: 'medalla' }, medalla[p.posicion - 1] ?? `${p.posicion}º`),
        img(urlAvatar(j?.asiento ?? 0), 'avatar'),
        h('strong', {}, j?.nombre ?? '-'),
        h('span', { class: 'score' }, score),
      );
    });
    const confeti = h('div', { class: 'confeti' }, ...Array.from({ length: 36 }, (_, i) => h('i', { style: { left: `${(i * 97) % 100}%`, animationDelay: `${(i % 12) * 0.25}s`, animationDuration: `${3.5 + (i % 5) * 0.6}s`, background: ['#e7c27d', '#86b6b1', '#d88e70', '#9db89a'][i % 4]! } })));
    const ganador = v.jugadores.find((j) => j.id === f.ganadorId);
    const el = h('div', { class: 'velo final', dataset: { k: `${v.codigo}:${f.ganadorId}:${v.ronda}` } },
      confeti,
      h('div', { class: 'panel podio', id: 'panel-final' },
        img(urlIcono('corona'), 'corona-grande'),
        h('h2', {}, `¡${ganador?.nombre ?? 'Alguien'} gana la partida!`),
        h('p', { class: 'detalle' }, f.motivo),
        h('ol', { class: 'podio-lista' }, ...filas),
        h('div', { class: 'fila' },
          soyHost ? h('button', { class: 'btn primario grande', id: 'btn-revancha', type: 'button', onclick: () => this.ctx.enviar({ t: 'nueva_partida' }) }, 'Revancha (volver a la sala)') : h('span', { class: 'esperando' }, 'El anfitrión decide si hay revancha...'),
          h('button', { class: 'btn grande', type: 'button', onclick: () => this.ctx.enviar({ t: 'salir' }) }, 'Salir'),
        ),
      ),
    );
    this.fin = el;
    this.el.append(el);
  }

  /* --------- modales: reglas y efectos --------- */
  cerrarModal(): void {
    if (!this.modal) return;
    const m = this.modal;
    this.modal = null;
    m.classList.add('saliendo');
    window.setTimeout(() => m.remove(), 200);
  }

  private abrirModal(titulo: string, cuerpo: HTMLElement, opts: { lateral?: HTMLElement; clase?: string } = {}): void {
    this.cerrarModal();
    const panel = h('div', { class: `panel ayuda ${opts.clase ?? ''}` },
      h('div', { class: 'panel-cab' }, h('h2', {}, titulo), h('button', { class: 'btn mini', type: 'button', id: 'btn-cerrar-modal', onclick: () => { this.cerrarModal(); } }, 'X')),
      cuerpo,
    );
    const m = h('div', { class: 'velo modal', onclick: (e: Event) => e.target === m && this.cerrarModal() },
      opts.lateral ? h('div', { class: 'modal-fila' }, panel, opts.lateral) : panel,
    );
    this.modal = m;
    this.el.append(m);
  }

  ayuda(): void {
    const cuerpo = h('div', { class: 'ayuda-cuerpo' },
      h('h3', {}, 'Cómo se juega'),
      h('p', {}, 'En tu turno primero robas (del mazo o la carta visible del pozo) y luego descartas una carta. Gana quien primero arma su mano en combinaciones válidas y cierra la ronda.'),
      h('h3', {}, 'Combinaciones válidas'),
      h('ul', {},
        h('li', {}, h('strong', {}, 'Grupo: '), 'tres o más cartas del mismo valor, de cualquier pinta (7♥ 7♣ 7♠).'),
        h('li', {}, h('strong', {}, 'Escalera: '), 'tres o más cartas consecutivas de la misma pinta (4♦ 5♦ 6♦). El As puede ir bajo o alto según la mesa; no se "da la vuelta" (K-A-2 no vale).'),
        h('li', {}, h('strong', {}, 'Comodín: '), 'si la mesa lo permite, reemplaza cualquier carta (siempre con al menos 2 cartas naturales).'),
      ),
      h('h3', {}, 'Modalidades'),
      ...MODALIDADES.map((m) => h('div', { class: 'modo-ayuda' }, h('strong', {}, m.nombre), h('p', {}, m.resumen))),
      h('h3', {}, 'Controles con el ratón'),
      h('ul', {},
        h('li', {}, 'Clic en una carta para seleccionarla: aparece un botón flotante "Descartar" sobre ella. Arrástrala por tu mano para reordenarla: una marca dorada te muestra entre qué cartas quedará (la guía sigue al puntero) y solo la carta movida pierde la selección.'),
        h('li', {}, 'Para ROBAR también puedes arrastrar la carta del mazo o la del pozo hasta la zona redondeada de tu mano (además del clic y de los botones).'),
        h('li', {}, 'Para descartar también puedes arrastrar la carta hasta el centro de la mesa (movimiento completo: suelta dentro de la zona iluminada).'),
        h('li', {}, 'Selecciona varias cartas con clics o arrastrando un recuadro sobre ellas; aparece "Agrupar" sobre el centro de la selección (3 o más cartas).'),
        h('li', {}, '"Descartar" solo se activa con UNA carta seleccionada; "Agrupar" solo con varias.'),
        h('li', {}, 'Para cerrar la ronda mantén pulsado el botón ¡Cerrar ronda! (o la tecla C) durante 2 s: se carga para evitar cierres accidentales. Si lo sueltas antes, aparece un aviso grande.'),
        h('li', {}, 'Si el tiempo se agota el sistema roba y descarta por ti. Tras 2 turnos vencidos pasas a "piloto". Con más de 3 turnos perdidos pasas SOLO a modo automático (un bot juega por ti) y los demás reciben un aviso suave. Si sigues ausente, en tu panel aparece el botón "Expulsar": la votación solo empieza cuando alguien lo pulsa.'),
        h('li', {}, 'Reacciones: abre el menú 😀 de tu panel y envía una (con sonido); aparece sobre tu panel para todos. Con el icono 🔊 de otro jugador lo silencias para ti; si la mitad (redondeada hacia arriba) de los jugadores lo silencia, queda silenciado para todos.'),
        h('li', {}, 'El turno gira en sentido contrario a las manecillas del reloj.'),
      ),
    );
    this.abrirModal('Reglas y ayuda', cuerpo, { lateral: this.guiaTeclado() });
  }

  /** Panel derecho de la ayuda: guía de atajos de teclado. */
  private guiaTeclado(): HTMLElement {
    const fila = (teclas: string[], texto: string): HTMLElement =>
      h('div', { class: 'atajo' }, h('span', { class: 'teclas' }, ...teclas.map((t) => h('kbd', {}, t))), h('span', { class: 'que' }, texto));
    return h('div', { class: 'panel atajos', id: 'panel-atajos' },
      h('h2', {}, 'Teclado'),
      h('p', { class: 'mini' }, 'Funciona en la mesa durante la partida.'),
      h('h3', {}, 'Tus cartas'),
      fila(['Izq', 'Der'], 'Moverte entre tus cartas'),
      fila(['Arriba', 'Abajo'], 'Seleccionar / quitar selección'),
      fila(['Espacio'], 'Seleccionar o quitar selección'),
      fila(['Espacio 3 s'], 'Mantenida: descarta la carta señalada, aunque haya otras seleccionadas (se carga)'),
      fila(['Esc'], 'Limpiar la selección'),
      h('h3', {}, 'Acciones'),
      fila(['M'], 'Robar del mazo'),
      fila(['P'], 'Tomar del pozo'),
      fila(['D'], 'Descartar la carta seleccionada'),
      fila(['G'], 'Agrupar la selección'),
      fila(['O'], 'Ordenar de menor a mayor; otra pulsación: por pinta'),
      fila(['C 2 s'], 'Mantenida: cerrar la ronda (se carga)'),
    );
  }

  /* --------- sonido --------- */
  private textoPieza(): string {
    const r = this.ctx.sonido.recetaActual;
    const c = this.ctx.sonido.contextoActual;
    const donde = c === 'sala' ? 'Sala' : (MODALIDADES.find((m) => m.id === c)?.nombre ?? c);
    return r ? `Sonando: "${r.nombre}" (${donde}) - ${recetasDe(c).length} estilos disponibles` : `Contexto: ${donde} - ${recetasDe(c).length} estilos disponibles`;
  }

  sonido(): void {
    const cuerpo = h('div', { class: 'ayuda-cuerpo', id: 'panel-sonido' });
    const pintar = (): void => {
      const a = this.ctx.sonido.ajustes;
      vaciar(cuerpo);
      // El sonido general es el maestro: apagado, el resto conserva su valor pero queda en gris y no se puede tocar.
      const interruptor = (id: string, titulo: string, desc: string, valor: boolean, cambiar: (v: boolean) => void, general = false): HTMLElement =>
        h('button', {
          class: `opcion interruptor${valor ? ' activa' : ''}${!general && !a.activo ? ' gris' : ''}`,
          type: 'button',
          id,
          role: 'switch',
          'aria-checked': String(valor),
          disabled: !general && !a.activo,
          onclick: () => {
            cambiar(!valor);
            pintar();
          },
        }, h('span', { class: 'texto-op' }, h('strong', {}, titulo), h('span', {}, desc)), h('i', { class: 'pastilla' }, valor ? 'Sí' : 'No'));
      const vol = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(a.volumen), id: 'sonido-volumen', class: 'rango', disabled: !a.activo }) as HTMLInputElement;
      const etiquetaVol = h('strong', { id: 'sonido-volumen-txt' }, `${a.volumen}%`);
      vol.addEventListener('input', () => {
        etiquetaVol.textContent = `${vol.value}%`;
        this.ctx.sonido.cambiar({ volumen: Number(vol.value) });
      });
      vol.addEventListener('change', () => this.ctx.sonido.reproducir('descartar'));
      cuerpo.append(
        interruptor('sonido-activo', 'Sonido general', 'Interruptor maestro: apagado, no suena nada (efectos ni música). Los demás ajustes se conservan.', a.activo, (v) => this.ctx.sonido.cambiar({ activo: v }), true),
        interruptor('sonido-musica', 'Música de fondo', 'Retro y generativa: una para la sala y cinco estilos por modalidad; cambia en cada ronda y partida.', a.musica, (v) => this.ctx.sonido.cambiar({ musica: v })),
        h('p', { class: 'mini', id: 'sonido-pieza' }, this.textoPieza()),
        interruptor('sonido-completos', 'Efectos de sonido completos', 'Sí: también al arrastrar, soltar, seleccionar y agrupar. No: solo los básicos (robar, descartar, turno, error, cierre).', a.completos, (v) => this.ctx.sonido.cambiar({ completos: v })),
        interruptor('sonido-clic', 'Respuesta al clic / toque', 'Un pequeño "tic" al pulsar botones.', a.clic, (v) => this.ctx.sonido.cambiar({ clic: v })),
        interruptor('sonido-reacciones', 'Sonido de las reacciones', 'Risas, aplausos, "uy"... cuando alguien reacciona en la mesa.', a.reacciones, (v) => this.ctx.sonido.cambiar({ reacciones: v })),
        interruptor('sonido-celebraciones', 'Música y efectos de celebración', 'La fanfarria, la música disco o los estallidos cuando alguien gana.', a.celebraciones, (v) => this.ctx.sonido.cambiar({ celebraciones: v })),
        h('div', { class: `opcion volumen${a.activo ? '' : ' gris'}` }, h('span', { class: 'texto-op' }, h('strong', {}, 'Volumen'), h('span', {}, 'Ajusta el nivel general.')), vol, etiquetaVol),
        h('div', { class: 'fila' },
          h('button', { class: 'btn mini', type: 'button', id: 'sonido-probar', disabled: !a.activo, onclick: () => {
            const s = this.ctx.sonido;
            s.reproducir('turno');
            window.setTimeout(() => s.reproducir('descartar'), 450);
            window.setTimeout(() => s.reproducir('agrupar'), 800);
          } }, 'Probar sonidos'),
        ),
        h('p', { class: 'mini' }, 'Todo se genera en tu navegador (WebAudio); no se descarga ningún archivo de audio. También puedes silenciar la música con el botón de música siempre visible.'),
      );
    };
    this.ctx.sonido.alCambiar(() => {
      if (this.modal && cuerpo.isConnected) pintar();
    });
    pintar();
    this.abrirModal('Sonido', cuerpo, { clase: 'estrecho' });
  }

  /* --------- personalizar estilo: tienda (mockup) --------- */
  /**
   * Se muestran TODAS las skins: en color con marco acentuado las que posees y en gris las que no. Al intentar usar una
   * que no tienes se ofrece comprarla. El cliente solo PIDE (comprar/activar); saldo, inventario y elección los decide
   * y guarda el servidor (la tarjeta se repinta con lo que éste responde).
   */
  estilo(): void {
    let pestana: TipoSkin = 'carta';
    /** Compra pendiente de confirmar (diálogo dentro del modal). */
    let compra: { tipo: TipoSkin; id: string } | null = null;
    const cuerpo = h('div', { class: 'ayuda-cuerpo estilo', id: 'panel-estilo' });
    const notas: Record<TipoSkin, string> = {
      carta: 'Tu skin de cartas la ven TODOS los jugadores (en tu mano de la mesa rival y en el pozo). Los bots eligen una al azar.',
      mesa: 'Las mesas básicas solo las ves tú. Si eliges una PREMIUM, la mesa premium más cara de la sala se muestra a todos con un bisel con el nombre del dueño; en la partida cada uno puede cambiar su vista entre las premium de la sala.',
      ambiente: 'El ambiente (fondo animado) solo lo ves tú y se aplica al instante.',
      celebracion: 'Cuando GANAS, todos ven tu celebración: a pantalla completa para ti y, para los demás, en tu puesto, subiendo en cono. Cada skin trae su efecto y su música.',
    };
    const lista = (t: TipoSkin): readonly SkinDef<unknown>[] =>
      (t === 'carta' ? SKINS_CARTA : t === 'mesa' ? SKINS_MESA : t === 'ambiente' ? SKINS_AMBIENTE : SKINS_CELEBRACION) as readonly SkinDef<unknown>[];
    const GLIFOS: Record<string, string> = { serpentinas: '🎉', estrellas: '✨', tinta: '🖋️', disco: '🪩', fuegos: '🎆' };
    /** Reverso con el mismo marco/tinta que se ve en la mesa (--mc/--mw/data-tinta), para la miniatura de cartas. */
    const dorsoDemo = (id: string, clase: string): HTMLElement => {
      const m = skinCarta(id).diseno.marco;
      const el = h('div', { class: `carta-demo ${clase}`, dataset: { tinta: m?.tinta ?? '' } }, img(urlDorsoSkin(id), 'dorso'), h('div', { class: 'marco' }));
      el.style.setProperty('--mc', m?.color ?? 'transparent');
      el.style.setProperty('--mw', `${m ? m.ancho : 0}px`);
      return el;
    };
    const miniatura = (t: TipoSkin, id: string): HTMLElement => {
      if (t === 'carta') return h('div', { class: 'mini-skin cartas-demo' }, dorsoDemo(id, 'izq'), dorsoDemo(id, 'der'), dorsoDemo(id, 'centro'));
      if (t === 'mesa') return h('div', { class: 'mini-skin mesa' }, img(urlMesaSkin(id), ''));
      if (t === 'ambiente') return h('div', { class: 'mini-skin ambiente' }, img(urlAmbienteSkin(id, 'far'), ''), img(urlAmbienteSkin(id, 'mid'), ''), img(urlAmbienteSkin(id, 'near'), ''));
      const d = skinCelebracion(id).diseno;
      return h('div', { class: 'mini-skin celeb' }, h('span', { class: 'glifo' }, GLIFOS[d.efecto] ?? '🎊'), h('div', { class: 'paleta' }, ...d.colores.map((c) => h('i', { style: { background: c } }))));
    };
    const pintar = (): void => {
      vaciar(cuerpo);
      const e = this.ctx.estilo;
      const nombres: Array<[TipoSkin, string]> = [['carta', 'Cartas'], ['mesa', 'Mesas'], ['ambiente', 'Ambientes'], ['celebracion', 'Celebraciones']];
      const tabs = h('div', { class: 'tabs' },
        ...nombres.map(([t, nom]) => h('button', { class: `tab${pestana === t ? ' activa' : ''}`, type: 'button', dataset: { tab: t }, onclick: () => { pestana = t; compra = null; pintar(); } }, nom)),
        h('span', { class: 'saldo', id: 'saldo-tokens', title: 'Saldo de tokens: lo guarda el servidor (simulación para el mockup)' }, e.lista ? `🪙 ${e.saldo} tokens` : '🪙 ...'),
        // <<< TEMPORAL: QUITAR AL IMPLEMENTAR "COMPRAR MONEDAS" (ver RECARGA en skins.catalogo.ts y Estilo.pedirRecarga) >>>
        ...(RECARGA.activa && e.recargaDisponible
          ? [h('button', { class: 'btn mini recargar', id: 'btn-recargar', type: 'button', title: 'Botón temporal de pruebas: en el sistema real se reemplaza por "Comprar monedas"', onclick: () => e.pedirRecarga() }, `Recargar tokens (+${RECARGA.tokens})`)]
          : []),
      );
      const tarjetas = lista(pestana).map((sk) => {
        const elegida = e.elegida(pestana) === sk.id;
        const posee = e.posee(pestana, sk.id);
        const prueba = pestana === 'celebracion'
          ? h('button', { class: 'btn mini', type: 'button', dataset: { probar: sk.id }, title: 'Ver y escuchar esta celebración', onclick: (ev: Event) => {
              ev.stopPropagation();
              this.ctx.celebracion.lanzar({ skinId: sk.id, esMio: true, alcance: 'partida' });
            } }, 'Probar')
          : null;
        const accion = elegida
          ? h('button', { class: 'btn mini', type: 'button', disabled: true }, 'Elegida')
          : posee
            ? h('button', { class: 'btn mini primario', type: 'button', dataset: { elegir: sk.id }, onclick: (ev: Event) => { ev.stopPropagation(); e.pedirActivar(pestana, sk.id); this.ctx.sonido.reproducir('seleccionar'); } }, 'Usar')
            : h('button', { class: 'btn mini comprar', type: 'button', dataset: { comprar: sk.id }, onclick: (ev: Event) => { ev.stopPropagation(); compra = { tipo: pestana, id: sk.id }; pintar(); } }, `🔒 Comprar - ${sk.precio} 🪙`);
        return h('div', {
          class: `skin-tarjeta${elegida ? ' elegida' : ''}${sk.premium ? ' premium' : ''}${posee ? ' poseida' : ' bloqueada'}`,
          dataset: { skin: sk.id, posee: String(posee) },
          onclick: () => {
            // Intentar usar una skin que no posees ofrece comprarla; si la posees, se pide activarla.
            if (elegida) return;
            if (posee) { e.pedirActivar(pestana, sk.id); this.ctx.sonido.reproducir('seleccionar'); } else { compra = { tipo: pestana, id: sk.id }; pintar(); }
          },
        },
          miniatura(pestana, sk.id),
          h('div', { class: 'datos-skin' },
            h('strong', {}, sk.nombre),
            h('span', { class: `etq-skin ${sk.premium ? 'premium' : 'basica'}` }, !sk.premium ? 'Básica - gratis' : posee ? 'Premium - tuya' : `Premium - ${sk.precio} tokens`),
            h('small', {}, sk.descripcion),
          ),
          h('div', { class: 'acc-skin' }, prueba, accion),
        );
      });
      const cuenta = e.lista ? null : h('p', { class: 'nota-estilo' }, 'Conectando con tu cuenta...');
      agregar(cuerpo,
        tabs,
        h('p', { class: 'nota-estilo' }, notas[pestana]),
        cuenta,
        h('div', { class: 'rejilla-skins' }, ...tarjetas),
        h('p', { class: 'mini' }, 'Los créditos son de juego, sin dinero real. Compras, saldo, inventario y elección viven en el servidor (tu navegador solo guarda una clave anónima). Los cambios de cartas, mesa y celebración se aplican a la sala o partida siguiente; el ambiente, al instante.'),
      );
      if (compra) {
        const sk = lista(compra.tipo).find((x) => x.id === compra!.id)!;
        const falta = Math.max(0, sk.precio - e.saldo);
        const tipo = compra.tipo;
        const id = compra.id;
        cuerpo.append(
          h('div', { class: 'confirmar-velo', onclick: (ev: Event) => { if (ev.target === ev.currentTarget) { compra = null; pintar(); } } },
            h('div', { class: 'confirmar-caja', id: 'confirmar-compra' },
              h('h3', {}, `Comprar "${sk.nombre}"`),
              miniatura(tipo, id),
              h('p', {}, `Precio: ${sk.precio} 🪙 - Tu saldo: ${e.saldo} 🪙`),
              falta > 0
                ? h('p', { class: 'falta' }, `Te faltan ${falta} tokens.${e.recargaDisponible ? ' Usa "Recargar tokens" y vuelve a intentarlo.' : ''}`)
                : h('p', {}, `Quedarás con ${e.saldo - sk.precio} 🪙 y la skin se activará de inmediato.`),
              h('div', { class: 'fila' },
                h('button', { class: 'btn primario', id: 'btn-confirmar-compra', type: 'button', disabled: falta > 0, onclick: () => { e.pedirComprar(tipo, id); this.ctx.sonido.reproducir('cerrar'); } }, 'Comprar y usar'),
                falta > 0 && e.recargaDisponible ? h('button', { class: 'btn recargar', type: 'button', onclick: () => e.pedirRecarga() }, `Recargar (+${RECARGA.tokens})`) : null,
                h('button', { class: 'btn', id: 'btn-cancelar-compra', type: 'button', onclick: () => { compra = null; pintar(); } }, 'Cancelar'),
              ),
            ),
          ),
        );
      }
    };
    // El servidor responde con la cuenta completa tras cada petición: se repinta y se cierra el diálogo si ya se compró.
    let inventarioPrevio = new Set(this.ctx.estilo.inventario);
    this.ctx.estilo.alCambiar(() => {
      if (!this.modal || !cuerpo.isConnected) return;
      const nuevas = this.ctx.estilo.inventario.filter((x) => !inventarioPrevio.has(x));
      inventarioPrevio = new Set(this.ctx.estilo.inventario);
      if (nuevas.length && compra && nuevas.includes(compra.id)) {
        const sk = lista(compra.tipo).find((x) => x.id === compra!.id);
        compra = null;
        this.ctx.toast(`Compraste y activaste "${sk?.nombre ?? nuevas[0]}"`, 'ok');
      }
      pintar();
    });
    pintar();
    this.abrirModal('Personalizar estilo', cuerpo, { clase: 'ancho' });
  }

  ajustes(): void {
    const opciones: Array<[Efectos, string, string]> = [
      ['auto', 'Automático', 'Empieza en alto y baja solo si tu equipo va lento'],
      ['alto', 'Alto', 'Bokeh, polvo y conos de luz a resolución completa'],
      ['medio', 'Medio', 'Menos partículas, media resolución'],
      ['bajo', 'Bajo', 'Lo mínimo; ideal para móviles'],
      ['off', 'Sin animación', 'Solo fondo estático (recomendado si prefieres menos movimiento)'],
    ];
    const cuerpo = h('div', { class: 'ayuda-cuerpo', id: 'panel-visual' });
    const pintar = (): void => {
      vaciar(cuerpo);
      const v = this.ctx.visual.ajustes;
      const interruptor = (id: string, titulo: string, desc: string, valor: boolean, cambiar: (x: boolean) => void): HTMLElement =>
        h('button', { class: `opcion interruptor${valor ? ' activa' : ''}`, type: 'button', id, role: 'switch', 'aria-checked': String(valor), onclick: () => { cambiar(!valor); pintar(); } },
          h('span', { class: 'texto-op' }, h('strong', {}, titulo), h('span', {}, desc)), h('i', { class: 'pastilla' }, valor ? 'Sí' : 'No'));
      const muestra = [['A', 'H'], ['A', 'D'], ['A', 'C'], ['A', 'S']].map(([valor, pinta]) => crearCarta(valor as never, pinta as never));
      cuerpo.append(
        h('p', {}, 'Colores'),
        interruptor('visual-pastel', 'Tonos pastel', 'Suaviza saturación y contraste de toda la interfaz para una vista más tranquila.', v.pastel, (x) => this.ctx.visual.cambiar({ pastel: x })),
        interruptor('visual-daltonico', 'Modo daltónico', 'Baraja de cuatro colores bien distinguibles (naranja, azul, verde y negro) y más contraste en los contornos.', v.daltonico, (x) => this.ctx.visual.cambiar({ daltonico: x })),
        h('div', { class: 'muestra-pintas' }, ...muestra.map((c) => miniCarta(c))),
        h('p', {}, 'Efectos de fondo animado'),
        ...opciones.map(([id, nom, desc]) =>
          h('button', { class: `opcion${this.ctx.fondo.modoActual === id ? ' activa' : ''}`, type: 'button', dataset: { efecto: id }, onclick: () => {
            this.ctx.fondo.establecer(id);
            this.ctx.almacen.efectos = id;
            pintar();
          } }, h('strong', {}, nom), h('span', {}, desc))),
      );
    };
    pintar();
    this.abrirModal('Efectos visuales', cuerpo);
  }
}
