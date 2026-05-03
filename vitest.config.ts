import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['lib/**/*.test.ts', 'lib/**/__tests__/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    // Tests purs — pas de besoin de setup DB / Redis
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
