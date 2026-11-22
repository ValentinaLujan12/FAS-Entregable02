# ADR-08: REGISTRO EXPLÍCITO DE ESTRATEGIAS DE REGLAS (MODIFICA LA PARTE DE DESCUBRIMIENTO DE ADR-03)

**ESTADO:** Accepted (nuevo en el Entregable 3). Modifica parcialmente ADR-03.

**CONTEXTO:**

ADR-03 propone que `CatalogoEstrategias` descubra automáticamente las estrategias que implementan `IReglaJuego` (en Java, por escaneo de classpath). En TypeScript el código se empaqueta con esbuild para Vercel y no existe un escaneo de archivos en tiempo de ejecución.

**DECISIÓN:**

1. Cada modalidad se registra en un solo lugar: la función `crearRegistroReglas()` en `src/rules/RegistroReglas.ts`, con una lista explícita de estrategias. `RegistroReglas` implementa el contrato `IRegistroReglas` (Entregable 2), que es lo único que conoce el orquestador; la composición (capa serverless y pruebas) crea el registro concreto.
2. Una prueba de consistencia (equivalente a FF-13, `tests/registro.test.ts`) comprueba que las modalidades registradas coinciden exactamente con las de la configuración (`MODALIDADES`) y que cada estrategia declara la modalidad con la que se registró.
3. Agregar una modalidad implica: crear la clase, registrarla en el archivo y añadir su ficha en `MODALIDADES`. No se modifica el motor.

**ALTERNATIVAS RECHAZADAS:**

- **Carga dinámica por nombre de archivo:** frágil con el empaquetado y difícil de verificar en CI.
- **Mapa en `RegistroReglas`:** acopla el motor a las modalidades; contradice ADR-03.

**CONSECUENCIAS:**

**Positivas:** el registro es visible en un solo archivo y la consistencia se prueba en CI.

**Negativas:** un paso manual adicional por modalidad (el registro); compensado por la prueba de consistencia.

**CUMPLIMIENTO:** prueba de consistencia de modalidades (FF-13, `tests/registro.test.ts`); regla de dependencias `solo-el-registro-conoce-estrategias` (FF-09): ningún archivo fuera de `RegistroReglas` referencia las estrategias concretas; FF-11: una modalidad de prueba se registra y recorre una partida completa sin modificar `src/`.

**REFERENCIAS:** ADR-03; Richards & Ford (2025), Cap. 21.
