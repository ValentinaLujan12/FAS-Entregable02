package co.edu.unal.apuntado.architecture.dinamicas;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import co.edu.unal.apuntado.infra.GatewayTiempoReal;
import co.edu.unal.apuntado.kernel.Carta;
import co.edu.unal.apuntado.kernel.EventoJuego;
import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.PartidaId;
import co.edu.unal.apuntado.kernel.TipoAccion;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Riesgo R7 (Sección 4.3) - FF-28: el gateway proyecta cada evento por destinatario. La carta robada del mazo
 * solo la ve quien roba; los descartes son públicos.
 */
class PrivacidadVistaJugadorFitnessTest {

    @Test
    void ff28_la_carta_robada_del_mazo_solo_la_ve_quien_roba() {
        GatewayTiempoReal gateway = new GatewayTiempoReal();
        PartidaId partida = PartidaId.nuevo();
        JugadorId ana = JugadorId.nuevo();
        JugadorId beto = JugadorId.nuevo();
        gateway.conectar(partida, ana);
        gateway.conectar(partida, beto);
        Carta carta = Carta.deCodigo("QD");

        gateway.difundir(new EventoJuego(partida, 1, 3, ana, TipoAccion.ROBO_MAZO, carta, null));
        gateway.difundir(new EventoJuego(partida, 1, 3, ana, TipoAccion.DESCARTE, carta, null));

        List<EventoJuego> vistaAna = gateway.pendientes(partida, ana);
        List<EventoJuego> vistaBeto = gateway.pendientes(partida, beto);
        assertEquals(carta, vistaAna.get(0).carta(), "quien roba ve su carta");
        assertNull(vistaBeto.get(0).carta(), "FF-28: los demás no ven la carta robada del mazo");
        assertEquals(carta, vistaBeto.get(1).carta(), "el descarte es público");
        assertEquals(List.of(), gateway.pendientes(partida, beto), "el búfer se vacía al leerlo");
    }

    @Test
    void ff28_eventos_de_otra_partida_no_llegan() {
        GatewayTiempoReal gateway = new GatewayTiempoReal();
        PartidaId una = PartidaId.nuevo();
        JugadorId ana = JugadorId.nuevo();
        gateway.conectar(una, ana);
        gateway.difundir(new EventoJuego(PartidaId.nuevo(), 1, 1, JugadorId.nuevo(), TipoAccion.DESCARTE,
                Carta.deCodigo("2C"), null));
        assertEquals(List.of(), gateway.pendientes(una, ana));
    }
}
