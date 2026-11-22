import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsearMensaje } from '../src/infra/mensajes.js';

/*
 * FF-26 (G5): los contratos publicados (docs/contracts/asyncapi.yaml y openapi.yaml) coinciden con el código.
 * Si se agrega un mensaje o una ruta sin documentarla (o al revés), esta prueba falla.
 */
const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8');

/** Tipos de mensaje declarados en una unión de src/kernel/protocolo.ts (bloque desde "export type <nombre>"). */
function tiposDe(union: string): Set<string> {
  const fuente = leer('src/kernel/protocolo.ts');
  const desde = fuente.indexOf(`export type ${union}`);
  const hasta = fuente.indexOf(';\n', desde);
  return new Set([...fuente.slice(desde, hasta).matchAll(/t: '([a-z_]+)'/g)].map((m) => m[1]!));
}

describe('FF-26 (G5): contratos de mensajes y rutas', () => {
  const asyncapi = leer('docs/contracts/asyncapi.yaml');
  const documentados = new Set([...asyncapi.matchAll(/t: \{ const: ([a-z_]+) \}/g)].map((m) => m[1]!));
  const cliente = tiposDe('MensajeCliente');
  const servidor = tiposDe('MensajeServidor');

  it('todo mensaje del protocolo (cliente y servidor) está en AsyncAPI, y AsyncAPI no documenta mensajes inexistentes', () => {
    expect(cliente.size).toBeGreaterThan(20);
    expect(servidor.size).toBeGreaterThan(5);
    expect([...cliente, ...servidor].filter((t) => !documentados.has(t))).toEqual([]);
    expect([...documentados].filter((t) => !cliente.has(t) && !servidor.has(t))).toEqual([]);
  });

  it('el validador de entrada acepta todos los tipos de mensaje del cliente y rechaza los desconocidos', () => {
    const sinDatos = [...cliente].filter((t) => parsearMensaje(JSON.stringify({ t })) !== null);
    expect(sinDatos).toContain('cerrar');
    expect(parsearMensaje(JSON.stringify({ t: 'inventado' }))).toBeNull();
    expect(parsearMensaje(JSON.stringify({ t: 'constructor' }))).toBeNull();
    expect(parsearMensaje(JSON.stringify({ t: 'toString' }))).toBeNull();
    expect(parsearMensaje('no es json')).toBeNull();
  });

  it('OpenAPI documenta exactamente las rutas que atiende el manejador HTTP', () => {
    const openapi = leer('docs/contracts/openapi.yaml');
    const manejador = leer('src/serverless/manejador.ts');
    const enCodigo = new Set([...manejador.matchAll(/'(?:GET|POST) (\/api\/[a-z/]+)'/g)].map((m) => m[1]!).concat('/api/salud'));
    const enContrato = new Set([...openapi.matchAll(/^ {2}(\/api[a-z/]*):/gm)].map((m) => m[1]!));
    expect(enContrato).toEqual(enCodigo);
  });
});
