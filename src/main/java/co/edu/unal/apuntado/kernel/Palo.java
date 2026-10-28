package co.edu.unal.apuntado.kernel;

/** Palos de la baraja francesa. Nombres de hasta 8 caracteres (columna carta.palo VARCHAR(8)). */
public enum Palo {
    PICA, CORAZON, DIAMANTE, TREBOL;

    /** Letra usada en el código de carta (carta.codigo_carta). */
    public char letra() {
        return name().charAt(0);
    }
}
