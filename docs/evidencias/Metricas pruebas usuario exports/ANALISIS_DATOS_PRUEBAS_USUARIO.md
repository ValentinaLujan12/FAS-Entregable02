# Análisis de datos de la prueba con usuarios (sesión S1, 25/11/2026)

Insumo para la Sección 3 del Entregable 03. Fuente: los CSV de esta carpeta, exportados de Supabase con
`docs/evidencias/GUIA_EXTRACCION_DATOS.md` (ventana 19:15 a 21:05, hora de Colombia). Este archivo usa solo códigos
anónimos. La correspondencia de códigos con nombres está en `consolidado_usuarios.csv` y no debe publicarse (ver la
sección 7).

## 1. Sesión

| Dato | Valor |
|---|---|
| Fecha y hora | 25/11/2026, de 19:54 a 20:47 (partidas); sesión de 19:30 a 20:50 aprox. |
| Participantes evaluados | 5 usuarios (U01 a U05) |
| Partidas | 2: Clásica (sala VZCQF, 15 min) y Apuntado (sala JAVB7, 33 min) |
| Mesa Clásica | 6 asientos: los 5 usuarios y 1 bot |
| Mesa Apuntado | 6 asientos: U01, U02, U04, U05, el guía G2 y 1 bot. U03 no jugó esta partida. G2 abandonó a propósito al inicio para ejercitar el caso de abandono; su asiento quedó en espera, luego en automático y después fue expulsado. El registro lo cuenta como bot. |
| Reloj de turno | 30 s (dato de los eventos: `venceEn − ts` = 30.000 ms) |
| Jugadas con latencia medida | 402 (140 en la Clásica y 262 en el Apuntado) |

Archivos: `partidas.csv`, `jugadores.csv`, `consolidado_usuarios.csv`, `metricas.csv`, `latencia_exacta.csv`,
`motivos_rechazo.csv` y `eventos.csv`. Este último trae solo las primeras 99 filas, de 20:13 a 20:18 de la mesa
Apuntado: el editor exportó el resultado truncado. Los eventos de la mesa Clásica ya no existen, porque la sala se
borró al salir todos.

## 2. Resultados por partida

| | Clásica (14) | Apuntado (15) |
|---|---|---|
| Rondas / turnos totales | 2 / 79 | 9 / 195 |
| Turnos de los usuarios | 66 | 110 |
| Final | Un jugador alcanzó 2 rondas ganadas | Quedó un solo jugador activo (los demás fueron eliminados al pasar de 101) |
| Tiempo por turno humano | 13,1 s | 13,0 s |
| Cierres válidos / rechazados (todos los asientos) | 2 / 1 | 9 / 4 |
| Turnos vencidos | 1 (U05) | 9 (todos del asiento de G2 tras su salida) |
| Servidor p50 / p95 / p99 | 58 / 95 / 170 ms | 59 / 111 / 239 ms |
| Navegador p50 / p95 / p99 | 318 / 486 / 874 ms | 310 / 446 / 700 ms |

## 3. Resultados por usuario (Tabla 3.3)

| ID | Modalidad probada | ¿Logró cierre válido? | Errores / confusiones (datos) | Tiempo por turno | Latencia p50 / p95 | SUS |
|---|---|---|---|---|---|---|
| U01 | Clásica y Apuntado | Sí (2 cierres, ganó la Clásica) | 0 rechazos. En el Apuntado fue eliminada temprano (19 turnos) | 10,9 s | 301 / 420 ms | (ver sus.csv) |
| U02 | Clásica y Apuntado | Sí (4 cierres en el Apuntado) | 3 rechazos en el Apuntado: 2 por sobrante que excede el límite y 1 sin combinación válida | 13,0 s | 307 / 464 ms | (ver sus.csv) |
| U03 | Clásica | No (no intentó cerrar) | 0 rechazos. El turno más lento de la sesión (17,2 s) y la latencia más alta | 17,2 s | 431 / 655 ms | (ver sus.csv) |
| U04 | Clásica y Apuntado | No (no intentó cerrar) | 0 rechazos. En el Apuntado fue eliminada muy temprano (6 turnos) | 10,9 s | 295 / 639 ms | (ver sus.csv) |
| U05 | Clásica y Apuntado | No (2 intentos rechazados) | 2 rechazos: 1 en la Clásica (motivo no disponible, ya no hay eventos de esa sala) y 1 sin combinación válida en el Apuntado. 1 turno vencido en la Clásica | 14,6 s | 316 / 418 ms | (ver sus.csv) |

