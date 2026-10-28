package co.edu.unal.apuntado.persistence.entity;

import co.edu.unal.apuntado.kernel.JugadorId;
import java.time.Instant;
import java.util.UUID;

/** Tabla jugador. */
public class PlayerEntity {

    private UUID idJugador;
    private String alias;
    private Instant creadoEn;

    public PlayerEntity(UUID idJugador, String alias, Instant creadoEn) {
        this.idJugador = idJugador;
        this.alias = alias;
        this.creadoEn = creadoEn;
    }

    public JugadorId jugadorId() {
        return new JugadorId(idJugador);
    }

    public String alias() {
        return alias;
    }

    public Instant creadoEn() {
        return creadoEn;
    }
}
