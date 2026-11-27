# Resumen de la validación con usuarios (Entregable 3, sección 3)

| Sesión | Fecha | Participantes | Partidas | Carpeta |
|---|---|---|---|---|
| S0 (piloto) | 23/11/2026 | U01 a U05, guías G1 y G2 | Partidas cortas de Clásica y Apuntado en el primer despliegue | `sesion-2026-11-23/` |
| S1 | 25/11/2026, 19:54 a 20:47 | U01 a U05, guías G1 y G2 (G2 abandonó a propósito para el caso de abandono) | Clásica (15 min, 2 rondas) y Apuntado (33 min, 9 rondas) | `sesion-2026-11-25/` |

## Tabla consolidada de S1 (Tabla 3.3 del Entregable 03)

| ID | Modalidad probada | ¿Logró cerrar ronda válida? | Errores / confusiones | Tiempo por turno | Latencia p50 / p95 | SUS |
|---|---|---|---|---|---|---|
| U01 | Clásica y Apuntado | Sí (2 cierres; ganó la Clásica) | 0 rechazos; eliminada temprano en el Apuntado | 10,9 s | 301 / 420 ms | 85,0 |
| U02 | Clásica y Apuntado | Sí (4 cierres) | 3 rechazos (2 sobrante sobre el límite, 1 sin combinación) | 13,0 s | 307 / 464 ms | 77,5 |
| U03 | Clásica | No | 0 rechazos; turno más lento | 17,2 s | 431 / 655 ms | 62,5 |
| U04 | Clásica y Apuntado | No | 0 rechazos; no entendía la suma de sus cartas sueltas | 10,9 s | 295 / 639 ms | 72,5 |
| U05 | Clásica y Apuntado | No (2 intentos rechazados) | 2 rechazos; 1 turno vencido | 14,6 s | 316 / 418 ms | 67,5 |

## Indicadores

| Indicador | Valor |
|---|---|
| Cierres válidos de los usuarios | 6 de 11 intentos (54,5 %) |
| Tiempo promedio por turno | 13,0 s (43 % del reloj de 30 s) |
| Turnos vencidos de los usuarios | 1 de 176 |
| Latencia de servidor p50 / p99 | 58 ms / 170 a 239 ms |
| Latencia percibida p50 / p95 | 307 ms / 418 a 655 ms |
| FF-32 (las 2 partidas de S1) | Servidor 204,5 ms (cumple); navegador 787 ms (ALERTA) |
| SUS promedio | 73,0 (de 62,5 a 85,0) |

## Archivos

- `sesion-2026-11-25/`: `partidas.csv`, `jugadores.csv`, `consolidado_usuarios.csv`, `metricas.csv`, `eventos.csv`,
  `latencia_exacta.csv`, `motivos_rechazo.csv`, `ff32-sesion.txt`, `sus.csv`, `encuesta-sus.md` y
  `hoja-registro.md`.
- `sesion-2026-11-23/hoja-registro.md`: comentarios de la sesión piloto y los ajustes que generaron (Tabla 3.4).
- `consentimiento.md`: texto aceptado y registro por participante.

Notas sobre los datos:
- `eventos.csv` trae solo las primeras 99 filas de la mesa Apuntado: el editor de Supabase exportó el resultado
  truncado.
- Los eventos de la mesa Clásica ya no existían al exportar, porque se borran con su sala.
- Los nombres de los CSV son seudónimos.
