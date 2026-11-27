# ADR-06: PLATAFORMA DE EJECUCIÓN Y DATOS: FUNCIÓN SERVERLESS EN VERCEL, TYPESCRIPT Y SUPABASE

**ESTADO:** Accepted (nuevo en el Entregable 3)

**CONTEXTO:**

El Entregable 2 supuso un proceso Java persistente (Spring-like, con puertos JDBC). Para desplegar el juego de forma pública y gratuita, la infraestructura disponible en el equipo es Vercel (hosting y funciones) y Supabase (PostgreSQL gestionado con Realtime). Vercel ejecuta funciones Node.js y TypeScript; el runtime Java no es nativo y requeriría un contenedor propio. El juego ya existe en TypeScript y su motor está probado.

**Fuerzas en juego:**

- Coste cero y despliegue sencillo para el equipo y para el docente.
- Reutilizar el motor de reglas del juego sin reescribirlo en Java.
- Persistencia relacional (ADR-04) sin administrar servidores de base de datos.
- Ninguna dependencia de procesos que permanezcan encendidos.

**DECISIÓN:**

1. **Lenguaje:** TypeScript sobre Node.js 22, con `strict` activo.
2. **Ejecución:** una función serverless de Vercel (`api/index.ts`) que atiende todas las rutas bajo `/api`. El cliente web se publica como archivos estáticos (`public/`).
3. **Datos:** Supabase como PostgreSQL 15 (cumple ADR-04). Se accede con `@supabase/supabase-js` desde el servidor; la clave secreta solo existe en Vercel.
4. **Tiempo real:** Supabase Realtime solo envía avisos de cambio; el estado se consulta al servidor.
5. **Acceso público:** la clave pública del navegador no tiene permisos sobre las tablas (RLS activo sin políticas, y permisos explícitos solo para el rol del servidor).
6. **Región:** la función corre en la misma región que la base de datos (`"regions": ["pdx1"]` en `vercel.json`, junto a Supabase `us-west-2`). Si el proyecto de Supabase se crea en otra región, se cambia esa línea por la región de Vercel más cercana (ver la nota de corrección de ADR-12).

**ALTERNATIVAS RECHAZADAS:**

- **Java 17 en un contenedor de Vercel:** runtime no nativo, depuración más costosa, arranque más lento y mantenimiento de dos lenguajes si el juego sigue en TypeScript.
- **Backend Java persistente (Render, Railway):** habría que reescribir todo el motor en Java y mantener un servicio encendido.
- **SQLite o MongoDB local:** ADR-04 ya los descartó con puntajes menores.

**CONSECUENCIAS:**

**Positivas:** despliegue sin servidor persistente, sin coste fijo y con HTTPS; el motor de reglas se prueba con vitest sobre el mismo código que corre en producción.

**Negativas:** límite de duración por petición (30 s configurados en `vercel.json`); no hay WebSocket propio; el arranque en frío puede añadir latencia; dependencia de dos proveedores.

**CUMPLIMIENTO:**

- `vercel.json` fija `maxDuration` y las cabeceras de seguridad (CSP, HSTS).
- `supabase/esquema.sql` activa RLS en todas las tablas y revoca el acceso público a funciones.
- La prueba de despliegue local (`npm run dev`) usa el mismo módulo de servidor que la función de Vercel.

**REFERENCIAS:**

- Richards, M. & Ford, N. (2025). Cap. 26 (intersecciones entre arquitectura e implementación).
- ADR-04, ADR-05 v2 y ADR-07.
