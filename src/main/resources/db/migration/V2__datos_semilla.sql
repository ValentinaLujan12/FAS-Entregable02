-- =====================================================================
-- V2__datos_semilla.sql  -  Datos de referencia
-- Modalidades (ADR-03: la modalidad es un dato) y las 52 cartas (Tabla 2.2.2).
-- Agregar una modalidad = una migración nueva con su fila (ADR-03, paso 2).
-- =====================================================================

INSERT INTO modalidad (codigo_modalidad, nombre, acumulativa, umbral_eliminacion, parametros) VALUES
 ('CLASICA',  'Clásica 4-3-3 (baraja cerrada)', FALSE, NULL,
  '{"valorAs": 1, "cartasPorJugador": 10, "cartaExtraInicial": true, "numeroBarajas": 1, "comodines": 0}'),
 ('APUNTADO', 'Apuntado a 101 puntos',          TRUE,  101,
  '{"valorAs": 1, "cartasPorJugador": 10, "cartaExtraInicial": true, "numeroBarajas": 1, "comodines": 0}');

INSERT INTO carta (codigo_carta, palo, rango)
SELECT CASE r WHEN 1 THEN 'A' WHEN 11 THEN 'J' WHEN 12 THEN 'Q' WHEN 13 THEN 'K' ELSE r::text END
       || substr(p, 1, 1),
       p, r
FROM unnest(ARRAY['PICA', 'CORAZON', 'DIAMANTE', 'TREBOL']) AS p
CROSS JOIN generate_series(1, 13) AS r;
