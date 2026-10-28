package co.edu.unal.apuntado.architecture.estaticas;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.edu.unal.apuntado.architecture.estaticas.MetricasDeModulos.Metrica;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * Regla de gobernanza G4 - FF-30: distancia a la secuencia principal por módulo (Richards & Ford, Cap. 3 y
 * Cap. 6, Ejemplo 6-3). D = |A + I - 1| debe ser ≤ 0,5 (tolerancia del ejemplo del Cap. 6). El Shared Kernel
 * es la excepción documentada: es estable y concreto por diseño (objetos de valor inmutables que todos usan),
 * por lo que se exige en cambio que no dependa de nadie (I = 0).
 */
class DistanciaSecuenciaPrincipalFitnessTest {

    private static final double TOLERANCIA = 0.5;
    private static final String KERNEL = "kernel";

    @Test
    void ff30_distancia_a_la_secuencia_principal_por_modulo() {
        Map<String, Metrica> metricas = medir();
        metricas.values().stream().filter(m -> !m.modulo().equals(KERNEL)).forEach(m ->
                assertTrue(m.distancia() <= TOLERANCIA, String.format(
                        "FF-30: módulo %s con D = %.2f (A = %.2f, I = %.2f) supera la tolerancia %.1f",
                        m.modulo(), m.distancia(), m.abstraccion(), m.inestabilidad(), TOLERANCIA)));
    }

    @Test
    void ff30_el_kernel_es_maximamente_estable() {
        assertEquals(0.0, medir().get(KERNEL).inestabilidad(), 1e-9,
                "FF-30: el Shared Kernel no puede depender de otros módulos (I = 0)");
    }

    private static Map<String, Metrica> medir() {
        JavaClasses clases = new ClassFileImporter()
                .withImportOption(new ImportOption.DoNotIncludeTests())
                .importPackages(Modulos.BASE);
        Map<String, Set<String>> dependencias = new HashMap<>();
        Set<String> abstractas = new HashSet<>();
        for (JavaClass clase : clases) {
            String nombre = nivelSuperior(clase.getName());
            if (nombre.endsWith("package-info")) {
                continue;
            }
            Set<String> destinos = dependencias.computeIfAbsent(nombre, k -> new HashSet<>());
            clase.getDirectDependenciesFromSelf().stream()
                    .map(d -> nivelSuperior(d.getTargetClass().getName()))
                    .filter(d -> d.startsWith(Modulos.BASE + ".") && !d.equals(nombre))
                    .forEach(destinos::add);
            if (clase.getName().equals(nombre)
                    && (clase.isInterface() || clase.getModifiers().contains(JavaModifier.ABSTRACT))) {
                abstractas.add(nombre);
            }
        }
        return MetricasDeModulos.calcular(dependencias, abstractas, DistanciaSecuenciaPrincipalFitnessTest::modulo);
    }

    private static String nivelSuperior(String nombre) {
        int i = nombre.indexOf('$');
        return i < 0 ? nombre : nombre.substring(0, i);
    }

    private static String modulo(String nombreClase) {
        return nombreClase.substring(Modulos.BASE.length() + 1).split("\\.")[0];
    }
}
