# FAS-Entregable02

Repositorio de código y modelos del **Entregable 2** de *Fundamentos de Arquitectura de Software* (UNAL, sede Medellín):
**Sistema Digital de Juego de Cartas "El Apuntado"** (variante Clásica 4-3-3 y variante Apuntado a 101).

Contiene lo que pide la guía (sección 7, pautas de entrega):

| Pauta | Dónde |
|---|---|
| 1. Archivos de modelo editables | `docs/estilo_arquitectonico/` (Figura 1.3.1), `docs/arquitectura_informacion/` (Figuras 2.2.1, 2.2.2 y 2.3.1) y el esquema SQL en `src/main/resources/db/migration/` |
| 2. ADRs 01 a 05 en `.md` | `docs/adrs/` |
| 3. Fitness functions ejecutables | `tests/architecture/` |

Además: análisis de riesgo (`docs/riesgos/`), catálogo de gobernanza (`docs/gobernanza/`) y el esqueleto Java del Monolito Modular que analizan las pruebas.

## Cómo ejecutar las fitness functions

Requisitos: **Java 17+** y **Maven 3.9+**.

```bash
mvn verify
```

`mvn verify` compila, corre todas las clases `*FitnessTest` de `tests/architecture/`, revisa la complejidad ciclomática con Checkstyle y verifica la cobertura con JaCoCo. **Si alguna regla se viola, el build falla.** GitHub Actions hace lo mismo en cada push y pull request (`.github/workflows/fitness-functions.yml`) y publica los reportes:

- `target/surefire-reports/`: resultado de cada fitness function.
- `target/site/jacoco/index.html`: cobertura.
- `target/checkstyle-result.xml`: complejidad ciclomática.

Desde el IDE (IntelliJ, VS Code o Eclipse) basta abrir el proyecto como proyecto Maven y ejecutar las pruebas de `tests/architecture`.

## Estructura

```
|-- pom.xml                                  Java 17 - JUnit 5 - ArchUnit 1.3 - Checkstyle 10 - JaCoCo
|-- .github/workflows/fitness-functions.yml  CI
|-- config/checkstyle/checkstyle.xml         CC ≤ 10 en todo el código (FF-10)
|-- config/checkstyle/checkstyle-evaluadores.xml  CC < 5 en los evaluadores de rules (FF-10)
|-- docs/
|   |-- adrs/                                ADR-01 a ADR-05
|   |-- estilo_arquitectonico/               Figura 1.3.1 (.drawio)
|   |-- arquitectura_informacion/            Figuras 2.2.1, 2.2.2 y 2.3.1 (.drawio)
|   |-- riesgos/risk-storming.md             Sección 4
|   |-- gobernanza/fitness-functions.md      Sección 5
|-- src/main/java/co/edu/unal/apuntado/
|   |-- kernel/        Shared Kernel: Carta, Mano, ParametrosModalidad, snapshots...
|   |-- game/          lobby (LobbyManagerComponent) y turn (TurnOrchestratorComponent, mediador)
|   |-- deck/          DeckManagementComponent
|   |-- player/        PlayerRegistryComponent
|   |-- rules/         MotorReglas, RegistroReglas
|   |   |-- strategy/  IReglaJuego, BuscadorCombinaciones, CatalogoEstrategias
|   |       |-- clasica/   ReglaClasicaCuartaTerna
|   |       |-- apuntado/  ReglaApuntado101Puntos
|   |-- scoring/       RoundScoringComponent
|   |-- persistence/   StateRepositoryComponent (JDBC/PostgreSQL) y entity/ (clases de entidad)
|   |-- infra/         GatewayTiempoReal, TemporizadorTurno, ProyectorVistaJugador
|-- src/main/resources/db/migration/
|   |-- V1__esquema.sql          tablas, CHECK, ux_cierre_valido, triggers y vistas (Sección 2)
|   |-- V2__datos_semilla.sql    modalidades y las 52 cartas
|-- tests/architecture/co/edu/unal/apuntado/
    |-- architecture/estaticas/  ArchUnit (G1, G2, G4, G5), distancia a la secuencia principal (FF-30),
    |                            Checkstyle (G3) y calidad de las pruebas (FF-31)
    |-- architecture/dinamicas/  JUnit 5 (G5 a G8), con dobles de prueba en dobles/
    |-- rules/strategy/prueba/   ReglaPrueba: modalidad que solo existe en las pruebas (FF-11)
```

