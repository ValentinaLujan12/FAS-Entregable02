package co.edu.unal.apuntado.architecture.dinamicas;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.edu.unal.apuntado.kernel.Mano;
import co.edu.unal.apuntado.kernel.ParametrosModalidad;
import co.edu.unal.apuntado.kernel.ResultadoValidacion;
import co.edu.unal.apuntado.rules.strategy.IReglaJuego;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * FF-12 - Suite de contrato común (ADR-02, ADR-03): toda implementación de IReglaJuego hereda estas pruebas
 * además de sus casos propios. Una modalidad nueva solo debe extender esta clase.
 */
public abstract class ContratoReglaJuego {

    protected abstract IReglaJuego regla();

    /** Una mano de 11 cartas que cierra la ronda en esta modalidad. */
    protected abstract Mano manoGanadora();

    /** Una mano de 11 cartas que NO cierra la ronda en esta modalidad. */
    protected abstract Mano manoQueNoCierra();

    @Test
    void contrato_identifica_su_modalidad() {
        assertNotNull(regla().getModalidad(), "getModalidad() no puede ser nulo");
    }

    @Test
    void contrato_parametros_coherentes_con_el_esquema() {
        ParametrosModalidad p = regla().parametros();
        assertNotNull(p);
        // CHECK ck_modalidad_umbral: umbral solo si la modalidad es acumulativa
        assertTrue(p.umbralEliminacion() == null || p.acumulativa(), "umbral solo si acumulativa");
        assertTrue(p.cartasPorJugador() > 0 && p.numeroBarajas() > 0);
    }

    @Test
    void contrato_acepta_la_mano_ganadora() {
        assertEquals(ResultadoValidacion.VALIDO, regla().validarVictoria(manoGanadora()));
    }

    @Test
    void contrato_rechaza_la_mano_que_no_cierra() {
        assertNotEquals(ResultadoValidacion.VALIDO, regla().validarVictoria(manoQueNoCierra()));
    }

    @Test
    void contrato_rechaza_cantidades_distintas_de_11_cartas() {
        List<?> cartas = manoGanadora().cartas();
        Mano corta = new Mano(manoGanadora().cartas().subList(0, cartas.size() - 1));
        List<co.edu.unal.apuntado.kernel.Carta> mas = new ArrayList<>(manoGanadora().cartas());
        mas.add(mas.get(0));
        assertEquals(ResultadoValidacion.COMBINACION_INVALIDA, regla().validarVictoria(corta));
        assertEquals(ResultadoValidacion.COMBINACION_INVALIDA, regla().validarVictoria(new Mano(mas)));
    }

    @Test
    void contrato_es_determinista_y_no_depende_del_orden() {
        Mano mano = manoGanadora();
        List<co.edu.unal.apuntado.kernel.Carta> invertida = new ArrayList<>(mano.cartas());
        java.util.Collections.reverse(invertida);
        assertEquals(regla().validarVictoria(mano), regla().validarVictoria(mano));
        assertEquals(regla().validarVictoria(mano), regla().validarVictoria(new Mano(invertida)));
    }

    @Test
    void contrato_puntos_no_negativos() {
        assertTrue(regla().calcularPuntos(manoQueNoCierra().cartas()) >= 0);
        assertTrue(regla().calcularPuntos(List.of()) >= 0);
    }

    @Test
    void contrato_sin_estado_mutable() {
        for (Field campo : regla().getClass().getDeclaredFields()) {
            assertTrue(Modifier.isFinal(campo.getModifiers()),
                    "Las estrategias deben ser inmutables; campo no final: " + campo.getName());
        }
    }

    @Test
    void contrato_descubrible_automaticamente() throws ReflectiveOperationException {
        Class<?> clase = regla().getClass();
        assertTrue(Modifier.isPublic(clase.getModifiers()), "la estrategia debe ser pública");
        assertNotNull(clase.getDeclaredConstructor().newInstance(), "requiere constructor público sin argumentos");
    }
}
