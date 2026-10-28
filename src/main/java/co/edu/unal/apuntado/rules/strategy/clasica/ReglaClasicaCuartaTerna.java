package co.edu.unal.apuntado.rules.strategy.clasica;

import co.edu.unal.apuntado.kernel.Carta;
import co.edu.unal.apuntado.kernel.CodigoModalidad;
import co.edu.unal.apuntado.kernel.Mano;
import co.edu.unal.apuntado.kernel.ParametrosModalidad;
import co.edu.unal.apuntado.kernel.ResultadoValidacion;
import co.edu.unal.apuntado.rules.strategy.BuscadorCombinaciones;
import co.edu.unal.apuntado.rules.strategy.IReglaJuego;
import java.util.List;

/**
 * Modalidad Clásica, baraja cerrada (4-3-3): 1 cuarta + 2 ternas + 1 descarte, en una sola ronda.
 * No lleva tracking de penalizaciones entre rondas (calcularPuntos = 0).
 */
public final class ReglaClasicaCuartaTerna implements IReglaJuego {

    public static final CodigoModalidad CODIGO = CodigoModalidad.de("CLASICA");
    private static final int CARTAS_AL_CERRAR = 11;

    private final BuscadorCombinaciones buscador = new BuscadorCombinaciones();
    private final ParametrosModalidad parametros = ParametrosModalidad.rondaUnica(1);

    @Override
    public ResultadoValidacion validarVictoria(Mano mano) {
        if (mano.tamano() != CARTAS_AL_CERRAR) {
            return ResultadoValidacion.COMBINACION_INVALIDA;
        }
        boolean hayCuartaYDosTernas = !buscador.particiones(mano.cartas(), 4, 3, 3).isEmpty();
        return hayCuartaYDosTernas ? ResultadoValidacion.VALIDO : ResultadoValidacion.COMBINACION_INVALIDA;
    }

    @Override
    public int calcularPuntos(List<Carta> cartas) {
        return 0;
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