Notas de lectura:
- El tiempo por turno es el promedio ponderado por turnos de las dos partidas.
- La latencia p50 es la mediana de los p50 de cada partida, y la p95 es el peor p95. En el Apuntado,
  `latencia_exacta.csv` da valores casi iguales: U01 298 / 420, U02 308 / 464, U04 293 / 639 y U05 318 / 418 ms.
- "¿Logró cierre válido?" sale de los datos. Debe contrastarse con la tarea T3 de la hoja de registro: solo un jugador
  puede cerrar cada ronda, así que no cerrar no significa no saber hacerlo.
- El SUS y las observaciones de las tareas T1 a T5 salen de `sus.csv` y `hoja-registro.md` (simulados, ver la sección 6), no de la base de
  datos.

## 4. Indicadores para el análisis

| Indicador | Valor | Lectura |
|---|---|---|
| Tasa de cierres válidos de los usuarios | 6 de 11 intentos = 54,5 % | Los 5 rechazos se concentran en dos usuarios (U02 y U05) |
| Usuarios con al menos un cierre válido | 2 de 5 (U01 y U02) | Hubo 11 rondas y solo una persona cierra cada una; los bots y la mesa compiten por el cierre |
| Tasa de cierres válidos de todos los asientos | 11 de 16 = 68,8 % | Incluye bots |
| Motivo de rechazo más frecuente (Apuntado) | Sobrante que excede el límite (2), sin combinación válida (2) | Sugiere que el límite del sobrante no es visible antes de intentar cerrar |
| Tiempo promedio por turno | 13,0 s (176 turnos de usuarios) | 43 % del reloj de 30 s. Máximo por usuario y partida: 18,0 s (60 %) |
| Turnos vencidos de los usuarios | 1 de 176 (0,6 %) | El reloj de 30 s alcanza |
| Turnos vencidos por un ausente | 9 en el Apuntado | Con el asiento de G2 vacío, la mesa esperó 30 s en cada uno de sus turnos hasta pasar a automático tras 2 vencimientos (en los eventos, entre las 20:14 y las 20:18) |
| Latencia de servidor | p50 58–59 ms, p95 95–111 ms, p99 170–239 ms | Cumple el objetivo de 300 ms con holgura |
| Latencia percibida (navegador) | p50 307 ms (mediana de los usuarios), p95 418–655 ms, p99 de partida 700–874 ms | p50 en el límite del objetivo; p95 y p99 lo superan |
| Diferencia navegador menos servidor | ≈ 250 ms por jugada | Red entre Colombia y la región de la función (Oregón, `pdx1`), más TLS y el enrutamiento de Vercel |
| FF-32 | Pendiente de correr `npm run ff32` | Con los p99 de navegador de esta sesión (mediana ≈ 787 ms) se espera ALERTA por el lado del navegador; el servidor cumple |
| Regla del 101 (T5) | U04 (6 turnos) y U01 (19 turnos) fueron eliminadas al pasar de 101; ganó U02 o un asiento no humano (confirmar en la hoja) | Los cuatro usuarios del Apuntado vieron la acumulación; la comprensión se confirma con la hoja de registro |
| SUS (simulado) | Promedio 73,0 (62,5 a 85,0) | Sobre el promedio de referencia de 68: usabilidad buena. Ítems más débiles: 9 (seguridad, 3,6) y 4 y 10 (ayuda y aprendizaje, 2,2) |

## 5. Hallazgos y ajustes propuestos (Tabla 3.4)

Propuestas para que el equipo las confirme. Ninguna está implementada todavía.

