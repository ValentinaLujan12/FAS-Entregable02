package co.edu.unal.apuntado.architecture.dinamicas.dobles;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Registro compartido del orden de las llamadas entre el orquestador y sus puertos (dobles de prueba). */
public final class Bitacora {

    private final List<String> entradas = Collections.synchronizedList(new ArrayList<>());

    public void anotar(String entrada) {
        entradas.add(entrada);
    }

    public List<String> entradas() {
        synchronized (entradas) {
            return List.copyOf(entradas);
        }
    }

    public int indice(String entrada) {
        return entradas().indexOf(entrada);
    }
}
