package co.edu.unal.apuntado.kernel;

/** Participante dentro de EstadoPartida (snapshot de partida_jugador). */
public record Participante(JugadorId jugador, int ordenTurno, EstadoJugador estado) {

    public Participante conEstado(EstadoJugador nuevo) {
        return new Participante(jugador, ordenTurno, nuevo);
    }
}
