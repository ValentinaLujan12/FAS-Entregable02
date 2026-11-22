/**
 * Pantalla de acceso: usuario y contraseña comunes que define el administrador del sitio.
 * El navegador no guarda nada: el servidor responde con una cookie de sesión HttpOnly que este código no puede leer.
 */
import { urlUi } from './assets.js';
import { h, img } from './dom.js';

export const apiAcceso = {
  async estado(): Promise<boolean | 'sin-red'> {
    try {
      const r = await fetch('/api/acceso', { credentials: 'same-origin', cache: 'no-store' });
      if (!r.ok) return 'sin-red';
      return ((await r.json()) as { acceso: boolean }).acceso === true;
    } catch {
      return 'sin-red';
    }
  },
  async entrar(usuario: string, contrasena: string): Promise<{ ok: boolean; mensaje?: string }> {
    try {
      const r = await fetch('/api/acceso/entrar', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario, contrasena }),
      });
      if (r.ok) return { ok: true };
      const d = (await r.json().catch(() => ({}))) as { mensaje?: string };
      return { ok: false, mensaje: d.mensaje ?? 'No se pudo entrar.' };
    } catch {
      return { ok: false, mensaje: 'No hay conexión con el servidor.' };
    }
  },
  async salir(): Promise<void> {
    await fetch('/api/acceso/salir', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => undefined);
  },
};

export class PantallaAcceso {
  readonly el = h('section', { class: 'pantalla acceso' });

  constructor(o: { toast(t: string, tipo?: 'info' | 'error' | 'ok'): void; alEntrar(): void; abrirAyuda(): void }) {
    const usuario = h('input', { class: 'campo', id: 'in-usuario', autocomplete: 'username', maxlength: 64, placeholder: 'Usuario', spellcheck: 'false', autocapitalize: 'off' }) as HTMLInputElement;
    const clave = h('input', { class: 'campo', id: 'in-contrasena', type: 'password', autocomplete: 'current-password', maxlength: 256, placeholder: 'Contraseña' }) as HTMLInputElement;
    const boton = h('button', { class: 'btn primario grande', type: 'submit', id: 'btn-entrar' }, 'Entrar al saloon');
    const form = h('form', { class: 'form-acceso', novalidate: true },
      h('label', { class: 'etiqueta' }, 'Usuario', usuario),
      h('label', { class: 'etiqueta' }, 'Contraseña', clave),
      boton,
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!usuario.value.trim() || !clave.value) return o.toast('Escribe usuario y contraseña.', 'error');
      boton.disabled = true;
      boton.textContent = 'Verificando...';
      const r = await apiAcceso.entrar(usuario.value.trim(), clave.value);
      boton.disabled = false;
      boton.textContent = 'Entrar al saloon';
      clave.value = '';
      if (!r.ok) return o.toast(r.mensaje ?? 'No se pudo entrar.', 'error');
      o.alEntrar();
    });
    this.el.append(
      h('div', { class: 'acceso-tarjeta' },
        img(urlUi('logo'), 'logo', 'El Apuntado'),
        h('p', { class: 'lema' }, 'Cartas, rondas y estrategia en la frontera'),
        form,
        h('p', { class: 'nota' }, 'El acceso lo entrega quien administra el sitio.'),
        h('button', { class: 'btn texto', type: 'button', onclick: () => o.abrirAyuda() }, 'Reglas del juego'),
      ),
    );
    window.setTimeout(() => usuario.focus(), 50);
  }
}
