import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // FF-15 (guia del Entregable 2, G7): cobertura >= 95 % en reglas y puntuacion.
      thresholds: {
        'src/rules/**': { lines: 95 },
        'src/scoring/**': { lines: 95 },
      },
    },
  },
});
