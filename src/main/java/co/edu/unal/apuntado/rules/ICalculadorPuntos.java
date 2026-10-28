package co.edu.unal.apuntado.rules;

import co.edu.unal.apuntado.kernel.Carta;
import co.edu.unal.apuntado.kernel.CodigoModalidad;
import co.edu.unal.apuntado.kernel.ParametrosModalidad;
import java.util.List;

/** Puerto pPuntos (Tabla 1.3.1): lo requiere scoring (segregación de interfaces). */
public interface ICalculadorPuntos {

    int puntosResiduales(List<Carta> cartas, CodigoModalidad modalidad);

    ParametrosModalidad parametrosModalidad(CodigoModalidad modalidad);
}
