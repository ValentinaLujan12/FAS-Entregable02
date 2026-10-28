package co.edu.unal.apuntado.infra;

import co.edu.unal.apuntado.kernel.EventoJuego;
import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.TipoAccion;

/**
 * Mitigación del riesgo R7 (Sección 4.3): cada evento se proyecta por destinatario antes de enviarlo.
 * La carta de un robo del mazo solo la ve quien roba; el resto de la mesa ve que robó, pero no qué.
 */
public final class ProyectorVistaJugador {

    public EventoJuego proyectar(EventoJuego evento, JugadorId destinatario) {
        boolean esPrivado = evento.accion() == TipoAccion.ROBO_MAZO;
        if (esPrivado && !evento.jugador().equals(destinatario)) {
            return evento.sinCarta();
        }
        return evento;
    }
}
