package co.edu.unal.apuntado.rules;

import co.edu.unal.apuntado.kernel.CodigoModalidad;
import co.edu.unal.apuntado.kernel.Mano;
import co.edu.unal.apuntado.kernel.ResultadoValidacion;

/** Puerto pValida (Tabla 1.3.1): lo requiere game. El orquestador nunca conoce IReglaJuego. */
public interface IValidadorCierre {

    ResultadoValidacion validarCierre(Mano mano, CodigoModalidad modalidad);
}
