package co.edu.unal.apuntado.infra;

import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.PartidaId;
import java.time.Duration;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/** TemporizadorTurno: un timer por partida; al vencer invoca IComandosJuego.alExpirarTurno. */
public final class TemporizadorTurno implements ITemporizadorTurno {

    private final ScheduledExecutorService reloj = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread hilo = new Thread(r, "temporizador-turno");
        hilo.setDaemon(true);
        return hilo;
    });
    private final Map<PartidaId, ScheduledFuture<?>> timers = new ConcurrentHashMap<>();
    private volatile IComandosJuego comandos;

    /** Se conecta después de construir game, para no crear un ciclo de construcción. */
    public void conectar(IComandosJuego comandos) {
        this.comandos = Objects.requireNonNull(comandos, "comandos");
    }

    @Override
    public void iniciar(PartidaId partida, JugadorId jugadorEnTurno, Duration duracion) {
        detener(partida);
        timers.put(partida, reloj.schedule(() -> vencer(partida, jugadorEnTurno),
                duracion.toMillis(), TimeUnit.MILLISECONDS));
    }

    @Override
    public void detener(PartidaId partida) {
        ScheduledFuture<?> anterior = timers.remove(partida);
        if (anterior != null) {
            anterior.cancel(false);
        }
    }

    private void vencer(PartidaId partida, JugadorId jugador) {
        timers.remove(partida);
        if (comandos != null) {
            comandos.alExpirarTurno(partida, jugador);
        }
    }
}
