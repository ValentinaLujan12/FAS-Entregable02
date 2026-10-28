package co.edu.unal.apuntado.persistence.entity;

import co.edu.unal.apuntado.kernel.Carta;
import co.edu.unal.apuntado.kernel.Palo;
import co.edu.unal.apuntado.kernel.Valor;

/** Tabla carta (52 filas semilla). */
public class CardEntity {

    private String codigoCarta;
    private Palo palo;
    private short rango;

    public CardEntity(String codigoCarta, Palo palo, short rango) {
        this.codigoCarta = codigoCarta;
        this.palo = palo;
        this.rango = rango;
    }

    public Carta toCarta() {
        return Carta.de(Valor.deRango(rango), palo);
    }

    public String codigoCarta() {
        return codigoCarta;
    }
}
