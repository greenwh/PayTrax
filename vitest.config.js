import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Browser mode for IndexedDB and DOM APIs
    browser: {
      enabled: true,
      name: 'chromium',
      provider: 'playwright',
      headless: true,
    },

    // Test setup file
    setupFiles: ['./tests/setup.js'],

    // Test file patterns
    include: ['tests/**/*.test.js'],

    // Coverage configuration
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'html', 'lcov'],

      // Include only source files
      include: ['js/*.js'],

      // Exclude entry points and service worker (hard to test)
      exclude: [
        'js/main.js',
        'sw.js',
        'node_modules/**',
        'tests/**'
      ],

      // Coverage thresholds
      // Note: UI modules (ui.js, banking.js, pdf-export.js) require E2E testing
      // These thresholds reflect what's achievable with unit/integration tests
      thresholds: {
        lines: 20,
        functions: 20,
        branches: 25,
        statements: 20,

        // Critical business logic - must maintain higher coverage
        'js/logic.js': {
          lines: 44,
          functions: 48,
          branches: 40,
          statements: 44
        }
      }
    },

    // Test timeout (browser tests can be slower)
    testTimeout: 10000,

    // Allow concurrent tests for speed
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false
      }
    }
  }
});
