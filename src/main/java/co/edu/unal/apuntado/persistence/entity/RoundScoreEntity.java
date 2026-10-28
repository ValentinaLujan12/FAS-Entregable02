package co.edu.unal.apuntado.persistence.entity;

import java.util.UUID;

/** Tabla puntaje_acumulado: fila inmutable por participante y ronda cerrada. */
public class RoundScoreEntity {

    private final UUID idRonda;
    private final UUID idParticipacion;
    private final int penalizacionRonda;
    private final int acumuladoTrasRonda;

    public RoundScoreEntity(UUID idRonda, UUID idParticipacion, int penalizacionRonda, int acumuladoTrasRonda) {
        this.idRonda = idRonda;
        this.idParticipacion = idParticipacion;
        this.penalizacionRonda = penalizacionRonda;
        this.acumuladoTrasRonda = acumuladoTrasRonda;
    }

    /** Fila de la ronda siguiente: acumulado_tras_ronda = acumulado previo + penalización (Sección 2.2.3). */
    public RoundScoreEntity siguiente(UUID ronda, int penalizacion) {
        return new RoundScoreEntity(ronda, idParticipacion, penalizacion, acumuladoTrasRonda + penalizacion);
    }

    public int penalizacionRonda() {
        return penalizacionRonda;
    }

    public int acumuladoTrasRonda() {
        return acumuladoTrasRonda;
    }

    public UUID idRonda() {
        return idRonda;
    }
}
