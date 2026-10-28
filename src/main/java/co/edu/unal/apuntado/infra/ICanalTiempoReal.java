package co.edu.unal.apuntado.infra;

import co.edu.unal.apuntado.kernel.EventoJuego;

/** Puerto pCanal (Tabla 1.3.1): game lo invoca solo después del COMMIT (ADR-05). */
public interface ICanalTiempoReal {

    void difundir(EventoJuego evento);
}
