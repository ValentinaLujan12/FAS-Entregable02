package co.edu.unal.apuntado.architecture.dinamicas;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import co.edu.unal.apuntado.kernel.ParametrosModalidad;
import co.edu.unal.apuntado.rules.strategy.CatalogoEstrategias;
import co.edu.unal.apuntado.rules.strategy.IReglaJuego;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/**
 * ADR-03 - FF-13 (consistencia datos-código): cada fila de la tabla modalidad (migraciones) tiene exactamente
 * una estrategia registrada y viceversa, con los mismos valores de acumulativa y umbral_eliminacion.
 */
class ConsistenciaModalidadesFitnessTest {

    private static final String SEMILLA = "db/migration/V2__datos_semilla.sql";
    private static final Pattern FILA =
            Pattern.compile("\\(\\s*'(\\w+)'\\s*,\\s*'[^']*'\\s*,\\s*(TRUE|FALSE)\\s*,\\s*(NULL|\\d+)", Pattern.CASE_INSENSITIVE);

    @Test
    void ff13_filas_de_modalidad_y_estrategias_coinciden() throws IOException {
        Map<String, String> filas = filasDeModalidad();
        Map<String, IReglaJuego> estrategias = CatalogoEstrategias.descubrir().stream()
                .filter(r -> !r.getClass().getPackageName().endsWith(".prueba")) // solo producción
                .collect(Collectors.toMap(r -> r.getModalidad().valor(), Function.identity(), (a, b) -> a, TreeMap::new));

        assertEquals(new TreeMap<>(filas).keySet(), estrategias.keySet(),
                "FF-13: toda fila de modalidad tiene una estrategia y toda estrategia tiene su fila");
        estrategias.forEach((codigo, regla) -> assertEquals(filas.get(codigo), firma(regla.parametros()),
                "FF-13: acumulativa/umbral de " + codigo + " coinciden entre la migración y la estrategia"));
    }

    private static Map<String, String> filasDeModalidad() throws IOException {
        String sql;
        try (InputStream in = ConsistenciaModalidadesFitnessTest.class.getClassLoader().getResourceAsStream(SEMILLA)) {
            assertNotNull(in, "No se encontró la migración " + SEMILLA);
            sql = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
        String insert = sql.substring(sql.indexOf("INSERT INTO modalidad"), sql.indexOf("INSERT INTO carta"));
        Map<String, String> filas = new TreeMap<>();
        Matcher m = FILA.matcher(insert);
        while (m.find()) {
            filas.put(m.group(1), m.group(2).toUpperCase() + "/" + m.group(3).toUpperCase());
        }
        return filas;
    }

    private static String firma(ParametrosModalidad p) {
        return (p.acumulativa() ? "TRUE" : "FALSE") + "/" + (p.umbralEliminacion() == null ? "NULL" : p.umbralEliminacion());
    }
}
