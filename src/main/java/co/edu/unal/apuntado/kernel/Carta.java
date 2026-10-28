package co.edu.unal.apuntado.kernel;

import java.util.Objects;

/** Carta de la baraja (snapshot inmutable). */
public record Carta(Valor valor, Palo palo) implements Comparable<Carta> {

    public Carta {
        Objects.requireNonNull(valor, "valor");
        Objects.requireNonNull(palo, "palo");
    }

    public static Carta de(Valor valor, Palo palo) {
        return new Carta(valor, palo);
    }

    /** Reconstruye la carta desde su código (inverso de {@link #codigo()}). */
    public static Carta deCodigo(String codigo) {
        String simbolo = codigo.substring(0, codigo.length() - 1);
        char letra = codigo.charAt(codigo.length() - 1);
        for (Valor v : Valor.values()) {
            if (v.simbolo().equals(simbolo)) {
                return new Carta(v, paloDeLetra(letra));
            }
        }
        throw new IllegalArgumentException("Código de carta inválido: " + codigo);
    }

    private static Palo paloDeLetra(char letra) {
        for (Palo p : Palo.values()) {
            if (p.letra() == letra) {
                return p;
            }
        }
        throw new IllegalArgumentException("Palo inválido: " + letra);
    }

    /** Código persistido en carta.codigo_carta (máximo 3 caracteres), p. ej. "AP", "10C", "KT". */
    public String codigo() {
        return valor.simbolo() + palo.letra();
    }

    @Override
    public int compareTo(Carta otra) {
        int porPalo = palo.compareTo(otra.palo);
        return porPalo != 0 ? porPalo : Integer.compare(valor.rango(), otra.valor.rango());
    }

    @Override
    public String toString() {
        return codigo();
    }
}
