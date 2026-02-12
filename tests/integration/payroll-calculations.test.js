import { describe, it, expect, beforeEach } from 'vitest';
import { appData, defaultAppData } from '../../js/state.js';
import {
  generatePayPeriods,
  generateBasePayPeriods,
  calculatePayFromData,
  recalculatePeriod,
  getPayStubData
} from '../../js/logic.js';
import { createTestEmployee, createHighEarnerEmployee } from '../fixtures/sample-employees.js';
import { createTestSettings } from '../fixtures/sample-settings.js';

/**
 * Core Payroll Calculation Tests
 *
 * Tests the fundamental payroll calculations including:
 * - Gross pay (regular, overtime, holiday, PTO)
 * - Tax calculations
 * - Net pay
 */
describe('Payroll Calculations', () => {
  let employee;

  beforeEach(() => {
    Object.assign(appData, JSON.parse(JSON.stringify(defaultAppData)));
    appData.settings = createTestSettings({
      taxYear: 2024,
      payFrequency: 'bi-weekly',
      firstPayPeriodStartDate: '2024-01-01',
      socialSecurity: 6.2,
      medicare: 1.45,
      sutaRate: 2.7,
      futaRate: 0.6
    });

    employee = createTestEmployee({
      rate: 25,
      fedTaxRate: 12,
      stateTaxRate: 5,
      localTaxRate: 2,
      overtimeMultiplier: 1.5,
      holidayMultiplier: 2.0
    });
    appData.employees.push(employee);
    generatePayPeriods();
  });

  describe('Gross Pay Calculations', () => {
    it('should calculate regular pay correctly', () => {
      const result = calculatePayFromData(employee.id, 1, {
        regular: 80, overtime: 0, pto: 0, holiday: 0
      });

      expect(result.grossPay).toBe(2000); // 80 hrs * $25
      expect(result.earnings.regular).toBe(2000);
    });

    it('should calculate overtime pay with multiplier', () => {
      const result = calculatePayFromData(employee.id, 1, {
        regular: 80, overtime: 10, pto: 0, holiday: 0
      });

      // 80 * 25 = 2000 + 10 * 25 * 1.5 = 375 = 2375
      expect(result.grossPay).toBe(2375);
      expect(result.earnings.regular).toBe(2000);
      expect(result.earnings.overtime).toBe(375);
    });

    it('should calculate holiday pay with multiplier', () => {
      const result = calculatePayFromData(employee.id, 1, {
        regular: 72, overtime: 0, pto: 0, holiday: 8
      });

      // 72 * 25 = 1800 + 8 * 25 * 2.0 = 400 = 2200
      expect(result.grossPay).toBe(2200);
      expect(result.earnings.regular).toBe(1800);
      expect(result.earnings.holiday).toBe(400);
    });

    it('should calculate PTO pay at regular rate', () => {
      const result = calculatePayFromData(employee.id, 1, {
        regular: 72, overtime: 0, pto: 8, holiday: 0
      });

      // 72 * 25 = 1800 + 8 * 25 = 200 = 2000
      expect(result.grossPay).toBe(2000);
      expect(result.earnings.regular).toBe(1800);
      expect(result.earnings.pto).toBe(200);
    });

    it('should calculate combined hour types correctly', () => {
      const result = calculatePayFromData(employee.id, 1, {
        regular: 70, overtime: 5, pto: 4, holiday: 1
      });

      // Regular: 70 * 25 = 1750
      // Overtime: 5 * 25 * 1.5 = 187.50
      // PTO: 4 * 25 = 100
      // Holiday: 1 * 25 * 2.0 = 50
      // Total: 2087.50
      expect(result.grossPay).toBe(2087.5);
      expect(result.earnings.regular).toBe(1750);
      expect(result.earnings.overtime).toBe(187.5);
      expect(result.earnings.pto).toBe(100);
      expect(result.earnings.holiday).toBe(50);
    });

    it('should handle zero hours', () => {
      const result = calculatePayFromData(employee.id, 1, {
        regular: 0, overtime: 0, pto: 0, holiday: 0
      });

      expect(result.grossPay).toBe(0);
      expect(result.earnings.regular).toBe(0);
    });
  });

  describe('Tax Calculations', () => {
    it('should calculate federal tax correctly', () => {
      const result = calculatePayFromData(employee.id, 1, {
        regular: 80, overtime: 0, pto: 0, holiday: 0
      });

      // $2000 * 12% = $240
      expect(result.taxes.federal).toBe(240);
    });

    it('should calculate state tax correctly', () => {
      const result = calculatePayFromData(employee.id, 1, {
        regular: 80, overtime: 0, pto: 0, holiday: 0
      });

      // $2000 * 5% = $100
      expect(result.taxes.state).toBe(100);
    });

    it('should calculate local tax correctly', () => {
      const result = calculatePayFromData(employee.id, 1, {
        regular: 80, overtime: 0, pto: 0, holiday: 0
      });

      // $2000 * 2% = $40
      expect(result.taxes.local).toBe(40);
    });

    it('should calculate FICA (Social Security) correctly', () => {
      const result = calculatePayFromData(employee.id, 1, {
        regular: 80, overtime: 0, pto: 0, holiday: 0
      });

      // $2000 * 6.2% = $124
      expect(result.taxes.fica).toBe(124);
    });

    it('should calculate Medicare correctly', () => {
      const result = calculatePayFromData(employee.id, 1, {
        regular: 80, overtime: 0, pto: 0, holiday: 0
      });

      // $2000 * 1.45% = $29
      expect(result.taxes.medicare).toBe(29);
    });

    it('should calculate SUTA correctly', () => {
      const result = calculatePayFromData(employee.id, 1, {
        regular: 80, overtime: 0, pto: 0, holiday: 0
      });

      // $2000 * 2.7% = $54
      expect(result.taxes.suta).toBe(54);
    });

    it('should calculate FUTA correctly', () => {
      const result = calculatePayFromData(employee.id, 1, {
        regular: 80, overtime: 0, pto: 0, holiday: 0
      });

      // $2000 * 0.6% = $12
      expect(result.taxes.futa).toBe(12);
    });

    it('should calculate total employee taxes (excluding employer taxes)', () => {
      const result = calculatePayFromData(employee.id, 1, {
        regular: 80, overtime: 0, pto: 0, holiday: 0
      });

      // Employee taxes: federal + state + local + fica + medicare
      // 240 + 100 + 40 + 124 + 29 = 533
      expect(result.taxes.total).toBe(533);
    });

    it('should track unrounded tax values', () => {
      const result = calculatePayFromData(employee.id, 1, {
        regular: 80, overtime: 0, pto: 0, holiday: 0
      });

      expect(result.taxes.unrounded).toBeDefined();
      expect(result.taxes.unrounded.federal).toBe(240); // Exact value
      expect(result.taxes.unrounded.fica).toBe(124); // Exact value
    });
  });

  describe('Net Pay Calculations', () => {
    it('should calculate net pay correctly', () => {
      const result = calculatePayFromData(employee.id, 1, {
        regular: 80, overtime: 0, pto: 0, holiday: 0
      });

      // Gross: $2000
      // Employee Taxes: $533
      // Net: $1467
      expect(result.netPay).toBe(1467);
    });

    it('should handle fractional amounts in net pay', () => {
      // Use a rate that creates fractional cents
      const fractionalEmployee = createTestEmployee({
        rate: 20.33,
        fedTaxRate: 12,
        stateTaxRate: 5,
        localTaxRate: 2
      });
      appData.employees.push(fractionalEmployee);
      generatePayPeriods();

      const result = calculatePayFromData(fractionalEmployee.id, 1, {
        regular: 80, overtime: 0, pto: 0, holiday: 0
      });

      // Gross should be close (floating point precision)
      expect(result.grossPay).toBeCloseTo(1626.4, 2); // 80 * 20.33
      // Net should be calculated
      expect(result.netPay).toBeGreaterThan(0);
      expect(result.netPay).toBeLessThan(result.grossPay);
    });
  });

  describe('Edge Cases', () => {
    it('should return null for invalid employee ID', () => {
      const result = calculatePayFromData('invalid-id', 1, {
        regular: 80, overtime: 0, pto: 0, holiday: 0
      });

      expect(result).toBeNull();
    });

    it('should return null for invalid period number', () => {
      const result = calculatePayFromData(employee.id, 999, {
        regular: 80, overtime: 0, pto: 0, holiday: 0
      });

      expect(result).toBeNull();
    });

    it('should handle string hour values by parsing them', () => {
      const result = calculatePayFromData(employee.id, 1, {
        regular: '80', overtime: '0', pto: '0', holiday: '0'
      });

      expect(result.grossPay).toBe(2000);
    });

    it('should handle missing or undefined hours as zero', () => {
      const result = calculatePayFromData(employee.id, 1, {
        regular: 80
      });

      expect(result.grossPay).toBe(2000);
      expect(result.earnings.overtime).toBe(0);
      expect(result.earnings.pto).toBe(0);
      expect(result.earnings.holiday).toBe(0);
    });
  });
});

