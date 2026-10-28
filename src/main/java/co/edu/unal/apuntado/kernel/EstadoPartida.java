package co.edu.unal.apuntado.kernel;

import java.util.List;

/** Snapshot inmutable de la partida (Figura 2.3.1). */
public record EstadoPartida(
        PartidaId id,
        CodigoModalidad modalidad,
        EstadoSesion fase,
        List<Participante> participantes,
        int version) {

    public EstadoPartida {
        participantes = List.copyOf(participantes);
    }

    public EstadoPartida conFase(EstadoSesion nueva) {
        return new EstadoPartida(id, modalidad, nueva, participantes, version + 1);
    }

    public EstadoPartida conParticipantes(List<Participante> nuevos) {
        return new EstadoPartida(id, modalidad, fase, nuevos, version + 1);
    }
}
