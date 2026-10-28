package co.edu.unal.apuntado.architecture.estaticas;

import static co.edu.unal.apuntado.architecture.estaticas.Modulos.DECK;
import static co.edu.unal.apuntado.architecture.estaticas.Modulos.GAME;
import static co.edu.unal.apuntado.architecture.estaticas.Modulos.INFRA;
import static co.edu.unal.apuntado.architecture.estaticas.Modulos.KERNEL;
import static co.edu.unal.apuntado.architecture.estaticas.Modulos.PERSISTENCE;
import static co.edu.unal.apuntado.architecture.estaticas.Modulos.PLAYER;
import static co.edu.unal.apuntado.architecture.estaticas.Modulos.RULES;
import static co.edu.unal.apuntado.architecture.estaticas.Modulos.SCORING;
import static co.edu.unal.apuntado.architecture.estaticas.Modulos.paquete;
import static co.edu.unal.apuntado.architecture.estaticas.Modulos.prohibidosPara;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import java.util.List;

/**
 * Regla de gobernanza G4 - Dependencias dirigidas y sin ciclos (Sección 1.2, ADR-01, ADR-03).
 * Fitness functions estáticas, atómicas y continuas (se ejecutan en cada build).
 */
@AnalyzeClasses(packages = Modulos.BASE, importOptions = ImportOption.DoNotIncludeTests.class)
class ReglasDeDependenciaFitnessTest {

    @ArchTest
    static final ArchRule ff01_kernel_no_depende_de_ningun_modulo =
            noClasses().that().resideInAPackage(paquete(KERNEL))
                    .should().dependOnClassesThat().resideInAnyPackage(prohibidosPara(KERNEL))
                    .because("FF-01: el Shared Kernel no depende de ningún otro módulo (Sección 1.2)");

    @ArchTest
    static final ArchRule ff01_infra_solo_depende_de_kernel =
            noClasses().that().resideInAPackage(paquete(INFRA))
                    .should().dependOnClassesThat().resideInAnyPackage(prohibidosPara(INFRA, KERNEL))
                    .because("FF-01: infra depende solo de kernel; llama a game únicamente por IComandosJuego, "
                            + "que declara infra (inversión de dependencia)");

    @ArchTest
    static final ArchRule ff02_rules_solo_depende_de_kernel =
            noClasses().that().resideInAPackage(paquete(RULES))
                    .should().dependOnClassesThat().resideInAnyPackage(prohibidosPara(RULES, KERNEL))
                    .because("FF-02: rules depende solo de kernel (Sección 1.2)");

    @ArchTest
    static final ArchRule ff02_deck_solo_depende_de_kernel =
            noClasses().that().resideInAPackage(paquete(DECK))
                    .should().dependOnClassesThat().resideInAnyPackage(prohibidosPara(DECK, KERNEL))
                    .because("FF-02: deck depende solo de kernel (Sección 1.2)");

    @ArchTest
    static final ArchRule ff02_player_solo_depende_de_kernel =
            noClasses().that().resideInAPackage(paquete(PLAYER))
                    .should().dependOnClassesThat().resideInAnyPackage(prohibidosPara(PLAYER, KERNEL))
                    .because("FF-02: player depende solo de kernel (Sección 1.2)");

    @ArchTest
    static final ArchRule ff02_persistence_solo_depende_de_kernel =
            noClasses().that().resideInAPackage(paquete(PERSISTENCE))
                    .should().dependOnClassesThat().resideInAnyPackage(prohibidosPara(PERSISTENCE, KERNEL))
                    .because("FF-02: persistence depende solo de kernel (Sección 1.2)");

    @ArchTest
    static final ArchRule ff03_scoring_solo_depende_de_rules_y_kernel =
            noClasses().that().resideInAPackage(paquete(SCORING))
                    .should().dependOnClassesThat().resideInAnyPackage(prohibidosPara(SCORING, RULES, KERNEL))
                    .because("FF-03: scoring depende solo de rules y kernel; devuelve la liquidación al "
                            + "orquestador sin llamar de vuelta a game (ADR-01)");

    @ArchTest
    static final ArchRule ff04_game_usa_otros_modulos_solo_por_interfaces =
            noClasses().that().resideInAPackage(paquete(GAME))
                    .should().dependOnClassesThat(clasesConcretasDeOtrosModulos())
                    .because("FF-04: game (mediador) depende de los demás módulos solo a través de "
                            + "interfaces (Sección 1.2, ADR-05)");

    @ArchTest
    static final ArchRule ff05_sin_ciclos_entre_modulos =
            slices().matching(Modulos.BASE + ".(*)..")
                    .should().beFreeOfCycles()
                    .because("FF-05: no existen dependencias cíclicas entre módulos (Acyclic Dependency "
                            + "Principle, ADR-01)");

    private static DescribedPredicate<JavaClass> clasesConcretasDeOtrosModulos() {
        List<String> otros = List.of(DECK, PLAYER, RULES, SCORING, PERSISTENCE, INFRA);
        return new DescribedPredicate<>("clases concretas de deck, player, rules, scoring, persistence o infra") {
            @Override
            public boolean test(JavaClass clase) {
                String paqueteClase = clase.getPackageName();
                boolean deOtroModulo = otros.stream()
                        .anyMatch(m -> paqueteClase.startsWith(Modulos.BASE + "." + m));
                return deOtroModulo && !clase.isInterface();
            }
        };
    }
}
