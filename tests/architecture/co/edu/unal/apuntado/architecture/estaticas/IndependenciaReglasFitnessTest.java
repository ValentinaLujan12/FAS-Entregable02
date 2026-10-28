package co.edu.unal.apuntado.architecture.estaticas;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

import co.edu.unal.apuntado.rules.strategy.IReglaJuego;
import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

/**
 * Regla de gobernanza G2 - Independencia de las reglas de juego (guía, Sección 5.1; ADR-02, ADR-03).
 * Cada estrategia vive en su subpaquete de rules.strategy y no depende de las demás; solo rules.strategy
 * conoce las implementaciones de IReglaJuego, y game y scoring no conocen ni el contrato Strategy.
 */
@AnalyzeClasses(packages = Modulos.BASE, importOptions = ImportOption.DoNotIncludeTests.class)
class IndependenciaReglasFitnessTest {

    private static final String ESTRATEGIAS = Modulos.BASE + ".rules.strategy..";

    @ArchTest
    static final ArchRule ff09_clasica_no_depende_de_apuntado =
            noClasses().that().resideInAPackage("..rules.strategy.clasica..")
                    .should().dependOnClassesThat().resideInAPackage("..rules.strategy.apuntado..")
                    .because("FF-09: ReglaClasica y ReglaApuntado no dependen entre sí");

    @ArchTest
    static final ArchRule ff09_apuntado_no_depende_de_clasica =
            noClasses().that().resideInAPackage("..rules.strategy.apuntado..")
                    .should().dependOnClassesThat().resideInAPackage("..rules.strategy.clasica..")
                    .because("FF-09: ReglaApuntado y ReglaClasica no dependen entre sí");

    @ArchTest
    static final ArchRule ff09_ninguna_estrategia_depende_de_otra =
            slices().matching(Modulos.BASE + ".rules.strategy.(*)..")
                    .should().notDependOnEachOther()
                    .because("FF-09: cualquier variante futura (p. ej. ReglaFusion) también queda aislada");

    @ArchTest
    static final ArchRule ff09_sin_ciclos_dentro_de_rules =
            slices().matching(Modulos.BASE + ".rules.(**)")
                    .should().beFreeOfCycles()
                    .because("FF-09: no hay dependencias cíclicas dentro del módulo de reglas");

    @ArchTest
    static final ArchRule ff07_estrategias_solo_en_rules_strategy =
            classes().that(implementacionesDeIReglaJuego())
                    .should().resideInAPackage(ESTRATEGIAS)
                    .because("FF-07: toda modalidad es una clase dentro de rules.strategy (ADR-03)");

    @ArchTest
    static final ArchRule ff07_nadie_fuera_de_rules_strategy_referencia_estrategias =
            noClasses().that().resideOutsideOfPackage(ESTRATEGIAS)
                    .should().dependOnClassesThat(implementacionesDeIReglaJuego())
                    .because("FF-07: el motor, el registro y los demás módulos no conocen reglas concretas");

    @ArchTest
    static final ArchRule ff07_game_y_scoring_no_conocen_el_contrato_strategy =
            noClasses().that().resideInAnyPackage(Modulos.paquete(Modulos.GAME), Modulos.paquete(Modulos.SCORING))
                    .should().dependOnClassesThat().resideInAPackage(ESTRATEGIAS)
                    .because("FF-07: el orquestador solo conoce IValidadorCierre y scoring solo ICalculadorPuntos "
                            + "(Sección 1.2)");

    private static DescribedPredicate<JavaClass> implementacionesDeIReglaJuego() {
        return new DescribedPredicate<>("implementaciones concretas de IReglaJuego") {
            @Override
            public boolean test(JavaClass clase) {
                return !clase.isInterface() && clase.isAssignableTo(IReglaJuego.class);
            }
        };
    }
}
