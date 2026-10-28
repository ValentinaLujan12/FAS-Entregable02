package co.edu.unal.apuntado.architecture.dinamicas.dobles;

import co.edu.unal.apuntado.deck.IMazo;
import co.edu.unal.apuntado.kernel.Carta;
import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.Mano;
import co.edu.unal.apuntado.kernel.ParametrosModalidad;
import co.edu.unal.apuntado.kernel.PartidaId;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Doble de IMazo: quien abre la ronda recibe la mano preparada (11 cartas) y los demás reciben las manos
 * de la lista {@code otras}, en orden. El mazo ciego entrega cartas conocidas.
 */
public final class MazoPreparado implements IMazo {

    private final List<Carta> manoQueAbre;
    private final List<List<Carta>> otras;
    private final Deque<Carta> mazo = new ArrayDeque<>();
    private final Deque<Carta> pozo = new ArrayDeque<>();

    public MazoPreparado(List<Carta> manoQueAbre, List<List<Carta>> otras, List<Carta> mazo) {
        this.manoQueAbre = manoQueAbre;
        this.otras = otras;
        this.mazo.addAll(mazo);
    }

    @Override
    public void barajar(PartidaId partida, long semilla, ParametrosModalidad parametros) {
        // determinista: no mezcla
    }

    @Override
    public Map<JugadorId, Mano> repartir(PartidaId partida, List<JugadorId> jugadores, JugadorId cartaExtraA) {
        Map<JugadorId, Mano> manos = new LinkedHashMap<>();
        int i = 0;
        for (JugadorId j : jugadores) {
            manos.put(j, new Mano(j.equals(cartaExtraA) ? manoQueAbre : otras.get(i++)));
        }
        return manos;
    }

    @Override
    public Carta robarMazo(PartidaId partida) {
        return mazo.pop();
    }

    @Override
    public Carta robarPozo(PartidaId partida) {
        return pozo.pop();
    }

    @Override
    public void descartar(PartidaId partida, Carta carta) {
        pozo.push(carta);
    }
}
