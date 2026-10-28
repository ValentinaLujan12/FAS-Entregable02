package co.edu.unal.apuntado.kernel;

import java.util.Objects;
import java.util.UUID;

/** Identificador de partida (partida.id_partida). */
public record PartidaId(UUID valor) {

    public PartidaId {
        Objects.requireNonNull(valor, "valor");
    }

    public static PartidaId nuevo() {
        return new PartidaId(UUID.randomUUID());
    }
}
