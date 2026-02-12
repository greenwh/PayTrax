import { describe, it, expect } from 'vitest';
import { migrateData } from '../../js/migration.js';
import testDataV1 from '../fixtures/test-data-v1.json';
import testDataV6 from '../fixtures/test-data-v6.json';

describe('migration.js', () => {
  describe('migrateData() - Full Migration Chain', () => {
    it('should migrate v1 data to v8', () => {
      // Create a deep copy to avoid mutating the fixture
      const v1Data = JSON.parse(JSON.stringify(testDataV1));

      // Migrate from v1 to v7
      const migrated = migrateData(v1Data);

      // Should be at v8
      expect(migrated.version).toBe(8);

      // v2 additions
      expect(migrated.settings.employeeIdPrefix).toBeDefined();
      expect(migrated.settings.ptoCarryOverLimit).toBeDefined();

      // v3 additions - taxRemainders
      expect(migrated.employees[0].taxRemainders).toBeDefined();
      expect(migrated.employees[0].taxRemainders).toHaveProperty('federal');
      expect(migrated.employees[0].taxRemainders).toHaveProperty('fica');
      expect(migrated.employees[0].taxRemainders).toHaveProperty('medicare');
      expect(migrated.employees[0].taxRemainders).toHaveProperty('state');
      expect(migrated.employees[0].taxRemainders).toHaveProperty('local');
      expect(migrated.employees[0].taxRemainders).toHaveProperty('suta');
      expect(migrated.employees[0].taxRemainders).toHaveProperty('futa');

      // v4 additions - reconciled
      expect(migrated.bankRegister[0].reconciled).toBeDefined();
      expect(typeof migrated.bankRegister[0].reconciled).toBe('boolean');

      // v5 additions - deductions and configurable tax settings
      expect(migrated.employees[0].deductions).toBeDefined();
      expect(Array.isArray(migrated.employees[0].deductions)).toBe(true);
      expect(migrated.settings.ssWageBase).toBe(168600);
      expect(migrated.settings.futaWageBase).toBe(7000);
      expect(migrated.settings.additionalMedicareThreshold).toBe(200000);
      expect(migrated.settings.additionalMedicareRate).toBe(0.9);

      // v7 additions - autoSubtraction
      expect(migrated.settings.autoSubtraction).toBe(true);

      // v8 additions - sutaWageBase
      expect(migrated.settings.sutaWageBase).toBe(25000);
    });

    it('should migrate v6 data to v8', () => {
      const v6Data = JSON.parse(JSON.stringify(testDataV6));

      // Migrate from v6 to v8
      const migrated = migrateData(v6Data);

      // Should be at v8
      expect(migrated.version).toBe(8);

      // v7 additions - autoSubtraction
      expect(migrated.settings.autoSubtraction).toBe(true);

      // Verify v6 deductions have createdDate added
      expect(migrated.employees[0].deductions).toHaveLength(2);
      expect(migrated.employees[0].deductions[0].createdDate).toBe('2000-01-01');
      expect(migrated.employees[0].deductions[1].createdDate).toBe('2000-01-01');
    });

    it('should migrate v7 data to v8 adding sutaWageBase', () => {
      const v7Data = {
        version: 7,
        settings: { companyName: 'Test', autoSubtraction: false },
        employees: [],
        payPeriods: {},
        bankRegister: []
      };

      const migrated = migrateData(JSON.parse(JSON.stringify(v7Data)));

      expect(migrated.version).toBe(8);
      expect(migrated.settings.autoSubtraction).toBe(false); // Should not be changed
      expect(migrated.settings.sutaWageBase).toBe(25000); // v8 addition
    });

    it('should not modify data already at v8', () => {
      const v8Data = {
        version: 8,
        settings: { companyName: 'Test', autoSubtraction: false, sutaWageBase: 30000 },
        employees: [],
        payPeriods: {},
        bankRegister: []
      };

      const migrated = migrateData(JSON.parse(JSON.stringify(v8Data)));

      expect(migrated.version).toBe(8);
      expect(migrated.settings.sutaWageBase).toBe(30000); // Should not be changed
    });
  });

  describe('Migration v1 → v2', () => {
    it('should add employeeIdPrefix to settings', () => {
      const v1Data = {
        version: 1,
        settings: { companyName: 'Test' },
        employees: [],
        payPeriods: {},
        bankRegister: []
      };

      const migrated = migrateData(v1Data);

      expect(migrated.settings.employeeIdPrefix).toBe('emp_');
    });

    it('should add ptoCarryOverLimit to settings', () => {
      const v1Data = {
        version: 1,
        settings: { companyName: 'Test' },
        employees: [],
        payPeriods: {},
        bankRegister: []
      };

      const migrated = migrateData(v1Data);

      expect(migrated.settings.ptoCarryOverLimit).toBe(40);
    });

    it('should not overwrite existing values', () => {
      const v1Data = {
        version: 1,
        settings: {
          companyName: 'Test',
          employeeIdPrefix: 'custom_',
          ptoCarryOverLimit: 80
        },
        employees: [],
        payPeriods: {},
        bankRegister: []
      };

      const migrated = migrateData(v1Data);

      expect(migrated.settings.employeeIdPrefix).toBe('custom_');
      expect(migrated.settings.ptoCarryOverLimit).toBe(80);
    });
  });

  describe('Migration v2 → v3', () => {
    it('should add taxRemainders to all employees', () => {
      const v2Data = {
        version: 2,
        settings: { companyName: 'Test' },
        employees: [
          { id: 'emp-1', name: 'John' },
          { id: 'emp-2', name: 'Jane' }
        ],
        payPeriods: {},
        bankRegister: []
      };

      const migrated = migrateData(v2Data);

      expect(migrated.employees[0].taxRemainders).toEqual({
        federal: 0,
        fica: 0,
        medicare: 0,
        state: 0,
        local: 0,
        suta: 0,
        futa: 0
      });

      expect(migrated.employees[1].taxRemainders).toEqual({
        federal: 0,
        fica: 0,
        medicare: 0,
        state: 0,
        local: 0,
        suta: 0,
        futa: 0
      });
    });

    it('should not overwrite existing taxRemainders', () => {
      const v2Data = {
        version: 2,
        settings: { companyName: 'Test' },
        employees: [
          {
            id: 'emp-1',
            name: 'John',
            taxRemainders: { federal: 0.123, fica: 0.456 }
          }
        ],
        payPeriods: {},
        bankRegister: []
      };

      const migrated = migrateData(v2Data);

      expect(migrated.employees[0].taxRemainders.federal).toBe(0.123);
      expect(migrated.employees[0].taxRemainders.fica).toBe(0.456);
    });
  });

  describe('Migration v3 → v4', () => {
    it('should add reconciled field to all bank transactions', () => {
      const v3Data = {
        version: 3,
        settings: { companyName: 'Test' },
        employees: [],
        payPeriods: {},
        bankRegister: [
          { id: 'txn-1', description: 'Transaction 1' },
          { id: 'txn-2', description: 'Transaction 2' }
        ]
      };

      const migrated = migrateData(v3Data);

      expect(migrated.bankRegister[0].reconciled).toBe(false);
      expect(migrated.bankRegister[1].reconciled).toBe(false);
    });

    it('should not overwrite existing reconciled values', () => {
      const v3Data = {
        version: 3,
        settings: { companyName: 'Test' },
        employees: [],
        payPeriods: {},
        bankRegister: [
          { id: 'txn-1', description: 'Transaction 1', reconciled: true }
        ]
      };

      const migrated = migrateData(v3Data);

      expect(migrated.bankRegister[0].reconciled).toBe(true);
    });
  });

  describe('Migration v4 → v5', () => {
    it('should add deductions array to all employees', () => {
      const v4Data = {
        version: 4,
        settings: { companyName: 'Test' },
        employees: [
          { id: 'emp-1', name: 'John' },
          { id: 'emp-2', name: 'Jane' }
        ],
        payPeriods: {},
        bankRegister: []
      };

      const migrated = migrateData(v4Data);

      expect(migrated.employees[0].deductions).toEqual([]);
      expect(migrated.employees[1].deductions).toEqual([]);
    });

    it('should add configurable tax settings', () => {
      const v4Data = {
        version: 4,
        settings: { companyName: 'Test' },
        employees: [],
        payPeriods: {},
        bankRegister: []
      };

      const migrated = migrateData(v4Data);

      expect(migrated.settings.ssWageBase).toBe(168600);
      expect(migrated.settings.futaWageBase).toBe(7000);
      expect(migrated.settings.additionalMedicareThreshold).toBe(200000);
      expect(migrated.settings.additionalMedicareRate).toBe(0.9);
    });

    it('should not overwrite existing deductions or tax settings', () => {
      const v4Data = {
        version: 4,
        settings: {
          companyName: 'Test',
          ssWageBase: 200000,
          futaWageBase: 10000
        },
        employees: [
          {
            id: 'emp-1',
            name: 'John',
            deductions: [{ id: 'ded-1', name: '401k', amount: 100 }]
          }
        ],
        payPeriods: {},
        bankRegister: []
      };

      const migrated = migrateData(v4Data);

      expect(migrated.employees[0].deductions).toHaveLength(1);
      expect(migrated.settings.ssWageBase).toBe(200000);
      expect(migrated.settings.futaWageBase).toBe(10000);
    });
  });

  describe('Migration v5 → v6', () => {
    it('should add createdDate to existing deductions', () => {
      const v5Data = {
        version: 5,
        settings: { companyName: 'Test' },
        employees: [
          {
            id: 'emp-1',
            name: 'John',
            deductions: [
              { id: 'ded-1', name: '401k', amount: 100, type: 'fixed' },
              { id: 'ded-2', name: 'Insurance', amount: 5, type: 'percent' }
            ]
          }
        ],
        payPeriods: {},
        bankRegister: []
      };

      const migrated = migrateData(v5Data);

      expect(migrated.employees[0].deductions[0].createdDate).toBe('2000-01-01');
      expect(migrated.employees[0].deductions[1].createdDate).toBe('2000-01-01');
    });

    it('should not overwrite existing createdDate', () => {
      const v5Data = {
        version: 5,
        settings: { companyName: 'Test' },
        employees: [
          {
            id: 'emp-1',
            name: 'John',
            deductions: [
              { id: 'ded-1', name: '401k', amount: 100, type: 'fixed', createdDate: '2024-06-15' }
            ]
          }
        ],
        payPeriods: {},
        bankRegister: []
      };

      const migrated = migrateData(v5Data);

      expect(migrated.employees[0].deductions[0].createdDate).toBe('2024-06-15');
    });

    it('should handle employees with no deductions', () => {
      const v5Data = {
        version: 5,
        settings: { companyName: 'Test' },
        employees: [
          { id: 'emp-1', name: 'John', deductions: [] }
        ],
        payPeriods: {},
        bankRegister: []
      };

      const migrated = migrateData(v5Data);

      expect(migrated.employees[0].deductions).toEqual([]);
    });
  });

  describe('Migration v6 → v7', () => {
    it('should add autoSubtraction setting', () => {
      const v6Data = {
        version: 6,
        settings: { companyName: 'Test' },
        employees: [],
        payPeriods: {},
        bankRegister: []
      };

      const migrated = migrateData(v6Data);

      expect(migrated.settings.autoSubtraction).toBe(true);
    });

    it('should not overwrite existing autoSubtraction', () => {
      const v6Data = {
        version: 6,
        settings: { companyName: 'Test', autoSubtraction: false },
        employees: [],
        payPeriods: {},
        bankRegister: []
      };

      const migrated = migrateData(v6Data);

      expect(migrated.settings.autoSubtraction).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle data without version field (defaults to v1)', () => {
      const unversionedData = {
        settings: { companyName: 'Test' },
        employees: [],
        payPeriods: {},
        bankRegister: []
      };

      const migrated = migrateData(unversionedData);

      expect(migrated.version).toBe(8);
      expect(migrated.settings.employeeIdPrefix).toBeDefined(); // v2 addition
      expect(migrated.settings.autoSubtraction).toBeDefined(); // v7 addition
      expect(migrated.settings.sutaWageBase).toBe(25000); // v8 addition
    });

    it('should handle empty employees array', () => {
      const v1Data = {
        version: 1,
        settings: { companyName: 'Test' },
        employees: [],
        payPeriods: {},
        bankRegister: []
      };

      const migrated = migrateData(v1Data);

      expect(migrated.employees).toEqual([]);
      expect(migrated.version).toBe(8);
    });

    it('should handle empty bank register', () => {
      const v3Data = {
        version: 3,
        settings: { companyName: 'Test' },
        employees: [],
        payPeriods: {},
        bankRegister: []
      };

      const migrated = migrateData(v3Data);

      expect(migrated.bankRegister).toEqual([]);
      expect(migrated.version).toBe(8);
    });

    it('should preserve all existing data during migration', () => {
      const v1Data = {
        version: 1,
        settings: {
          companyName: 'Original Company',
          taxYear: 2023,
          socialSecurity: 6.2
        },
        employees: [
          {
            id: 'emp-original',
            name: 'Original Employee',
            rate: 25.50
          }
        ],
        payPeriods: {
          'emp-original': [
            { period: 1, grossPay: 1000 }
          ]
        },
        bankRegister: [
          {
            id: 'txn-original',
            description: 'Original Transaction',
            debit: 500
          }
        ]
      };

      const migrated = migrateData(v1Data);

      // Verify original data preserved
      expect(migrated.settings.companyName).toBe('Original Company');
      expect(migrated.settings.taxYear).toBe(2023);
      expect(migrated.settings.socialSecurity).toBe(6.2);
      expect(migrated.employees[0].id).toBe('emp-original');
      expect(migrated.employees[0].name).toBe('Original Employee');
      expect(migrated.employees[0].rate).toBe(25.50);
      expect(migrated.payPeriods['emp-original'][0].grossPay).toBe(1000);
      expect(migrated.bankRegister[0].description).toBe('Original Transaction');
    });
  });
});
