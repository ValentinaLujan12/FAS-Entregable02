package co.edu.unal.apuntado.rules.strategy;

import co.edu.unal.apuntado.kernel.Carta;
import co.edu.unal.apuntado.kernel.Combinacion;
import co.edu.unal.apuntado.kernel.Palo;
import co.edu.unal.apuntado.kernel.TipoCombinacion;
import co.edu.unal.apuntado.kernel.Valor;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.function.ToIntFunction;

/**
 * Evaluador de combinaciones compartido por las estrategias (no conoce ninguna modalidad).
 * Supuestos: GRUPO = 3 o 4 cartas del mismo valor; ESCALERA = 3 o más cartas consecutivas del mismo palo,
 * con el As solo como carta baja (A-2-3). Cada método respeta el límite de complejidad ciclomática (CC ≤ 10).
 */
public final class BuscadorCombinaciones {

    /** Todas las combinaciones válidas de exactamente {@code tamano} cartas. */
    public List<Combinacion> candidatas(List<Carta> cartas, int tamano) {
        List<Combinacion> resultado = new ArrayList<>();
        for (Combinacion c : todas(cartas)) {
            if (c.tamano() == tamano) {
                resultado.add(c);
            }
        }
        return resultado;
    }

    /**
     * Todas las formas de elegir combinaciones disjuntas con los tamaños pedidos (en orden).
     * Cada solución es la lista de combinaciones elegidas.
     */
    public List<List<Combinacion>> particiones(List<Carta> cartas, int... tamanos) {
        List<List<Combinacion>> soluciones = new ArrayList<>();
        buscar(cartas, tamanos, 0, new ArrayList<>(), soluciones);
        return soluciones;
    }

    /** Menor suma posible de puntos de las cartas que quedan sueltas al formar combinaciones disjuntas. */
    public int menorSobrante(List<Carta> cartas, ToIntFunction<Carta> puntos) {
        return menorSobrante(new ArrayList<>(cartas), todas(cartas), 0, puntos);
    }

    /** Cartas que no pertenecen a ninguna de las combinaciones dadas. */
    public static List<Carta> restantes(List<Carta> cartas, List<Combinacion> usadas) {
        List<Carta> libres = new ArrayList<>(cartas);
        for (Combinacion c : usadas) {
            libres.removeAll(c.cartas());
        }
        return libres;
    }

    private void buscar(List<Carta> libres, int[] tamanos, int i, List<Combinacion> elegidas,
                        List<List<Combinacion>> soluciones) {
        if (i == tamanos.length) {
            soluciones.add(List.copyOf(elegidas));
            return;
        }
        for (Combinacion c : candidatas(libres, tamanos[i])) {
            elegidas.add(c);
            buscar(restantes(libres, List.of(c)), tamanos, i + 1, elegidas, soluciones);
            elegidas.remove(elegidas.size() - 1);
        }
    }

    private int menorSobrante(List<Carta> libres, List<Combinacion> opciones, int desde, ToIntFunction<Carta> puntos) {
        int mejor = suma(libres, puntos);
        for (int k = desde; k < opciones.size(); k++) {
            Combinacion c = opciones.get(k);
            if (libres.containsAll(c.cartas())) {
                List<Carta> resto = restantes(libres, List.of(c));
                mejor = Math.min(mejor, menorSobrante(resto, opciones, k + 1, puntos));
            }
        }
        return mejor;
    }

    private static int suma(List<Carta> cartas, ToIntFunction<Carta> puntos) {
        return cartas.stream().mapToInt(puntos).sum();
    }

    private List<Combinacion> todas(List<Carta> cartas) {
        Set<Combinacion> resultado = new HashSet<>(grupos(cartas));
        resultado.addAll(escaleras(cartas));
        List<Combinacion> lista = new ArrayList<>(resultado);
        lista.sort((a, b) -> Integer.compare(b.tamano(), a.tamano()));
        return lista;
    }

    private List<Combinacion> grupos(List<Carta> cartas) {
        List<Combinacion> resultado = new ArrayList<>();
        for (Valor v : Valor.values()) {
            List<Carta> mismas = cartas.stream().filter(c -> c.valor() == v).sorted().toList();
            resultado.addAll(subgruposDe(mismas));
        }
        return resultado;
    }

    private List<Combinacion> subgruposDe(List<Carta> mismas) {
        List<Combinacion> resultado = new ArrayList<>();
        if (mismas.size() == 3) {
            resultado.add(new Combinacion(TipoCombinacion.GRUPO, mismas));
        }
        if (mismas.size() == 4) {
            resultado.add(new Combinacion(TipoCombinacion.GRUPO, mismas));
            for (int fuera = 0; fuera < mismas.size(); fuera++) {
                List<Carta> tres = new ArrayList<>(mismas);
                tres.remove(fuera);
                resultado.add(new Combinacion(TipoCombinacion.GRUPO, tres));
            }
        }
        return resultado;
    }

    private List<Combinacion> escaleras(List<Carta> cartas) {
        List<Combinacion> resultado = new ArrayList<>();
        for (Palo p : Palo.values()) {
            List<Carta> delPalo = cartas.stream().filter(c -> c.palo() == p).distinct().sorted().toList();
            resultado.addAll(tramosConsecutivos(delPalo));
        }
        return resultado;
    }

    private List<Combinacion> tramosConsecutivos(List<Carta> ordenadas) {
        List<Combinacion> resultado = new ArrayList<>();
        for (int inicio = 0; inicio < ordenadas.size(); inicio++) {
            for (int fin = inicio + 3; fin <= ordenadas.size(); fin++) {
                List<Carta> tramo = ordenadas.subList(inicio, fin);
                if (esConsecutivo(tramo)) {
                    resultado.add(new Combinacion(TipoCombinacion.ESCALERA, tramo));
                }
            }
        }
        return resultado;
    }

    private static boolean esConsecutivo(List<Carta> tramo) {
        for (int i = 1; i < tramo.size(); i++) {
            if (tramo.get(i).valor().rango() != tramo.get(i - 1).valor().rango() + 1) {
                return false;
            }
        }
        return true;
    }
}
