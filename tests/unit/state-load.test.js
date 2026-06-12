import { describe, it, expect, beforeEach } from 'vitest';
import { loadData, appData, defaultAppData } from '../../js/state.js';

/**
 * Startup resilience (audit F8).
 *
 * Corrupt localStorage must never brick startup: loadData() must resolve and
 * fall back to defaults instead of throwing on JSON.parse.
 */
describe('loadData() startup resilience', () => {
  // tests/setup.js clears IndexedDB and localStorage before each test,
  // so only what each test seeds is present.

  it('falls back to defaults when localStorage data is corrupt', async () => {
    localStorage.setItem('PayTraxData', '{not json');

    await expect(loadData()).resolves.not.toThrow();

    // App must come up with usable default state
    expect(Array.isArray(appData.employees)).toBe(true);
    expect(appData.employees).toHaveLength(0);
    expect(appData.settings).toBeDefined();
    expect(appData.settings.companyName).toBe(defaultAppData.settings.companyName);
  });

  it('loads valid localStorage data normally', async () => {
    const valid = JSON.parse(JSON.stringify(defaultAppData));
    valid.settings.companyName = 'Loaded From LocalStorage';
    localStorage.setItem('PayTraxData', JSON.stringify(valid));

    await loadData();

    expect(appData.settings.companyName).toBe('Loaded From LocalStorage');
  });
});
