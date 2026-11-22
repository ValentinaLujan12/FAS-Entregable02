// Gobernanza de complejidad ciclomática (regla G3 y FF-10 del Entregable 2, adaptadas a TypeScript; ADR-14).
// Núcleo (todo src/ y api/ salvo la interfaz web y los extras): CC <= 10; evaluadores de src/rules: CC <= 4.
// Es BLOQUEANTE en CI (npm run cc). La interfaz web y los extras se miden aparte, de forma informativa
// (npm run cc:ui, eslint.ui.config.js): no forman parte del núcleo arquitectónico (ADR-11, ADR-14).
import tseslint from 'typescript-eslint';

const base = { languageOptions: { parser: tseslint.parser }, plugins: { '@typescript-eslint': tseslint.plugin } };

export default [
  { ignores: ['src/web/**', 'src/extras/**'] },
  { ...base, files: ['src/**/*.ts', 'api/**/*.ts'], rules: { complexity: ['error', 10] } },
  { ...base, files: ['src/rules/**/*.ts'], rules: { complexity: ['error', 4] } },
];
