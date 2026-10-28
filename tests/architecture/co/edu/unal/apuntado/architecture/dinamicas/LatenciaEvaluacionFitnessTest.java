package co.edu.unal.apuntado.architecture.dinamicas;

import static org.junit.jupiter.api.Assertions.assertTrue;

import co.edu.unal.apuntado.kernel.Carta;
import co.edu.unal.apuntado.kernel.CodigoModalidad;
import co.edu.unal.apuntado.kernel.Mano;
import co.edu.unal.apuntado.kernel.Palo;
import co.edu.unal.apuntado.kernel.Valor;
import co.edu.unal.apuntado.rules.MotorReglas;
import co.edu.unal.apuntado.rules.RegistroReglas;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Random;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

/**
 * Driver Responsiveness (E1, ADR-02, ADR-03) - FF-16 (parte en memoria): validación + cálculo de puntos de una
 * mano de 11 cartas en menos de 100 ms, tanto en el percentil 99 como en el peor caso medido (Cap. 6: el promedio
 * oculta los valores atípicos), para cada modalidad.
 */
class LatenciaEvaluacionFitnessTest {

    private static final long PRESUPUESTO_MS = 100;
    private static final int MUESTRAS = 1000;
    private final MotorReglas motor = new MotorReglas(RegistroReglas.descubrir());

    @Test
    void ff16_validacion_y_calculo_en_menos_de_100_ms() {
        Random azar = new Random(7);
        for (String modalidad : List.of("CLASICA", "APUNTADO")) {
            CodigoModalidad codigo = CodigoModalidad.de(modalidad);
            for (int i = 0; i < 100; i++) {
                medir(codigo, manoAleatoria(azar)); // calentamiento del JIT
            }
            long[] tiempos = new long[MUESTRAS];
            for (int i = 0; i < MUESTRAS; i++) {
                tiempos[i] = medir(codigo, manoAleatoria(azar));
            }
            Arrays.sort(tiempos);
            long p99 = TimeUnit.NANOSECONDS.toMillis(tiempos[(int) (MUESTRAS * 0.99)]);
            long maximo = TimeUnit.NANOSECONDS.toMillis(tiempos[MUESTRAS - 1]);
            assertTrue(p99 < PRESUPUESTO_MS, "FF-16: p99 de " + modalidad + " = " + p99 + " ms (máx. 100 ms)");
            assertTrue(maximo < PRESUPUESTO_MS, "FF-16: peor caso de " + modalidad + " = " + maximo + " ms (máx. 100 ms)");
        }
    }

    private long medir(CodigoModalidad codigo, Mano mano) {
        long inicio = System.nanoTime();
        motor.validarCierre(mano, codigo);
        motor.puntosResiduales(mano.cartas(), codigo);
        return System.nanoTime() - inicio;
    }

    private static Mano manoAleatoria(Random azar) {
        List<Carta> mazo = new ArrayList<>();
        for (Palo p : Palo.values()) {
            for (Valor v : Valor.values()) {
                mazo.add(Carta.de(v, p));
            }
        }
        Collections.shuffle(mazo, azar);
        return new Mano(mazo.subList(0, 11));
    }
}
