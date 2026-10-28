package co.edu.unal.apuntado.persistence.entity;

import co.edu.unal.apuntado.kernel.Mano;
import java.util.List;
import java.util.UUID;

/** Tabla mano_jugador; sus cartas están en ronda_carta (zona = MANO). */
public class HandStateEntity {

    private UUID idMano;
    private UUID idRonda;
    private UUID idParticipacion;
    private int version;
    private final List<CardLocationEntity> ubicaciones;

    public HandStateEntity(UUID idMano, UUID idRonda, UUID idParticipacion, int version,
                           List<CardLocationEntity> ubicaciones) {
        this.idMano = idMano;
        this.idRonda = idRonda;
        this.idParticipacion = idParticipacion;
        this.version = version;
        this.ubicaciones = List.copyOf(ubicaciones);
    }

    public Mano toMano() {
        return new Mano(ubicaciones.stream().filter(CardLocationEntity::enMano).map(CardLocationEntity::carta).toList());
    }

    public UUID idMano() {
        return idMano;
    }
}
