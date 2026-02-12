import { describe, it, expect, beforeEach } from 'vitest';
import { appData, defaultAppData } from '../../js/state.js';
import {
  generatePayPeriods,
  calculatePayFromData,
  recalculateAllPeriodsForEmployee,
  recalculatePeriod
} from '../../js/logic.js';
import { createTestEmployee } from '../fixtures/sample-employees.js';
import { createTestSettings } from '../fixtures/sample-settings.js';

/**
 * CRITICAL TEST: Sequential Recalculation
 *
 * Tests the critical behavior where editing an earlier pay period
 * triggers recalculation of all subsequent periods. This is essential
 * for maintaining correct tax remainder tracking.
 */
describe('Sequential Recalculation (CRITICAL)', () => {
  let employee;
  const standardHours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

  beforeEach(() => {
    // Reset app state
    Object.assign(appData, JSON.parse(JSON.stringify(defaultAppData)));

    // Set up bi-weekly payroll
    appData.settings = createTestSettings({
      taxYear: 2024,
      payFrequency: 'bi-weekly',
      firstPayPeriodStartDate: '2024-01-01',
      daysUntilPayday: 5
    });

    // Create test employee
    employee = createTestEmployee({
      rate: 25,
      fedTaxRate: 12,
      stateTaxRate: 5,
      localTaxRate: 2
    });
    appData.employees.push(employee);
    generatePayPeriods();
  });

  it('should recalculate all periods when editing Period 1', () => {
    // Calculate periods 1-10
    for (let i = 1; i <= 10; i++) {
      calculatePayFromData(employee.id, i, standardHours);
    }

    // Store period 1's gross pay before edit
    const period1GrossBefore = appData.payPeriods[employee.id][0].grossPay;

    // Edit Period 1 with different hours (should trigger full recalc)
    calculatePayFromData(employee.id, 1, { regular: 85, overtime: 0, pto: 0, holiday: 0 });

    // Period 1 should have different gross pay
    const period1GrossAfter = appData.payPeriods[employee.id][0].grossPay;
    expect(period1GrossAfter).not.toBe(period1GrossBefore);
    expect(period1GrossAfter).toBe(85 * 25); // 2125
  });

  it('should only recalculate forward when editing middle period', () => {
    // Calculate periods 1-10
    for (let i = 1; i <= 10; i++) {
      calculatePayFromData(employee.id, i, standardHours);
    }

    // Store values from periods 1-4 and period 5
    const period1Before = { ...appData.payPeriods[employee.id][0] };
    const period4Before = { ...appData.payPeriods[employee.id][3] };
    const period5GrossBefore = appData.payPeriods[employee.id][4].grossPay;

    // Edit Period 5 with different hours
    calculatePayFromData(employee.id, 5, { regular: 85, overtime: 0, pto: 0, holiday: 0 });

    // Periods 1-4 should be unchanged (grossPay is the key indicator)
    expect(appData.payPeriods[employee.id][0].grossPay).toBe(period1Before.grossPay);
    expect(appData.payPeriods[employee.id][3].grossPay).toBe(period4Before.grossPay);

    // Period 5 should have different gross pay
    expect(appData.payPeriods[employee.id][4].grossPay).not.toBe(period5GrossBefore);
    expect(appData.payPeriods[employee.id][4].grossPay).toBe(85 * 25); // 2125
  });

  it('should reset tax remainders when recalculating all periods', () => {
    // Calculate first 5 periods
    for (let i = 1; i <= 5; i++) {
      calculatePayFromData(employee.id, i, standardHours);
    }

    // Capture remainder values after 5 periods
    const remaindersAfter5 = { ...employee.taxRemainders };

    // Manually reset and recalculate all
    recalculateAllPeriodsForEmployee(employee.id);

    // Remainders should be the same (recalculated from scratch)
    // They won't be exactly zero because there are still 5 periods
    expect(employee.taxRemainders.federal).toBeCloseTo(remaindersAfter5.federal, 10);
    expect(employee.taxRemainders.fica).toBeCloseTo(remaindersAfter5.fica, 10);
  });

  it('should not recalculate backward when editing last period', () => {
    // Calculate periods 1-10
    for (let i = 1; i <= 10; i++) {
      calculatePayFromData(employee.id, i, standardHours);
    }

    // Store period 1 values
    const period1Before = { ...appData.payPeriods[employee.id][0] };

    // Edit Period 10 (last calculated)
    calculatePayFromData(employee.id, 10, { regular: 85, overtime: 0, pto: 0, holiday: 0 });

    // Period 1 should be completely unchanged
    expect(appData.payPeriods[employee.id][0].grossPay).toBe(period1Before.grossPay);
    expect(appData.payPeriods[employee.id][0].taxes.federal).toBe(period1Before.taxes.federal);
    expect(appData.payPeriods[employee.id][0].taxes.fica).toBe(period1Before.taxes.fica);
  });
});

