package co.edu.unal.apuntado.game.turn;

import co.edu.unal.apuntado.deck.IMazo;
import co.edu.unal.apuntado.game.lobby.ISala;
import co.edu.unal.apuntado.infra.ICanalTiempoReal;
import co.edu.unal.apuntado.infra.IComandosJuego;
import co.edu.unal.apuntado.infra.ITemporizadorTurno;
import co.edu.unal.apuntado.kernel.Carta;
import co.edu.unal.apuntado.kernel.CodigoModalidad;
import co.edu.unal.apuntado.kernel.EstadoPartida;
import co.edu.unal.apuntado.kernel.EstadoSesion;
import co.edu.unal.apuntado.kernel.EventoJuego;
import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.Mano;
import co.edu.unal.apuntado.kernel.ParametrosModalidad;
import co.edu.unal.apuntado.kernel.PartidaId;
import co.edu.unal.apuntado.kernel.ResultadoValidacion;
import co.edu.unal.apuntado.kernel.TipoAccion;
import co.edu.unal.apuntado.kernel.ZonaCarta;
import co.edu.unal.apuntado.persistence.IRepositorioPartida;
import co.edu.unal.apuntado.player.IJugadores;
import co.edu.unal.apuntado.rules.ICalculadorPuntos;
import co.edu.unal.apuntado.rules.IValidadorCierre;
import co.edu.unal.apuntado.scoring.IServicioPuntaje;
import co.edu.unal.apuntado.scoring.ResultadoLiquidacion;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * TurnOrchestratorComponent (mediador, ADR-05). Coordina deck, player, rules, scoring, persistence e infra
 * solo a través de interfaces y es el único escritor de estado de partida.
 * <ul>
 *   <li>Serialización por partida: los comandos de una misma partida se procesan de a uno (incluido el
 *       timeout); partidas distintas corren en paralelo (Sección 2.4, capa 1).</li>
 *   <li>Persistir y luego notificar: difundir se invoca solo después de que el repositorio confirmó; si
 *       falla, el estado confirmado no se revierte (ADR-05, puntos 2 y 4).</li>
 * </ul>
 */
public final class TurnOrchestratorComponent implements IComandosJuego {

    static final Duration DURACION_TURNO = Duration.ofSeconds(60);

    private final ISala sala;
    private final IMazo mazo;
    private final IJugadores jugadores;
    private final IValidadorCierre validador;
    private final ICalculadorPuntos parametros;
    private final IServicioPuntaje puntaje;
    private final IRepositorioPartida repositorio;
    private final ICanalTiempoReal canal;
    private final ITemporizadorTurno temporizador;

    /** R14 (Sección 4.3): semilla impredecible, generada en el servidor y nunca enviada al cliente. */
    private final SecureRandom azar = new SecureRandom();
    private final Map<PartidaId, Mesa> mesas = new ConcurrentHashMap<>();
    private final Map<PartidaId, Object> cerrojos = new ConcurrentHashMap<>();

    public TurnOrchestratorComponent(ISala sala, IMazo mazo, IJugadores jugadores, IValidadorCierre validador,
                                     ICalculadorPuntos parametros, IServicioPuntaje puntaje,
                                     IRepositorioPartida repositorio, ICanalTiempoReal canal,
                                     ITemporizadorTurno temporizador) {
        this.sala = sala;
        this.mazo = mazo;
        this.jugadores = jugadores;
        this.validador = validador;
        this.parametros = parametros;
        this.puntaje = puntaje;
        this.repositorio = repositorio;
        this.canal = canal;
        this.temporizador = temporizador;
    }

    // ------------------------------------------------------------------ comandos de sala

    @Override
    public EstadoPartida crearSala(JugadorId anfitrion, CodigoModalidad modalidad) {
        parametros.parametrosModalidad(modalidad); // falla si la modalidad no tiene estrategia
        EstadoPartida estado = sala.crearSala(anfitrion);
        estado = sala.fijarModalidad(estado.id(), modalidad);
        jugadores.registrar(estado.id(), anfitrion);
        repositorio.guardarEstado(estado);
        return estado;
    }