describe('generateBasePayPeriods()', () => {
  beforeEach(() => {
    Object.assign(appData, JSON.parse(JSON.stringify(defaultAppData)));
  });

  it('should generate 26 periods for bi-weekly frequency', () => {
    appData.settings = createTestSettings({
      payFrequency: 'bi-weekly',
      firstPayPeriodStartDate: '2024-01-01',
      taxYear: 2024
    });

    const periods = generateBasePayPeriods();
    expect(periods.length).toBe(26);
  });

  it('should generate up to 52 periods for weekly frequency', () => {
    appData.settings = createTestSettings({
      payFrequency: 'weekly',
      firstPayPeriodStartDate: '2024-01-01',
      taxYear: 2024
    });

    const periods = generateBasePayPeriods();
    expect(periods.length).toBeGreaterThanOrEqual(52);
  });

  it('should generate 24 periods for semi-monthly frequency', () => {
    appData.settings = createTestSettings({
      payFrequency: 'semi-monthly',
      firstPayPeriodStartDate: '2024-01-01',
      taxYear: 2024
    });

    const periods = generateBasePayPeriods();
    expect(periods.length).toBe(24);
  });

  it('should generate 12 periods for monthly frequency', () => {
    appData.settings = createTestSettings({
      payFrequency: 'monthly',
      firstPayPeriodStartDate: '2024-01-01',
      taxYear: 2024
    });

    const periods = generateBasePayPeriods();
    expect(periods.length).toBe(12);
  });

  it('should return empty array if no start date', () => {
    appData.settings = createTestSettings({
      firstPayPeriodStartDate: ''
    });

    const periods = generateBasePayPeriods();
    expect(periods).toEqual([]);
  });

  it('should initialize periods with zero values', () => {
    appData.settings = createTestSettings({
      payFrequency: 'bi-weekly',
      firstPayPeriodStartDate: '2024-01-01',
      taxYear: 2024
    });

    const periods = generateBasePayPeriods();
    const firstPeriod = periods[0];

    expect(firstPeriod.grossPay).toBe(0);
    expect(firstPeriod.netPay).toBe(0);
    expect(firstPeriod.hours.regular).toBe(0);
    expect(firstPeriod.taxes.federal).toBe(0);
    expect(firstPeriod.deductions).toEqual([]);
    expect(firstPeriod.totalDeductions).toBe(0);
  });

  it('should calculate correct pay dates with daysUntilPayday', () => {
    appData.settings = createTestSettings({
      payFrequency: 'bi-weekly',
      firstPayPeriodStartDate: '2024-01-01',
      taxYear: 2024,
      daysUntilPayday: 5
    });

    const periods = generateBasePayPeriods();
    // First period: Jan 1-14, pay date should be Jan 19 (14 + 5)
    expect(periods[0].startDate).toBe('1/1/2024');
    expect(periods[0].endDate).toBe('1/14/2024');
    expect(periods[0].payDate).toBe('1/19/2024');
  });
});

