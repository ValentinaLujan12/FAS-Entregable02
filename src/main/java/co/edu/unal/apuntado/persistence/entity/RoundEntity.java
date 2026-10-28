package co.edu.unal.apuntado.persistence.entity;

import co.edu.unal.apuntado.kernel.EstadoRonda;
import co.edu.unal.apuntado.kernel.RegistroRonda;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/** Tabla ronda (Partida-Ronda 1:N). */
public class RoundEntity {

    private UUID idRonda;
    private UUID idPartida;
    private short numeroRonda;
    private EstadoRonda estado;
    private long semillaBarajado;
    private Instant iniciadaEn;
    private Instant cerradaEn;
    private int version;

    public RoundEntity(UUID idRonda, UUID idPartida, short numeroRonda, EstadoRonda estado, long semillaBarajado,
                       int version) {
        this.idRonda = idRonda;
        this.idPartida = idPartida;
        this.numeroRonda = numeroRonda;
        this.estado = estado;
        this.semillaBarajado = semillaBarajado;
        this.version = version;
    }

    public RegistroRonda toRegistro() {
        return new RegistroRonda(numeroRonda, estado, null, Map.of());
    }

    public boolean abierta() {
        return estado == EstadoRonda.EN_CURSO;
    }

    public long semillaBarajado() {
        return semillaBarajado;
    }

    public int version() {
        return version;
    }
}
