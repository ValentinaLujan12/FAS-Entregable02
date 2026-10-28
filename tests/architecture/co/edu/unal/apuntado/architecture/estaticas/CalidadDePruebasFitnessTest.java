package co.edu.unal.apuntado.architecture.estaticas;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * Regla de gobernanza G7 - FF-31: toda prueba tiene al menos una aserción (Richards & Ford, Cap. 6). La cobertura
 * (FF-15) se puede "engañar" con pruebas que ejecutan el código sin verificar nada; esta fitness function lo
 * impide revisando que cada método @Test / @ParameterizedTest de /tests/architecture contenga una aserción.
 */
class CalidadDePruebasFitnessTest {

    private static final Path PRUEBAS = Path.of("tests", "architecture");
    private static final Pattern METODO_DE_PRUEBA =
            Pattern.compile("@(Test|ParameterizedTest)\\b[^{]*?\\bvoid\\s+(\\w+)\\s*\\([^)]*\\)[^{]*\\{");

    @Test
    void ff31_toda_prueba_tiene_al_menos_una_asercion() throws IOException {
        List<String> sinAsercion = new ArrayList<>();
        int revisadas = 0;
        for (Path archivo : archivosJava()) {
            String fuente = Files.readString(archivo, StandardCharsets.UTF_8);
            Matcher m = METODO_DE_PRUEBA.matcher(fuente);
            while (m.find()) {
                revisadas++;
                if (!cuerpo(fuente, m.end()).contains("assert")) {
                    sinAsercion.add(archivo.getFileName() + "#" + m.group(2));
                }
            }
        }
        assertTrue(revisadas > 0, "FF-31: no se encontraron pruebas para revisar");
        assertTrue(sinAsercion.isEmpty(), "FF-31: pruebas sin aserción: " + sinAsercion);
    }

    @Test
    void ff31_ninguna_prueba_esta_deshabilitada() throws IOException {
        for (Path archivo : archivosJava()) {
            String fuente = Files.readString(archivo, StandardCharsets.UTF_8);
            assertFalse(fuente.contains("@" + "Disabled"), "FF-31: prueba deshabilitada en " + archivo.getFileName());
        }
    }

    private static List<Path> archivosJava() throws IOException {
        try (Stream<Path> rutas = Files.walk(PRUEBAS)) {
            return rutas.filter(p -> p.toString().endsWith(".java")).toList();
        }
    }

    /** Texto entre la llave que abre el método y la que lo cierra. */
    private static String cuerpo(String fuente, int inicio) {
        int nivel = 1;
        int i = inicio;
        while (i < fuente.length() && nivel > 0) {
            char c = fuente.charAt(i++);
            nivel += c == '{' ? 1 : (c == '}' ? -1 : 0);
        }
        return fuente.substring(inicio, i);
    }
}
