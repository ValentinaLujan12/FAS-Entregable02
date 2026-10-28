package co.edu.unal.apuntado.infra;

import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.PartidaId;
import java.time.Duration;

/** Puerto pTimer (Tabla 1.3.1). Al vencer invoca IComandosJuego.alExpirarTurno (misma cola que los comandos). */
public interface ITemporizadorTurno {

    void iniciar(PartidaId partida, JugadorId jugadorEnTurno, Duration duracion);

    void detener(PartidaId partida);
}
