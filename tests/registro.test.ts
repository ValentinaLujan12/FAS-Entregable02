import { describe, expect, it } from 'vitest';
import { crearRegistroReglas } from '../src/rules/RegistroReglas.js';
import { MODALIDADES, parametrosPorDefecto } from '../src/kernel/config.js';

/**
 * FF-13 adaptada (ADR-08): cada modalidad de la configuracion tiene una estrategia registrada, y cada estrategia
 * declara la misma modalidad con la que se registro.
 */
describe('registro de estrategias (ADR-08)', () => {
  const motor = crearRegistroReglas();
  const idsConfig = MODALIDADES.map((m) => m.id).sort();

  it('toda modalidad configurada tiene una estrategia registrada, y solo esas', () => {
    expect([...motor.modalidades()].sort()).toEqual(idsConfig);
  });

  it('cada estrategia declara la modalidad con la que se registro', () => {
    for (const id of idsConfig) {
      const regla = motor.reglaPara(parametrosPorDefecto(id as 'CLASICA'));
      expect(regla.getModalidad()).toBe(id);
    }
  });
});
