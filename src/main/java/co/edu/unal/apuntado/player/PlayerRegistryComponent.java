package co.edu.unal.apuntado.player;

import co.edu.unal.apuntado.kernel.EstadoJugador;
import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.PartidaId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** PlayerRegistryComponent: componente puro en memoria (sin I/O). Máximo 6 jugadores por partida. */
public final class PlayerRegistryComponent implements IJugadores {

    private static final int MAXIMO_JUGADORES = 6;

    private final Map<PartidaId, Map<JugadorId, EstadoJugador>> porPartida = new ConcurrentHashMap<>();

    @Override
    public void registrar(PartidaId partida, JugadorId jugador) {
        Map<JugadorId, EstadoJugador> jugadores = porPartida.computeIfAbsent(partida, p -> new LinkedHashMap<>());
        synchronized (jugadores) {
            if (jugadores.size() >= MAXIMO_JUGADORES) {
                throw new IllegalStateException("La sala ya tiene 6 jugadores");
            }
            jugadores.putIfAbsent(jugador, EstadoJugador.ACTIVO);
        }
    }

    @Override
    public List<JugadorId> ordenDeTurno(PartidaId partida) {
        Map<JugadorId, EstadoJugador> jugadores = porPartida.getOrDefault(partida, Map.of());
        synchronized (jugadores) {
            return jugadores.entrySet().stream()
                    .filter(e -> e.getValue() != EstadoJugador.ELIMINADO)
                    .map(Map.Entry::getKey)
                    .toList();
        }
    }

    @Override
    public void marcarEliminado(PartidaId partida, JugadorId jugador) {
        cambiar(partida, jugador, EstadoJugador.ELIMINADO);
    }

    @Override
    public void marcarDesconectado(PartidaId partida, JugadorId jugador) {
        cambiar(partida, jugador, EstadoJugador.DESCONECTADO);
    }

    @Override
    public void reconectar(PartidaId partida, JugadorId jugador) {
        cambiar(partida, jugador, EstadoJugador.ACTIVO);
    }

    @Override
    public EstadoJugador estado(PartidaId partida, JugadorId jugador) {
        EstadoJugador estado = porPartida.getOrDefault(partida, Map.of()).get(jugador);
        if (estado == null) {
            throw new IllegalArgumentException("Jugador no registrado en la partida");
        }
        return estado;
    }

    private void cambiar(PartidaId partida, JugadorId jugador, EstadoJugador nuevo) {
        Map<JugadorId, EstadoJugador> jugadores = porPartida.get(partida);
        if (jugadores == null || !jugadores.containsKey(jugador)) {
            throw new IllegalArgumentException("Jugador no registrado en la partida");
        }
        synchronized (jugadores) {
            jugadores.put(jugador, nuevo);
        }
    }
}
