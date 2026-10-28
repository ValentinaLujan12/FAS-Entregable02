package co.edu.unal.apuntado.scoring;

import co.edu.unal.apuntado.kernel.Carta;
import co.edu.unal.apuntado.kernel.CodigoModalidad;
import co.edu.unal.apuntado.kernel.JugadorId;
import java.util.List;
import java.util.Map;

/** Puerto pPuntaje (Tabla 1.3.1): lo requiere game. */
public interface IServicioPuntaje {

    /**
     * Liquida una ronda cerrada válidamente.
     *
     * @param manosFinales     cartas de cada jugador activo al cierre (el ganador incluido)
     * @param acumuladoPrevio  acumulado de cada jugador antes de esta ronda (vacío en modalidades no acumulativas)
     */
    ResultadoLiquidacion liquidarRonda(CodigoModalidad modalidad, int numeroRonda, JugadorId ganador,
                                       Map<JugadorId, List<Carta>> manosFinales,
                                       Map<JugadorId, Integer> acumuladoPrevio);
}
