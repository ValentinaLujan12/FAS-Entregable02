package co.edu.unal.apuntado.architecture.dinamicas.dobles;

import co.edu.unal.apuntado.infra.ICanalTiempoReal;
import co.edu.unal.apuntado.kernel.EventoJuego;

/** Doble de ICanalTiempoReal: anota cada difusión y, si se pide, falla (cliente caído). */
public final class CanalQueRegistra implements ICanalTiempoReal {

    private final Bitacora bitacora;
    private volatile boolean fallar;

    public CanalQueRegistra(Bitacora bitacora) {
        this.bitacora = bitacora;
    }

    public void fallarDesdeAhora() {
        this.fallar = true;
    }

    @Override
    public void difundir(EventoJuego evento) {
        bitacora.anotar("difundir:" + evento.accion());
        if (fallar) {
            throw new IllegalStateException("conexión caída");
        }
    }
}
