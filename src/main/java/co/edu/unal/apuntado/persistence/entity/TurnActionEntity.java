package co.edu.unal.apuntado.persistence.entity;

import co.edu.unal.apuntado.kernel.Carta;
import co.edu.unal.apuntado.kernel.EventoJuego;
import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.PartidaId;
import co.edu.unal.apuntado.kernel.ResultadoValidacion;
import co.edu.unal.apuntado.kernel.TipoAccion;
import java.time.Instant;
import java.util.UUID;

/** Tabla turno_jugada: trazabilidad de robos, descartes y cierres. */
public class TurnActionEntity {

    private long idJugada;
    private UUID idRonda;
    private short numeroTurno;
    private short secuencia;
    private UUID idParticipacion;
    private TipoAccion tipoAccion;
    private String codigoCarta;
    private ResultadoValidacion resultadoValidacion;
    private Instant ocurridaEn;

    public TurnActionEntity(long idJugada, short numeroTurno, short secuencia, TipoAccion tipoAccion,
                            String codigoCarta, ResultadoValidacion resultadoValidacion) {
        this.idJugada = idJugada;
        this.numeroTurno = numeroTurno;
        this.secuencia = secuencia;
        this.tipoAccion = tipoAccion;
        this.codigoCarta = codigoCarta;
        this.resultadoValidacion = resultadoValidacion;
    }

    public EventoJuego toEvento(PartidaId partida, int ronda, JugadorId jugador) {
        Carta carta = codigoCarta == null ? null : Carta.deCodigo(codigoCarta);
        return new EventoJuego(partida, ronda, numeroTurno, jugador, tipoAccion, carta, resultadoValidacion);
    }

    /** Fila del índice parcial ux_cierre_valido (un solo cierre válido por ronda). */
    public boolean cierreValido() {
        return tipoAccion == TipoAccion.CIERRE && resultadoValidacion == ResultadoValidacion.VALIDO;
    }

    public long idJugada() {
        return idJugada;
    }

    public short secuencia() {
        return secuencia;
    }
}
