package co.edu.unal.apuntado.persistence;

import co.edu.unal.apuntado.kernel.EstadoPartida;
import co.edu.unal.apuntado.kernel.EventoJuego;
import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.PartidaId;
import co.edu.unal.apuntado.kernel.RegistroRonda;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Puerto pDatos (Tabla 1.3.1; tablas que toca cada operación: Tabla 2.3.2). Solo usa tipos del kernel. */
public interface IRepositorioPartida {

    void guardarEstado(EstadoPartida estado);

    /** Robos, descartes y cierres inválidos (auditoría) en turno_jugada. */
    void registrarEvento(EventoJuego evento);

    /**
     * Liquidación de un cierre válido en UNA transacción (Sección 2.4): registra el CIERRE, cierra la ronda,
     * inserta puntaje_acumulado, marca eliminados y, si corresponde, finaliza la partida. Todo o nada.
     *
     * @throws IllegalStateException si la ronda ya no está EN_CURSO ("ronda ya cerrada")
     */
    void registrarPenalizacion(EventoJuego cierre, RegistroRonda registro, Map<JugadorId, Integer> acumulados,
                               List<JugadorId> eliminados, boolean partidaTerminada);

    Optional<EstadoPartida> recuperar(PartidaId partida);

    List<EventoJuego> historial(PartidaId partida);

    Map<JugadorId, Integer> marcador(PartidaId partida);
}