describe('getPayStubData()', () => {
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
      stateTaxRate: 5
    });
    appData.employees.push(employee);
    generatePayPeriods();

    // Calculate a few periods
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    calculatePayFromData(employee.id, 1, hours);
    calculatePayFromData(employee.id, 2, hours);
    calculatePayFromData(employee.id, 3, hours);
  });

  it('should return employee data for pay stub', () => {
    const stub = getPayStubData(employee.id, 2);

    expect(stub.employee).toBeDefined();
    expect(stub.employee.id).toBe(employee.id);
    expect(stub.employee.name).toBe(employee.name);
  });

  it('should return period data for pay stub', () => {
    const stub = getPayStubData(employee.id, 2);

    expect(stub.period).toBeDefined();
    expect(stub.period.grossPay).toBe(2000);
    expect(stub.period.period).toBe(2);
  });

  it('should calculate YTD totals correctly', () => {
    const stub = getPayStubData(employee.id, 3);

    // YTD includes periods 1, 2, 3 (up to and including current period)
    expect(stub.ytd).toBeDefined();
    expect(stub.ytd.gross).toBe(6000); // 2000 * 3 periods
    expect(stub.ytd.federal).toBe(720); // 240 * 3
  });

  it('should return empty object for invalid employee', () => {
    const stub = getPayStubData('invalid-id', 1);
    expect(stub).toEqual({});
  });

  it('should return empty object for invalid period', () => {
    const stub = getPayStubData(employee.id, 999);
    expect(stub).toEqual({});
  });
});
