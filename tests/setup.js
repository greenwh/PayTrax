import { beforeEach, afterEach } from 'vitest';

/**
 * Global test setup for PayTrax tests
 * Runs before/after each test to ensure clean state
 */

// Clean up storage before each test
beforeEach(async () => {
  // Clear IndexedDB databases
  if (typeof indexedDB !== 'undefined') {
    const databases = await indexedDB.databases();
    for (const db of databases) {
      indexedDB.deleteDatabase(db.name);
    }
  }

  // Clear localStorage
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }

  // Clear sessionStorage
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.clear();
  }
});

// Suppress console errors during tests (optional - remove if you want to see errors)
// Uncomment if tests produce too much noise
// const originalError = console.error;
// beforeEach(() => {
//   console.error = (...args) => {
//     // Only suppress expected errors
//     if (typeof args[0] === 'string' && args[0].includes('Failed to save data')) {
//       return;
//     }
//     originalError(...args);
//   };
// });
//
// afterEach(() => {
//   console.error = originalError;
// });
