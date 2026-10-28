package co.edu.unal.apuntado.game.lobby;

import co.edu.unal.apuntado.kernel.CodigoModalidad;
import co.edu.unal.apuntado.kernel.EstadoJugador;
import co.edu.unal.apuntado.kernel.EstadoPartida;
import co.edu.unal.apuntado.kernel.EstadoSesion;
import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.Participante;
import co.edu.unal.apuntado.kernel.PartidaId;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** LobbyManagerComponent: salas en espera (partida EN_ESPERA con código de invitación, CU-04). Sin I/O. */
public final class LobbyManagerComponent implements ISala {

    private static final String ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int MINIMO_JUGADORES = 2;
    private static final int MAXIMO_JUGADORES = 6;

    private final SecureRandom azar = new SecureRandom();
    private final Map<PartidaId, Sala> salas = new ConcurrentHashMap<>();
    private final Map<String, PartidaId> porCodigo = new ConcurrentHashMap<>();

    @Override
    public EstadoPartida crearSala(JugadorId anfitrion) {
        PartidaId id = PartidaId.nuevo();
        String codigo = nuevoCodigo();
        Sala sala = new Sala(codigo, anfitrion);
        sala.estado = new EstadoPartida(id, null, EstadoSesion.EN_ESPERA,
                List.of(new Participante(anfitrion, 1, EstadoJugador.ACTIVO)), 0);
        salas.put(id, sala);
        porCodigo.put(codigo, id);
        return sala.estado;
    }

    @Override
    public synchronized EstadoPartida unirse(String codigoInvitacion, JugadorId jugador) {
        PartidaId id = porCodigo.get(codigoInvitacion);
        Sala sala = id == null ? null : salas.get(id);
        if (sala == null || sala.estado.fase() != EstadoSesion.EN_ESPERA) {
            throw new IllegalArgumentException("No hay una sala abierta con ese código");
        }
        List<Participante> participantes = new ArrayList<>(sala.estado.participantes());
        if (participantes.size() >= MAXIMO_JUGADORES) {
            throw new IllegalStateException("La sala ya tiene 6 jugadores");
        }
        participantes.add(new Participante(jugador, participantes.size() + 1, EstadoJugador.ACTIVO));
        sala.estado = sala.estado.conParticipantes(participantes);
        return sala.estado;
    }

    @Override
    public synchronized EstadoPartida fijarModalidad(PartidaId partida, CodigoModalidad modalidad) {
        Sala sala = sala(partida);
        if (sala.estado.fase() != EstadoSesion.EN_ESPERA) {
            throw new IllegalStateException("La modalidad es inmutable una vez iniciada la partida");
        }
        EstadoPartida e = sala.estado;
        sala.estado = new EstadoPartida(e.id(), modalidad, e.fase(), e.participantes(), e.version() + 1);
        return sala.estado;
    }

    @Override
    public synchronized EstadoPartida iniciar(PartidaId partida, JugadorId solicitante) {
        Sala sala = sala(partida);
        if (!sala.anfitrion.equals(solicitante)) {
            throw new IllegalStateException("Solo el anfitrión puede iniciar la partida");
        }
        if (sala.estado.modalidad() == null || sala.estado.participantes().size() < MINIMO_JUGADORES) {
            throw new IllegalStateException("Se requieren modalidad y al menos 2 jugadores");
        }
        sala.estado = sala.estado.conFase(EstadoSesion.EN_CURSO);
        return sala.estado;
    }

    @Override
    public String codigoInvitacion(PartidaId partida) {
        return sala(partida).codigo;
    }

    private Sala sala(PartidaId partida) {
        Sala sala = salas.get(partida);
        if (sala == null) {
            throw new IllegalArgumentException("Sala inexistente: " + partida);
        }
        return sala;
    }

    private String nuevoCodigo() {
        StringBuilder codigo = new StringBuilder();
        for (int i = 0; i < 6; i++) {
            codigo.append(ALFABETO.charAt(azar.nextInt(ALFABETO.length())));
        }
        String valor = codigo.toString();
        return porCodigo.containsKey(valor) ? nuevoCodigo() : valor;
    }

    private static final class Sala {
        private final String codigo;
        private final JugadorId anfitrion;
        private EstadoPartida estado;

        private Sala(String codigo, JugadorId anfitrion) {
            this.codigo = codigo;
            this.anfitrion = anfitrion;
        }
    }
}
