package co.edu.unal.apuntado.architecture.estaticas;

import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.function.Function;

/**
 * Métricas de Robert C. Martin por módulo (Richards & Ford, Cap. 3 y Cap. 6, Ejemplo 6-3), calculadas sobre
 * clases de nivel superior:
 * <ul>
 *   <li>Ca (acoplamiento aferente): clases de otros módulos que dependen de alguna clase del módulo.</li>
 *   <li>Ce (acoplamiento eferente): clases del módulo que dependen de alguna clase de otro módulo.</li>
 *   <li>I = Ce / (Ca + Ce) (inestabilidad) y A = abstractas / total (abstracción).</li>
 *   <li>D = |A + I - 1| (distancia a la secuencia principal).</li>
 * </ul>
 * Es independiente de la herramienta: la prueba le entrega el grafo de dependencias extraído con ArchUnit.
 */
final class MetricasDeModulos {

    record Metrica(String modulo, int clases, double abstraccion, int aferentes, int eferentes,
                   double inestabilidad, double distancia) {
    }

    private MetricasDeModulos() {
    }

    static Map<String, Metrica> calcular(Map<String, Set<String>> dependencias, Set<String> abstractas,
                                         Function<String, String> moduloDe) {
        Map<String, Metrica> resultado = new TreeMap<>();
        dependencias.keySet().stream().map(moduloDe).distinct()
                .forEach(m -> resultado.put(m, metrica(m, dependencias, abstractas, moduloDe)));
        return resultado;
    }

    private static Metrica metrica(String modulo, Map<String, Set<String>> deps, Set<String> abstractas,
                                   Function<String, String> moduloDe) {
        int total = 0;
        int abstractasDelModulo = 0;
        int eferentes = 0;
        int aferentes = 0;
        for (Map.Entry<String, Set<String>> e : deps.entrySet()) {
            boolean dentro = moduloDe.apply(e.getKey()).equals(modulo);
            if (dentro) {
                total++;
                abstractasDelModulo += abstractas.contains(e.getKey()) ? 1 : 0;
                eferentes += e.getValue().stream().anyMatch(d -> !moduloDe.apply(d).equals(modulo)) ? 1 : 0;
            } else {
                aferentes += e.getValue().stream().anyMatch(d -> moduloDe.apply(d).equals(modulo)) ? 1 : 0;
            }
        }
        double a = total == 0 ? 0 : (double) abstractasDelModulo / total;
        double i = aferentes + eferentes == 0 ? 0 : (double) eferentes / (aferentes + eferentes);
        return new Metrica(modulo, total, a, aferentes, eferentes, i, Math.abs(a + i - 1));
    }
}
