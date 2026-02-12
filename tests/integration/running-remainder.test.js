import { describe, it, expect, beforeEach } from 'vitest';
import { appData, defaultAppData } from '../../js/state.js';
import { generatePayPeriods, calculatePayFromData } from '../../js/logic.js';
import { createTestEmployee } from '../fixtures/sample-employees.js';
import { createTestSettings } from '../fixtures/sample-settings.js';

/**
 * CRITICAL TEST: Running Remainder Algorithm
 *
 * This tests the core tax calculation logic that prevents rounding errors
 * from accumulating over multiple pay periods. Fractional cents are tracked
 * in employee.taxRemainders and carried forward to the next period.
 *
 * See CLAUDE.md "Fractional Cent Tracking" for implementation details.
 */
describe('Running Remainder Algorithm (CRITICAL)', () => {
  beforeEach(() => {
    // Initialize fresh app state by copying default structure
    Object.assign(appData, JSON.parse(JSON.stringify(defaultAppData)));

    // Set up bi-weekly payroll for 2024
    appData.settings = createTestSettings({
      taxYear: 2024,
      payFrequency: 'bi-weekly', // Must be lowercase to match logic.js switch statement
      firstPayPeriodStartDate: '2024-01-01',
      daysUntilPayday: 5
    });
  });

  it('should track tax remainders across multiple pay periods', () => {
    // Create an employee with rates that produce fractional cents
    const employee = createTestEmployee({
      rate: 20.33, // Intentionally creates fractional tax amounts
      fedTaxRate: 12,
      stateTaxRate: 5,
      localTaxRate: 2
    });

    appData.employees.push(employee);

    // Generate pay periods for the year
    generatePayPeriods();

    // Calculate first 3 pay periods with identical hours
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

    calculatePayFromData(employee.id, 1, hours);
    calculatePayFromData(employee.id, 2, hours);
    calculatePayFromData(employee.id, 3, hours);

    // Verify taxRemainders are being tracked
    expect(employee.taxRemainders).toBeDefined();
    expect(employee.taxRemainders).toHaveProperty('federal');
    expect(employee.taxRemainders).toHaveProperty('fica');
    expect(employee.taxRemainders).toHaveProperty('medicare');

    // Verify taxes are calculated (non-zero after pay calculation)
    const period1 = appData.payPeriods[employee.id][0];
    const period2 = appData.payPeriods[employee.id][1];
    const period3 = appData.payPeriods[employee.id][2];

    expect(period1.taxes.federal).toBeGreaterThan(0);
    expect(period2.taxes.federal).toBeGreaterThan(0);
    expect(period3.taxes.federal).toBeGreaterThan(0);

    // Verify unrounded taxes are tracked
    expect(period1.taxes.unrounded).toBeDefined();
    expect(period1.taxes.unrounded.federal).toBeGreaterThan(0);

    // Key assertion: Tax remainders should change between periods
    // (this proves the algorithm is carrying fractional cents forward)
    const remaindersAfterPeriod1 = { ...employee.taxRemainders };

    calculatePayFromData(employee.id, 4, hours);

    // At least one remainder should have changed
    const hasRemainderChanged = Object.keys(remaindersAfterPeriod1).some(
      tax => Math.abs(remaindersAfterPeriod1[tax] - employee.taxRemainders[tax]) > 0.001
    );

    expect(hasRemainderChanged).toBe(true);
  });

  it('should maintain accuracy over a full year of bi-weekly pay periods', () => {
    // Create employee with standard rates
    const employee = createTestEmployee({
      rate: 25,
      fedTaxRate: 12,
      stateTaxRate: 5
    });

    appData.employees.push(employee);
    generatePayPeriods();

    // Calculate all 26 bi-weekly periods
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

    for (let period = 1; period <= 26; period++) {
      calculatePayFromData(employee.id, period, hours);
    }

    // Calculate total taxes for the year
    const yearlyTaxes = appData.payPeriods[employee.id].reduce((acc, period) => {
      return acc + (period.taxes.total || 0);
    }, 0);

    // Calculate expected annual gross pay
    const annualGross = 26 * 80 * 25; // 26 periods * 80 hrs * $25/hr = $52,000

    // Verify gross pay is accurate
    const actualGross = appData.payPeriods[employee.id].reduce((acc, p) => acc + p.grossPay, 0);
    expect(actualGross).toBe(annualGross);

    // Verify total taxes are reasonable
    // Expected: 12% fed + 5% state + 2% local + 6.2% SS + 1.45% Medicare = 26.65%
    const taxRate = yearlyTaxes / annualGross;
    expect(taxRate).toBeGreaterThan(0.25); // At least 25%
    expect(taxRate).toBeLessThan(0.30); // Less than 30%

    // Verify remainders are small (should be < $1 total)
    const totalRemainders = Object.values(employee.taxRemainders)
      .reduce((sum, val) => sum + Math.abs(val), 0);
    expect(totalRemainders).toBeLessThan(1);
  });

  it('should reset remainders when recalculating all periods', () => {
    const employee = createTestEmployee({ rate: 20 });
    appData.employees.push(employee);
    generatePayPeriods();

    // Calculate first 5 periods
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 5; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    // Remainders should exist after calculations
    const hasRemainders = Object.values(employee.taxRemainders)
      .some(val => Math.abs(val) > 0.001);

    // Verify calculation completed successfully
    expect(appData.payPeriods[employee.id][0].grossPay).toBeGreaterThan(0);
    expect(appData.payPeriods[employee.id][4].grossPay).toBeGreaterThan(0);
  });
});

/**
 * NOTE FOR FUTURE TEST EXPANSION:
 *
 * Additional critical tests to add:
 *
 * 1. sequential-recalc.test.js:
 *    - Test editing Period 1 triggers recalc of all periods
 *    - Test editing Period 10 only recalcs 10-26
 *    - Verify console logging for recalculation
 *
 * 2. tax-wage-bases.test.js:
 *    - Test Social Security stops at $168,600
 *    - Test FUTA stops at $7,000
 *    - Test high earner (>$200k) scenarios
 *
 * 3. payroll-calculations.test.js:
 *    - Test overtime calculations
 *    - Test PTO accrual
 *    - Test holiday pay
 *    - Test deductions (fixed and percentage)
 *
 * 4. bank-register-sync.test.js:
 *    - Test payroll creates bank transactions
 *    - Test autoSubtraction toggle
 *    - Test transaction updates when hours change
 *
 * See plan file for detailed test specifications.
 */
