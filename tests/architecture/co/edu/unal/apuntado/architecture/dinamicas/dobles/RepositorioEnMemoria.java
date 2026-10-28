package co.edu.unal.apuntado.architecture.dinamicas.dobles;

import co.edu.unal.apuntado.kernel.EstadoPartida;
import co.edu.unal.apuntado.kernel.EventoJuego;
import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.PartidaId;
import co.edu.unal.apuntado.kernel.RegistroRonda;
import co.edu.unal.apuntado.persistence.IRepositorioPartida;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/** Doble de IRepositorioPartida en memoria; anota en la bitácora cada confirmación ("commit"). */
public final class RepositorioEnMemoria implements IRepositorioPartida {

    private final Bitacora bitacora;
    private final long demoraCierreMs;
    private final Map<PartidaId, EstadoPartida> estados = new ConcurrentHashMap<>();
    private final List<EventoJuego> eventos = new CopyOnWriteArrayList<>();
    private final List<Liquidacion> liquidaciones = new CopyOnWriteArrayList<>();

    public RepositorioEnMemoria(Bitacora bitacora) {
        this(bitacora, 0);
    }

    public RepositorioEnMemoria(Bitacora bitacora, long demoraCierreMs) {
        this.bitacora = bitacora;
        this.demoraCierreMs = demoraCierreMs;
    }

    @Override
    public void guardarEstado(EstadoPartida estado) {
        estados.put(estado.id(), estado);
    }

    @Override
    public void registrarEvento(EventoJuego evento) {
        eventos.add(evento);
        bitacora.anotar("commit:" + evento.accion());
    }

    @Override
    public void registrarPenalizacion(EventoJuego cierre, RegistroRonda registro, Map<JugadorId, Integer> acumulados,
                                      List<JugadorId> eliminados, boolean partidaTerminada) {
        dormir();
        eventos.add(cierre);
        liquidaciones.add(new Liquidacion(cierre, registro, Map.copyOf(acumulados), List.copyOf(eliminados),
                partidaTerminada));
        bitacora.anotar("commit:CIERRE");
    }

    @Override
    public Optional<EstadoPartida> recuperar(PartidaId partida) {
        return Optional.ofNullable(estados.get(partida));
    }

    @Override
    public List<EventoJuego> historial(PartidaId partida) {
        return eventos.stream().filter(e -> e.partida().equals(partida)).toList();
    }

    @Override
    public Map<JugadorId, Integer> marcador(PartidaId partida) {
        return liquidaciones.stream().filter(l -> l.cierre().partida().equals(partida))
                .reduce((a, b) -> b).map(Liquidacion::acumulados).orElse(Map.of());
    }

    public List<Liquidacion> liquidaciones(PartidaId partida) {
        return new ArrayList<>(liquidaciones.stream().filter(l -> l.cierre().partida().equals(partida)).toList());
    }

    public Optional<EstadoPartida> estado(PartidaId partida) {
        return Optional.ofNullable(estados.get(partida));
    }

    private void dormir() {
        if (demoraCierreMs > 0) {
            try {
                Thread.sleep(demoraCierreMs);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    /** Lo que se confirmó en una transacción de cierre. */
    public record Liquidacion(EventoJuego cierre, RegistroRonda registro, Map<JugadorId, Integer> acumulados,
                              List<JugadorId> eliminados, boolean partidaTerminada) {
    }
}
