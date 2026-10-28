package co.edu.unal.apuntado.kernel;

/** Valor (rango 1 a 13) de una carta. */
public enum Valor {
    AS(1, "A"), DOS(2, "2"), TRES(3, "3"), CUATRO(4, "4"), CINCO(5, "5"), SEIS(6, "6"), SIETE(7, "7"),
    OCHO(8, "8"), NUEVE(9, "9"), DIEZ(10, "10"), JOTA(11, "J"), REINA(12, "Q"), REY(13, "K");

    private final int rango;
    private final String simbolo;

    Valor(int rango, String simbolo) {
        this.rango = rango;
        this.simbolo = simbolo;
    }

    public int rango() {
        return rango;
    }

    public String simbolo() {
        return simbolo;
    }

    /**
     * Puntos de la carta suelta: 2 a 10 valen su número, J/Q/K valen 10 y el As vale lo que fije
     * la modalidad (ParametrosModalidad.valorAs).
     */
    public int puntos(int valorAs) {
        if (this == AS) {
            return valorAs;
        }
        return Math.min(rango, 10);
    }

    public static Valor deRango(int rango) {
        for (Valor v : values()) {
            if (v.rango == rango) {
                return v;
            }
        }
        throw new IllegalArgumentException("Rango fuera de 1..13: " + rango);
    }
}
