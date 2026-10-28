package co.edu.unal.apuntado.architecture.dinamicas.dobles;

import co.edu.unal.apuntado.infra.ITemporizadorTurno;
import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.PartidaId;
import java.time.Duration;

/** Doble de ITemporizadorTurno: no programa nada; la prueba dispara el timeout a mano. */
public final class TemporizadorManual implements ITemporizadorTurno {

    @Override
    public void iniciar(PartidaId partida, JugadorId jugadorEnTurno, Duration duracion) {
        // sin acción
    }

    @Override
    public void detener(PartidaId partida) {
        // sin acción
    }
}