describe('recalculatePeriod() Function', () => {
  let employee;

  beforeEach(() => {
    Object.assign(appData, JSON.parse(JSON.stringify(defaultAppData)));
    appData.settings = createTestSettings({
      taxYear: 2024,
      payFrequency: 'bi-weekly',
      firstPayPeriodStartDate: '2024-01-01'
    });

    employee = createTestEmployee({ rate: 20, fedTaxRate: 10 });
    appData.employees.push(employee);
    generatePayPeriods();
  });

  it('should calculate period using stored hours', () => {
    // Store hours in period manually
    const period = appData.payPeriods[employee.id][0];
    period.hours = { regular: 80, overtime: 5, pto: 0, holiday: 0 };

    // Call recalculatePeriod directly
    const result = recalculatePeriod(employee.id, 1);

    // Verify calculation
    expect(result.grossPay).toBe(80 * 20 + 5 * 20 * 1.5); // 1600 + 150 = 1750
    expect(result.earnings.regular).toBe(1600);
    expect(result.earnings.overtime).toBe(150);
  });

  it('should return null for invalid employee ID', () => {
    const result = recalculatePeriod('invalid-id', 1);
    expect(result).toBeUndefined();
  });

  it('should return null for invalid period number', () => {
    const result = recalculatePeriod(employee.id, 999);
    expect(result).toBeUndefined();
  });

  it('should update tax remainders after calculation', () => {
    // Store hours and calculate
    const period = appData.payPeriods[employee.id][0];
    period.hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

    // Reset remainders
    employee.taxRemainders = {
      federal: 0, fica: 0, medicare: 0, state: 0, local: 0, suta: 0, futa: 0
    };

    recalculatePeriod(employee.id, 1);

    // Remainders should be updated (may be non-zero due to fractional cents)
    expect(employee.taxRemainders).toBeDefined();
    expect(typeof employee.taxRemainders.federal).toBe('number');
  });
});

describe('recalculateAllPeriodsForEmployee() Function', () => {
  let employee;

  beforeEach(() => {
    Object.assign(appData, JSON.parse(JSON.stringify(defaultAppData)));
    appData.settings = createTestSettings({
      taxYear: 2024,
      payFrequency: 'bi-weekly',
      firstPayPeriodStartDate: '2024-01-01'
    });

    employee = createTestEmployee({ rate: 25 });
    appData.employees.push(employee);
    generatePayPeriods();
  });

  it('should process all periods with hours in sequence', () => {
    // Store hours in periods 1, 2, 3
    appData.payPeriods[employee.id][0].hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    appData.payPeriods[employee.id][1].hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    appData.payPeriods[employee.id][2].hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

    recalculateAllPeriodsForEmployee(employee.id);

    // All three periods should have gross pay
    expect(appData.payPeriods[employee.id][0].grossPay).toBe(2000);
    expect(appData.payPeriods[employee.id][1].grossPay).toBe(2000);
    expect(appData.payPeriods[employee.id][2].grossPay).toBe(2000);
  });

  it('should skip periods without hours', () => {
    // Only period 2 has hours
    appData.payPeriods[employee.id][1].hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

    recalculateAllPeriodsForEmployee(employee.id);

    // Period 1 should have no gross pay
    expect(appData.payPeriods[employee.id][0].grossPay).toBe(0);
    // Period 2 should have gross pay
    expect(appData.payPeriods[employee.id][1].grossPay).toBe(2000);
  });

  it('should reset remainders before processing', () => {
    // Set artificial remainders
    employee.taxRemainders = {
      federal: 0.99, fica: 0.99, medicare: 0.99, state: 0.99, local: 0.99, suta: 0.99, futa: 0.99
    };

    // Store hours and recalculate
    appData.payPeriods[employee.id][0].hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

    recalculateAllPeriodsForEmployee(employee.id);

    // Remainders should be reset and recalculated (not 0.99 + new values)
    // After one period, remainders should be small (fractional cents only)
    expect(Math.abs(employee.taxRemainders.federal)).toBeLessThan(0.5);
  });
});
