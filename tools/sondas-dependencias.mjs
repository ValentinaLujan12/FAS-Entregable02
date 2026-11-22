/**
 * Prueba de las reglas de dependencias (ADR-14): escribe archivos "sonda" que violan a propósito cada regla de
 * .dependency-cruiser.cjs, ejecuta dependency-cruiser y exige que CADA regla detecte su sonda. Al terminar borra las
 * sondas (también si algo falla). Así una regla mal escrita (que nunca dispara) hace fallar el pipeline.
 *   npm run deps:sondas
 */
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const bin = join(raiz, 'node_modules', '.bin', process.platform === 'win32' ? 'depcruise.cmd' : 'depcruise');

/** archivo -> [contenido, reglas que debe disparar] */
const SONDAS = {
  'src/kernel/__sonda_kernel.ts': ["import { abrirMazo } from '../deck/index.js';\nexport const s = abrirMazo;\n", ['kernel-no-depende-de-modulos']],
  'src/deck/__sonda_deck.ts': ["import type { Sala } from '../estado/tipos.js';\nexport type S = Sala;\n", ['rules-deck-player-solo-kernel']],
  'src/scoring/__sonda_scoring.ts': ["import { HandEvaluator } from '../rules/HandEvaluator.js';\nexport const s = HandEvaluator;\n", ['scoring-solo-contrato-de-rules']],
  'src/estado/__sonda_estado.ts': ["import { DeckManagement } from '../deck/DeckManagement.js';\nexport const s = DeckManagement;\n", ['estado-solo-contratos']],
  'src/infra/__sonda_infra.ts': ["import { createClient } from '@supabase/supabase-js';\nimport { PartidaEnCurso } from '../game/PartidaEnCurso.js';\nexport const s = [createClient, PartidaEnCurso];\n", ['persistence-e-infra-solo-kernel-y-estado', 'reglas-deck-scoring-persistence-no-dependen-de-game', 'base-de-datos-solo-desde-persistence']],
  'src/game/__sonda_game.ts': ["import { EventEmitter } from 'node:events';\nimport { RoundScoring } from '../scoring/RoundScoring.js';\nimport { extrasPorDefecto } from '../extras/composicion.js';\nexport const s = [EventEmitter, RoundScoring, extrasPorDefecto];\n", ['dominio-sin-brokers-ni-buses', 'game-usa-solo-contratos', 'nucleo-no-depende-de-extras']],
  'src/rules/ReglaSonda.ts': ["import { ReglaClasicaCuartaTerna } from './ReglaClasicaCuartaTerna.js';\nexport const s = ReglaClasicaCuartaTerna;\n", ['estrategias-aisladas']],
  'src/serverless/__sonda_serverless.ts': ["import { ReglaApuntado101Puntos } from '../rules/ReglaApuntado101Puntos.js';\nimport { extrasPorDefecto } from '../extras/composicion.js';\nexport const s = [ReglaApuntado101Puntos, extrasPorDefecto];\n", ['solo-el-registro-conoce-estrategias', 'serverless-solo-compone-extras-en-manejador']],
  'src/web/__sonda_web.ts': ["import { s } from '../serverless/__sonda_serverless.js';\nexport const w = s;\n", ['web-aislada-del-servidor']],
  'src/player/__sonda_ciclo_a.ts': ["import { b } from './__sonda_ciclo_b.js';\nexport const a = () => b;\n", ['sin-ciclos']],
  'src/player/__sonda_ciclo_b.ts': ["import { a } from './__sonda_ciclo_a.js';\nexport const b = () => a;\n", []],
};

const archivos = Object.keys(SONDAS);
let fallos = 0;
try {
  for (const [archivo, [contenido]] of Object.entries(SONDAS)) writeFileSync(join(raiz, archivo), contenido);
  let salida;
  try {
    salida = execFileSync(bin, ['src', '--config', '.dependency-cruiser.cjs', '--output-type', 'json'], { cwd: raiz, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' });
  } catch (e) {
    salida = e.stdout; // depcruise termina con código distinto de 0 cuando hay violaciones (es lo esperado)
  }
  const violaciones = JSON.parse(salida).summary.violations;
  const reglasDe = (archivo) => new Set(violaciones.filter((v) => v.from === archivo).map((v) => v.rule.name));
  const reglasConfig = new Set(require_reglas());
  const disparadas = new Set();
  for (const [archivo, [, esperadas]] of Object.entries(SONDAS)) {
    const reales = reglasDe(archivo);
    for (const r of esperadas) {
      disparadas.add(r);
      if (!reales.has(r)) {
        fallos++;
        console.error(`FALLA: la regla "${r}" no detectó la sonda ${archivo}`);
      }
    }
  }
  for (const r of reglasConfig) {
    if (!disparadas.has(r)) {
      fallos++;
      console.error(`FALLA: la regla "${r}" no tiene sonda que la pruebe`);
    }
  }
  console.log(fallos ? `\nSondas de dependencias: ${fallos} fallo(s)` : `Sondas de dependencias OK: las ${reglasConfig.size} reglas detectan su violación`);
} finally {
  for (const a of archivos) rmSync(join(raiz, a), { force: true });
}
process.exit(fallos ? 1 : 0);

function require_reglas() {
  const src = execFileSync(process.execPath, ['-e', "console.log(JSON.stringify(require('./.dependency-cruiser.cjs').forbidden.map((r) => r.name)))"], { cwd: raiz, encoding: 'utf8' });
  return JSON.parse(src);
}