| Hallazgo de los usuarios | Ajuste en la arquitectura o el código | Componente | Estado |
|---|---|---|---|
| Cuando un jugador sale a mitad de partida, la mesa espera el reloj completo (30 s) en cada turno de su asiento hasta dos vencimientos, antes de pasarlo a automático. En el Apuntado esto detuvo a los demás varios minutos al inicio | Si la presencia indica que el jugador está desconectado, su asiento pasa a automático desde el primer turno, o con un reloj corto, y se conserva la ventana para que vuelva y retome | `game` (TurnOrchestrator y presencia, ADR-13) | Planeado |
| La latencia percibida es de unos 310 ms en p50 y de 450 a 650 ms en p95, frente a unos 60 ms del servidor; la diferencia es la red entre Colombia y Oregón | Mover la función y la base de datos a una región más cercana a los jugadores (por ejemplo, la costa este de EE. UU.) y volver a medir con FF-32. Mientras tanto se mantiene la respuesta visual inmediata (elemento atenuado mientras se confirma) | Despliegue (ADR-06), cliente (`src/web`, ADR-12) | Planeado |
| Los rechazos del Apuntado se deben a un sobrante que excede el límite o a no tener combinación válida: el jugador intenta cerrar sin saber si su mano cumple | Mostrar en la mesa, antes de cerrar, los puntos del sobrante frente al límite y un aviso de "aún no cumple", usando la validación que ya existe sin cerrar | `src/web` (mesa) y `rules` (validación previa) | Planeado |

Si la hoja de registro o el SUS muestran otra confusión repetida, conviene que sea uno de los dos ajustes mínimos
exigidos, por encima de los anteriores.

## 6. Datos simulados y Entregable 03_PRUEBAS

Por decisión del equipo (el proyecto es un caso de estudio simulado), las métricas de S1 son reales y lo siguiente es
simulado:
- `sus.csv`: respuestas SUS coherentes con los datos de cada usuario (promedio 73,0).
- `hoja-registro.md` (S1) y `hoja-registro-S0.md` (sesión piloto del 23/11). Las frases de S0 describen los cambios que
  el equipo ya había hecho tras sus pruebas propias (D46 a D55). Esos cambios pasan a la Tabla 3.4 como "Implementado".
- G2 era un guía.

`Entregable 03_PRUEBAS.docx` (en la carpeta `Entregable 03`) tiene todos los cambios en azul y notas internas en
verde que dicen dónde va cada uno.

## FF-32 sin instalar nada (Supabase, SQL Editor)

Misma lógica que `npm run ff32`: mediana de los p99 por partida en las últimas 100 partidas, contra 300 ms.

```sql
with u as (
  select servidor_p99_ms as s, cliente_p99_ms as c, coalesce(muestras_latencia, 0) as m
    from partida_registro order by fin desc limit 100
)
select count(*) as partidas, sum(m) as muestras,
       round(percentile_cont(0.5) within group (order by s)) as mediana_p99_servidor_ms,
       round(percentile_cont(0.5) within group (order by c)) as mediana_p99_navegador_ms,
       count(*) filter (where s > 300) as partidas_servidor_sobre_300,
       count(*) filter (where c > 300) as partidas_navegador_sobre_300,
       case when sum(m) < 20 then 'SIN_DATOS'
            when percentile_cont(0.5) within group (order by s) > 300
              or percentile_cont(0.5) within group (order by c) > 300 then 'ALERTA'
            else 'CUMPLE' end as estado
  from u;
```

Solo con la sesión: cambiar la primera parte por
`select ... from partida_registro where fin >= '2026-11-25 19:15-05' and fin < '2026-11-25 21:05-05'`.
Con las dos partidas de S1 da: servidor 204,5 ms (cumple) y navegador 787 ms (ALERTA).

## 7. Privacidad

`jugadores.csv`, `consolidado_usuarios.csv` y `latencia_exacta.csv` tienen nombres reales y están dentro de la
carpeta del repositorio. Antes de subir a GitHub hay que hacer una de dos cosas:
- reemplazar cada nombre por su código (U01 a U05), o
- sacar esta carpeta del repositorio y dejar en `docs/evidencias/sesion-2026-11-25/` solo versiones anónimas.
