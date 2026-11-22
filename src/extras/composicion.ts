/**
 * Composicion de los extras (ADR-11): implementa los puertos de `src/game/puertos.ts` con el catalogo, las cuentas,
 * las reacciones y la estrategia de los bots. La aplicacion (serverless/manejador, pruebas) inyecta este paquete.
 */
import { randomBytes } from 'node:crypto';
import type { IExtrasJuego } from '../game/puertos.js';
import { ServicioCuentas } from './cuentas/ServicioCuentas.js';
import { SKINS_CARTA, SKINS_CELEBRACION, esMesaPremium } from './skins/skins.js';
import { REACCION_ENFRIAMIENTO_MS, esReaccionValida, umbralSilencio } from './reacciones/reacciones.js';
import { PROBABILIDADES_POR_DEFECTO, PlanificadorReacciones } from './bots/ReaccionesBot.js';
import { decidirAccionBot } from './bots/EstrategiaBot.js';
import { fabricaDescarteAnalisis } from './bots/AnalisisMano.js';
import { metricasLatencia } from './metricas/latencia.js';

/** Elige al azar (criptografico, no el RNG de la partida) entre todos los ids del catalogo. */
const alAzar = (lista: readonly { id: string }[]): string => lista[randomBytes(1)[0]! % lista.length]!.id;

export const extrasPorDefecto: IExtrasJuego = {
  estilos: {
    esMesaPremium,
    aleatorioCarta: () => alAzar(SKINS_CARTA),
    aleatorioCelebracion: () => alAzar(SKINS_CELEBRACION),
  },
  reacciones: { valida: esReaccionValida, enfriamientoMs: REACCION_ENFRIAMIENTO_MS, umbralSilencio },
  bots: { decidir: decidirAccionBot },
  probabilidadesBot: PROBABILIDADES_POR_DEFECTO,
  fabricaDescarte: fabricaDescarteAnalisis,
  crearCuentas: (repo, reloj, opciones) => new ServicioCuentas(repo, reloj, opciones),
  crearPlanificador: (p, azar, reloj) => new PlanificadorReacciones(p, azar, reloj),
  metricas: metricasLatencia,
};
