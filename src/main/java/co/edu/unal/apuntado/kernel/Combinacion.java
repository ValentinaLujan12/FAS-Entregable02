package co.edu.unal.apuntado.kernel;

import java.util.List;

/** Combinación válida de cartas (terna, cuarta o escalera más larga). */
public record Combinacion(TipoCombinacion tipo, List<Carta> cartas) {

    public Combinacion {
        cartas = List.copyOf(cartas);
    }

    public int tamano() {
        return cartas.size();
    }
}
