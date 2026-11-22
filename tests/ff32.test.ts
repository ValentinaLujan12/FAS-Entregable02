import { describe, expect, it } from 'vitest';
import { type FilaLatencia, LINEA_BASE_MS, evaluarFF32 } from '../tools/ff32-latencia-produccion.js';

/** FF-32 (G7): alerta si el p99 de la latencia en producción sale de la línea base (Responsiveness < 300 ms). */
describe('FF-32 (G7): monitoreo de la latencia en producción', () => {
  const fila = (servidor: number | null, cliente: number | null, muestras = 30): FilaLatencia => ({
    codigo: 'ABC', partida: 1, servidor_p99_ms: servidor, cliente_p99_ms: cliente, muestras_latencia: muestras,
  });

  it('cumple cuando la mediana de los p99 está bajo la línea base, aunque una partida aislada la supere', () => {
    const r = evaluarFF32([fila(80, 150), fila(90, 900), fila(70, 160)]);
    expect(r.estado).toBe('CUMPLE');
    expect(r.lineaBaseMs).toBe(LINEA_BASE_MS);
    expect(r.cliente).toEqual({ medianaMs: 160, peorMs: 900, partidasSobreLineaBase: 1 });
    expect(r.muestras).toBe(90);
  });

  it('alerta cuando la regresión es sostenida, en el servidor o en el cliente', () => {
    expect(evaluarFF32([fila(320, 100), fila(350, 120)]).estado).toBe('ALERTA');
    expect(evaluarFF32([fila(50, 400), fila(60, 420), fila(40, 100)]).estado).toBe('ALERTA');
    expect(evaluarFF32([fila(50, 250), fila(60, 280)], 200).estado).toBe('ALERTA');
  });

  it('no concluye sin datos suficientes ni con partidas sin latencia del navegador', () => {
    expect(evaluarFF32([]).estado).toBe('SIN_DATOS');
    expect(evaluarFF32([fila(900, 900, 5)]).estado).toBe('SIN_DATOS');
    const r = evaluarFF32([fila(40, null), fila(60, null)]);
    expect(r.estado).toBe('CUMPLE');
    expect(r.cliente.medianaMs).toBeNull();
    expect(r.servidor.medianaMs).toBe(50);
  });
});
