package co.edu.unal.apuntado.rules.strategy.prueba;

import co.edu.unal.apuntado.kernel.Carta;
import co.edu.unal.apuntado.kernel.CodigoModalidad;
import co.edu.unal.apuntado.kernel.Mano;
import co.edu.unal.apuntado.kernel.ParametrosModalidad;
import co.edu.unal.apuntado.kernel.ResultadoValidacion;
import co.edu.unal.apuntado.rules.strategy.IReglaJuego;
import java.util.List;

/**
 * Estrategia que existe SOLO en el código de pruebas (FF-11, ADR-03). Representa "una variante nueva":
 * se cierra con cualquier mano de 11 cartas y cada carta suelta penaliza 1 punto; umbral de 50.
 */
public final class ReglaPrueba implements IReglaJuego {

    public static final CodigoModalidad CODIGO = CodigoModalidad.de("PRUEBA");
    private final ParametrosModalidad parametros = ParametrosModalidad.acumulativa(50, 1);

    @Override
    public ResultadoValidacion validarVictoria(Mano mano) {
        return mano.tamano() == 11 ? ResultadoValidacion.VALIDO : ResultadoValidacion.COMBINACION_INVALIDA;
    }

    @Override
    public int calcularPuntos(List<Carta> cartas) {
        return cartas.size();
    }

    @Override
    public ParametrosModalidad parametros() {
        return parametros;
    }

    @Override
    public CodigoModalidad getModalidad() {
        return CODIGO;
    }
}
