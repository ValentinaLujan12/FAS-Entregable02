/**
 * Función serverless de Vercel: todas las rutas /api/* llegan aquí (ver vercel.json).
 * El contexto (conexión a Supabase, usuarios de acceso) se crea una vez por instancia y se reutiliza mientras esté "tibia".
 */
import { crearContexto, manejar, type Contexto } from '../src/serverless/manejador.js';

let ctx: Contexto | null = null;

export default {
  async fetch(request: Request): Promise<Response> {
    ctx ??= crearContexto(process.env);
    return manejar(request, ctx);
  },
};
