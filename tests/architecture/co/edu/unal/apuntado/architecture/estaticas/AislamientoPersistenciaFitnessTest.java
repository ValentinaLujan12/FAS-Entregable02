package co.edu.unal.apuntado.architecture.estaticas;

import static co.edu.unal.apuntado.architecture.estaticas.Modulos.INFRA;
import static co.edu.unal.apuntado.architecture.estaticas.Modulos.PERSISTENCE;
import static co.edu.unal.apuntado.architecture.estaticas.Modulos.paquete;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

/**
 * Regla de gobernanza G1 - Aislamiento de capas/módulos (guía, Sección 5.1; Sección 2.1, 2.3; ADR-04).
 * La presentación (cliente Web/Móvil, que entra por infra) no accede a la persistencia sin pasar por el
 * orquestador; las entidades y el acceso JDBC/ORM no salen de persistence.
 */
@AnalyzeClasses(packages = Modulos.BASE, importOptions = ImportOption.DoNotIncludeTests.class)
class AislamientoPersistenciaFitnessTest {

    @ArchTest
    static final ArchRule g1_presentacion_no_accede_a_persistencia =
            noClasses().that().resideInAPackage(paquete(INFRA))
                    .should().dependOnClassesThat().resideInAPackage(paquete(PERSISTENCE))
                    .because("G1: la capa de entrada (gateway del cliente) no accede a la persistencia sin pasar "
                            + "por el orquestador");

    @ArchTest
    static final ArchRule ff06_solo_persistence_usa_jdbc_u_orm =
            noClasses().that().resideOutsideOfPackage(paquete(PERSISTENCE))
                    .should().dependOnClassesThat().resideInAnyPackage(
                            "java.sql..", "javax.sql..", "jakarta.persistence..", "javax.persistence..",
                            "org.hibernate..")
                    .because("FF-06: solo persistence abre conexiones y toca el esquema (Sección 2.1, ADR-04)");

    @ArchTest
    static final ArchRule ff27_entidades_no_salen_de_persistence =
            noClasses().that().resideOutsideOfPackage(paquete(PERSISTENCE))
                    .should().dependOnClassesThat().resideInAPackage(Modulos.BASE + ".persistence.entity..")
                    .because("FF-27: las entidades no salen de persistence; los demás módulos solo ven los "
                            + "snapshots del kernel (Sección 2.3)");
}
