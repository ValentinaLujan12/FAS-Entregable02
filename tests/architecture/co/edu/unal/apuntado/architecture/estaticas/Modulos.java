package co.edu.unal.apuntado.architecture.estaticas;

import java.util.Arrays;
import java.util.List;

/** Módulos del Monolito Modular (Tabla 1.2.1) y utilidades para expresar las reglas de dependencia. */
final class Modulos {

    static final String BASE = "co.edu.unal.apuntado";
    static final String KERNEL = "kernel";
    static final String GAME = "game";
    static final String DECK = "deck";
    static final String PLAYER = "player";
    static final String RULES = "rules";
    static final String SCORING = "scoring";
    static final String PERSISTENCE = "persistence";
    static final String INFRA = "infra";

    static final List<String> TODOS = List.of(KERNEL, GAME, DECK, PLAYER, RULES, SCORING, PERSISTENCE, INFRA);

    private Modulos() {
    }

    /** Identificador de paquete ArchUnit del módulo, p. ej. "co.edu.unal.apuntado.rules..". */
    static String paquete(String modulo) {
        return BASE + "." + modulo + "..";
    }

    /** Paquetes de todos los módulos distintos de {@code modulo} y de los {@code permitidos}. */
    static String[] prohibidosPara(String modulo, String... permitidos) {
        List<String> ok = Arrays.asList(permitidos);
        return TODOS.stream()
                .filter(m -> !m.equals(modulo) && !ok.contains(m))
                .map(Modulos::paquete)
                .toArray(String[]::new);
    }
}
