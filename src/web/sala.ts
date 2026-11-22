import { MODALIDADES, type ModalidadId, type ParametrosModalidad } from '../kernel/config.js';
import type { VistaMesa } from '../kernel/protocolo.js';
import { urlAvatar, urlDorsoSkin, urlIcono } from './assets.js';
import { SKIN_CARTA_DEFECTO } from '../extras/skins/skins.js';
import type { Contexto } from './contexto.js';
import { h, img, vaciar } from './dom.js';
import { estadoConexion, textoConexion } from './net.js';

/** Sala de espera: jugadores, bots y configuración de la partida (solo el anfitrión edita). */
export class PantallaSala {
  readonly el = h('section', { class: 'pantalla sala' });

  constructor(private readonly ctx: Contexto) {}

  actualizar(v: VistaMesa): void {
    vaciar(this.el);
    const soyHost = v.hostId === v.yoId;
    const p = v.parametros;
    const info = MODALIDADES.find((m) => m.id === v.modalidad)!;
    const enlace = `${location.origin}${location.pathname}?sala=${v.codigo}`;

    const copiar = async (): Promise<void> => {
      try {
        await navigator.clipboard.writeText(enlace);
        this.ctx.toast('Enlace de invitación copiado', 'ok');
      } catch {
        this.ctx.toast(enlace, 'info');
      }
    };

    const herramienta = (id: string | null, icono: string | null, texto: string, accion: (e: Event) => void, extra: Record<string, string> = {}): HTMLElement =>
      h('button', { class: 'herramienta', type: 'button', ...(id ? { id } : {}), ...extra, onclick: accion },
        icono ? img(urlIcono(icono), 'ic') : h('span', { class: 'ic emoji' }, '😀'), h('span', {}, texto));

    const cabecera = h('header', { class: 'sala-cab' },
      h('div', { class: 'ticket' },
        h('span', { class: 'mini' }, 'Código de sala'),
        h('div', { class: 'codigo-sala', id: 'codigo-sala' }, v.codigo),
        h('button', { class: 'btn mini', type: 'button', onclick: copiar }, img(urlIcono('copiar'), 'ic'), 'Copiar invitación'),
      ),
      h('div', { class: 'sala-titulo' },
        h('span', { class: 'mini' }, 'Modalidad'),
        h('h1', {}, info.nombre),
        h('p', {}, soyHost ? 'Eres el anfitrión: configura y da la salida.' : 'Estás en la sala. El anfitrión configura la partida.'),
        h('span', { class: `chip-conexion${estadoConexion.tiempoReal ? ' en-vivo' : ''}`, id: 'estado-conexion', title: 'En vivo = aviso instantáneo de Supabase Realtime' }, textoConexion()),
      ),
      h('nav', { class: 'sala-herramientas' },
        herramienta(null, 'ayuda', 'Reglas', () => this.ctx.abrirAyuda()),
        herramienta('btn-ajustes-sala', 'ajustes', 'Efectos', () => this.ctx.abrirAjustes()),
        herramienta('btn-sonido-sala', 'sonido', 'Sonido', () => this.ctx.abrirSonido()),
        herramienta('btn-reaccion-sala', null, 'Reaccionar', (e: Event) => this.ctx.reacciones.abrirMenu(e.currentTarget as HTMLElement, 'abajo'), { title: 'Enviar una reacción', 'data-abre-rx': '1' }),
        herramienta('btn-estilo-sala', 'paleta', 'Estilo', () => this.ctx.abrirEstilo()),
        herramienta(null, 'salir', 'Salir', () => this.ctx.enviar({ t: 'salir' }), { class: 'herramienta peligro' }),
      ),
    );

    const slots = Array.from({ length: p.maxJugadores }, (_, i) => v.jugadores[i]);
    const lista = h('ul', { class: 'jugadores' },
      ...slots.map((j, i) =>
        j
          ? h('li', { class: `jugador${j.id === v.yoId ? ' yo' : ''}`, dataset: { id: j.id } },
              img(urlAvatar(j.asiento), 'avatar'),
              h('div', { class: 'datos' },
                h('strong', {}, j.nombre),
                h('span', {}, [j.esHost ? 'Anfitrión' : null, j.esBot ? 'Bot' : null, !j.conectado ? 'Desconectado' : null].filter(Boolean).join(' - ') || 'Listo'),
              ),
              h('div', { class: 'extras' },
                img(urlDorsoSkin(j.skinCartas ?? SKIN_CARTA_DEFECTO), 'skin-mini'),
                j.mesaPremium ? h('span', { class: 'chip-mesa', title: 'Mesa premium' }, img(urlIcono('mesa'), 'ic')) : null,
                j.esHost ? img(urlIcono('corona'), 'ic') : null,
                j.esBot ? img(urlIcono('bot'), 'ic') : null,
                j.silenciado ? h('span', { class: 'chip-silencio', title: 'La sala lo silenció' }, 'Silenciado') : null,
                !j.esBot && j.id !== v.yoId
                  ? h('button', { class: `btn mini silenciar${j.silenciadoPorMi ? ' activo' : ''}`, type: 'button', dataset: { silenciar: j.id }, title: j.silenciadoPorMi ? 'Quitar silencio' : 'Silenciar sus reacciones', onclick: () => this.ctx.enviar({ t: 'silenciar', jugadorId: j.id, activo: !j.silenciadoPorMi }) }, j.silenciadoPorMi ? '🔇' : '🔊')
                  : null,
                soyHost && j.id !== v.yoId
                  ? h('button', { class: 'btn mini peligro', type: 'button', title: 'Quitar', onclick: () => this.ctx.enviar({ t: 'quitar_jugador', jugadorId: j.id }) }, 'X')
                  : null,
              ),
            )
          : h('li', { class: 'jugador vacio' }, h('span', {}, `Silla ${i + 1} libre`)),
      ),
    );

    const puedeIniciar = soyHost && v.jugadores.length >= p.minJugadores;
    const aviso = soyHost
      ? (puedeIniciar ? '' : `Se necesitan al menos ${p.minJugadores} jugadores (agrega un bot para probar).`)
      : 'Esperando a que el anfitrión inicie la partida...';
    // Los botones tienen posición y tamaño fijos: el aviso va debajo, en un espacio reservado, para que nada se mueva.
    const acciones = h('div', { class: 'acciones-sala' },
      h('div', { class: 'fila-fija' },
        soyHost
          ? h('button', { class: 'btn', id: 'btn-bot', type: 'button', disabled: v.jugadores.length >= p.maxJugadores, onclick: () => this.ctx.enviar({ t: 'agregar_bot' }) }, img(urlIcono('bot'), 'ic'), 'Agregar bot')
          : null,
        soyHost
          ? h('button', { class: 'btn primario grande', id: 'btn-iniciar', type: 'button', disabled: !puedeIniciar, onclick: () => this.ctx.enviar({ t: 'iniciar' }) }, 'Iniciar partida')
          : null,
      ),
      h('p', { class: 'esperando reservado' }, aviso),
    );

    const izquierda = h('div', { class: 'col col-jugadores' }, h('h2', {}, `Jugadores (${v.jugadores.length}/${p.maxJugadores})`), lista, acciones);
    const derecha = h('div', { class: 'col col-config' }, h('h2', {}, 'Reglas de la mesa'), this.config(v, soyHost, info.resumen));

    this.el.append(cabecera, h('div', { class: 'sala-cuerpo' }, izquierda, derecha));
  }

