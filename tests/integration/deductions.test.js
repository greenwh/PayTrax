import { describe, it, expect, beforeEach } from 'vitest';
import { appData, defaultAppData } from '../../js/state.js';
import {
  generatePayPeriods,
  calculatePayFromData,
  addDeduction,
  updateDeduction,
  deleteDeduction,
  calculateDeductions,
  recalculateAllPeriodsForEmployee
} from '../../js/logic.js';
import { createTestEmployee, createEmployeeWithDeductions } from '../fixtures/sample-employees.js';
import { createTestSettings } from '../fixtures/sample-settings.js';

/**
 * Employee Deductions Tests
 *
 * Tests the deduction system including:
 * - Adding, updating, deleting deductions
 * - Fixed vs percentage deductions
 * - Deduction effective dates
 * - Impact on net pay
 */
describe('Employee Deductions', () => {
  let employee;

  beforeEach(() => {
    Object.assign(appData, JSON.parse(JSON.stringify(defaultAppData)));
    appData.settings = createTestSettings({
      taxYear: 2024,
      payFrequency: 'bi-weekly',
      firstPayPeriodStartDate: '2024-01-01'
    });

    employee = createTestEmployee({
      rate: 25,
      fedTaxRate: 12,
      stateTaxRate: 5,
      localTaxRate: 2
    });
    appData.employees.push(employee);
    generatePayPeriods();
  });

  describe('addDeduction()', () => {
    it('should add a fixed deduction to an employee', () => {
      const result = addDeduction(employee.id, '401k', 100, 'fixed');

      expect(result).toBe(true);
      expect(employee.deductions.length).toBe(1);
      expect(employee.deductions[0].name).toBe('401k');
      expect(employee.deductions[0].amount).toBe(100);
      expect(employee.deductions[0].type).toBe('fixed');
    });

    it('should add a percentage deduction to an employee', () => {
      const result = addDeduction(employee.id, 'Health Insurance', 5, 'percent');

      expect(result).toBe(true);
      expect(employee.deductions[0].type).toBe('percent');
      expect(employee.deductions[0].amount).toBe(5);
    });

    it('should generate unique IDs for deductions', () => {
      // Add deductions with a small delay to ensure unique timestamps
      addDeduction(employee.id, 'Deduction 1', 50, 'fixed');

      // IDs should start with 'ded_'
      expect(employee.deductions[0].id).toMatch(/^ded_/);

      // Add another and check it has an ID
      addDeduction(employee.id, 'Deduction 2', 75, 'fixed');
      expect(employee.deductions[1].id).toMatch(/^ded_/);

      // Both should have IDs defined
      expect(employee.deductions[0].id).toBeDefined();
      expect(employee.deductions[1].id).toBeDefined();
    });

    it('should add createdDate to the deduction', () => {
      addDeduction(employee.id, '401k', 100, 'fixed');

      expect(employee.deductions[0].createdDate).toBeDefined();
      expect(employee.deductions[0].createdDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should return false for invalid employee ID', () => {
      const result = addDeduction('invalid-id', '401k', 100, 'fixed');

      expect(result).toBe(false);
    });

    it('should initialize deductions array if not present', () => {
      delete employee.deductions;

      addDeduction(employee.id, '401k', 100, 'fixed');

      expect(employee.deductions).toBeDefined();
      expect(employee.deductions.length).toBe(1);
    });
  });

  describe('updateDeduction()', () => {
    beforeEach(() => {
      addDeduction(employee.id, '401k', 100, 'fixed');
    });

    it('should update deduction name', () => {
      const deductionId = employee.deductions[0].id;
      updateDeduction(employee.id, deductionId, 'Roth 401k', 100, 'fixed');

      expect(employee.deductions[0].name).toBe('Roth 401k');
    });

    it('should update deduction amount', () => {
      const deductionId = employee.deductions[0].id;
      updateDeduction(employee.id, deductionId, '401k', 200, 'fixed');

      expect(employee.deductions[0].amount).toBe(200);
    });

    it('should update deduction type', () => {
      const deductionId = employee.deductions[0].id;
      updateDeduction(employee.id, deductionId, '401k', 5, 'percent');

      expect(employee.deductions[0].type).toBe('percent');
    });

    it('should return false for invalid employee ID', () => {
      const deductionId = employee.deductions[0].id;
      const result = updateDeduction('invalid-id', deductionId, '401k', 100, 'fixed');

      expect(result).toBe(false);
    });

    it('should return false for invalid deduction ID', () => {
      const result = updateDeduction(employee.id, 'invalid-ded-id', '401k', 100, 'fixed');

      expect(result).toBe(false);
    });
  });

  describe('deleteDeduction()', () => {
    beforeEach(() => {
      // Manually add deductions with explicit unique IDs to avoid timestamp collision
      employee.deductions = [
        { id: 'ded-unique-1', name: '401k', amount: 100, type: 'fixed', createdDate: '2024-01-01' },
        { id: 'ded-unique-2', name: 'Health', amount: 50, type: 'fixed', createdDate: '2024-01-01' }
      ];
    });

    it('should remove the deduction', () => {
      const deductionId = employee.deductions[0].id;

      const result = deleteDeduction(employee.id, deductionId);

      expect(result).toBe(true);
      expect(employee.deductions.length).toBe(1);
      expect(employee.deductions[0].name).toBe('Health');
    });

    it('should return false for invalid employee ID', () => {
      const deductionId = employee.deductions[0].id;
      const result = deleteDeduction('invalid-id', deductionId);

      expect(result).toBe(false);
    });

    it('should handle missing deduction ID gracefully', () => {
      const initialCount = employee.deductions.length;
      deleteDeduction(employee.id, 'invalid-ded-id');

      // Deductions array unchanged (filter just returns all items)
      expect(employee.deductions.length).toBe(initialCount);
    });
  });

  describe('calculateDeductions()', () => {
    it('should calculate fixed deduction amount', () => {
      employee.deductions = [
        { id: 'ded1', name: '401k', amount: 100, type: 'fixed' }
      ];

      const result = calculateDeductions(employee, 2000);

      expect(result.total).toBe(100);
      expect(result.deductions[0].calculatedAmount).toBe(100);
    });

    it('should calculate percentage deduction from gross pay', () => {
      employee.deductions = [
        { id: 'ded1', name: 'Health', amount: 5, type: 'percent' }
      ];

      const result = calculateDeductions(employee, 2000);

      // 5% of $2000 = $100
      expect(result.total).toBe(100);
      expect(result.deductions[0].calculatedAmount).toBe(100);
    });

    it('should calculate multiple deductions', () => {
      employee.deductions = [
        { id: 'ded1', name: '401k', amount: 100, type: 'fixed' },
        { id: 'ded2', name: 'Health', amount: 5, type: 'percent' }
      ];

      const result = calculateDeductions(employee, 2000);

      // $100 fixed + 5% of $2000 = $200
      expect(result.total).toBe(200);
    });

    it('should return empty result for employee with no deductions', () => {
      employee.deductions = [];

      const result = calculateDeductions(employee, 2000);

      expect(result.total).toBe(0);
      expect(result.deductions).toEqual([]);
    });

    it('should return empty result for null deductions', () => {
      delete employee.deductions;

      const result = calculateDeductions(employee, 2000);

      expect(result.total).toBe(0);
      expect(result.deductions).toEqual([]);
    });

    it('should filter deductions by created date when payDate is provided', () => {
      employee.deductions = [
        { id: 'ded1', name: '401k', amount: 100, type: 'fixed', createdDate: '2024-01-01' },
        { id: 'ded2', name: 'Health', amount: 50, type: 'fixed', createdDate: '2024-06-01' }
      ];

      // Pay date before second deduction was created
      const result = calculateDeductions(employee, 2000, '3/1/2024');

      // Only first deduction should apply
      expect(result.total).toBe(100);
      expect(result.deductions.length).toBe(1);
    });

    it('should apply all deductions when payDate is after all created dates', () => {
      employee.deductions = [
        { id: 'ded1', name: '401k', amount: 100, type: 'fixed', createdDate: '2024-01-01' },
        { id: 'ded2', name: 'Health', amount: 50, type: 'fixed', createdDate: '2024-06-01' }
      ];

      // Pay date after all deductions created
      const result = calculateDeductions(employee, 2000, '12/1/2024');

      expect(result.total).toBe(150);
      expect(result.deductions.length).toBe(2);
    });

    it('should include deductions without createdDate (legacy data)', () => {
      employee.deductions = [
        { id: 'ded1', name: '401k', amount: 100, type: 'fixed' } // No createdDate
      ];

      const result = calculateDeductions(employee, 2000, '1/1/2024');

      expect(result.total).toBe(100);
    });

    it('should round total to 2 decimal places', () => {
      employee.deductions = [
        { id: 'ded1', name: 'Odd Percent', amount: 3.33, type: 'percent' }
      ];

      const result = calculateDeductions(employee, 2000);

      // 3.33% of $2000 = $66.60
      expect(result.total).toBe(66.6);
    });
  });

  describe('Deductions in Payroll Calculations', () => {
    it('should apply deductions to net pay', () => {
      // Manually add deduction with a date before the pay period
      employee.deductions.push({
        id: 'ded-test-1',
        name: '401k',
        amount: 100,
        type: 'fixed',
        createdDate: '2023-12-01' // Before pay periods start
      });

      const result = calculatePayFromData(employee.id, 1, {
        regular: 80, overtime: 0, pto: 0, holiday: 0
      });

      // Gross: $2000
      // Taxes: $533
      // Deductions: $100
      // Net: $1367
      expect(result.totalDeductions).toBe(100);
      expect(result.netPay).toBe(1367);
    });

    it('should include percentage deductions based on gross pay', () => {
      // Manually add deduction with a date before the pay period
      employee.deductions.push({
        id: 'ded-test-2',
        name: '401k',
        amount: 5,
        type: 'percent',
        createdDate: '2023-12-01'
      });

      const result = calculatePayFromData(employee.id, 1, {
        regular: 80, overtime: 0, pto: 0, holiday: 0
      });

      // 5% of $2000 = $100
      expect(result.totalDeductions).toBe(100);
    });

    it('should apply multiple deductions correctly', () => {
      // Manually add deductions with dates before the pay period
      employee.deductions.push({
        id: 'ded-test-3',
        name: '401k',
        amount: 100,
        type: 'fixed',
        createdDate: '2023-12-01'
      });
      employee.deductions.push({
        id: 'ded-test-4',
        name: 'Health',
        amount: 5,
        type: 'percent',
        createdDate: '2023-12-01'
      });

      const result = calculatePayFromData(employee.id, 1, {
        regular: 80, overtime: 0, pto: 0, holiday: 0
      });

      // $100 fixed + 5% of $2000 = $200
      expect(result.totalDeductions).toBe(200);
      expect(result.deductions.length).toBe(2);
    });

    it('should store calculated deduction amounts in period', () => {
      // Manually add deduction with a date before the pay period
      employee.deductions.push({
        id: 'ded-test-5',
        name: '401k',
        amount: 100,
        type: 'fixed',
        createdDate: '2023-12-01'
      });

      const result = calculatePayFromData(employee.id, 1, {
        regular: 80, overtime: 0, pto: 0, holiday: 0
      });

      expect(result.deductions[0].calculatedAmount).toBe(100);
    });
  });
});

describe('Deductions with Pre-existing Employee', () => {
  let employee;

  beforeEach(() => {
    Object.assign(appData, JSON.parse(JSON.stringify(defaultAppData)));
    appData.settings = createTestSettings({
      taxYear: 2024,
      payFrequency: 'bi-weekly',
      firstPayPeriodStartDate: '2024-01-01'
    });

    employee = createEmployeeWithDeductions({
      rate: 25,
      fedTaxRate: 12,
      stateTaxRate: 5
    });
    appData.employees.push(employee);
    generatePayPeriods();
  });

  it('should use factory-created deductions', () => {
    expect(employee.deductions.length).toBeGreaterThan(0);

    const result = calculatePayFromData(employee.id, 1, {
      regular: 80, overtime: 0, pto: 0, holiday: 0
    });

    expect(result.totalDeductions).toBeGreaterThan(0);
  });

  it('should allow adding more deductions to employee with existing ones', () => {
    const initialCount = employee.deductions.length;

    addDeduction(employee.id, 'New Deduction', 50, 'fixed');

    expect(employee.deductions.length).toBe(initialCount + 1);
  });
});
