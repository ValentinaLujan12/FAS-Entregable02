package co.edu.unal.apuntado.kernel;

/**
 * Evento de juego (Figura 2.3.1). Además de los atributos de la figura incluye el id de la partida,
 * necesario para enrutar la notificación (ADR-05). carta y resultado pueden ser nulos.
 */
public record EventoJuego(
        PartidaId partida,
        int ronda,
        int turno,
        JugadorId jugador,
        TipoAccion accion,
        Carta carta,
        ResultadoValidacion resultado) {

    /** Copia del evento sin la carta (vista pública de un robo del mazo). */
    public EventoJuego sinCarta() {
        return new EventoJuego(partida, ronda, turno, jugador, accion, null, resultado);
    }
}
