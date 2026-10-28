package co.edu.unal.apuntado.persistence.entity;

import co.edu.unal.apuntado.kernel.ParametrosModalidad;
import java.util.Map;

/** Tabla modalidad. */
public class ModalityEntity {

    private String codigoModalidad;
    private String nombre;
    private boolean acumulativa;
    private Integer umbralEliminacion;
    private Map<String, Object> parametros = Map.of();

    public ModalityEntity(String codigoModalidad, String nombre, boolean acumulativa, Integer umbralEliminacion,
                          Map<String, Object> parametros) {
        this.codigoModalidad = codigoModalidad;
        this.nombre = nombre;
        this.acumulativa = acumulativa;
        this.umbralEliminacion = umbralEliminacion;
        this.parametros = Map.copyOf(parametros);
    }

    /** Columnas + JSONB parametros -> ParametrosModalidad (Tabla 2.3.1). */
    public ParametrosModalidad parametros() {
        return new ParametrosModalidad(acumulativa, umbralEliminacion, entero("valorAs", 1),
                entero("cartasPorJugador", 10), Boolean.TRUE.equals(parametros.getOrDefault("cartaExtraInicial", true)),
                entero("numeroBarajas", 1), entero("comodines", 0));
    }

    private int entero(String clave, int porDefecto) {
        Object valor = parametros.get(clave);
        return valor instanceof Number n ? n.intValue() : porDefecto;
    }

    public String codigoModalidad() {
        return codigoModalidad;
    }

    public String nombre() {
        return nombre;
    }
}
