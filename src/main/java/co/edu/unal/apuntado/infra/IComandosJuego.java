package co.edu.unal.apuntado.infra;

import co.edu.unal.apuntado.kernel.Carta;
import co.edu.unal.apuntado.kernel.CodigoModalidad;
import co.edu.unal.apuntado.kernel.EstadoPartida;
import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.PartidaId;
import co.edu.unal.apuntado.kernel.ResultadoValidacion;
import co.edu.unal.apuntado.kernel.ZonaCarta;

/**
 * Puerto pComandos (Tabla 1.3.1): lo declara infra y lo provee game (inversión de dependencia).
 * Por aquí llegan los comandos de los clientes y el timeout del temporizador. El servidor es autoritativo:
 * el cliente envía intenciones y el servidor valida con su propio estado (por eso cerrarRonda no recibe la mano).
 */
public interface IComandosJuego {

    EstadoPartida crearSala(JugadorId anfitrion, CodigoModalidad modalidad);

    EstadoPartida unirse(String codigoInvitacion, JugadorId jugador);

    /** Inicia la partida (solo el anfitrión, con 2 a 6 jugadores) y reparte la primera ronda. */
    EstadoPartida iniciar(PartidaId partida, JugadorId anfitrion);

    /** Roba del mazo o del pozo; devuelve la carta solo a quien roba. */
    Carta robar(PartidaId partida, JugadorId jugador, ZonaCarta origen);

    void descartar(PartidaId partida, JugadorId jugador, Carta carta);

    ResultadoValidacion cerrarRonda(PartidaId partida, JugadorId jugador);

    void alExpirarTurno(PartidaId partida, JugadorId jugador);
}
