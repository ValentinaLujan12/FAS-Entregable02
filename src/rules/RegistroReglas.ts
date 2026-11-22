import type { ModalidadId, ParametrosModalidad } from '../kernel/config.js';
import type { FabricaRegla, IReglaJuego, IRegistroReglas } from './IReglaJuego.js';
import { ReglaApuntado101Puntos } from './ReglaApuntado101Puntos.js';
import { ReglaClasicaCuartaTerna } from './ReglaClasicaCuartaTerna.js';

/**
 * RegistroReglas (IRegistroReglas): resuelve la estrategia de cada partida por su modalidad (ADR-03, ADR-08).
 * Es AGNÓSTICO a los detalles de cada modalidad: solo conoce el contrato IReglaJuego.
 * Registrar una modalidad nueva NO modifica esta clase ni el orquestador (Open/Closed).
 */
export class RegistroReglas implements IRegistroReglas {
  private readonly fabricas = new Map<ModalidadId | string, FabricaRegla>();

  registrar(modalidad: ModalidadId | string, fabrica: FabricaRegla): this {
    this.fabricas.set(modalidad, fabrica);
    return this;
  }

  modalidades(): string[] {
    return [...this.fabricas.keys()];
  }

  /** Crea la regla configurada con los parámetros de UNA partida. */
  reglaPara(parametros: ParametrosModalidad): IReglaJuego {
    const fabrica = this.fabricas.get(parametros.modalidad);
    if (!fabrica) throw new Error(`Modalidad no registrada: ${parametros.modalidad}`);
    return fabrica(parametros);
  }
}

/** Composición por defecto (registro explícito, ADR-08): las dos modalidades del proyecto. */
export function crearRegistroReglas(): RegistroReglas {
  return new RegistroReglas()
    .registrar('CLASICA', (p) => new ReglaClasicaCuartaTerna(p))
    .registrar('APUNTADO', (p) => new ReglaApuntado101Puntos(p));
}
