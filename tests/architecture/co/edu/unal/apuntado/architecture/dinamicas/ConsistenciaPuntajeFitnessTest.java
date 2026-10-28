package co.edu.unal.apuntado.architecture.dinamicas;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.edu.unal.apuntado.kernel.Carta;
import co.edu.unal.apuntado.kernel.CodigoModalidad;
import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.Palo;
import co.edu.unal.apuntado.kernel.Valor;
import co.edu.unal.apuntado.rules.MotorReglas;
import co.edu.unal.apuntado.rules.RegistroReglas;
import co.edu.unal.apuntado.scoring.ResultadoLiquidacion;
import co.edu.unal.apuntado.scoring.RoundScoringComponent;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import org.junit.jupiter.api.Test;

/**
 * Sección 2.2.3 y ADR-04 - FF-20 (versión en memoria): en todas las rondas, acumulado_tras_ronda es igual al
 * acumulado previo más la penalización de la ronda, y la eliminación ocurre exactamente al llegar a 101.
 */
class ConsistenciaPuntajeFitnessTest {

    private static final CodigoModalidad APUNTADO = CodigoModalidad.de("APUNTADO");
    private final MotorReglas motor = new MotorReglas(RegistroReglas.descubrir());
    private final RoundScoringComponent scoring = new RoundScoringComponent(motor);

    @Test
    void ff20_acumulado_igual_a_suma_de_penalizaciones_en_partidas_aleatorias() {
        Random azar = new Random(101);
        int rondasVerificadas = 0;
        for (int partida = 0; partida < 50; partida++) {
            rondasVerificadas += simularPartida(azar);
        }
        assertTrue(rondasVerificadas >= 50, "FF-20: se verificaron " + rondasVerificadas + " rondas");
    }

    private int simularPartida(Random azar) {
        List<JugadorId> jugadores = List.of(JugadorId.nuevo(), JugadorId.nuevo(), JugadorId.nuevo());
        Map<JugadorId, Integer> acumulado = new HashMap<>();
        Map<JugadorId, Integer> sumaPenalizaciones = new HashMap<>();
        List<JugadorId> activos = new ArrayList<>(jugadores);
        int ronda = 1;
        for (; activos.size() > 1 && ronda < 100; ronda++) {
            JugadorId ganador = activos.get(azar.nextInt(activos.size()));
            ResultadoLiquidacion r = scoring.liquidarRonda(APUNTADO, ronda, ganador, manos(activos, azar), acumulado);
            for (JugadorId j : activos) {
                int pen = r.registro().penalizaciones().get(j);
                sumaPenalizaciones.merge(j, pen, Integer::sum);
                assertEquals(acumulado.getOrDefault(j, 0) + pen, r.acumulados().get(j),
                        "FF-20: acumulado_tras_ronda = acumulado previo + penalización");
                assertEquals(sumaPenalizaciones.get(j), r.acumulados().get(j));
                assertEquals(r.acumulados().get(j) >= 101, r.eliminados().contains(j), "umbral de 101");
            }
            assertEquals(0, r.registro().penalizaciones().get(ganador), "quien cierra no se penaliza");
            acumulado = new HashMap<>(r.acumulados());
            activos.removeAll(r.eliminados());
            assertEquals(activos.size() <= 1, r.partidaTerminada());
        }
        assertTrue(activos.size() <= 1, "la partida termina");
        return ronda - 1;
    }

    private static Map<JugadorId, List<Carta>> manos(List<JugadorId> jugadores, Random azar) {
        List<Carta> mazo = new ArrayList<>();
        for (Palo p : Palo.values()) {
            for (Valor v : Valor.values()) {
                mazo.add(Carta.de(v, p));
            }
        }
        Collections.shuffle(mazo, azar);
        Map<JugadorId, List<Carta>> manos = new LinkedHashMap<>();
        int i = 0;
        for (JugadorId j : jugadores) {
            manos.put(j, new ArrayList<>(mazo.subList(i, i + 10)));
            i += 10;
        }
        return manos;
    }
}
