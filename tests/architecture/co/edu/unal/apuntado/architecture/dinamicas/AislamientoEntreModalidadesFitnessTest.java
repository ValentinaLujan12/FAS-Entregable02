package co.edu.unal.apuntado.architecture.dinamicas;

import static co.edu.unal.apuntado.architecture.dinamicas.Cartas.lista;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.edu.unal.apuntado.architecture.dinamicas.dobles.MazoPreparado;
import co.edu.unal.apuntado.architecture.dinamicas.dobles.RepositorioEnMemoria.Liquidacion;
import co.edu.unal.apuntado.kernel.CodigoModalidad;
import co.edu.unal.apuntado.kernel.EstadoSesion;
import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.PartidaId;
import co.edu.unal.apuntado.kernel.ResultadoValidacion;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * ADR-03 - FF-14: una partida Clásica y una Apuntado simultáneas en el mismo proceso no se contaminan en
 * estado, historial ni puntajes (reemplaza el integration test de cambio de modalidad de ADR-02).
 */
class AislamientoEntreModalidadesFitnessTest {

    @Test
    void ff14_clasica_y_apuntado_simultaneas_no_comparten_estado() {
        // La misma mano cierra en ambas modalidades. Clásica: cuarta 4-7P + ternas de 9 y 2-3-4C, descarte KT.
        // Apuntado: ternas 5-6-7P, 9 y 2-3-4C; sobran 4P (4 puntos, < 5) y KT (descarte).
        MazoPreparado mazo = new MazoPreparado(
                lista("4P", "5P", "6P", "7P", "9C", "9D", "9T", "2C", "3C", "4C", "KT"),
                List.of(lista("AP", "2P", "3D", "8T", "JC", "QC", "KD", "5C", "6D", "8D")),
                lista("10P"));
        Mesa mesa = new Mesa(mazo);
        JugadorId ana = JugadorId.nuevo();
        JugadorId beto = JugadorId.nuevo();
        PartidaId clasica = mesa.partida(CodigoModalidad.de("CLASICA"), ana, List.of(beto));
        JugadorId caro = JugadorId.nuevo();
        JugadorId dani = JugadorId.nuevo();
        PartidaId apuntado = mesa.partida(CodigoModalidad.de("APUNTADO"), caro, List.of(dani));

        assertEquals(ResultadoValidacion.VALIDO, mesa.orquestador.cerrarRonda(apuntado, caro));
        assertEquals(ResultadoValidacion.VALIDO, mesa.orquestador.cerrarRonda(clasica, ana));

        Liquidacion deApuntado = mesa.repositorio.liquidaciones(apuntado).get(0);
        Liquidacion deClasica = mesa.repositorio.liquidaciones(clasica).get(0);

        assertEquals(63, deApuntado.acumulados().get(dani), "Apuntado acumula las cartas sueltas del rival: 1+2+3+8+10+10+10+5+6+8");
        assertEquals(0, deApuntado.acumulados().get(caro));
        assertFalse(deApuntado.partidaTerminada(), "Apuntado continúa con otra ronda (nadie llegó a 101)");
        assertTrue(deClasica.acumulados().isEmpty(), "Clásica no registra penalizaciones históricas");
        assertTrue(deClasica.partidaTerminada(), "Clásica es una ronda atómica");
        assertEquals(EstadoSesion.FINALIZADA, mesa.repositorio.estado(clasica).orElseThrow().fase());
        assertEquals(EstadoSesion.EN_CURSO, mesa.repositorio.estado(apuntado).orElseThrow().fase());
        assertTrue(mesa.repositorio.historial(clasica).stream().allMatch(e -> e.partida().equals(clasica)),
                "el historial de una partida no contiene eventos de la otra");
    }
}
