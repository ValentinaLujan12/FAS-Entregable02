package co.edu.unal.apuntado.rules.strategy.apuntado;

import co.edu.unal.apuntado.kernel.Carta;
import co.edu.unal.apuntado.kernel.CodigoModalidad;
import co.edu.unal.apuntado.kernel.Combinacion;
import co.edu.unal.apuntado.kernel.Mano;
import co.edu.unal.apuntado.kernel.ParametrosModalidad;
import co.edu.unal.apuntado.kernel.ResultadoValidacion;
import co.edu.unal.apuntado.rules.strategy.BuscadorCombinaciones;
import co.edu.unal.apuntado.rules.strategy.IReglaJuego;
import java.util.List;

/**
 * Modalidad Apuntado: se cierra con 3 ternas, 1 descarte y un sobrante de menos de 5 puntos.
 * Los demás jugadores suman sus cartas sueltas; al llegar a 101 quedan eliminados (umbral en ParametrosModalidad).
 */
public final class ReglaApuntado101Puntos implements IReglaJuego {

    public static final CodigoModalidad CODIGO = CodigoModalidad.de("APUNTADO");
    private static final int CARTAS_AL_CERRAR = 11;
    private static final int LIMITE_SOBRANTE = 5;

    private final BuscadorCombinaciones buscador = new BuscadorCombinaciones();
    private final ParametrosModalidad parametros = ParametrosModalidad.acumulativa(101, 1);

    @Override
    public ResultadoValidacion validarVictoria(Mano mano) {
        if (mano.tamano() != CARTAS_AL_CERRAR) {
            return ResultadoValidacion.COMBINACION_INVALIDA;
        }
        List<List<Combinacion>> tresTernas = buscador.particiones(mano.cartas(), 3, 3, 3);
        if (tresTernas.isEmpty()) {
            return ResultadoValidacion.COMBINACION_INVALIDA;
        }
        boolean algunaConSobranteBajo = tresTernas.stream().anyMatch(t -> sobranteMenorAlLimite(mano, t));
        return algunaConSobranteBajo ? ResultadoValidacion.VALIDO : ResultadoValidacion.SOBRANTE_EXCEDIDO;
    }

    /** Quedan 2 cartas: una es el descarte y la otra el sobrante; basta que la menor valga menos de 5. */
    private boolean sobranteMenorAlLimite(Mano mano, List<Combinacion> ternas) {
        return BuscadorCombinaciones.restantes(mano.cartas(), ternas).stream()
                .mapToInt(this::puntos)
                .min()
                .orElse(0) < LIMITE_SOBRANTE;
    }

    @Override
    public int calcularPuntos(List<Carta> cartas) {
        return buscador.menorSobrante(cartas, this::puntos);
    }

    private int puntos(Carta carta) {
        return carta.valor().puntos(parametros.valorAs());
    }

    @Override
    public ParametrosModalidad parametros() {
        return parametros;
    }

    @Override
    public CodigoModalidad getModalidad() {
        return CODIGO;
    }
}
