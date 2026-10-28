package co.edu.unal.apuntado.kernel;

import java.util.Objects;
import java.util.UUID;

/** Identificador de jugador (jugador.id_jugador). */
public record JugadorId(UUID valor) {

    public JugadorId {
        Objects.requireNonNull(valor, "valor");
    }

    public static JugadorId nuevo() {
        return new JugadorId(UUID.randomUUID());
    }
}
