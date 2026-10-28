package co.edu.unal.apuntado.persistence;

import co.edu.unal.apuntado.kernel.Carta;
import co.edu.unal.apuntado.kernel.EstadoPartida;
import co.edu.unal.apuntado.kernel.EventoJuego;
import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.Participante;
import co.edu.unal.apuntado.kernel.PartidaId;
import co.edu.unal.apuntado.kernel.RegistroRonda;
import co.edu.unal.apuntado.kernel.ResultadoValidacion;
import co.edu.unal.apuntado.kernel.TipoAccion;
import co.edu.unal.apuntado.persistence.entity.GameSessionEntity;
import co.edu.unal.apuntado.persistence.entity.ParticipationEntity;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import javax.sql.DataSource;

/**
 * StateRepositoryComponent: implementación JDBC sobre PostgreSQL (esquema en db/migration).
 * La transacción de cierre reproduce la secuencia de la Sección 2.4 (READ COMMITTED + SELECT ... FOR UPDATE).
 * El alta de partidas y jugadores y la persistencia de manos (ronda_carta) se completan en el Entregable 3.
 */
public final class StateRepositoryComponent implements IRepositorioPartida {

    private static final String PARTICIPACION =
            "(SELECT id_participacion FROM partida_jugador WHERE id_partida = ? AND id_jugador = ?)";

    private final DataSource fuente;

    public StateRepositoryComponent(DataSource fuente) {
        this.fuente = fuente;
    }

    @Override
    public void guardarEstado(EstadoPartida estado) {
        enTransaccion(con -> {
            ejecutar(con, "UPDATE partida SET estado = ?, version = ? WHERE id_partida = ?",
                    estado.fase().name(), estado.version(), estado.id().valor());
            for (Participante p : estado.participantes()) {
                ejecutar(con, "UPDATE partida_jugador SET estado = ? WHERE id_partida = ? AND id_jugador = ?",
                        p.estado().name(), estado.id().valor(), p.jugador().valor());
            }
            return null;
        });
    }

    @Override
    public void registrarEvento(EventoJuego e) {
        enTransaccion(con -> {
            insertarJugada(con, idRonda(con, e, false), e);
            return null;
        });
    }

    @Override
    public void registrarPenalizacion(EventoJuego cierre, RegistroRonda registro, Map<JugadorId, Integer> acumulados,
                                      List<JugadorId> eliminados, boolean partidaTerminada) {
        enTransaccion(con -> {
            UUID ronda = idRonda(con, cierre, true);                         // 1. bloquear la ronda
            insertarJugada(con, ronda, cierre);                               // 2. cierre válido
            int cerradas = ejecutar(con, "UPDATE ronda SET estado = 'CERRADA', cerrada_en = now(), "
                    + "version = version + 1 WHERE id_ronda = ? AND estado = 'EN_CURSO'", ronda);
            exigir(cerradas == 1, "ronda ya cerrada");                       // 3. compare-and-set
            insertarPuntajes(con, ronda, cierre.partida(), registro, acumulados);    // 4. acumulativa
            eliminar(con, cierre.partida(), eliminados);                       // 5. eliminados
            if (partidaTerminada) {
                finalizar(con, cierre.partida(), cierre.jugador());           // 5b. fin de partida
            }
            return null;
        });
    }

    @Override
    public Optional<EstadoPartida> recuperar(PartidaId partida) {
        return enTransaccion(con -> {
            GameSessionEntity sesion = GameSessionEntity.leer(con, partida.valor());
            if (sesion == null) {
                return Optional.empty();
            }
            return Optional.of(sesion.toEstado(ParticipationEntity.leerTodas(con, partida.valor())));
        });
    }

