package co.edu.unal.apuntado.scoring;

import co.edu.unal.apuntado.kernel.Carta;
import co.edu.unal.apuntado.kernel.CodigoModalidad;
import co.edu.unal.apuntado.kernel.EstadoRonda;
import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.ParametrosModalidad;
import co.edu.unal.apuntado.kernel.RegistroRonda;
import co.edu.unal.apuntado.rules.ICalculadorPuntos;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** RoundScoringComponent: liquidación pura de una ronda (sin estado ni I/O). */
public final class RoundScoringComponent implements IServicioPuntaje {

    private final ICalculadorPuntos calculador;

    public RoundScoringComponent(ICalculadorPuntos calculador) {
        this.calculador = Objects.requireNonNull(calculador, "calculador");
    }

    @Override
    public ResultadoLiquidacion liquidarRonda(CodigoModalidad modalidad, int numeroRonda, JugadorId ganador,
                                              Map<JugadorId, List<Carta>> manosFinales,
                                              Map<JugadorId, Integer> acumuladoPrevio) {
        ParametrosModalidad parametros = calculador.parametrosModalidad(modalidad);
        if (!parametros.acumulativa()) {
            RegistroRonda registro = new RegistroRonda(numeroRonda, EstadoRonda.CERRADA, ganador, Map.of());
            return new Liquidacion(registro, Map.of(), List.of(), true);
        }
        Map<JugadorId, Integer> penalizaciones = penalizaciones(modalidad, ganador, manosFinales);
        Map<JugadorId, Integer> acumulados = acumular(penalizaciones, acumuladoPrevio);
        List<JugadorId> eliminados = eliminados(acumulados, parametros.umbralEliminacion());
        boolean termina = acumulados.size() - eliminados.size() <= 1;
        RegistroRonda registro = new RegistroRonda(numeroRonda, EstadoRonda.CERRADA, ganador, penalizaciones);
        return new Liquidacion(registro, acumulados, eliminados, termina);
    }

    private Map<JugadorId, Integer> penalizaciones(CodigoModalidad modalidad, JugadorId ganador,
                                                   Map<JugadorId, List<Carta>> manos) {
        Map<JugadorId, Integer> resultado = new LinkedHashMap<>();
        manos.forEach((jugador, cartas) -> resultado.put(jugador,
                jugador.equals(ganador) ? 0 : calculador.puntosResiduales(cartas, modalidad)));
        return resultado;
    }

    /** acumulado_tras_ronda = acumulado previo + penalización de la ronda (Sección 2.2.3). */
    private static Map<JugadorId, Integer> acumular(Map<JugadorId, Integer> penalizaciones,
                                                    Map<JugadorId, Integer> previo) {
        Map<JugadorId, Integer> resultado = new LinkedHashMap<>();
        penalizaciones.forEach((jugador, pen) -> resultado.put(jugador, previo.getOrDefault(jugador, 0) + pen));
        return resultado;
    }

    private static List<JugadorId> eliminados(Map<JugadorId, Integer> acumulados, Integer umbral) {
        List<JugadorId> resultado = new ArrayList<>();
        acumulados.forEach((jugador, total) -> {
            if (total >= umbral) {
                resultado.add(jugador);
            }
        });
        return resultado;
    }

    private record Liquidacion(RegistroRonda registro, Map<JugadorId, Integer> acumulados,
                               List<JugadorId> eliminados, boolean partidaTerminada)
            implements ResultadoLiquidacion {
    }
}
