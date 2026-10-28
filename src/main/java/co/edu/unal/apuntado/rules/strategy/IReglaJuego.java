package co.edu.unal.apuntado.rules.strategy;

import co.edu.unal.apuntado.kernel.Carta;
import co.edu.unal.apuntado.kernel.CodigoModalidad;
import co.edu.unal.apuntado.kernel.Mano;
import co.edu.unal.apuntado.kernel.ParametrosModalidad;
import co.edu.unal.apuntado.kernel.ResultadoValidacion;
import java.util.List;

/**
 * Contrato Strategy de las modalidades (ADR-02, refinado por ADR-03). Toda implementación debe ser
 * concreta, pública, sin estado mutable y con constructor público sin argumentos (descubrimiento automático).
 */
public interface IReglaJuego {

    /** Valida si la mano (11 cartas, incluida la de descarte) permite cerrar la ronda. */
    ResultadoValidacion validarVictoria(Mano mano);

    /** Puntos de penalización de las cartas sueltas de un jugador que no cerró. */
    int calcularPuntos(List<Carta> cartas);

    ParametrosModalidad parametros();

    CodigoModalidad getModalidad();
}
