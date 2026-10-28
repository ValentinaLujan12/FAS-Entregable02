package co.edu.unal.apuntado.infra;

import co.edu.unal.apuntado.kernel.EventoJuego;
import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.PartidaId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * GatewayTiempoReal: provee IGatewayWebSocket a los clientes e ICanalTiempoReal a game.
 * difundir no bloquea la cola de la partida: encola en el búfer de cada conexión (ADR-05) después de
 * proyectar el evento para cada destinatario (R7).
 */
public final class GatewayTiempoReal implements IGatewayWebSocket, ICanalTiempoReal {

    private final Map<PartidaId, Map<JugadorId, Queue<EventoJuego>>> conexiones = new ConcurrentHashMap<>();
    private final ProyectorVistaJugador proyector = new ProyectorVistaJugador();

    @Override
    public void conectar(PartidaId partida, JugadorId jugador) {
        conexiones.computeIfAbsent(partida, p -> new ConcurrentHashMap<>())
                .putIfAbsent(jugador, new ConcurrentLinkedQueue<>());
    }

    @Override
    public void desconectar(PartidaId partida, JugadorId jugador) {
        conexiones.getOrDefault(partida, Map.of()).remove(jugador);
    }

    @Override
    public List<EventoJuego> pendientes(PartidaId partida, JugadorId jugador) {
        Queue<EventoJuego> bufer = conexiones.getOrDefault(partida, Map.of()).get(jugador);
        List<EventoJuego> eventos = new ArrayList<>();
        EventoJuego e;
        while (bufer != null && (e = bufer.poll()) != null) {
            eventos.add(e);
        }
        return eventos;
    }

    @Override
    public void difundir(EventoJuego evento) {
        conexiones.getOrDefault(evento.partida(), Map.of())
                .forEach((jugador, bufer) -> bufer.add(proyector.proyectar(evento, jugador)));
    }
}
