package co.edu.unal.apuntado.architecture.dinamicas;

import static co.edu.unal.apuntado.architecture.dinamicas.Cartas.lista;
import static co.edu.unal.apuntado.architecture.dinamicas.Cartas.mano;
import static org.junit.jupiter.api.Assertions.assertEquals;

import co.edu.unal.apuntado.kernel.Mano;
import co.edu.unal.apuntado.kernel.ResultadoValidacion;
import co.edu.unal.apuntado.rules.strategy.IReglaJuego;
import co.edu.unal.apuntado.rules.strategy.apuntado.ReglaApuntado101Puntos;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** FF-12 - Contrato + casos propios de la modalidad Apuntado (3 ternas + sobrante < 5; umbral 101). */
class ReglaApuntadoContratoFitnessTest extends ContratoReglaJuego {

    private final ReglaApuntado101Puntos regla = new ReglaApuntado101Puntos();

    @Override
    protected IReglaJuego regla() {
        return regla;
    }

    @Override
    protected Mano manoGanadora() {
        // 3 ternas + sobrante As (1 punto) + descarte K
        return mano("5P", "6P", "7P", "9C", "9D", "9T", "2C", "3C", "4C", "AD", "KT");
    }

    @Override
    protected Mano manoQueNoCierra() {
        return mano("5P", "6P", "8P", "9C", "9D", "JT", "2C", "3C", "4C", "AD", "KT");
    }

    @ParameterizedTest(name = "[{index}] {0} -> {1}")
    @CsvSource({
        // tres ternas, pero las dos cartas restantes valen 7 y 10: sobrante excedido (CU-02)
        "'5P 6P 7P 9C 9D 9T 2C 3C 4C 7D KT', SOBRANTE_EXCEDIDO",
        // sobrante de 4 puntos todavía cierra (estrictamente menor que 5)
        "'5P 6P 7P 9C 9D 9T 2C 3C 4C 4D KT', VALIDO",
        // sobrante de exactamente 5 no cierra
        "'5P 6P 7P 9C 9D 9T 2C 3C 4C 5D KT', SOBRANTE_EXCEDIDO",
        // el evaluador prueba todas las ternas: con 2-3-4 sobran 5 y Q (no cierra), con 3-4-5 sobra el 2 (cierra)
        "'2T 3T 4T 5T 9C 9D 9P KC KD KP QD', VALIDO",
        // ninguna combinación de ternas deja un sobrante menor que 5
        "'6T 7T 8T 9T 9C 9D 9P KC KD KP QD', SOBRANTE_EXCEDIDO",
        // solo dos ternas
        "'5P 6P 7P 9C 9D 9T 2C 3C 8C 4D KT', COMBINACION_INVALIDA",
    })
    void casos_apuntado(String codigos, ResultadoValidacion esperado) {
        assertEquals(esperado, regla.validarVictoria(new Mano(lista(codigos.split(" ")))));
    }

    @Test
    void penalizacion_suma_solo_las_cartas_sueltas() {
        // escalera 5-6-7-8 de picas (0) + sueltas: K (10) + 2 (2) + As (1)
        assertEquals(13, regla.calcularPuntos(lista("5P", "6P", "7P", "8P", "KC", "2D", "AT")));
    }

    @Test
    void penalizacion_elige_la_mejor_agrupacion() {
        // con cuatro sietes, tomar el grupo de 4 deja 5P 6P 8P sueltos (21); lo óptimo es la escalera 5-8 de
        // picas + el grupo 7C 7D 7T, que deja suelto solo el 2
        assertEquals(2, regla.calcularPuntos(lista("5P", "6P", "7P", "7C", "7D", "7T", "8P", "2T")));
        assertEquals(30, regla.calcularPuntos(lista("KP", "QC", "JD")));
        assertEquals(0, regla.calcularPuntos(lista("KP", "KC", "KD", "KT")));
    }

    @Test
    void parametros_de_apuntado() {
        assertEquals(true, regla.parametros().acumulativa());
        assertEquals(101, regla.parametros().umbralEliminacion());
    }
}
