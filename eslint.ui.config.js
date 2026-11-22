// Medición INFORMATIVA de complejidad de la interfaz web y de los extras (ADR-14): no bloquea el pipeline.
import tseslint from 'typescript-eslint';

export default [
  { files: ['src/web/**/*.ts', 'src/extras/**/*.ts'], languageOptions: { parser: tseslint.parser }, plugins: { '@typescript-eslint': tseslint.plugin }, rules: { complexity: ['warn', 10] } },
];
