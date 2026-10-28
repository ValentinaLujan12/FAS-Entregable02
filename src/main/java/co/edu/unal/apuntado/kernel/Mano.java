package co.edu.unal.apuntado.kernel;

import java.util.List;

/** Mano de un jugador: lista inmutable de cartas. */
public record Mano(List<Carta> cartas) {

    public Mano {
        cartas = List.copyOf(cartas);
    }

    public static Mano de(Carta... cartas) {
        return new Mano(List.of(cartas));
    }

    public int tamano() {
        return cartas.size();
    }
}
