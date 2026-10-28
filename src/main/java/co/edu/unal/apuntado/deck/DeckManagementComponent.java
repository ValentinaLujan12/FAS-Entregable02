package co.edu.unal.apuntado.deck;

import co.edu.unal.apuntado.kernel.Carta;
import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.Mano;
import co.edu.unal.apuntado.kernel.Palo;
import co.edu.unal.apuntado.kernel.ParametrosModalidad;
import co.edu.unal.apuntado.kernel.PartidaId;
import co.edu.unal.apuntado.kernel.Valor;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;

/** DeckManagementComponent: componente puro en memoria (sin I/O). */
public final class DeckManagementComponent implements IMazo {

    private final Map<PartidaId, EstadoMazo> mazos = new ConcurrentHashMap<>();

    @Override
    public void barajar(PartidaId partida, long semilla, ParametrosModalidad parametros) {
        List<Carta> cartas = new ArrayList<>();
        for (int b = 0; b < parametros.numeroBarajas(); b++) {
            for (Palo p : Palo.values()) {
                for (Valor v : Valor.values()) {
                    cartas.add(Carta.de(v, p));
                }
            }
        }
        Collections.shuffle(cartas, new Random(semilla));
        mazos.put(partida, new EstadoMazo(new ArrayDeque<>(cartas), new ArrayDeque<>(), parametros));
    }

    @Override
    public Map<JugadorId, Mano> repartir(PartidaId partida, List<JugadorId> jugadores, JugadorId cartaExtraA) {
        EstadoMazo estado = estado(partida);
        Map<JugadorId, Mano> manos = new LinkedHashMap<>();
        for (JugadorId jugador : jugadores) {
            int cantidad = estado.parametros().cartasPorJugador() + (jugador.equals(cartaExtraA) ? 1 : 0);
            List<Carta> cartas = new ArrayList<>();
            for (int i = 0; i < cantidad; i++) {
                cartas.add(estado.mazo().pop());
            }
            manos.put(jugador, new Mano(cartas));
        }
        return manos;
    }

    @Override
    public Carta robarMazo(PartidaId partida) {
        EstadoMazo estado = estado(partida);
        if (estado.mazo().isEmpty()) {
            throw new IllegalStateException("Mazo agotado");
        }
        return estado.mazo().pop();
    }

    @Override
    public Carta robarPozo(PartidaId partida) {
        EstadoMazo estado = estado(partida);
        if (estado.pozo().isEmpty()) {
            throw new IllegalStateException("Pozo vacío");
        }
        return estado.pozo().pop();
    }

    @Override
    public void descartar(PartidaId partida, Carta carta) {
        estado(partida).pozo().push(carta);
    }

    private EstadoMazo estado(PartidaId partida) {
        EstadoMazo estado = mazos.get(partida);
        if (estado == null) {
            throw new IllegalStateException("La partida no tiene mazo: " + partida);
        }
        return estado;
    }

    private record EstadoMazo(Deque<Carta> mazo, Deque<Carta> pozo, ParametrosModalidad parametros) {
    }
}
