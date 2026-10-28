package co.edu.unal.apuntado.persistence.entity;

import co.edu.unal.apuntado.kernel.CodigoModalidad;
import co.edu.unal.apuntado.kernel.EstadoPartida;
import co.edu.unal.apuntado.kernel.EstadoSesion;
import co.edu.unal.apuntado.kernel.PartidaId;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Tabla partida (la sala es una partida EN_ESPERA). */
public class GameSessionEntity {

    private UUID idPartida;
    private String codigoInvitacion;
    private String codigoModalidad;
    private UUID idHost;
    private EstadoSesion estado;
    private Instant creadaEn;
    private Instant iniciadaEn;
    private Instant finalizadaEn;
    private int version;

    public GameSessionEntity(UUID idPartida, String codigoInvitacion, String codigoModalidad, UUID idHost,
                             EstadoSesion estado, int version) {
        this.idPartida = idPartida;
        this.codigoInvitacion = codigoInvitacion;
        this.codigoModalidad = codigoModalidad;
        this.idHost = idHost;
        this.estado = estado;
        this.version = version;
    }

    public static GameSessionEntity leer(Connection con, UUID id) throws SQLException {
        String sql = "SELECT codigo_invitacion, codigo_modalidad, id_host, estado, version FROM partida WHERE id_partida = ?";
        try (PreparedStatement ps = con.prepareStatement(sql)) {
            ps.setObject(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return null;
                }
                return new GameSessionEntity(id, rs.getString(1), rs.getString(2), rs.getObject(3, UUID.class),
                        EstadoSesion.valueOf(rs.getString(4)), rs.getInt(5));
            }
        }
    }

    public EstadoPartida toEstado(List<ParticipationEntity> participaciones) {
        return new EstadoPartida(new PartidaId(idPartida), CodigoModalidad.de(codigoModalidad), estado,
                participaciones.stream().map(ParticipationEntity::toParticipante).toList(), version);
    }

    public static GameSessionEntity from(EstadoPartida estado, String codigoInvitacion, UUID idHost) {
        return new GameSessionEntity(estado.id().valor(), codigoInvitacion, estado.modalidad().valor(), idHost,
                estado.fase(), estado.version());
    }

    public boolean enCurso() {
        return estado == EstadoSesion.EN_CURSO;
    }

    public Instant creadaEn() {
        return creadaEn;
    }

    public Instant iniciadaEn() {
        return iniciadaEn;
    }

    public Instant finalizadaEn() {
        return finalizadaEn;
    }
}
