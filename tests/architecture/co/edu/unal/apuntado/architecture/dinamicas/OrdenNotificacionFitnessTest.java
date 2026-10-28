package co.edu.unal.apuntado.architecture.dinamicas;

import static co.edu.unal.apuntado.architecture.dinamicas.Cartas.lista;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.edu.unal.apuntado.architecture.dinamicas.dobles.MazoPreparado;
import co.edu.unal.apuntado.kernel.CodigoModalidad;
import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.PartidaId;
import co.edu.unal.apuntado.kernel.ResultadoValidacion;
import co.edu.unal.apuntado.kernel.ZonaCarta;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Regla G5 (ADR-05) - FF-23 y FF-24: persistir y luego notificar; una notificación fallida no revierte. */
class OrdenNotificacionFitnessTest {

    private static final CodigoModalidad CLASICA = CodigoModalidad.de("CLASICA");
    private final JugadorId ana = JugadorId.nuevo();
    private final JugadorId beto = JugadorId.nuevo();

    private MazoPreparado mazoConCierreDeAna() {
        return new MazoPreparado(
                lista("4P", "5P", "6P", "7P", "9C", "9D", "9T", "2C", "3C", "4C", "KT"),
                List.of(lista("AP", "2P", "3D", "8T", "JC", "QC", "KD", "5C", "6D", "8D")),
                lista("10P", "10C", "10D"));
    }

    @Test
    void ff23_difundir_solo_despues_del_commit_y_en_orden() {
        Mesa mesa = new Mesa(mazoConCierreDeAna());
        PartidaId partida = mesa.partida(CLASICA, ana, List.of(beto));

        mesa.orquestador.descartar(partida, ana, lista("KT").get(0));
        mesa.orquestador.robar(partida, beto, ZonaCarta.MAZO);

        List<String> b = mesa.bitacora.entradas();
        assertEquals(List.of("commit:DESCARTE", "difundir:DESCARTE", "commit:ROBO_MAZO", "difundir:ROBO_MAZO"), b,
                "FF-23: cada evento se confirma antes de difundirse y los eventos salen en el orden de los comandos");
    }

    @Test
    void ff23_el_cierre_se_notifica_despues_de_confirmar_la_liquidacion() {
        Mesa mesa = new Mesa(mazoConCierreDeAna());
        PartidaId partida = mesa.partida(CLASICA, ana, List.of(beto));

        assertEquals(ResultadoValidacion.VALIDO, mesa.orquestador.cerrarRonda(partida, ana));
        assertTrue(mesa.bitacora.indice("commit:CIERRE") >= 0);
        assertTrue(mesa.bitacora.indice("commit:CIERRE") < mesa.bitacora.indice("difundir:CIERRE"),
                "FF-23: el cierre se difunde solo después del COMMIT de la liquidación");
    }

    @Test
    void ff24_si_difundir_falla_el_comando_termina_y_el_estado_queda_confirmado() {
        Mesa mesa = new Mesa(mazoConCierreDeAna());
        PartidaId partida = mesa.partida(CLASICA, ana, List.of(beto));
        mesa.canal.fallarDesdeAhora();

        ResultadoValidacion resultado = mesa.orquestador.cerrarRonda(partida, ana);

        assertEquals(ResultadoValidacion.VALIDO, resultado, "FF-24: el comando no falla por la notificación");
        assertEquals(1, mesa.repositorio.liquidaciones(partida).size(), "FF-24: la liquidación quedó confirmada");
    }
}