  private config(v: VistaMesa, editable: boolean, resumen: string): HTMLElement {
    const p = v.parametros;
    const cambiar = (parametros: Partial<ParametrosModalidad>): void => this.ctx.enviar({ t: 'configurar', parametros });

    const modos = h('div', { class: 'modos compacto' },
      ...MODALIDADES.map((m) =>
        h('button', {
          class: `modo${m.id === v.modalidad ? ' activo' : ''}`,
          type: 'button',
          disabled: !editable,
          dataset: { modo: m.id },
          onclick: () => this.ctx.enviar({ t: 'configurar', modalidad: m.id as ModalidadId }),
        }, h('strong', {}, m.nombre)),
      ),
    );

    const sel = <T extends string | number>(
      titulo: string,
      valor: T,
      opciones: Array<[T, string]>,
      alCambiar: (v: T) => void,
      id: string,
    ): HTMLElement =>
      h('label', { class: 'etiqueta' }, titulo,
        h('select', {
          class: 'campo',
          id,
          disabled: !editable,
          onchange: (e: Event) => {
            const raw = (e.target as HTMLSelectElement).value;
            alCambiar((typeof valor === 'number' ? Number(raw) : raw) as T);
          },
        }, ...opciones.map(([val, txt]) => h('option', { value: String(val), selected: val === valor }, txt))),
      );

    const campos: HTMLElement[] = [
      sel('Tiempo por turno', p.tiempoTurnoSeg, [[20, '20 s'], [30, '30 s'], [45, '45 s'], [60, '60 s'], [90, '90 s'], [120, '2 min']], (x) => cambiar({ tiempoTurnoSeg: x }), 'cfg-tiempo'),
      sel('Comodines en el mazo', p.comodines, [[0, 'Sin comodines'], [2, '2 comodines'], [4, '4 comodines']], (x) => cambiar({ comodines: x as 0 | 2 | 4 }), 'cfg-comodines'),
      sel('Valor del As suelto', p.valorAs, [[1, 'As = 1'], [10, 'As = 10'], [11, 'As = 11']], (x) => cambiar({ valorAs: x as 1 | 10 | 11 }), 'cfg-as'),
      sel('As en escaleras', p.aceEscalera, [['AMBOS', 'Alto o bajo (A-2-3 / Q-K-A)'], ['BAJO', 'Solo bajo (A-2-3)'], ['ALTO', 'Solo alto (Q-K-A)']], (x) => cambiar({ aceEscalera: x as ParametrosModalidad['aceEscalera'] }), 'cfg-ace'),
      sel('Robar del pozo', p.permitirRoboPozo ? 'si' : 'no', [['si', 'Permitido'], ['no', 'No permitido']], (x) => cambiar({ permitirRoboPozo: x === 'si' }), 'cfg-pozo'),
    ];
    if (v.modalidad === 'CLASICA') {
      campos.push(sel('Victorias para ganar', p.victoriasObjetivo, [1, 2, 3, 5, 7].map((n) => [n, `${n}`] as [number, string]), (x) => cambiar({ victoriasObjetivo: x }), 'cfg-victorias'));
    }
    if (v.modalidad === 'APUNTADO') {
      campos.push(sel('Eliminación al llegar a', p.umbralEliminacion, [51, 71, 101, 151].map((n) => [n, `${n} puntos`] as [number, string]), (x) => cambiar({ umbralEliminacion: x }), 'cfg-umbral'));
      campos.push(sel('Cerrar con sobrante', p.permitirCierreConSobrante ? 'si' : 'no', [['si', `Permitido (sobrante < ${p.sobranteMaxApuntado} pts)`], ['no', 'No (cuarta+2 ternas+descarte)']], (x) => cambiar({ permitirCierreConSobrante: x === 'si' }), 'cfg-sobrante'));
      if (p.permitirCierreConSobrante) campos.push(sel('Cuarta o quinta cuenta como terna', p.cuartaCuentaComoTerna ? 'si' : 'no', [['no', 'No (solo 3 ternas)'], ['si', 'Sí (3-3-3, 4-3-3, 4-4-3, 5-3-3)']], (x) => cambiar({ cuartaCuentaComoTerna: x === 'si' }), 'cfg-cuarta-terna'));
    }

    return h('div', { class: 'config' },
      modos,
      h('p', { class: 'resumen' }, resumen),
      h('div', { class: 'grid-campos' }, ...campos),
      h('p', { class: 'mini' }, `Mazos: ${p.mazos === 'AUTO' ? 'automático (2 mazos con 5-6 jugadores)' : p.mazos} - ${p.cartasPorMano} cartas por mano`),
      editable ? null : h('p', { class: 'mini' }, 'Solo el anfitrión puede cambiar la configuración.'),
    );
  }
}
