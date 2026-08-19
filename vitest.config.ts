import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: false,
  },
  resolve: {
    alias: {
      '@lib': new URL('./src/lib', import.meta.url).pathname,
    },
  },
});
