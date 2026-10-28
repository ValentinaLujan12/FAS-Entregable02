package co.edu.unal.apuntado.rules;

import co.edu.unal.apuntado.kernel.CodigoModalidad;
import co.edu.unal.apuntado.rules.strategy.IReglaJuego;
import java.util.Set;

/** Interfaz interna de rules (Tabla 1.3.1): la usa MotorReglas. */
public interface IRegistroReglas {

    IReglaJuego obtener(CodigoModalidad codigoModalidad);

    Set<CodigoModalidad> modalidades();
}
