# Protocolo de validación con usuarios reales (Entregable 3, sección 3.1)

**Estado:** diseño listo (revisado el 22/11/2026: la tabla `evento` ya existe en el esquema). Las sesiones NO se han realizado. Los resultados se registrarán solo con datos reales.
**Responsable de sesiones:** equipo (2 guías). **Fecha:** abierta (por definir).

## 1. Población

- **5 jugadores evaluadores**, ajenos al equipo de desarrollo (amigos, familiares o compañeros de otros cursos).
- **2 guías** del equipo que facilitan la sesión y registran observaciones. Los guías no cuentan como evaluadores.
- En el juego hay 7 cuentas de prueba: 5 para jugadores y 2 para guías.

## 2. Preparación

1. Crear las 7 cuentas de prueba (acceso con clave, ADR-10).
2. Verificar que el despliegue responde (guía de despliegue, paso de comprobación).
3. Confirmar que los registros de eventos se están guardando (ADR-09).
4. Imprimir o tener a la mano: consentimiento, guion de tareas, hoja de registro y encuesta SUS.

## 3. Consentimiento informado

Antes de la sesión, el jugador lee y firma (o acepta por escrito):
- Participación voluntaria, puede retirarse en cualquier momento sin consecuencias.
- Se registran acciones del juego (jugadas, tiempos, errores de regla) con un identificador anónimo. No se guardan direcciones IP ni datos personales.
- No se graban audio ni video sin autorización adicional.
- Los datos se usan solo con fines académicos del curso.

## 4. Guion de tareas (sin asistencia técnica)

| Tarea | Descripción | Qué se mide |
|---|---|---|
| T1 | Crear una sala y elegir la modalidad (Clásica o Apuntado). | Éxito, tiempo. |
| T2 | Realizar 3 turnos completos: robar del mazo o del pozo, ordenar la mano, descartar. | Éxito por turno, tiempo por turno, errores. |
| T3 | Intentar un cierre de ronda válido. | Éxito, tiempo. |
| T4 | Intentar un cierre inválido a propósito y leer la retroalimentación. | ¿Entendió el mensaje? (sí/no) y tiempo hasta corregir. |
| T5 | (Apuntado) Jugar rondas hasta ver la acumulación y la eliminación al llegar a 101. | ¿Entendió la regla? (sí/no). |

Los guías no dan pistas durante la tarea. Solo intervienen si el jugador se bloquea más de 3 minutos, y lo anotan.

## 5. Métricas

**Cuantitativas (del registro de eventos y del histórico `partida_registro`):**
- Tasa de cierres válidos por jugador (T3).
- Número de errores de regla por jugador.
- Tiempo promedio por turno (segundos).
- Latencia real por jugada: ida y vuelta medida por el navegador (percibida por el jugador) y tiempo de proceso en el servidor, en p50, p95 y p99 por partida (`partida_registro`); al terminar la sesión se ejecuta FF-32 (`npm run ff32`).

**Cualitativas:**
- **SUS (System Usability Scale):** 10 ítems en escala de 1 a 5 (totalmente en desacuerdo a totalmente de acuerdo). Ítems impares: puntaje = respuesta - 1. Ítems pares: puntaje = 5 - respuesta. Total = suma × 2,5 (rango 0 a 100).
- Observaciones de los guías (confusiones, frases literales del jugador).

Los 10 ítems SUS (en español):
1. Creo que me gustaría usar este sistema con frecuencia.
2. Encontré el sistema innecesariamente complejo.
3. Pensé que el sistema era fácil de usar.
4. Creo que necesitaría ayuda de una persona técnica para usar este sistema.
5. Encontré que las distintas funciones del sistema estaban bien integradas.
6. Pensé que había demasiada inconsistencia en este sistema.
7. Imagino que la mayoría de las personas aprendería a usar este sistema muy rápidamente.
8. Encontré el sistema muy incómodo de usar.
9. Me sentí muy seguro usando el sistema.
10. Tuve que aprender muchas cosas antes de poder empezar a usar este sistema.

## 6. Hoja de registro por sesión

| Campo | Valor |
|---|---|
| ID de jugador (anónimo, U01 a U05) | |
| Modalidad probada | |
| T1 a T5: éxito (sí/no) | |
| Errores de regla observados | |
| Tiempo promedio por turno (s) | |
| SUS (0 a 100) | |
| Observación del guía | |
| Guía que registra | |

## 7. Exportación de evidencias

Los registros de eventos se exportan desde Supabase (SQL Editor) con una consulta por ventana de la sesión (tabla `evento`, ADR-09):

```sql
select codigo as sala, tipo, ocurrido_en, detalle
  from evento
 where ocurrido_en >= '<inicio de la sesión>'
   and ocurrido_en <  '<fin de la sesión>'
 order by codigo, ocurrido_en;
```

Además se exporta el resumen de cada partida: `select * from partida_registro where fin >= '<inicio>' and fin < '<fin>';` el detalle por jugador (`partida_jugador_registro`, consulta en `docs/evidencias/README.md`) y el agregado `select * from v_metricas_partidas;`. Cada jugador entra a la sala con su código anónimo (U01 a U05) como nombre.

Los resultados se descargan como CSV (botón Export) y se guardan en `docs/evidencias/sesion-<fecha>/` del repositorio, sin datos personales. La plantilla de esa carpeta y el cálculo de métricas y del SUS están en `docs/evidencias/README.md`.

## 8. Pendientes de este protocolo

- Definir fecha y lugar de las sesiones.
- Confirmar el formato de consentimiento (impreso o formulario).
- Ejecutar las sesiones y completar las tablas 3.2 a 3.4 del Entregable 03.
