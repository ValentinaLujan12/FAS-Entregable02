package co.edu.unal.apuntado.architecture.dinamicas;

import co.edu.unal.apuntado.kernel.Carta;
import co.edu.unal.apuntado.kernel.Mano;
import java.util.Arrays;
import java.util.List;

/** Utilidad de pruebas: construye cartas y manos a partir de códigos ("AP", "10C", "KT"...). */
public final class Cartas {

    private Cartas() {
    }

    public static List<Carta> lista(String... codigos) {
        return Arrays.stream(codigos).map(Carta::deCodigo).toList();
    }

    public static Mano mano(String... codigos) {
        return new Mano(lista(codigos));
    }
}