    @Override
    public List<EventoJuego> historial(PartidaId partida) {
        String sql = "SELECT r.numero_ronda, tj.numero_turno, pj.id_jugador, tj.tipo_accion, tj.codigo_carta, "
                + "tj.resultado_validacion FROM turno_jugada tj JOIN ronda r ON r.id_ronda = tj.id_ronda "
                + "JOIN partida_jugador pj ON pj.id_participacion = tj.id_participacion "
                + "WHERE r.id_partida = ? ORDER BY tj.id_jugada";
        return enTransaccion(con -> {
            List<EventoJuego> eventos = new ArrayList<>();
            try (PreparedStatement ps = preparar(con, sql, partida.valor()); ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    eventos.add(aEvento(partida, rs));
                }
            }
            return eventos;
        });
    }

    @Override
    public Map<JugadorId, Integer> marcador(PartidaId partida) {
        String sql = "SELECT pj.id_jugador, m.acumulado FROM v_marcador m "
                + "JOIN partida_jugador pj ON pj.id_participacion = m.id_participacion WHERE m.id_partida = ?";
        return enTransaccion(con -> {
            Map<JugadorId, Integer> marcador = new LinkedHashMap<>();
            try (PreparedStatement ps = preparar(con, sql, partida.valor()); ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    marcador.put(new JugadorId(rs.getObject(1, UUID.class)), rs.getInt(2));
                }
            }
            return marcador;
        });
    }

    // ------------------------------------------------------------------ pasos de la transacción

    private UUID idRonda(Connection con, EventoJuego e, boolean bloquear) throws SQLException {
        String sql = "SELECT id_ronda, estado FROM ronda WHERE id_partida = ? AND numero_ronda = ?"
                + (bloquear ? " FOR UPDATE" : "");
        try (PreparedStatement ps = preparar(con, sql, e.partida().valor(), e.ronda());
             ResultSet rs = ps.executeQuery()) {
            exigir(rs.next(), "ronda inexistente");
            exigir(!bloquear || "EN_CURSO".equals(rs.getString(2)), "ronda ya cerrada");
            return rs.getObject(1, UUID.class);
        }
    }

    private void insertarJugada(Connection con, UUID ronda, EventoJuego e) throws SQLException {
        String sql = "INSERT INTO turno_jugada (id_ronda, numero_turno, secuencia, id_participacion, tipo_accion, "
                + "codigo_carta, resultado_validacion) VALUES (?, ?, (SELECT COALESCE(MAX(secuencia), 0) + 1 "
                + "FROM turno_jugada WHERE id_ronda = ? AND numero_turno = ?), " + PARTICIPACION + ", ?, ?, ?)";
        ejecutar(con, sql, ronda, (short) e.turno(), ronda, (short) e.turno(), e.partida().valor(),
                e.jugador().valor(), e.accion().name(), codigo(e.carta()), nombre(e.resultado()));
    }

    private void insertarPuntajes(Connection con, UUID ronda, PartidaId partida, RegistroRonda registro,
                                  Map<JugadorId, Integer> acumulados) throws SQLException {
        String sql = "INSERT INTO puntaje_acumulado (id_ronda, id_participacion, penalizacion_ronda, "
                + "acumulado_tras_ronda) VALUES (?, " + PARTICIPACION + ", ?, ?)";
        for (Map.Entry<JugadorId, Integer> fila : acumulados.entrySet()) {
            int penalizacion = registro.penalizaciones().getOrDefault(fila.getKey(), 0);
            ejecutar(con, sql, ronda, partida.valor(), fila.getKey().valor(), penalizacion, fila.getValue());
        }
    }

    private void eliminar(Connection con, PartidaId partida, List<JugadorId> eliminados) throws SQLException {
        if (eliminados.isEmpty()) {
            return;
        }
        int sobrevivientes = contar(con, "SELECT count(*) FROM partida_jugador WHERE id_partida = ? "
                + "AND estado <> 'ELIMINADO'", partida.valor()) - eliminados.size();
        for (JugadorId j : eliminados) {
            ejecutar(con, "UPDATE partida_jugador SET estado = 'ELIMINADO', posicion_final = ? "
                    + "WHERE id_partida = ? AND id_jugador = ?", (short) (sobrevivientes + 1), partida.valor(), j.valor());
        }
    }

    private void finalizar(Connection con, PartidaId partida, JugadorId ganador) throws SQLException {
        ejecutar(con, "UPDATE partida_jugador SET posicion_final = 1 WHERE id_partida = ? AND id_jugador = ?",
                partida.valor(), ganador.valor());
        int filas = ejecutar(con, "UPDATE partida SET estado = 'FINALIZADA', finalizada_en = now(), "
                + "version = version + 1 WHERE id_partida = ? AND estado = 'EN_CURSO'", partida.valor());
        exigir(filas == 1, "la partida no estaba EN_CURSO");
    }

    // ------------------------------------------------------------------ utilidades JDBC

    private <T> T enTransaccion(Trabajo<T> trabajo) {
        try (Connection con = fuente.getConnection()) {
            con.setAutoCommit(false);
            con.setTransactionIsolation(Connection.TRANSACTION_READ_COMMITTED);
            try {
                T resultado = trabajo.ejecutar(con);
                con.commit();
                return resultado;
            } catch (SQLException | RuntimeException e) {
                con.rollback();
                throw e;
            }
        } catch (SQLException e) {
            throw new IllegalStateException("Error de persistencia: " + e.getMessage(), e);
        }
    }

    private static PreparedStatement preparar(Connection con, String sql, Object... parametros) throws SQLException {
        PreparedStatement ps = con.prepareStatement(sql);
        for (int i = 0; i < parametros.length; i++) {
            ps.setObject(i + 1, parametros[i]);
        }
        return ps;
    }

    private static int ejecutar(Connection con, String sql, Object... parametros) throws SQLException {
        try (PreparedStatement ps = preparar(con, sql, parametros)) {
            return ps.executeUpdate();
        }
    }

    private static int contar(Connection con, String sql, Object... parametros) throws SQLException {
        try (PreparedStatement ps = preparar(con, sql, parametros); ResultSet rs = ps.executeQuery()) {
            rs.next();
            return rs.getInt(1);
        }
    }

    private static void exigir(boolean condicion, String mensaje) {
        if (!condicion) {
            throw new IllegalStateException(mensaje);
        }
    }

    private static EventoJuego aEvento(PartidaId partida, ResultSet rs) throws SQLException {
        String carta = rs.getString(5);
        String resultado = rs.getString(6);
        return new EventoJuego(partida, rs.getInt(1), rs.getInt(2), new JugadorId(rs.getObject(3, UUID.class)),
                TipoAccion.valueOf(rs.getString(4)), carta == null ? null : Carta.deCodigo(carta),
                resultado == null ? null : ResultadoValidacion.valueOf(resultado));
    }

    private static String codigo(Carta carta) {
        return carta == null ? null : carta.codigo();
    }

    private static String nombre(ResultadoValidacion resultado) {
        return resultado == null ? null : resultado.name();
    }

    @FunctionalInterface
    private interface Trabajo<T> {
        T ejecutar(Connection con) throws SQLException;
    }
}
