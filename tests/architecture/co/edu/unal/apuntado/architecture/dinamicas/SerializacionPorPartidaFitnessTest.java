package co.edu.unal.apuntado.architecture.dinamicas;

import static co.edu.unal.apuntado.architecture.dinamicas.Cartas.lista;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.edu.unal.apuntado.architecture.dinamicas.dobles.MazoPreparado;
import co.edu.unal.apuntado.kernel.CodigoModalidad;
import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.PartidaId;
import co.edu.unal.apuntado.kernel.ResultadoValidacion;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

/** Sección 2.4 (capa 1) y ADR-05 - FF-25: serialización por partida y paralelismo entre partidas. */
class SerializacionPorPartidaFitnessTest {

    private static final CodigoModalidad CLASICA = CodigoModalidad.de("CLASICA");
    private static final int HILOS = 6;

    private static MazoPreparado mazo() {
        return new MazoPreparado(
                lista("4P", "5P", "6P", "7P", "9C", "9D", "9T", "2C", "3C", "4C", "KT"),
                List.of(lista("AP", "2P", "3D", "8T", "JC", "QC", "KD", "5C", "6D", "8D")),
                lista("10P"));
    }

    @Test
    void ff25_cierres_concurrentes_de_la_misma_ronda_dejan_un_solo_cierre_valido() throws Exception {
        JugadorId ana = JugadorId.nuevo();
        Mesa mesa = new Mesa(mazo(), 20);
        PartidaId partida = mesa.partida(CLASICA, ana, List.of(JugadorId.nuevo()));

        AtomicInteger validos = new AtomicInteger();
        AtomicInteger rechazados = new AtomicInteger();
        ejecutarEnParalelo(HILOS, () -> {
            try {
                if (mesa.orquestador.cerrarRonda(partida, ana) == ResultadoValidacion.VALIDO) {
                    validos.incrementAndGet();
                }
            } catch (IllegalStateException rondaYaCerrada) {
                rechazados.incrementAndGet();
            }
            return null;
        });

        assertEquals(1, validos.get(), "FF-25: exactamente un cierre válido");
        assertEquals(HILOS - 1, rechazados.get(), "FF-25: los demás reciben 'ronda ya cerrada'");
        assertEquals(1, mesa.repositorio.liquidaciones(partida).size(), "FF-25: sin liquidaciones duplicadas");
    }

    @Test
    void ff25_partidas_distintas_se_procesan_en_paralelo() throws Exception {
        long demora = 300;
        Mesa mesa = new Mesa(mazo(), demora); // un solo orquestador; el doble de mazo reparte igual a cada partida
        JugadorId ana = JugadorId.nuevo();
        JugadorId beto = JugadorId.nuevo();
        PartidaId primera = mesa.partida(CLASICA, ana, List.of(JugadorId.nuevo()));
        PartidaId segunda = mesa.partida(CLASICA, beto, List.of(JugadorId.nuevo()));

        AtomicInteger turno = new AtomicInteger();
        long inicio = System.nanoTime();
        ejecutarEnParalelo(2, () -> {
            if (turno.getAndIncrement() == 0) {
                mesa.orquestador.cerrarRonda(primera, ana);
            } else {
                mesa.orquestador.cerrarRonda(segunda, beto);
            }
            return null;
        });
        long ms = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - inicio);

        assertTrue(ms < 2 * demora, "FF-25: dos partidas no se bloquean entre sí (" + ms + " ms)");
        assertEquals(1, mesa.repositorio.liquidaciones(primera).size());
        assertEquals(1, mesa.repositorio.liquidaciones(segunda).size());
    }

    private static void ejecutarEnParalelo(int hilos, Callable<Void> tarea) throws Exception {
        ExecutorService ejecutor = Executors.newFixedThreadPool(hilos);
        CountDownLatch salida = new CountDownLatch(1);
        List<Future<Void>> futuros = new ArrayList<>();
        for (int i = 0; i < hilos; i++) {
            futuros.add(ejecutor.submit(() -> {
                salida.await();
                return tarea.call();
            }));
        }
        salida.countDown();
        for (Future<Void> f : futuros) {
            f.get(10, TimeUnit.SECONDS);
        }
        ejecutor.shutdown();
    }
}
