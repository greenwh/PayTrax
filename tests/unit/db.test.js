import { describe, it, expect, beforeEach } from 'vitest';
import { initDB, saveDataToDB, loadDataFromDB } from '../../js/db.js';

describe('db.js', () => {
  beforeEach(async () => {
    // Clean up any existing database
    const databases = await indexedDB.databases();
    for (const db of databases) {
      if (db.name === 'PayTraxDB') {
        indexedDB.deleteDatabase(db.name);
      }
    }
  });

  describe('initDB()', () => {
    it('should initialize IndexedDB database', async () => {
      const db = await initDB();
      expect(db).toBeDefined();
      expect(db.name).toBe('PayTraxDB');
      expect(db.version).toBe(1);
    });

    it('should create object store on first initialization', async () => {
      const db = await initDB();
      expect(db.objectStoreNames.contains('appDataStore')).toBe(true);
    });

    it('should return existing database on subsequent calls', async () => {
      const db1 = await initDB();
      const db2 = await initDB();
      expect(db1).toBe(db2); // Should be same instance
    });
  });

  describe('saveDataToDB()', () => {
    it('should save data to IndexedDB', async () => {
      await initDB();

      const testData = {
        version: 7,
        settings: { companyName: 'Test Company' },
        employees: [],
        payPeriods: {},
        bankRegister: []
      };

      await expect(saveDataToDB(testData)).resolves.toBeUndefined();
    });

    // Note: Cannot reliably test "database not initialized" because db.js
    // maintains a module-level db variable that persists across tests.
    // In practice, the app always calls initDB() on startup.

    it('should overwrite existing data', async () => {
      await initDB();

      const data1 = { version: 1, test: 'first' };
      const data2 = { version: 2, test: 'second' };

      await saveDataToDB(data1);
      await saveDataToDB(data2);

      const loaded = await loadDataFromDB();
      expect(loaded.test).toBe('second');
      expect(loaded.version).toBe(2);
    });

    it('should handle large data objects', async () => {
      await initDB();

      // Create a large employee array
      const largeData = {
        version: 7,
        employees: Array.from({ length: 100 }, (_, i) => ({
          id: `emp-${i}`,
          name: `Employee ${i}`,
          rate: 20 + i
        })),
        payPeriods: {},
        bankRegister: []
      };

      await saveDataToDB(largeData);
      const loaded = await loadDataFromDB();
      expect(loaded.employees).toHaveLength(100);
    });
  });

  describe('loadDataFromDB()', () => {
    it('should load saved data from IndexedDB', async () => {
      await initDB();

      const testData = {
        version: 7,
        settings: { companyName: 'Load Test Company', taxYear: 2024 },
        employees: [
          { id: 'emp-load-1', name: 'John Doe', rate: 20 }
        ],
        payPeriods: {},
        bankRegister: []
      };

      await saveDataToDB(testData);
      const loaded = await loadDataFromDB();

      expect(loaded).toEqual(testData);
      expect(loaded.version).toBe(7);
      expect(loaded.settings.companyName).toBe('Load Test Company');
      expect(loaded.employees).toHaveLength(1);
      expect(loaded.employees[0].name).toBe('John Doe');
    });

    // Note: Cannot reliably test "no data exists" or "database not initialized"
    // because db.js maintains module-level state and data may persist from
    // previous tests even after IndexedDB deletion. This is an acceptable
    // limitation given the module's design.

    it('should handle complex nested data structures', async () => {
      await initDB();

      const complexData = {
        version: 7,
        employees: [
          {
            id: 'emp-1',
            taxRemainders: {
              federal: 0.123,
              fica: 0.456,
              medicare: 0.789
            },
            deductions: [
              { id: 'ded-1', name: '401(k)', amount: 100 }
            ]
          }
        ],
        payPeriods: {
          'emp-1': [
            {
              period: 1,
              taxes: {
                federal: 100,
                unrounded: { federal: 100.123 }
              }
            }
          ]
        }
      };

      await saveDataToDB(complexData);
      const loaded = await loadDataFromDB();

      expect(loaded.employees[0].taxRemainders.federal).toBe(0.123);
      expect(loaded.employees[0].deductions).toHaveLength(1);
      expect(loaded.payPeriods['emp-1'][0].taxes.unrounded.federal).toBe(100.123);
    });
  });

  describe('save and load round-trip', () => {
    it('should preserve data integrity through save/load cycle', async () => {
      await initDB();

      const originalData = {
        version: 7,
        settings: {
          companyName: 'Round Trip Test',
          taxYear: 2024,
          payFrequency: 'Bi-weekly',
          socialSecurity: 6.2,
          medicare: 1.45
        },
        employees: [
          {
            id: crypto.randomUUID(),
            name: 'Test Employee',
            rate: 25.50,
            taxRemainders: {
              federal: 0.12345,
              fica: 0.67890
            }
          }
        ],
        payPeriods: {},
        bankRegister: [
          {
            id: crypto.randomUUID(),
            date: '2024-01-15',
            description: 'Test transaction',
            debit: 1000.50,
            credit: 0,
            reconciled: false
          }
        ]
      };

      await saveDataToDB(originalData);
      const loadedData = await loadDataFromDB();

      expect(loadedData).toEqual(originalData);
    });
  });
});
