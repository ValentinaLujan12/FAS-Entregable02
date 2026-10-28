package co.edu.unal.apuntado.kernel;

/** Resultado de validar un cierre; mismos valores que turno_jugada.resultado_validacion (CU-02). */
public enum ResultadoValidacion {
    VALIDO, COMBINACION_INVALIDA, SOBRANTE_EXCEDIDO;

    public boolean esValido() {
        return this == VALIDO;
    }
}
