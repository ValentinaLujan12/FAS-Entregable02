/**
 * Reglas de dependencia del Entregable 3: funciones de idoneidad estructurales del Entregable 2 (Anexo E.1) adaptadas a
 * TypeScript (ADR-14). Cada regla indica la función (FF) y la regla de gobernanza (G) que verifica.
 * Matriz de dependencias permitidas (Tabla A.2.1 del Entregable 2):
 *   kernel      -> (ninguno)
 *   rules, deck, player -> kernel
 *   scoring     -> kernel, contrato de rules
 *   estado      -> kernel, contratos de deck y player (estado serializable de la partida, parte del núcleo compartido)
 *   persistence, infra -> kernel, estado
 *   game        -> kernel, estado, infra y SOLO los contratos de rules, deck, player, scoring y persistence
 *   serverless  -> todo (raíz de composición); extras solo desde manejador.ts (ADR-11)
 *   web         -> kernel y extras visuales; nunca el servidor ni el almacenamiento
 */
const CONTRATOS_PARA_GAME = [
  '^src/rules/IReglaJuego\\.ts$',
  '^src/deck/(index|IMazo)\\.ts$',
  '^src/player/(index|IJugadores)\\.ts$',
  '^src/scoring/(index|IServicioPuntaje)\\.ts$',
  '^src/persistence/I[A-Z][^/]*\\.ts$',
];
const ESTRATEGIA = '^src/rules/Regla(?!Base)[^/]*\\.ts$';

module.exports = {
  forbidden: [
    {
      name: 'sin-ciclos',
      comment: 'FF-05 (G4): ninguna dependencia circular entre archivos.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'kernel-no-depende-de-modulos',
      comment: 'FF-01 (G4): el núcleo compartido (kernel) es estable y no depende de ningún módulo.',
      severity: 'error',
      from: { path: '^src/kernel/' },
      to: { path: '^src/', pathNot: '^src/kernel/' },
    },
    {
      name: 'rules-deck-player-solo-kernel',
      comment: 'FF-01 (G4): rules, deck y player dependen únicamente del kernel.',
      severity: 'error',
      from: { path: '^src/(rules|deck|player)/' },
      to: { path: '^src/', pathNot: ['^src/kernel/', '^src/$1/'] },
    },
    {
      name: 'scoring-solo-contrato-de-rules',
      comment: 'FF-02 (G4): scoring depende del kernel y solo del contrato ICalculadorPuntos de rules.',
      severity: 'error',
      from: { path: '^src/scoring/' },
      to: { path: '^src/', pathNot: ['^src/(kernel|scoring)/', '^src/rules/IReglaJuego\\.ts$'] },
    },
    {
      name: 'estado-solo-contratos',
      comment: 'FF-03 (G4): el estado serializable usa solo el kernel y los contratos de deck y player.',
      severity: 'error',
      from: { path: '^src/estado/' },
      to: { path: '^src/', pathNot: ['^src/(kernel|estado)/', '^src/deck/IMazo\\.ts$', '^src/player/IJugadores\\.ts$'] },
    },
    {
      name: 'persistence-e-infra-solo-kernel-y-estado',
      comment: 'FF-03 (G1, G4): los adaptadores de persistencia e infraestructura no dependen de game ni de serverless.',
      severity: 'error',
      from: { path: '^src/(persistence|infra)/' },
      to: { path: '^src/', pathNot: ['^src/(kernel|estado)/', '^src/$1/', '^src/player/IJugadores\\.ts$'] },
    },
    {
      name: 'game-usa-solo-contratos',
      comment: 'FF-04 (G4, ADR-05): el orquestador usa rules, deck, player, scoring y persistence solo por sus interfaces.',
      severity: 'error',
      from: { path: '^src/game/' },
      to: { path: '^src/(rules|deck|player|scoring|persistence)/', pathNot: CONTRATOS_PARA_GAME },
    },
    {
      name: 'reglas-deck-scoring-persistence-no-dependen-de-game',
      comment: 'G2: el motor de reglas, el mazo, la puntuación y la persistencia no dependen del orquestador.',
      severity: 'error',
      from: { path: '^src/(rules|deck|player|scoring|persistence|infra|estado)/' },
      to: { path: '^src/game/' },
    },
    {
      name: 'estrategias-aisladas',
      comment: 'FF-07 (G2): una estrategia de modalidad no depende de otra.',
      severity: 'error',
      from: { path: ESTRATEGIA },
      to: { path: ESTRATEGIA },
    },
    {
      name: 'solo-el-registro-conoce-estrategias',
      comment: 'FF-09 (G2, ADR-08): solo RegistroReglas referencia las estrategias concretas.',
      severity: 'error',
      from: { pathNot: '^src/rules/(RegistroReglas|Regla[^/]*)\\.ts$' },
      to: { path: ESTRATEGIA },
    },
    {
      name: 'base-de-datos-solo-desde-persistence',
      comment: 'FF-06 / FF-27 (G1): solo los adaptadores de persistence usan el cliente de la base de datos.',
      severity: 'error',
      from: { pathNot: '^src/persistence/' },
      to: { path: 'node_modules/@supabase/supabase-js/' },
    },
    {
      name: 'web-aislada-del-servidor',
      comment: 'FF-06 (G1): la interfaz de usuario no alcanza, ni de forma transitiva, el servidor ni el almacenamiento de partidas.',
      severity: 'error',
      from: { path: '^src/web/' },
      to: { path: '^src/(game|serverless|persistence|rules|scoring|deck|player|infra|estado)/', reachable: true },
    },
    {
      name: 'dominio-sin-brokers-ni-buses',
      comment: 'FF-08 (G5, ADR-05): sin buses de eventos ni brokers de mensajería en el dominio; la coordinación es síncrona.',
      severity: 'error',
      from: { path: '^src/(kernel|estado|rules|deck|player|scoring|game)/' },
      to: { path: ['^(node:)?events$', 'node_modules/(kafkajs|amqplib|bullmq|ioredis|redis|eventemitter[23]?|rxjs|nats|mqtt|@supabase)/'] },
    },
    {
      name: 'nucleo-no-depende-de-extras',
      comment: 'ADR-11: kernel, estado, rules, deck, player, scoring, persistence, game e infra no conocen los extras.',
      severity: 'error',
      from: { path: '^src/(kernel|estado|rules|deck|player|scoring|persistence|game|infra)/' },
      to: { path: '^src/extras/' },
    },
    {
      name: 'serverless-solo-compone-extras-en-manejador',
      comment: 'ADR-11: el procesador recibe los extras por inyección; solo el manejador (composición) importa extras/composicion.',
      severity: 'error',
      from: { path: '^src/serverless/', pathNot: '^src/serverless/manejador\\.ts$' },
      to: { path: '^src/extras/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    exclude: { path: '^(tests|tools|public|docs)/' },
  },
};
