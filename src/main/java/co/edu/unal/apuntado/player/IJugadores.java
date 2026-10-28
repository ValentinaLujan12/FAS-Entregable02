package co.edu.unal.apuntado.player;

import co.edu.unal.apuntado.kernel.EstadoJugador;
import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.PartidaId;
import java.util.List;

/** Puerto pJugadores (Tabla 1.3.1): lo requiere game. */
public interface IJugadores {

    void registrar(PartidaId partida, JugadorId jugador);

    /** Jugadores ACTIVOS o DESCONECTADOS, en orden de turno. */
    List<JugadorId> ordenDeTurno(PartidaId partida);

    void marcarEliminado(PartidaId partida, JugadorId jugador);

    void marcarDesconectado(PartidaId partida, JugadorId jugador);

    void reconectar(PartidaId partida, JugadorId jugador);

    EstadoJugador estado(PartidaId partida, JugadorId jugador);
}
