package co.edu.unal.apuntado.rules;

import co.edu.unal.apuntado.kernel.Carta;
import co.edu.unal.apuntado.kernel.CodigoModalidad;
import co.edu.unal.apuntado.kernel.Mano;
import co.edu.unal.apuntado.kernel.ParametrosModalidad;
import co.edu.unal.apuntado.kernel.ResultadoValidacion;
import java.util.List;
import java.util.Objects;

/**
 * HandEvaluatorComponent (MotorReglas). Provee IValidadorCierre (a game) e ICalculadorPuntos (a scoring)
 * y delega en la estrategia que entrega el registro. Es puro: sin estado mutable ni I/O.
 */
public final class MotorReglas implements IValidadorCierre, ICalculadorPuntos {

    private final IRegistroReglas registro;

    public MotorReglas(IRegistroReglas registro) {
        this.registro = Objects.requireNonNull(registro, "registro");
    }

    @Override
    public ResultadoValidacion validarCierre(Mano mano, CodigoModalidad modalidad) {
        return registro.obtener(modalidad).validarVictoria(mano);
    }

    @Override
    public int puntosResiduales(List<Carta> cartas, CodigoModalidad modalidad) {
        return registro.obtener(modalidad).calcularPuntos(cartas);
    }

    @Override
    public ParametrosModalidad parametrosModalidad(CodigoModalidad modalidad) {
        return registro.obtener(modalidad).parametros();
    }
}