## Fitness functions

| Regla | Fitness functions | Clase de prueba |
|---|---|---|
| G1 Aislamiento de capas/módulos | G1, FF-06, FF-27 | `AislamientoPersistenciaFitnessTest` |
| G2 Independencia de las reglas de juego | FF-07, FF-09 | `IndependenciaReglasFitnessTest` |
| G3 Complejidad ciclomática: ≤ 10 en todo el código, < 5 en los evaluadores | FF-10 | `ComplejidadCiclomaticaFitnessTest` + `maven-checkstyle-plugin` |
| G4 Dependencias dirigidas, sin ciclos y D ≤ 0,5 | FF-01 a FF-05, FF-30 | `ReglasDeDependenciaFitnessTest`, `DistanciaSecuenciaPrincipalFitnessTest` |
| G5 Comunicación síncrona por mediador | FF-08, FF-23, FF-24, FF-25 | `ComunicacionSincronaFitnessTest`, `OrdenNotificacionFitnessTest`, `SerializacionPorPartidaFitnessTest` |
| G6 Extensibilidad por contrato | FF-11 a FF-14 | `ExtensibilidadReglasFitnessTest`, `Regla*ContratoFitnessTest`, `ConsistenciaModalidadesFitnessTest`, `AislamientoEntreModalidadesFitnessTest` |
| G7 Calidad medible | FF-15, FF-16, FF-31 | JaCoCo (`pom.xml`), `LatenciaEvaluacionFitnessTest` (p99 y peor caso), `CalidadDePruebasFitnessTest` |
| G8 Integridad del cierre | FF-20 (en memoria) | `ConsistenciaPuntajeFitnessTest` |
| Riesgo R7 (privacidad) | FF-28 | `PrivacidadVistaJugadorFitnessTest` |
| Riesgo R15 (identidad) | FF-29 | Especificada para el Entregable 3 |

FF-17 a FF-19, FF-21, FF-22 (sobre PostgreSQL real con Testcontainers), FF-26 (AsyncAPI), FF-29 (identidad por conexión) y FF-32 (monitor de producción) quedan especificadas para el Entregable 3. El catálogo completo está en `docs/gobernanza/fitness-functions.md`.

## Agregar una modalidad (ADR-03)

1. Crear una clase en un subpaquete nuevo de `co.edu.unal.apuntado.rules.strategy` que implemente `IReglaJuego`, sea pública y tenga constructor sin argumentos.
2. Agregar su fila en `modalidad` con una migración nueva (`V3__modalidad_xxx.sql`).
3. Escribir su prueba extendiendo `ContratoReglaJuego` (suite de contrato común) con sus casos propios.
4. `mvn verify`.

`CatalogoEstrategias` la descubre sola; no se modifica `MotorReglas`, `RegistroReglas`, `game`, `scoring` ni `persistence`. Si falta la fila o la estrategia, FF-13 falla.

## Notas de implementación

- El esqueleto implementa las interfaces de la Tabla 1.3.1 y la Figura 1.3.1, en particular:
  - `IComandosJuego.iniciar`.
  - `game` usa `ICalculadorPuntos.parametrosModalidad`.
  - Un subpaquete por estrategia.
  - `registrarPenalizacion` es la transacción completa de cierre de la Sección 2.4.
- `EventoJuego` incluye además el id de la partida, para enrutar la notificación.
- Los palos se guardan como `PICA`, `CORAZON`, `DIAMANTE` y `TREBOL` (caben en `carta.palo VARCHAR(8)`); el código de carta es valor + inicial del palo (`AP`, `10C`, `KT`).
- Supuestos de las reglas: GRUPO = 3 o 4 cartas del mismo valor; ESCALERA = 3 o más consecutivas del mismo palo, con el As solo como carta baja.
- Pendiente para el Entregable 3:
  - Alta de partidas y jugadores en la base de datos, y persistencia de manos (`ronda_carta`).
  - Protocolo JSON/AsyncAPI del gateway.
  - Inyección de dependencias de producción.
