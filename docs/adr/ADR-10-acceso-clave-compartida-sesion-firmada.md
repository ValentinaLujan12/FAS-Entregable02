# ADR-10: ACCESO CON CLAVE COMPARTIDA Y SESIÓN FIRMADA

**ESTADO:** Accepted (nuevo en el Entregable 3)

**CONTEXTO:**

El juego se publica en internet y debe limitar quién puede crear salas. Un sistema de cuentas completo excede el alcance del MVP y del Entregable 2 (que no definía identidad). El Entregable 2 dejó pendiente la identidad por conexión (FF-29).

**DECISIÓN:**

1. Acceso con usuario y clave definidos por el administrador. Solo el hash PBKDF2-SHA256 (600 000 iteraciones) se guarda en una variable de entorno de Vercel. La clave nunca se guarda en el repositorio.
2. Tras autenticarse, el servidor emite una cookie firmada, `HttpOnly`, `Secure` y `SameSite=Strict`, válida 7 días.
3. Límite de intentos de acceso y de creación de salas mediante la función `contar_intento` (identificador anónimo diario, nunca la IP).
4. Los jugadores solo reciben su propia mano; el servidor es la única autoridad.

**ALTERNATIVAS RECHAZADAS:**

- **Autenticación de terceros (OAuth):** dependencia externa y configuración que no aporta al alcance.
- **Sin acceso:** permitiría abuso de creación de salas.

**CONSECUENCIAS:**

**Positivas:** protección simple y verificable; sin datos personales.

**Negativas:** la cuenta es compartida por usuario definido; cerrar una sesión concreta requiere almacenamiento de sesiones (pendiente, ver backlog del juego).

**CUMPLIMIENTO:** prueba de acceso (sin cookie no hay partida; intentos fallidos se limitan) en la suite de servidor.

**REFERENCIAS:** Richards & Ford (2025), Cap. 6 (fitness functions de seguridad); ADR-06.
