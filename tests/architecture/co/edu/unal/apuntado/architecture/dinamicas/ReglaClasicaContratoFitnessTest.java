package co.edu.unal.apuntado.architecture.dinamicas;

import static co.edu.unal.apuntado.architecture.dinamicas.Cartas.lista;
import static co.edu.unal.apuntado.architecture.dinamicas.Cartas.mano;
import static org.junit.jupiter.api.Assertions.assertEquals;

import co.edu.unal.apuntado.kernel.Mano;
import co.edu.unal.apuntado.kernel.ResultadoValidacion;
import co.edu.unal.apuntado.rules.strategy.IReglaJuego;
import co.edu.unal.apuntado.rules.strategy.clasica.ReglaClasicaCuartaTerna;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.api.Test;

/** FF-12 - Contrato + casos propios de la modalidad Clásica (1 cuarta + 2 ternas + 1 descarte). */
class ReglaClasicaContratoFitnessTest extends ContratoReglaJuego {

    private final ReglaClasicaCuartaTerna regla = new ReglaClasicaCuartaTerna();

    @Override
    protected IReglaJuego regla() {
        return regla;
    }

    @Override
    protected Mano manoGanadora() {
        // cuarta en escalera 4-7 de picas, terna de nueves, terna 2-3-4 de corazones y descarte K de tréboles
        return mano("4P", "5P", "6P", "7P", "9C", "9D", "9T", "2C", "3C", "4C", "KT");
    }

    @Override
    protected Mano manoQueNoCierra() {
        return mano("4P", "5P", "6P", "9C", "9D", "9T", "2C", "3C", "4C", "KT", "QD");
    }

    @ParameterizedTest(name = "[{index}] {0} -> {1}")
    @CsvSource({
        // cuarta por grupo (cuatro reyes)
        "'KP KC KD KT 2P 3P 4P 7D 7C 7T JC', VALIDO",
        // la cuarta puede ser parte de una escalera más larga mezclada
        "'AP 2P 3P 4P 5D 6D 7D 9T 9C 9P QC', VALIDO",
        // dos cuartas y una carta suelta: no hay 2 ternas disjuntas + 1 descarte
        "'AP 2P 3P 4P 5D 6D 7D 8D 9T JC QC', COMBINACION_INVALIDA",
        // K-A no es consecutivo (el As es carta baja)
        "'QP KP AP 2P 9C 9D 9T 2C 3C 4C KT', COMBINACION_INVALIDA",
        // escalera de distinto palo no vale
        "'4P 5C 6P 7P 9C 9D 9T 2C 3C 4C KT', COMBINACION_INVALIDA",
    })
    void casos_clasica(String codigos, ResultadoValidacion esperado) {
        assertEquals(esperado, regla.validarVictoria(new Mano(lista(codigos.split(" ")))));
    }

    @Test
    void clasica_no_lleva_penalizaciones_historicas() {
        assertEquals(0, regla.calcularPuntos(lista("KP", "QD", "JT")));
        assertEquals(false, regla.parametros().acumulativa());
    }
}
