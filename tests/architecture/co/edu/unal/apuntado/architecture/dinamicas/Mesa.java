package co.edu.unal.apuntado.architecture.dinamicas;

import co.edu.unal.apuntado.architecture.dinamicas.dobles.Bitacora;
import co.edu.unal.apuntado.architecture.dinamicas.dobles.CanalQueRegistra;
import co.edu.unal.apuntado.architecture.dinamicas.dobles.MazoPreparado;
import co.edu.unal.apuntado.architecture.dinamicas.dobles.RepositorioEnMemoria;
import co.edu.unal.apuntado.architecture.dinamicas.dobles.TemporizadorManual;
import co.edu.unal.apuntado.game.lobby.LobbyManagerComponent;
import co.edu.unal.apuntado.game.turn.TurnOrchestratorComponent;
import co.edu.unal.apuntado.kernel.CodigoModalidad;
import co.edu.unal.apuntado.kernel.EstadoPartida;
import co.edu.unal.apuntado.kernel.JugadorId;
import co.edu.unal.apuntado.kernel.PartidaId;
import co.edu.unal.apuntado.player.PlayerRegistryComponent;
import co.edu.unal.apuntado.rules.MotorReglas;
import co.edu.unal.apuntado.rules.RegistroReglas;
import co.edu.unal.apuntado.scoring.RoundScoringComponent;
import java.util.List;

/**
 * Raíz de composición para las pruebas dinámicas: ensambla los componentes reales (lobby, player, rules,
 * scoring y el orquestador) con dobles de mazo, repositorio, canal y temporizador.
 */
final class Mesa {

    final Bitacora bitacora = new Bitacora();
    final RepositorioEnMemoria repositorio;
    final CanalQueRegistra canal = new CanalQueRegistra(bitacora);
    final LobbyManagerComponent lobby = new LobbyManagerComponent();
    final TurnOrchestratorComponent orquestador;

    Mesa(MazoPreparado mazo) {
        this(mazo, 0);
    }

    Mesa(MazoPreparado mazo, long demoraCierreMs) {
        this.repositorio = new RepositorioEnMemoria(bitacora, demoraCierreMs);
        MotorReglas motor = new MotorReglas(RegistroReglas.descubrir());
        this.orquestador = new TurnOrchestratorComponent(lobby, mazo, new PlayerRegistryComponent(), motor, motor,
                new RoundScoringComponent(motor), repositorio, canal, new TemporizadorManual());
    }

    /** Crea la sala, une a los invitados e inicia la partida. Devuelve el id de la partida. */
    PartidaId partida(CodigoModalidad modalidad, JugadorId anfitrion, List<JugadorId> invitados) {
        EstadoPartida sala = orquestador.crearSala(anfitrion, modalidad);
        String codigo = lobby.codigoInvitacion(sala.id());
        invitados.forEach(j -> orquestador.unirse(codigo, j));
        orquestador.iniciar(sala.id(), anfitrion);
        return sala.id();
    }
}
