import { MODALIDADES, type ModalidadId } from '../kernel/config.js';
import { urlUi, urlIcono } from './assets.js';
import type { Contexto } from './contexto.js';
import { h, img, vaciar } from './dom.js';

/** Pantalla de inicio: nombre, crear sala (con modalidad) o unirse por código. */
export class PantallaInicio {
  readonly el = h('section', { class: 'pantalla inicio' });
  private modalidad: ModalidadId = 'APUNTADO';

  constructor(private readonly ctx: Contexto) {
    this.construir();
  }

  private construir(): void {
    vaciar(this.el);
    const params = new URLSearchParams(location.search);
    const codigoUrl = (params.get('sala') ?? '').toUpperCase().slice(0, 5);

    const nombre = h('input', {
      class: 'campo',
      id: 'in-nombre',
      maxlength: 16,
      placeholder: 'Ej. Lupe',
      value: this.ctx.almacen.nombre,
      autocomplete: 'nickname',
    });
    const codigo = h('input', {
      class: 'campo codigo',
      id: 'in-codigo',
      maxlength: 5,
      placeholder: 'CÓDIGO',
      value: codigoUrl,
      autocapitalize: 'characters',
      autocomplete: 'off',
    });

    const tarjetas = MODALIDADES.map((m) =>
      h(
        'button',
        {
          class: `modo${m.id === this.modalidad ? ' activo' : ''}`,
          type: 'button',
          dataset: { modo: m.id },
          onclick: () => {
            this.modalidad = m.id;
            tarjetas.forEach((t) => t.classList.toggle('activo', t.dataset.modo === m.id));
          },
        },
        h('strong', {}, m.nombre),
        h('span', {}, m.resumen),
      ),
    );

    const nombreValido = (): string | null => {
      const n = nombre.value.trim();
      if (n.length < 2) {
        this.ctx.toast('Escribe un nombre de al menos 2 letras.', 'error');
        nombre.focus();
        return null;
      }
      this.ctx.almacen.nombre = n;
      return n;
    };

    const crear = h(
      'button',
      {
        class: 'btn primario grande',
        id: 'btn-crear',
        type: 'button',
        onclick: () => {
          const n = nombreValido();
          if (n) this.ctx.enviar({ t: 'crear_sala', nombre: n, modalidad: this.modalidad });
        },
      },
      'Crear sala nueva',
    );
    const unirse = h(
      'button',
      {
        class: 'btn grande',
        id: 'btn-unirse',
        type: 'button',
        onclick: () => {
          const n = nombreValido();
          const c = codigo.value.trim().toUpperCase();
          if (!n) return;
          if (c.length !== 5) return this.ctx.toast('El código de sala tiene 5 caracteres.', 'error');
          this.ctx.enviar({ t: 'unirse', codigo: c, nombre: n });
        },
      },
      'Unirse',
    );

    const abanico = h('div', { class: 'abanico', 'aria-hidden': 'true' },
      ...['AH', 'KS', 'QD', 'JC', 'AS'].map((c, i) => img(`assets/cards/${c}.svg`, `carta-abanico c${i}`)),
    );
    const pie = h('nav', { class: 'inicio-pie' },
      h('button', { class: 'btn texto', type: 'button', onclick: () => this.ctx.abrirAyuda() }, img(urlIcono('ayuda'), 'ic'), 'Reglas'),
      h('button', { class: 'btn texto', type: 'button', onclick: () => this.ctx.abrirAjustes() }, img(urlIcono('ajustes'), 'ic'), 'Efectos'),
      h('button', { class: 'btn texto', id: 'btn-sonido-inicio', type: 'button', onclick: () => this.ctx.abrirSonido() }, img(urlIcono('sonido'), 'ic'), 'Sonido'),
      h('button', { class: 'btn texto', id: 'btn-estilo-inicio', type: 'button', onclick: () => this.ctx.abrirEstilo() }, img(urlIcono('paleta'), 'ic'), 'Estilo'),
      h('button', { class: 'btn texto', id: 'btn-salir-sitio', type: 'button', title: 'Cerrar la sesión de acceso en este navegador', onclick: () => this.ctx.salirDelSitio() }, img(urlIcono('salir'), 'ic'), 'Salir del sitio'),
    );

    this.el.append(
      h('div', { class: 'inicio-cartel' },
        img(urlUi('logo'), 'logo', 'El Apuntado'),
        h('p', { class: 'lema' }, 'Cartas, rondas y estrategia en la frontera'),
        abanico,
        pie,
      ),
      h('div', { class: 'inicio-panel' },
        h('h2', {}, 'Arma tu mesa'),
        h('label', { class: 'etiqueta' }, 'Tu apodo', nombre),
        h('div', { class: 'paso' }, h('span', { class: 'num' }, '1'), 'Elige la modalidad'),
        h('div', { class: 'modos' }, ...tarjetas),
        h('div', { class: 'paso' }, h('span', { class: 'num' }, '2'), 'Abre la sala e invita'),
        h('div', { class: 'fila' }, crear),
        h('div', { class: 'separador' }, h('span', {}, 'o entra con un código')),
        h('div', { class: 'fila' }, codigo, unirse),
      ),
    );
    nombre.addEventListener('keydown', (e) => e.key === 'Enter' && (codigo.value ? unirse : crear).click());
    codigo.addEventListener('keydown', (e) => e.key === 'Enter' && unirse.click());
    codigo.addEventListener('input', () => (codigo.value = codigo.value.toUpperCase()));
  }
}