    @Override
    public EstadoPartida unirse(String codigoInvitacion, JugadorId jugador) {
        EstadoPartida estado = sala.unirse(codigoInvitacion, jugador);
        return enSerie(estado.id(), () -> {
            jugadores.registrar(estado.id(), jugador);
            repositorio.guardarEstado(estado);
            return estado;
        });
    }

    @Override
    public EstadoPartida iniciar(PartidaId partida, JugadorId anfitrion) {
        return enSerie(partida, () -> {
            EstadoPartida estado = sala.iniciar(partida, anfitrion);
            Mesa mesa = new Mesa(estado);
            mesas.put(partida, mesa);
            repositorio.guardarEstado(estado);
            abrirRonda(mesa, jugadores.ordenDeTurno(partida).get(0));
            return estado;
        });
    }

    // ------------------------------------------------------------------ comandos de turno

    @Override
    public Carta robar(PartidaId partida, JugadorId jugador, ZonaCarta origen) {
        return enSerie(partida, () -> {
            Mesa mesa = mesaEnTurno(partida, jugador);
            if (mesa.yaRobo) {
                throw new IllegalStateException("El jugador ya robó en este turno");
            }
            return robarInterno(mesa, jugador, origen);
        });
    }

    @Override
    public void descartar(PartidaId partida, JugadorId jugador, Carta carta) {
        enSerie(partida, () -> {
            Mesa mesa = mesaEnTurno(partida, jugador);
            descartarInterno(mesa, jugador, carta, TipoAccion.DESCARTE);
            return null;
        });
    }

    @Override
    public ResultadoValidacion cerrarRonda(PartidaId partida, JugadorId jugador) {
        return enSerie(partida, () -> {
            Mesa mesa = mesaEnTurno(partida, jugador);
            Mano mano = new Mano(mesa.manos.get(jugador));
            ResultadoValidacion resultado = validador.validarCierre(mano, mesa.estado.modalidad());
            EventoJuego cierre = evento(mesa, jugador, TipoAccion.CIERRE, null, resultado);
            if (!resultado.esValido()) {
                repositorio.registrarEvento(cierre); // cierre inválido: solo auditoría (Sección 2.4)
                notificar(cierre);
                return resultado;
            }
            liquidar(mesa, jugador, cierre);
            return resultado;
        });
    }

    @Override
    public void alExpirarTurno(PartidaId partida, JugadorId jugador) {
        enSerie(partida, () -> {
            Mesa mesa = mesas.get(partida);
            if (mesa == null || !mesa.rondaAbierta || !jugador.equals(mesa.enTurno)) {
                return null; // timer obsoleto: el turno ya cambió
            }
            if (!mesa.yaRobo) {
                robarInterno(mesa, jugador, ZonaCarta.MAZO);
            }
            descartarInterno(mesa, jugador, cartaDeMayorCosto(mesa, jugador), TipoAccion.DESCARTE_AUTO);
            return null;
        });
    }

    // ------------------------------------------------------------------ pasos internos

    private Carta robarInterno(Mesa mesa, JugadorId jugador, ZonaCarta origen) {
        PartidaId id = mesa.estado.id();
        Carta carta = origen == ZonaCarta.POZO ? mazo.robarPozo(id) : mazo.robarMazo(id);
        mesa.manos.get(jugador).add(carta);
        mesa.yaRobo = true;
        TipoAccion accion = origen == ZonaCarta.POZO ? TipoAccion.ROBO_POZO : TipoAccion.ROBO_MAZO;
        registrarYNotificar(evento(mesa, jugador, accion, carta, null));
        return carta;
    }

    private void descartarInterno(Mesa mesa, JugadorId jugador, Carta carta, TipoAccion accion) {
        if (!mesa.yaRobo || !mesa.manos.get(jugador).remove(carta)) {
            throw new IllegalStateException("Descarte no permitido");
        }
        mazo.descartar(mesa.estado.id(), carta);
        registrarYNotificar(evento(mesa, jugador, accion, carta, null));
        pasarTurno(mesa);
    }

