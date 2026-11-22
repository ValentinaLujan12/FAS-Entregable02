/**
 * API pública del módulo deck (Entregable 2: IMazo). El orquestador usa solo este archivo y los contratos;
 * nunca la clase concreta DeckManagement (regla G2 de dependencias en .dependency-cruiser.cjs).
 */
import { type Aleatorio, barajar, crearBaraja } from './Baraja.js';
import { DeckManagement } from './DeckManagement.js';
import type { EstadoMazo, IMazo } from './IMazo.js';

export type { EstadoMazo, IMazo, ResultadoRobo } from './IMazo.js';
export type { Aleatorio } from './Baraja.js';

/** Abre el mazo de una ronda en curso sobre su estado guardado (las operaciones lo modifican en el sitio). */
export function abrirMazo(estado: EstadoMazo): IMazo {
  return new DeckManagement(estado);
}

/** Baraja una baraja nueva (1 o 2 mazos y comodines opcionales) y devuelve el mazo listo para repartir. */
export function nuevoMazo(config: { mazos: 1 | 2; comodines: 0 | 2 | 4 }, rng: Aleatorio): IMazo {
  return DeckManagement.desde(barajar(crearBaraja(config), rng));
}
