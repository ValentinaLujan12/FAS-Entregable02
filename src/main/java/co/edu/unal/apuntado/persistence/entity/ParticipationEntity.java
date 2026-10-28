package co.edu.unal.apuntado.persistence.entity;

import co.edu.unal.apuntado.kernel.EstadoJugador;
import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.Participante;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Tabla partida_jugador (resuelve la relación N:M Jugador-Partida). */
public class ParticipationEntity {

    private UUID idParticipacion;
    private UUID idPartida;
    private UUID idJugador;
    private short ordenTurno;
    private EstadoJugador estado;
    private Short posicionFinal;
    private Instant unidoEn;

    public ParticipationEntity(UUID idParticipacion, UUID idPartida, UUID idJugador, short ordenTurno,
                               EstadoJugador estado, Short posicionFinal) {
        this.idParticipacion = idParticipacion;
        this.idPartida = idPartida;
        this.idJugador = idJugador;
        this.ordenTurno = ordenTurno;
        this.estado = estado;
        this.posicionFinal = posicionFinal;
    }

    public static List<ParticipationEntity> leerTodas(Connection con, UUID idPartida) throws SQLException {
        String sql = "SELECT id_participacion, id_jugador, orden_turno, estado, posicion_final "
                + "FROM partida_jugador WHERE id_partida = ? ORDER BY orden_turno";
        List<ParticipationEntity> resultado = new ArrayList<>();
        try (PreparedStatement ps = con.prepareStatement(sql)) {
            ps.setObject(1, idPartida);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    resultado.add(new ParticipationEntity(rs.getObject(1, UUID.class), idPartida,
                            rs.getObject(2, UUID.class), rs.getShort(3), EstadoJugador.valueOf(rs.getString(4)),
                            rs.getObject(5, Short.class)));
                }
            }
        }
        return resultado;
    }

    public boolean activo() {
        return estado == EstadoJugador.ACTIVO;
    }

    public Participante toParticipante() {
        return new Participante(new JugadorId(idJugador), ordenTurno, estado);
    }

    public UUID idParticipacion() {
        return idParticipacion;
    }

    public Short posicionFinal() {
        return posicionFinal;
    }

    public Instant unidoEn() {
        return unidoEn;
    }
}
