package co.edu.unal.apuntado.architecture.estaticas;

import static co.edu.unal.apuntado.architecture.estaticas.Modulos.DECK;
import static co.edu.unal.apuntado.architecture.estaticas.Modulos.GAME;
import static co.edu.unal.apuntado.architecture.estaticas.Modulos.PERSISTENCE;
import static co.edu.unal.apuntado.architecture.estaticas.Modulos.PLAYER;
import static co.edu.unal.apuntado.architecture.estaticas.Modulos.RULES;
import static co.edu.unal.apuntado.architecture.estaticas.Modulos.SCORING;
import static co.edu.unal.apuntado.architecture.estaticas.Modulos.paquete;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

/** Regla de gobernanza G5 - Comunicación síncrona en memoria con mediador, sin bus de eventos (ADR-05). */
@AnalyzeClasses(packages = Modulos.BASE, importOptions = ImportOption.DoNotIncludeTests.class)
class ComunicacionSincronaFitnessTest {

    @ArchTest
    static final ArchRule ff08_sin_bus_de_eventos_ni_mensajeria =
            noClasses().that().resideInAnyPackage(paquete(GAME), paquete(DECK), paquete(PLAYER), paquete(RULES),
                            paquete(SCORING), paquete(PERSISTENCE))
                    .should().dependOnClassesThat().resideInAnyPackage(
                            "org.springframework.context.event..", "com.google.common.eventbus..",
                            "org.apache.kafka..", "com.rabbitmq..", "java.beans..")
                    .because("FF-08: los módulos de negocio se comunican por interfaces a través del mediador; "
                            + "no hay bus de eventos ni broker en esta fase (ADR-05)");

    @ArchTest
    static final ArchRule ff08_modulos_de_negocio_no_llaman_a_game =
            noClasses().that().resideInAnyPackage(paquete(DECK), paquete(PLAYER), paquete(RULES),
                            paquete(SCORING), paquete(PERSISTENCE))
                    .should().dependOnClassesThat().resideInAPackage(paquete(GAME))
                    .because("FF-08: ningún módulo de negocio llama al orquestador (evita el ciclo "
                            + "game -> scoring -> game advertido en ADR-01)");
}
