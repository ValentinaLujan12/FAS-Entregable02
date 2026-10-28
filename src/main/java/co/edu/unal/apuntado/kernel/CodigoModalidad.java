package co.edu.unal.apuntado.kernel;

/**
 * Código abierto de modalidad (no es un enum, ADR-03): corresponde a modalidad.codigo_modalidad.
 * Una modalidad nueva no exige modificar esta clase.
 */
public record CodigoModalidad(String valor) {

    public CodigoModalidad {
        if (valor == null || valor.isBlank() || valor.length() > 20) {
            throw new IllegalArgumentException("Código de modalidad inválido: " + valor);
        }
    }

    public static CodigoModalidad de(String valor) {
        return new CodigoModalidad(valor);
    }
}
