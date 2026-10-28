package co.edu.unal.apuntado.scoring;

import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.RegistroRonda;
import java.util.List;
import java.util.Map;

/** Resultado de la liquidación (Tabla 1.3.1). Es una interfaz: game depende solo de contratos (FF-04). */
public interface ResultadoLiquidacion {

    /** Ronda liquidada con la penalización de cada jugador (filas de puntaje_acumulado). */
    RegistroRonda registro();

    /** Acumulado de cada jugador tras la ronda (puntaje_acumulado.acumulado_tras_ronda). */
    Map<JugadorId, Integer> acumulados();

    /** Jugadores que alcanzaron o superaron el umbral en esta ronda. */
    List<JugadorId> eliminados();

    /** true si la partida termina con esta ronda. */
    boolean partidaTerminada();
}
