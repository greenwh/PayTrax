import { describe, it, expect, beforeEach } from 'vitest';
import { appData, defaultAppData } from '../../js/state.js';
import {
  generatePayPeriods,
  calculatePayFromData
} from '../../js/logic.js';
import { createTestEmployee } from '../fixtures/sample-employees.js';
import { createTestSettings } from '../fixtures/sample-settings.js';

/**
 * PTO accrual and balance tracking (audit F1).
 *
 * PTO is derived sequentially from employee.ptoStartingBalance by
 * recalculateAllPeriodsForEmployee: each period with worked (regular/overtime)
 * hours accrues ptoAccrualRate / periodsInYear, and PTO hours used reduce the
 * balance. period.ptoBalanceAfter records the running balance per period.
 */
describe('PTO Accrual and Balance Tracking', () => {
  let employee;
  let periodsInYear;
  let perPeriodAccrual;

  beforeEach(() => {
    Object.assign(appData, JSON.parse(JSON.stringify(defaultAppData)));

    appData.settings = createTestSettings({
      taxYear: 2024,
      payFrequency: 'bi-weekly',
      firstPayPeriodStartDate: '2024-01-01',
      daysUntilPayday: 5
    });

    employee = createTestEmployee({
      rate: 25,
      ptoAccrualRate: 80,       // 80 hours/year
      ptoStartingBalance: 40,
      ptoBalance: 40
    });
    appData.employees.push(employee);
    generatePayPeriods();

    periodsInYear = appData.payPeriods[employee.id].length;
    perPeriodAccrual = 80 / periodsInYear;
  });

  it('accrues PTO when working a full period of regular hours', () => {
    calculatePayFromData(employee.id, 1, { regular: 80, overtime: 0, pto: 0, holiday: 0 });

    const period1 = appData.payPeriods[employee.id].find(p => p.period === 1);
    expect(period1.ptoAccrued).toBeCloseTo(perPeriodAccrual, 10);
    expect(period1.ptoBalanceAfter).toBeCloseTo(40 + perPeriodAccrual, 2);
    expect(employee.ptoBalance).toBeCloseTo(40 + perPeriodAccrual, 2);
  });

  it('reduces the balance when PTO hours are used', () => {
    calculatePayFromData(employee.id, 1, { regular: 80, overtime: 0, pto: 0, holiday: 0 });
    calculatePayFromData(employee.id, 2, { regular: 72, overtime: 0, pto: 8, holiday: 0 });

    const expected = 40 + 2 * perPeriodAccrual - 8;
    const period2 = appData.payPeriods[employee.id].find(p => p.period === 2);
    expect(period2.ptoBalanceAfter).toBeCloseTo(expected, 2);
    expect(employee.ptoBalance).toBeCloseTo(expected, 2);
  });

  it('leaves the balance unchanged when recalculating the same period twice (idempotency)', () => {
    calculatePayFromData(employee.id, 1, { regular: 80, overtime: 0, pto: 0, holiday: 0 });
    const balanceAfterFirst = employee.ptoBalance;

    calculatePayFromData(employee.id, 1, { regular: 80, overtime: 0, pto: 0, holiday: 0 });
    expect(employee.ptoBalance).toBe(balanceAfterFirst);
  });

  it('re-derives balances correctly when editing an earlier period after later ones exist', () => {
    calculatePayFromData(employee.id, 1, { regular: 80, overtime: 0, pto: 0, holiday: 0 });
    calculatePayFromData(employee.id, 2, { regular: 80, overtime: 0, pto: 0, holiday: 0 });
    calculatePayFromData(employee.id, 3, { regular: 76, overtime: 0, pto: 4, holiday: 0 });

    // Now edit period 1 to use 8 PTO hours
    calculatePayFromData(employee.id, 1, { regular: 72, overtime: 0, pto: 8, holiday: 0 });

    // From first principles: 40 start, 3 accruing periods, 8 + 4 PTO used
    const expected = 40 + 3 * perPeriodAccrual - 8 - 4;
    expect(employee.ptoBalance).toBeCloseTo(expected, 2);

    const period3 = appData.payPeriods[employee.id].find(p => p.period === 3);
    expect(period3.ptoBalanceAfter).toBeCloseTo(expected, 2);
  });

  it('does not accrue PTO for a period with only holiday hours', () => {
    calculatePayFromData(employee.id, 1, { regular: 0, overtime: 0, pto: 0, holiday: 8 });

    const period1 = appData.payPeriods[employee.id].find(p => p.period === 1);
    expect(period1.ptoAccrued).toBe(0);
    expect(employee.ptoBalance).toBeCloseTo(40, 2);

    // ...but a period with regular hours does accrue
    calculatePayFromData(employee.id, 2, { regular: 80, overtime: 0, pto: 0, holiday: 0 });
    expect(employee.ptoBalance).toBeCloseTo(40 + perPeriodAccrual, 2);
  });

  it('carries the running balance through uncalculated periods via ptoBalanceAfter', () => {
    calculatePayFromData(employee.id, 1, { regular: 80, overtime: 0, pto: 0, holiday: 0 });

    // Period 2 has no hours; its ptoBalanceAfter should equal period 1's
    const period1 = appData.payPeriods[employee.id].find(p => p.period === 1);
    const period2 = appData.payPeriods[employee.id].find(p => p.period === 2);
    expect(period2.ptoAccrued).toBe(0);
    expect(period2.ptoBalanceAfter).toBe(period1.ptoBalanceAfter);
  });
});
