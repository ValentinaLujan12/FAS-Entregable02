package co.edu.unal.apuntado.deck;

import co.edu.unal.apuntado.kernel.Carta;
import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.Mano;
import co.edu.unal.apuntado.kernel.ParametrosModalidad;
import co.edu.unal.apuntado.kernel.PartidaId;
import java.util.List;
import java.util.Map;

/** Puerto pMazo (Tabla 1.3.1): lo requiere game. */
public interface IMazo {

    /** Construye y mezcla el mazo de la partida; la semilla se persiste en ronda.semilla_barajado. */
    void barajar(PartidaId partida, long semilla, ParametrosModalidad parametros);

    /** Reparte las cartas de cada jugador; {@code cartaExtraA} recibe una carta adicional (abre la ronda). */
    Map<JugadorId, Mano> repartir(PartidaId partida, List<JugadorId> jugadores, JugadorId cartaExtraA);

    Carta robarMazo(PartidaId partida);

    Carta robarPozo(PartidaId partida);

    void descartar(PartidaId partida, Carta carta);
}
