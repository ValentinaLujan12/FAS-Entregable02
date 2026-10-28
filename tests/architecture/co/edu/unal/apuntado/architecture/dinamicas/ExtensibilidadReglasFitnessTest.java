package co.edu.unal.apuntado.architecture.dinamicas;

import static co.edu.unal.apuntado.architecture.dinamicas.Cartas.lista;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.edu.unal.apuntado.architecture.dinamicas.dobles.MazoPreparado;
import co.edu.unal.apuntado.architecture.dinamicas.dobles.RepositorioEnMemoria.Liquidacion;
import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.PartidaId;
import co.edu.unal.apuntado.kernel.ResultadoValidacion;
import co.edu.unal.apuntado.rules.RegistroReglas;
import co.edu.unal.apuntado.rules.strategy.prueba.ReglaPrueba;
import co.edu.unal.apuntado.kernel.CodigoModalidad;
import co.edu.unal.apuntado.rules.strategy.CatalogoEstrategias;
import co.edu.unal.apuntado.rules.strategy.IReglaJuego;
import java.io.IOException;
import java.io.OutputStream;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.jar.JarEntry;
import java.util.jar.JarOutputStream;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * ADR-03 - FF-11 (prueba de extensibilidad): una estrategia que existe solo en el código de pruebas
 * (ReglaPrueba, con un CodigoModalidad nuevo) recorre sala -> partida -> cierre -> puntaje sin modificar
 * ninguna clase de main: el registro la descubre solo.
 */
class ExtensibilidadReglasFitnessTest {

    @Test
    void ff11_el_registro_descubre_una_modalidad_nueva_sin_tocar_main() {
        assertTrue(RegistroReglas.descubrir().modalidades().contains(ReglaPrueba.CODIGO));
    }

    @Test
    void ff11_la_modalidad_nueva_recorre_el_flujo_completo() {
        MazoPreparado mazo = new MazoPreparado(
                lista("AP", "2P", "3D", "8T", "JC", "QC", "KD", "5C", "6D", "8D", "9D"),
                List.of(lista("4P", "5P", "6P", "7P", "9C", "9T", "2C", "3C", "4C", "KT")),
                lista("10P"));
        Mesa mesa = new Mesa(mazo);
        JugadorId ana = JugadorId.nuevo();
        JugadorId beto = JugadorId.nuevo();

        PartidaId partida = mesa.partida(ReglaPrueba.CODIGO, ana, List.of(beto));
        ResultadoValidacion resultado = mesa.orquestador.cerrarRonda(partida, ana);

        assertEquals(ResultadoValidacion.VALIDO, resultado);
        Liquidacion liquidacion = mesa.repositorio.liquidaciones(partida).get(0);
        assertEquals(10, liquidacion.acumulados().get(beto), "ReglaPrueba penaliza 1 punto por carta");
    }

    @Test
    void ff11_modalidad_sin_estrategia_se_rechaza() {
        RegistroReglas registro = RegistroReglas.descubrir();
        assertThrows(IllegalArgumentException.class, () -> registro.obtener(CodigoModalidad.de("CONTINENTAL")),
                "una fila de modalidad sin estrategia debe detectarse (ver FF-13)");
    }

    @Test
    void ff11_el_descubrimiento_funciona_con_la_aplicacion_empaquetada_en_jar() throws Exception {
        Path clases = Path.of(CatalogoEstrategias.class.getProtectionDomain().getCodeSource().getLocation().toURI());
        Path jar = Files.createTempFile("estrategias", ".jar");
        empaquetar(clases, jar);
        ClassLoader original = Thread.currentThread().getContextClassLoader();
        try (URLClassLoader soloJar = new URLClassLoader(new URL[] {jar.toUri().toURL()}, null)) {
            Thread.currentThread().setContextClassLoader(soloJar);
            List<String> codigos = CatalogoEstrategias.descubrir().stream()
                    .map(IReglaJuego::getModalidad).map(CodigoModalidad::valor).sorted().toList();
            assertEquals(List.of("APUNTADO", "CLASICA"), codigos);
        } finally {
            Thread.currentThread().setContextClassLoader(original);
            Files.deleteIfExists(jar);
        }
    }

    private static void empaquetar(Path clases, Path jar) throws IOException {
        Path estrategias = clases.resolve("co/edu/unal/apuntado/rules/strategy");
        try (OutputStream salida = Files.newOutputStream(jar);
             JarOutputStream jos = new JarOutputStream(salida);
             Stream<Path> rutas = Files.walk(estrategias)) {
            // como en un jar de Maven: entradas de directorio + archivos .class
            for (Path p : rutas.toList()) {
                String nombre = clases.relativize(p).toString().replace('\\', '/');
                boolean directorio = Files.isDirectory(p);
                jos.putNextEntry(new JarEntry(directorio ? nombre + "/" : nombre));
                if (!directorio) {
                    jos.write(Files.readAllBytes(p));
                }
                jos.closeEntry();
            }
        }
    }
}