    private void liquidar(Mesa mesa, JugadorId ganador, EventoJuego cierre) {
        ResultadoLiquidacion liquidacion = puntaje.liquidarRonda(mesa.estado.modalidad(), mesa.ronda, ganador,
                Map.copyOf(mesa.manos), Map.copyOf(mesa.acumulados));
        // Una sola transacción: cierre, puntajes, eliminaciones y fin de partida (Sección 2.4).
        repositorio.registrarPenalizacion(cierre, liquidacion.registro(), liquidacion.acumulados(),
                liquidacion.eliminados(), liquidacion.partidaTerminada());
        mesa.rondaAbierta = false;
        mesa.acumulados.putAll(liquidacion.acumulados());
        liquidacion.eliminados().forEach(j -> jugadores.marcarEliminado(mesa.estado.id(), j));
        temporizador.detener(mesa.estado.id());
        notificar(cierre); // solo después del COMMIT
        if (liquidacion.partidaTerminada()) {
            mesa.estado = mesa.estado.conFase(EstadoSesion.FINALIZADA);
            repositorio.guardarEstado(mesa.estado);
        } else {
            abrirRonda(mesa, ganador);
        }
    }

    private void abrirRonda(Mesa mesa, JugadorId abre) {
        PartidaId id = mesa.estado.id();
        ParametrosModalidad p = parametros.parametrosModalidad(mesa.estado.modalidad());
        mazo.barajar(id, azar.nextLong(), p);
        List<JugadorId> orden = jugadores.ordenDeTurno(id);
        mesa.manos.clear();
        mazo.repartir(id, orden, abre).forEach((j, mano) -> mesa.manos.put(j, new ArrayList<>(mano.cartas())));
        mesa.ronda++;
        mesa.turno = 1;
        mesa.enTurno = abre;
        mesa.yaRobo = true; // quien abre recibe la carta extra y empieza descartando
        mesa.rondaAbierta = true;
        temporizador.iniciar(id, abre, DURACION_TURNO);
    }

    private void pasarTurno(Mesa mesa) {
        List<JugadorId> orden = jugadores.ordenDeTurno(mesa.estado.id());
        int siguiente = (orden.indexOf(mesa.enTurno) + 1) % orden.size();
        mesa.enTurno = orden.get(siguiente);
        mesa.turno++;
        mesa.yaRobo = false;
        temporizador.iniciar(mesa.estado.id(), mesa.enTurno, DURACION_TURNO);
    }

    private Carta cartaDeMayorCosto(Mesa mesa, JugadorId jugador) {
        return mesa.manos.get(jugador).stream()
                .max(Comparator.comparingInt(c -> c.valor().puntos(1)))
                .orElseThrow();
    }

    private Mesa mesaEnTurno(PartidaId partida, JugadorId jugador) {
        Mesa mesa = mesas.get(partida);
        if (mesa == null || !mesa.rondaAbierta) {
            throw new IllegalStateException("Ronda ya cerrada o partida no iniciada");
        }
        if (!jugador.equals(mesa.enTurno)) {
            throw new IllegalStateException("No es el turno del jugador");
        }
        return mesa;
    }

    private EventoJuego evento(Mesa mesa, JugadorId jugador, TipoAccion accion, Carta carta,
                               ResultadoValidacion resultado) {
        return new EventoJuego(mesa.estado.id(), mesa.ronda, mesa.turno, jugador, accion, carta, resultado);
    }

    private void registrarYNotificar(EventoJuego evento) {
        repositorio.registrarEvento(evento);
        notificar(evento);
    }

    /** Si la difusión falla, el comando termina igual: el cliente se resincroniza al reconectar (ADR-05). */
    private void notificar(EventoJuego evento) {
        try {
            canal.difundir(evento);
        } catch (RuntimeException fallaDeDifusion) {
            // Estado ya confirmado; no se revierte.
        }
    }

    private <T> T enSerie(PartidaId partida, Supplier<T> accion) {
        Object cerrojo = cerrojos.computeIfAbsent(partida, p -> new Object());
        synchronized (cerrojo) {
            return accion.get();
        }
    }

    /** Estado en memoria de una partida en curso (solo lo escribe el orquestador). */
    private static final class Mesa {
        private EstadoPartida estado;
        private final Map<JugadorId, List<Carta>> manos = new ConcurrentHashMap<>();
        private final Map<JugadorId, Integer> acumulados = new ConcurrentHashMap<>();
        private int ronda;
        private int turno;
        private JugadorId enTurno;
        private boolean yaRobo;
        private boolean rondaAbierta;

        private Mesa(EstadoPartida estado) {
            this.estado = estado;
        }
    }
}
