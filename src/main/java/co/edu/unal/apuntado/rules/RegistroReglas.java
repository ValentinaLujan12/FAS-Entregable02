package co.edu.unal.apuntado.rules;

import co.edu.unal.apuntado.kernel.CodigoModalidad;
import co.edu.unal.apuntado.rules.strategy.CatalogoEstrategias;
import co.edu.unal.apuntado.rules.strategy.IReglaJuego;
import java.util.Collection;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Registro de estrategias indexado por CodigoModalidad (ADR-03, mecanismo 2). Recibe las estrategias por
 * inyección (constructor); no conoce ninguna clase concreta, por lo que agregar una modalidad no lo modifica.
 */
public final class RegistroReglas implements IRegistroReglas {

    private final Map<CodigoModalidad, IReglaJuego> porModalidad;

    public RegistroReglas(Collection<? extends IReglaJuego> estrategias) {
        this.porModalidad = estrategias.stream()
                .collect(Collectors.toUnmodifiableMap(IReglaJuego::getModalidad, Function.identity()));
    }

    /** Registro con todas las estrategias descubiertas automáticamente en rules.strategy. */
    public static RegistroReglas descubrir() {
        return new RegistroReglas(CatalogoEstrategias.descubrir());
    }

    @Override
    public IReglaJuego obtener(CodigoModalidad codigoModalidad) {
        IReglaJuego regla = porModalidad.get(codigoModalidad);
        if (regla == null) {
            throw new IllegalArgumentException("Modalidad sin estrategia registrada: " + codigoModalidad.valor());
        }
        return regla;
    }

    @Override
    public Set<CodigoModalidad> modalidades() {
        return porModalidad.keySet();
    }
}
