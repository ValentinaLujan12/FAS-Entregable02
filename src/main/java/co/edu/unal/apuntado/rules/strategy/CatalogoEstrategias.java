package co.edu.unal.apuntado.rules.strategy;

import java.io.File;
import java.io.IOException;
import java.lang.reflect.Modifier;
import java.net.JarURLConnection;
import java.net.URISyntaxException;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.jar.JarFile;
import java.util.stream.Stream;

/**
 * Descubrimiento automático de estrategias (ADR-03, mecanismo 2): recorre el classpath bajo este paquete y
 * crea una instancia de cada clase concreta que implemente IReglaJuego. Así, agregar una modalidad es
 * agregar una clase: no se edita el registro, el motor ni ninguna lista mantenida a mano.
 * En el Entregable 3 este papel lo puede asumir el contenedor de inyección de dependencias elegido.
 */
public final class CatalogoEstrategias {

    private static final String PAQUETE = CatalogoEstrategias.class.getPackageName();
    private static final String RUTA = PAQUETE.replace('.', '/');

    private CatalogoEstrategias() {
    }

    public static List<IReglaJuego> descubrir() {
        try {
            List<IReglaJuego> estrategias = new ArrayList<>();
            ClassLoader cargador = Thread.currentThread().getContextClassLoader();
            for (URL url : Collections.list(cargador.getResources(RUTA))) {
                for (String nombre : nombresEn(url)) {
                    agregarSiEsEstrategia(nombre, estrategias);
                }
            }
            return Collections.unmodifiableList(estrategias);
        } catch (IOException | URISyntaxException | ReflectiveOperationException e) {
            throw new IllegalStateException("No se pudieron descubrir las estrategias de juego", e);
        }
    }

    private static List<String> nombresEn(URL url) throws IOException, URISyntaxException {
        if ("jar".equals(url.getProtocol())) {
            return nombresEnJar(((JarURLConnection) url.openConnection()).getJarFile());
        }
        return nombresEnDirectorio(Path.of(url.toURI()));
    }

    private static List<String> nombresEnDirectorio(Path raiz) throws IOException {
        try (Stream<Path> rutas = Files.walk(raiz)) {
            return rutas.map(raiz::relativize)
                    .map(Path::toString)
                    .filter(CatalogoEstrategias::esClaseDeNivelSuperior)
                    .map(r -> PAQUETE + "." + r.replace(File.separatorChar, '.').replace(".class", ""))
                    .toList();
        }
    }

    private static List<String> nombresEnJar(JarFile jar) {
        return jar.stream()
                .map(e -> e.getName())
                .filter(n -> n.startsWith(RUTA + "/") && esClaseDeNivelSuperior(n))
                .map(n -> n.replace('/', '.').replace(".class", ""))
                .toList();
    }

    private static boolean esClaseDeNivelSuperior(String ruta) {
        return ruta.endsWith(".class") && !ruta.contains("$") && !ruta.endsWith("package-info.class");
    }

    private static void agregarSiEsEstrategia(String nombre, List<IReglaJuego> estrategias)
            throws ReflectiveOperationException {
        Class<?> clase = Class.forName(nombre);
        boolean concreta = !clase.isInterface() && !Modifier.isAbstract(clase.getModifiers());
        if (concreta && IReglaJuego.class.isAssignableFrom(clase)) {
            estrategias.add((IReglaJuego) clase.getDeclaredConstructor().newInstance());
        }
    }
}
