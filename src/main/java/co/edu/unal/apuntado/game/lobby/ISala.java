package co.edu.unal.apuntado.game.lobby;

import co.edu.unal.apuntado.kernel.CodigoModalidad;
import co.edu.unal.apuntado.kernel.EstadoPartida;
import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.PartidaId;

/** Interfaz interna de game (Tabla 1.3.1): conector entre LobbyManagerComponent y el orquestador. */
public interface ISala {

    EstadoPartida crearSala(JugadorId anfitrion);

    EstadoPartida unirse(String codigoInvitacion, JugadorId jugador);

    /** La modalidad se fija en la sala y es inmutable durante la partida (ADR-03, mecanismo 4). */
    EstadoPartida fijarModalidad(PartidaId partida, CodigoModalidad modalidad);

    EstadoPartida iniciar(PartidaId partida, JugadorId solicitante);

    String codigoInvitacion(PartidaId partida);
}
