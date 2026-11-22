/** Utilidades mínimas de DOM (sin framework: se prioriza tamaño y control sobre las animaciones). */
export type Hijo = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> = {},
  ...hijos: Hijo[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of hijos) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export const vaciar = (el: Element): void => {
  while (el.firstChild) el.removeChild(el.firstChild);
};

export const img = (src: string, cls = '', alt = ''): HTMLImageElement => {
  const i = document.createElement('img');
  i.src = src;
  i.alt = alt;
  i.draggable = false;
  if (cls) i.className = cls;
  return i;
};

/** append() tolerante: ignora null/undefined/false (útil con hijos condicionales). */
export const agregar = (el: Element, ...hijos: Hijo[]): void => {
  for (const c of hijos) if (c !== null && c !== undefined && c !== false) el.append(c);
};
