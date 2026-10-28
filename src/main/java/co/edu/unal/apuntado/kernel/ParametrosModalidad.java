package co.edu.unal.apuntado.kernel;

/**
 * Parámetros de una modalidad (ADR-03, mecanismo 3). acumulativa y umbralEliminacion se persisten
 * como columnas de la tabla modalidad; el resto viaja en modalidad.parametros (JSONB).
 */
public record ParametrosModalidad(
        boolean acumulativa,
        Integer umbralEliminacion,
        int valorAs,
        int cartasPorJugador,
        boolean cartaExtraInicial,
        int numeroBarajas,
        int comodines) {

    public ParametrosModalidad {
        if (umbralEliminacion != null && (!acumulativa || umbralEliminacion <= 0)) {
            // Coherente con el CHECK ck_modalidad_umbral del esquema.
            throw new IllegalArgumentException("El umbral solo aplica a modalidades acumulativas y debe ser > 0");
        }
        if (cartasPorJugador <= 0 || numeroBarajas <= 0 || comodines < 0) {
            throw new IllegalArgumentException("Parámetros de reparto inválidos");
        }
    }

    /** Modalidad de ronda atómica, sin acumulado ni umbral. */
    public static ParametrosModalidad rondaUnica(int valorAs) {
        return new ParametrosModalidad(false, null, valorAs, 10, true, 1, 0);
    }

    /** Modalidad acumulativa con umbral de eliminación. */
    public static ParametrosModalidad acumulativa(int umbral, int valorAs) {
        return new ParametrosModalidad(true, umbral, valorAs, 10, true, 1, 0);
    }
}
