# Evidencias de las pruebas con usuarios reales (Entregable 3, sección 3)

Esta carpeta guarda la evidencia de las sesiones de validación descritas en el protocolo
(`docs/evidencias/protocolo-validacion.md`, copia del documento del equipo). Paso a paso para exportar los datos de
Supabase y usarlos en el Entregable 03: `GUIA_EXTRACCION_DATOS.md`. **Solo datos reales**: no se completa con datos de ejemplo.

## Qué guardar

| Archivo | Contenido |
|---|---|
| `sesion-AAAA-MM-DD/hoja-registro.md` | Hoja de registro por jugador (U01 a U05): modalidad, tareas T1 a T5, errores, tiempo por turno, SUS y observaciones del guía |
| `sesion-AAAA-MM-DD/eventos.csv` | Exportación de la tabla `evento` de Supabase para las salas de la sesión (consulta abajo) |
| `sesion-AAAA-MM-DD/sus.csv` | Respuestas de la encuesta SUS (10 ítems, escala de 1 a 5) por jugador |
| `sesion-AAAA-MM-DD/encuesta-sus.md` | Las mismas respuestas con el texto de cada ítem, la interpretación y la pregunta abierta |
| `consentimiento.md` | Texto del consentimiento y registro de aceptación por participante |
| `sesion-AAAA-MM-DD/capturas/` | Capturas de pantalla o fotos de la sesión (sin rostros si no hay autorización) |
| `resumen.md` | Tabla consolidada de métricas que va en la sección 3.3 del Entregable 3 |

Sin nombres, correos ni IP: cada jugador se identifica como U01 a U05.

## Exportar los eventos de una sesión (Supabase, SQL Editor)

```sql
select e.codigo as sala, e.tipo, e.ocurrido_en, e.detalle
  from evento e
 where e.ocurrido_en >= '2026-11-25 14:00'   -- inicio de la sesión
   and e.ocurrido_en <  '2026-11-25 17:00'   -- fin de la sesión
 order by e.codigo, e.ocurrido_en;
```

Descarga el resultado como CSV (botón **Export** del editor) y guárdalo como `eventos.csv`.

## Histórico de partidas y latencia (extra de métricas, ADR-09 punto 5)

Al terminar cada partida, la base de datos guarda su resumen en `partida_registro` (últimas 100 partidas). Exportar
las partidas de la sesión y el agregado por modalidad:

```sql
select * from partida_registro
 where fin >= '2026-11-25 14:00' and fin < '2026-11-25 17:00'
 order by fin;

select * from v_metricas_partidas;

-- Por jugador (tabla 3.3 del Entregable 03): turnos, tiempo promedio por turno, cierres y latencia percibida.
select p.fin, p.modalidad, j.nombre, j.turnos, round(j.turno_promedio_ms / 1000.0, 1) as turno_s,
       j.cierres_aceptados, j.cierres_rechazados, j.turnos_expirados, j.cliente_p50_ms, j.cliente_p95_ms
  from partida_jugador_registro j join partida_registro p on p.id = j.registro_id
 where not j.es_bot and p.fin >= '2026-11-25 14:00' and p.fin < '2026-11-25 17:00'
 order by p.fin, j.nombre;
```

Guárdalos como `sesion-AAAA-MM-DD/partidas.csv`, `sesion-AAAA-MM-DD/jugadores.csv` y `sesion-AAAA-MM-DD/metricas.csv`. Para que la tabla por jugador sea anónima, cada participante entra a la sala con su código (U01 a U05) como nombre. Columnas clave: `turno_humano_ms`
(tiempo promedio por turno sin bots), `cierres_aceptados` y `cierres_rechazados`, `turnos_expirados`,
`servidor_p50_ms` y `servidor_p95_ms` (proceso en el servidor) y `cliente_p50_ms` y `cliente_p95_ms` (ida y vuelta
medida por el navegador, es decir, la latencia que percibe el jugador); `servidor_p99_ms` y `cliente_p99_ms` alimentan FF-32.

Después de cada sesión, ejecutar FF-32 con las variables del despliegue y guardar la salida como
`sesion-AAAA-MM-DD/ff32.txt`:

```bash
SUPABASE_URL=... SUPABASE_SECRET_KEY=... npm run ff32 > ff32.txt
```

Resultado `CUMPLE` si la mediana de los p99 por partida está bajo 300 ms, `ALERTA` si la supera y `SIN_DATOS` si hay
menos de 20 jugadas medidas.

## Métricas que salen de los eventos

- **Cierres válidos por jugador:** eventos `CIERRE_ACEPTADO` con `detalle.jugadorId`.
- **Errores de regla:** eventos `CIERRE_RECHAZADO` (motivo en `detalle.motivo`).
- **Tiempo promedio por turno:** diferencia entre `TURNO_INICIADO` consecutivos del mismo jugador (campo `ts` de `detalle`).
- **Turnos vencidos:** eventos `TURNO_EXPIRADO`.

## Cálculo del SUS

Para cada jugador: ítems impares, puntaje = respuesta - 1; ítems pares, puntaje = 5 - respuesta; SUS = suma x 2,5 (de 0 a 100).
