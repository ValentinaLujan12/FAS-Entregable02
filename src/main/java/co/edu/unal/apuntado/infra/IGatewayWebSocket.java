package co.edu.unal.apuntado.infra;

import co.edu.unal.apuntado.kernel.EventoJuego;
import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.PartidaId;
import java.util.List;

/**
 * Puerto pCliente (Tabla 1.3.1): conexión de los clientes Web/Móvil. El protocolo JSON (AsyncAPI) se
 * implementa en el Entregable 3; aquí se modelan la conexión y la entrega de eventos por conexión.
 */
public interface IGatewayWebSocket {

    void conectar(PartidaId partida, JugadorId jugador);

    void desconectar(PartidaId partida, JugadorId jugador);

    /** Extrae los eventos pendientes del búfer de la conexión del jugador. */
    List<EventoJuego> pendientes(PartidaId partida, JugadorId jugador);
}
