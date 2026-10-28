package co.edu.unal.apuntado.kernel;

import java.util.Map;

/** Snapshot de una ronda liquidada (Figura 2.3.1); ganador puede ser nulo. */
public record RegistroRonda(int numero, EstadoRonda estado, JugadorId ganador, Map<JugadorId, Integer> penalizaciones) {

    public RegistroRonda {
        penalizaciones = Map.copyOf(penalizaciones);
    }
}
