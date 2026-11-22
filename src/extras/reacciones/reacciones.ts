/**
 * Reacciones rápidas (chat básico sin texto libre). Catálogo COMPARTIDO por cliente y servidor:
 * el servidor solo acepta ids de esta lista (nunca texto del cliente) y los bots usan los mismos ids.
 * Para agregar una: añade una entrada aquí y, si quieres un sonido propio, su id en src/extras/web/sonido.ts (`reaccion_*`).
 */
export interface ReaccionDef {
  id: string;
  emoji: string;
  texto: string;
  /** Familia de sonido sintetizado (ver `Sonido.reproducirReaccion`). */
  sonido: 'saludo' | 'risa' | 'aplauso' | 'uy' | 'trompeta' | 'queja' | 'burla' | 'ok';
}

export const REACCIONES: readonly ReaccionDef[] = [
  { id: 'hola', emoji: '👋', texto: '¡Hola!', sonido: 'saludo' },
  { id: 'buena', emoji: '👍', texto: '¡Buena jugada!', sonido: 'ok' },
  { id: 'gracias', emoji: '🙏', texto: 'Gracias', sonido: 'ok' },
  { id: 'jaja', emoji: '😂', texto: 'Jajaja', sonido: 'risa' },
  { id: 'uy', emoji: '😬', texto: '¡Uy!', sonido: 'uy' },
  { id: 'celebro', emoji: '🎉', texto: '¡Eso es!', sonido: 'aplauso' },
  { id: 'facil', emoji: '😎', texto: 'Fácil...', sonido: 'trompeta' },
  { id: 'sarcasmo', emoji: '🙄', texto: 'Qué suerte la tuya', sonido: 'burla' },
  { id: 'queja', emoji: '😤', texto: 'Siempre me pasa a mí', sonido: 'queja' },
  { id: 'apurate', emoji: '⏱️', texto: '¡Apúrate!', sonido: 'uy' },
  { id: 'gg', emoji: '🤝', texto: 'GG', sonido: 'ok' },
  { id: 'wow', emoji: '😮', texto: '¡Wow!', sonido: 'trompeta' },
];

export const esReaccionValida = (id: unknown): id is string => typeof id === 'string' && REACCIONES.some((r) => r.id === id);
export const reaccion = (id: string): ReaccionDef | undefined => REACCIONES.find((r) => r.id === id);

/** Tiempo mínimo entre dos reacciones del mismo jugador (anti-spam, lo aplica el servidor). */
export const REACCION_ENFRIAMIENTO_MS = 1200;

/** Umbral de silencio colectivo: se silencia para TODOS cuando lo silencian ⌈activos/2⌉ humanos (techo de la mitad). */
export const umbralSilencio = (humanosActivos: number): number => Math.max(1, Math.ceil(humanosActivos / 2));
