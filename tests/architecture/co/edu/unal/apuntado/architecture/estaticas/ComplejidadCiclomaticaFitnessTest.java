package co.edu.unal.apuntado.architecture.estaticas;

import static org.junit.jupiter.api.Assertions.assertTrue;

import com.puppycrawl.tools.checkstyle.Checker;
import com.puppycrawl.tools.checkstyle.ConfigurationLoader;
import com.puppycrawl.tools.checkstyle.PropertiesExpander;
import com.puppycrawl.tools.checkstyle.api.AuditEvent;
import com.puppycrawl.tools.checkstyle.api.AuditListener;
import com.puppycrawl.tools.checkstyle.api.CheckstyleException;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * Regla de gobernanza G3 - Límite de complejidad ciclomática (guía, Secciones 5.1 y 5.3).
 * FF-10: ningún método de producción supera CC = 10. La configuración es la misma que usa
 * maven-checkstyle-plugin en la fase verify del pipeline (config/checkstyle/checkstyle.xml).
 */
class ComplejidadCiclomaticaFitnessTest {

    private static final Path CONFIG = Path.of("config", "checkstyle", "checkstyle.xml");
    private static final Path CONFIG_EVALUADORES = Path.of("config", "checkstyle", "checkstyle-evaluadores.xml");
    private static final Path CODIGO = Path.of("src", "main", "java");
    private static final Path EVALUADORES = CODIGO.resolve(Path.of("co", "edu", "unal", "apuntado", "rules"));

    @Test
    void ff10_los_evaluadores_de_combinaciones_quedan_bajo_cc_5() throws Exception {
        List<String> violaciones = auditar(EVALUADORES, CONFIG_EVALUADORES);
        assertTrue(violaciones.isEmpty(), "FF-10: métodos de rules con CC ≥ 5:\n" + String.join("\n", violaciones));
    }

    @Test
    void ff10_ningun_metodo_del_sistema_supera_cc_10() throws Exception {
        List<String> violaciones = auditar(CODIGO, CONFIG);
        assertTrue(violaciones.isEmpty(), "FF-10: métodos con CC > 10:\n" + String.join("\n", violaciones));
    }

    private static List<String> auditar(Path raiz, Path config) throws CheckstyleException, IOException {
        List<File> archivos;
        try (Stream<Path> rutas = Files.walk(raiz)) {
            archivos = rutas.filter(p -> p.toString().endsWith(".java")).map(Path::toFile).toList();
        }
        Checker checker = new Checker();
        List<String> violaciones = new ArrayList<>();
        try {
            checker.setModuleClassLoader(Checker.class.getClassLoader());
            checker.configure(ConfigurationLoader.loadConfiguration(config.toString(),
                    new PropertiesExpander(System.getProperties())));
            checker.addListener(new Recolector(violaciones));
            checker.process(archivos);
        } finally {
            checker.destroy();
        }
        return violaciones;
    }

    private static final class Recolector implements AuditListener {
        private final List<String> violaciones;

        private Recolector(List<String> violaciones) {
            this.violaciones = violaciones;
        }

        @Override
        public void addError(AuditEvent evento) {
            violaciones.add(evento.getFileName() + ":" + evento.getLine() + " " + evento.getMessage());
        }

        @Override
        public void addException(AuditEvent evento, Throwable error) {
            violaciones.add(evento.getFileName() + ": " + error);
        }

        @Override
        public void auditStarted(AuditEvent evento) {
            // sin acción
        }

        @Override
        public void auditFinished(AuditEvent evento) {
            // sin acción
        }

        @Override
        public void fileStarted(AuditEvent evento) {
            // sin acción
        }

        @Override
        public void fileFinished(AuditEvent evento) {
            // sin acción
        }
    }
}
