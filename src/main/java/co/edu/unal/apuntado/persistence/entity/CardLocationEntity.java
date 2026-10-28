package co.edu.unal.apuntado.persistence.entity;

import co.edu.unal.apuntado.kernel.Carta;
import co.edu.unal.apuntado.kernel.ZonaCarta;
import java.util.UUID;

/** Tabla ronda_carta: cada carta está exactamente en un lugar por ronda (MAZO, POZO o MANO). */
public class CardLocationEntity {

    private UUID idRonda;
    private String codigoCarta;
    private ZonaCarta zona;
    private UUID idMano;
    private short posicion;

    public CardLocationEntity(UUID idRonda, String codigoCarta, ZonaCarta zona, UUID idMano, short posicion) {
        if ((zona == ZonaCarta.MANO) != (idMano != null)) {
            throw new IllegalArgumentException("zona = MANO si y solo si hay id_mano (CHECK ck_rc_zona_mano)");
        }
        this.idRonda = idRonda;
        this.codigoCarta = codigoCarta;
        this.zona = zona;
        this.idMano = idMano;
        this.posicion = posicion;
    }

    public boolean enMano() {
        return zona == ZonaCarta.MANO;
    }

    public Carta carta() {
        return Carta.deCodigo(codigoCarta);
    }

    public short posicion() {
        return posicion;
    }
}
