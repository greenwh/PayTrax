import { describe, it, expect, beforeEach } from 'vitest';
import { appData, defaultAppData } from '../../js/state.js';
import {
  generatePayPeriods,
  calculatePayFromData,
  recalculatePeriod,
  recalculateAllPeriodsForEmployee,
  generateW2Report,
  generate940Report,
  generateTaxDepositReportFromData
} from '../../js/logic.js';
import { createTestEmployee } from '../fixtures/sample-employees.js';
import { createTestSettings } from '../fixtures/sample-settings.js';

/**
 * Wage Base Cap Enforcement Tests
 *
 * Verifies that FICA (SS), FUTA, and SUTA taxes stop accruing
 * once an employee's YTD wages exceed the respective wage base.
 * Medicare and income taxes have NO wage base cap and must continue.
 */
describe('Wage Base Cap Enforcement', () => {
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
      futaRate: 0.6,
      ssWageBase: 168600,
      futaWageBase: 7000,
      sutaWageBase: 25000
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

  describe('FUTA Wage Base Cap ($7,000)', () => {
    it('should apply full FUTA tax when YTD is under cap', () => {
      // Period 1: YTD before = $0, gross = $2,000, fully under $7,000
      const result = calculatePayFromData(employee.id, 1, {
        regular: 80, overtime: 0, pto: 0, holiday: 0
      });

      // $2,000 * 0.6% = $12
      expect(result.taxes.futa).toBe(12);
    });

    it('should apply partial FUTA when period crosses the cap', () => {
      const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

      // Periods 1-3: YTD = $6,000 (under cap)
      for (let i = 1; i <= 3; i++) {
        calculatePayFromData(employee.id, i, hours);
      }

      // Period 4: YTD before = $6,000, gross = $2,000
      // Taxable FUTA = min($2,000, $7,000 - $6,000) = $1,000
      // FUTA = $1,000 * 0.6% = $6
      const p4 = calculatePayFromData(employee.id, 4, hours);
      expect(p4.taxes.futa).toBe(6);
    });

    it('should apply zero FUTA once cap is exceeded', () => {
      const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

      // Periods 1-4: YTD after P4 = $8,000 (over cap)
      for (let i = 1; i <= 4; i++) {
        calculatePayFromData(employee.id, i, hours);
      }

      // Period 5: YTD before = $8,000, cap = $7,000, FUTA = $0
      const p5 = calculatePayFromData(employee.id, 5, hours);
      expect(p5.taxes.futa).toBe(0);

      // Period 6: Should also be $0
      const p6 = calculatePayFromData(employee.id, 6, hours);
      expect(p6.taxes.futa).toBe(0);
    });

    it('should total FUTA correctly across all periods up to cap', () => {
      const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

      // Run 6 periods
      for (let i = 1; i <= 6; i++) {
        calculatePayFromData(employee.id, i, hours);
      }

      const periods = appData.payPeriods[employee.id];
      const totalFuta = periods.slice(0, 6).reduce((sum, p) => sum + p.taxes.futa, 0);

      // $7,000 * 0.6% = $42 (exact cap)
      expect(totalFuta).toBe(42);
    });
  });

  describe('SUTA Wage Base Cap ($25,000)', () => {
    it('should apply full SUTA when YTD is under cap', () => {
      const result = calculatePayFromData(employee.id, 1, {
        regular: 80, overtime: 0, pto: 0, holiday: 0
      });

      // $2,000 * 2.7% = $54
      expect(result.taxes.suta).toBe(54);
    });

    it('should apply partial SUTA when period crosses the cap', () => {
      const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

      // Periods 1-12: YTD = $24,000 (under $25,000)
      for (let i = 1; i <= 12; i++) {
        calculatePayFromData(employee.id, i, hours);
      }

      // Period 13: YTD before = $24,000, gross = $2,000
      // Taxable SUTA = min($2,000, $25,000 - $24,000) = $1,000
      // SUTA = $1,000 * 2.7% = $27
      const p13 = calculatePayFromData(employee.id, 13, hours);
      expect(p13.taxes.suta).toBe(27);
    });

    it('should apply zero SUTA once cap is exceeded', () => {
      const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

      // Periods 1-13: YTD after P13 = $26,000 (over cap)
      for (let i = 1; i <= 13; i++) {
        calculatePayFromData(employee.id, i, hours);
      }

      // Period 14: SUTA = $0
      const p14 = calculatePayFromData(employee.id, 14, hours);
      expect(p14.taxes.suta).toBe(0);
    });

    it('should total SUTA correctly up to the cap', () => {
      const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

      for (let i = 1; i <= 15; i++) {
        calculatePayFromData(employee.id, i, hours);
      }

      const periods = appData.payPeriods[employee.id];
      const totalSuta = periods.slice(0, 15).reduce((sum, p) => sum + p.taxes.suta, 0);

      // $25,000 * 2.7% = $675
      expect(totalSuta).toBe(675);
    });
  });

  describe('Social Security (FICA) Wage Base Cap', () => {
    // Use a low SS wage base for practical testing
    beforeEach(() => {
      appData.settings.ssWageBase = 5000;
    });

    it('should apply full FICA when under SS wage base', () => {
      const result = calculatePayFromData(employee.id, 1, {
        regular: 80, overtime: 0, pto: 0, holiday: 0
      });

      // $2,000 * 6.2% = $124
      expect(result.taxes.fica).toBe(124);
    });

    it('should apply partial FICA when period crosses the cap', () => {
      const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

      // Period 1: YTD = $2,000
      calculatePayFromData(employee.id, 1, hours);
      // Period 2: YTD = $4,000
      calculatePayFromData(employee.id, 2, hours);

      // Period 3: YTD before = $4,000, gross = $2,000
      // Taxable SS = min($2,000, $5,000 - $4,000) = $1,000
      // FICA = $1,000 * 6.2% = $62
      const p3 = calculatePayFromData(employee.id, 3, hours);
      expect(p3.taxes.fica).toBe(62);
    });

    it('should apply zero FICA once SS cap is exceeded', () => {
      const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

      for (let i = 1; i <= 3; i++) {
        calculatePayFromData(employee.id, i, hours);
      }

      // Period 4: YTD before = $6,000, cap = $5,000, FICA = $0
      const p4 = calculatePayFromData(employee.id, 4, hours);
      expect(p4.taxes.fica).toBe(0);
    });

    it('should total FICA correctly up to SS cap', () => {
      const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

      for (let i = 1; i <= 5; i++) {
        calculatePayFromData(employee.id, i, hours);
      }

      const periods = appData.payPeriods[employee.id];
      const totalFica = periods.slice(0, 5).reduce((sum, p) => sum + p.taxes.fica, 0);

      // $5,000 * 6.2% = $310
      expect(totalFica).toBe(310);
    });
  });

  describe('Medicare Has No Cap', () => {
    beforeEach(() => {
      // Set SS cap very low to prove Medicare is not capped
      appData.settings.ssWageBase = 3000;
    });

    it('should continue Medicare tax after SS cap is reached', () => {
      const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

      // Period 1: YTD = $2,000, under SS cap
      calculatePayFromData(employee.id, 1, hours);
      // Period 2: YTD = $4,000, SS cap crossed at $3,000
      calculatePayFromData(employee.id, 2, hours);

      // Period 3: YTD before = $4,000, over SS cap
      const p3 = calculatePayFromData(employee.id, 3, hours);

      // FICA should be $0 (over SS cap)
      expect(p3.taxes.fica).toBe(0);

      // Medicare should still be full: $2,000 * 1.45% = $29
      expect(p3.taxes.medicare).toBe(29);
    });

    it('should apply Medicare to all periods regardless of caps', () => {
      const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

      for (let i = 1; i <= 10; i++) {
        calculatePayFromData(employee.id, i, hours);
      }

      const periods = appData.payPeriods[employee.id];
      // Every period should have Medicare = $29 (2000 * 1.45%)
      for (let i = 0; i < 10; i++) {
        expect(periods[i].taxes.medicare).toBe(29);
      }
    });
  });

  describe('Income Taxes Have No Cap', () => {
    beforeEach(() => {
      // Set all wage base caps very low
      appData.settings.ssWageBase = 3000;
      appData.settings.futaWageBase = 3000;
      appData.settings.sutaWageBase = 3000;
    });

    it('should continue federal, state, local taxes after all caps hit', () => {
      const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

      // Run several periods to exceed all caps
      for (let i = 1; i <= 5; i++) {
        calculatePayFromData(employee.id, i, hours);
      }

      // Period 5: YTD before = $8,000, all caps ($3,000) exceeded
      const p5 = appData.payPeriods[employee.id][4];

      // Capped taxes should be $0
      expect(p5.taxes.fica).toBe(0);
      expect(p5.taxes.futa).toBe(0);
      expect(p5.taxes.suta).toBe(0);

      // Uncapped taxes should still be normal
      expect(p5.taxes.federal).toBe(240); // $2,000 * 12%
      expect(p5.taxes.state).toBe(100);   // $2,000 * 5%
      expect(p5.taxes.local).toBe(40);    // $2,000 * 2%
      expect(p5.taxes.medicare).toBe(29); // $2,000 * 1.45%
    });
  });

  describe('Cap Crossing Period (Partial Taxation)', () => {
    it('should correctly calculate the crossing period for FUTA', () => {
      // Employee earns $2,000/period, FUTA cap = $7,000
      // Period 4: YTD before = $6,000, gross = $2,000
      // Only $1,000 is taxable: $7,000 - $6,000 = $1,000
      const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

      for (let i = 1; i <= 4; i++) {
        calculatePayFromData(employee.id, i, hours);
      }

      const p4 = appData.payPeriods[employee.id][3];
      // FUTA = $1,000 * 0.6% = $6 (not $12)
      expect(p4.taxes.futa).toBe(6);
    });

    it('should correctly handle exact cap boundary', () => {
      // Set FUTA wage base to exactly 2 periods worth
      appData.settings.futaWageBase = 4000;

      const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

      // Period 1: $2,000, fully taxable
      const p1 = calculatePayFromData(employee.id, 1, hours);
      expect(p1.taxes.futa).toBe(12); // $2,000 * 0.6%

      // Period 2: $2,000, fully taxable (YTD = $2,000 + $2,000 = $4,000 = cap)
      const p2 = calculatePayFromData(employee.id, 2, hours);
      expect(p2.taxes.futa).toBe(12); // $2,000 * 0.6%

      // Period 3: $2,000, zero taxable (YTD before = $4,000 >= cap)
      const p3 = calculatePayFromData(employee.id, 3, hours);
      expect(p3.taxes.futa).toBe(0);
    });
  });

  describe('Sequential Recalculation with Caps', () => {
    it('should maintain correct caps when editing an earlier period', () => {
      const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

      // Calculate 6 periods with standard hours
      for (let i = 1; i <= 6; i++) {
        calculatePayFromData(employee.id, i, hours);
      }

      // Verify period 5 has no FUTA (YTD before P5 = $8,000 > $7,000)
      expect(appData.payPeriods[employee.id][4].taxes.futa).toBe(0);

      // Now edit period 1 to have fewer hours (triggers full recalc)
      calculatePayFromData(employee.id, 1, {
        regular: 40, overtime: 0, pto: 0, holiday: 0
      });

      // After recalc: P1 gross = $1,000, P2-6 gross = $2,000 each
      // YTD after P5: $1,000 + $2,000*4 = $9,000
      // FUTA taxable through P4: $1,000 + $2,000 + $2,000 + $2,000 = $7,000 (exact cap)
      // P5 FUTA = $0 (YTD before P5 = $7,000 >= cap)
      const p5 = appData.payPeriods[employee.id][4];
      expect(p5.taxes.futa).toBe(0);

      // But P4 should now be different: YTD before P4 = $5,000, taxable = $2,000
      const p4 = appData.payPeriods[employee.id][3];
      expect(p4.taxes.futa).toBe(12); // Full $2,000 * 0.6%
    });

    it('should increase FUTA when earlier period gross is reduced', () => {
      // Set up: FUTA cap = $7,000 with $2,000/period
      const fullHours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

      for (let i = 1; i <= 6; i++) {
        calculatePayFromData(employee.id, i, fullHours);
      }

      // Total FUTA with $2,000/period: $42 (7000 * 0.6%)
      let totalFuta = appData.payPeriods[employee.id]
        .slice(0, 6).reduce((sum, p) => sum + p.taxes.futa, 0);
      expect(totalFuta).toBe(42);

      // Reduce P1 to 0 hours - this shifts cap threshold forward
      calculatePayFromData(employee.id, 1, {
        regular: 0, overtime: 0, pto: 0, holiday: 0
      });

      // Now P1 gross = $0, P2-6 gross = $2,000 each (total 5 periods)
      // YTD after P6 = $10,000
      // FUTA taxable: P2=$2,000, P3=$2,000, P4=$2,000, P5=$1,000 (cap crossing), P6=$0
      // Total FUTA still = $7,000 * 0.6% = $42
      totalFuta = appData.payPeriods[employee.id]
        .slice(0, 6).reduce((sum, p) => sum + p.taxes.futa, 0);
      expect(totalFuta).toBe(42);
    });
  });

  describe('Net Pay Impact', () => {
    it('should increase net pay when FICA cap is reached', () => {
      appData.settings.ssWageBase = 3000;

      const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

      // Period 1: FICA = $124 ($2,000 * 6.2%)
      const p1 = calculatePayFromData(employee.id, 1, hours);

      // Period 2: FICA = $62 (only $1,000 taxable: $3,000 - $2,000)
      const p2 = calculatePayFromData(employee.id, 2, hours);

      // Period 3: FICA = $0 (over cap)
      const p3 = calculatePayFromData(employee.id, 3, hours);

      // Net pay should increase as FICA drops
      // P1 net: 2000 - (240+100+40+124+29) = 2000 - 533 = 1467
      // P2 net: 2000 - (240+100+40+62+29)  = 2000 - 471 = 1529
      // P3 net: 2000 - (240+100+40+0+29)   = 2000 - 409 = 1591
      expect(p1.netPay).toBe(1467);
      expect(p2.netPay).toBe(1529);
      expect(p3.netPay).toBe(1591);

      // Net should increase as caps are reached
      expect(p3.netPay).toBeGreaterThan(p2.netPay);
      expect(p2.netPay).toBeGreaterThan(p1.netPay);
    });
  });

  describe('Bank Register Impact', () => {
    it('should reduce payroll cost in bank register when caps hit', () => {
      appData.settings.futaWageBase = 3000;
      appData.settings.sutaWageBase = 3000;
      appData.settings.ssWageBase = 3000;

      const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

      // Period 1: All taxes apply
      calculatePayFromData(employee.id, 1, hours);

      // Period 3: All capped taxes at $0
      calculatePayFromData(employee.id, 2, hours);
      calculatePayFromData(employee.id, 3, hours);

      // Find bank register entries
      const p1Txn = appData.bankRegister.find(t =>
        t.id === `payroll-${employee.id}-1-2024`
      );
      const p3Txn = appData.bankRegister.find(t =>
        t.id === `payroll-${employee.id}-3-2024`
      );

      // P1: gross + suta + futa + fica + medicare = 2000 + 54 + 12 + 124 + 29 = 2219
      expect(p1Txn.debit).toBe(2219);

      // P3: gross + 0 + 0 + 0 + medicare = 2000 + 0 + 0 + 0 + 29 = 2029
      expect(p3Txn.debit).toBe(2029);
    });
  });

  describe('Configurable Wage Base', () => {
    it('should respect custom SUTA wage base from settings', () => {
      appData.settings.sutaWageBase = 5000;

      const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

      // P1: $2,000, SUTA = $54
      const p1 = calculatePayFromData(employee.id, 1, hours);
      expect(p1.taxes.suta).toBe(54);

      // P2: $2,000, SUTA = $54
      const p2 = calculatePayFromData(employee.id, 2, hours);
      expect(p2.taxes.suta).toBe(54);

      // P3: YTD before = $4,000, taxable = $1,000, SUTA = $27
      const p3 = calculatePayFromData(employee.id, 3, hours);
      expect(p3.taxes.suta).toBe(27);

      // P4: YTD before = $6,000, taxable = $0, SUTA = $0
      const p4 = calculatePayFromData(employee.id, 4, hours);
      expect(p4.taxes.suta).toBe(0);
    });

    it('should respect custom SS wage base from settings', () => {
      appData.settings.ssWageBase = 4000;

      const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

      // P1: $2,000, FICA = $124
      const p1 = calculatePayFromData(employee.id, 1, hours);
      expect(p1.taxes.fica).toBe(124);

      // P2: YTD before = $2,000, taxable = $2,000, FICA = $124
      const p2 = calculatePayFromData(employee.id, 2, hours);
      expect(p2.taxes.fica).toBe(124);

      // P3: YTD before = $4,000, cap reached, FICA = $0
      const p3 = calculatePayFromData(employee.id, 3, hours);
      expect(p3.taxes.fica).toBe(0);
    });
  });

  describe('Running Remainders with Caps', () => {
    it('should not accumulate remainders for zero-tax periods', () => {
      appData.settings.futaWageBase = 3000;

      const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

      // Calculate several periods past the FUTA cap
      for (let i = 1; i <= 5; i++) {
        calculatePayFromData(employee.id, i, hours);
      }

      // FUTA remainder should be 0 or effectively zero for periods after the cap
      // Since we're feeding 0 into calculateTaxWithRemainder, the remainder
      // should stabilize at 0
      const emp = appData.employees.find(e => e.id === employee.id);
      expect(Math.abs(emp.taxRemainders.futa)).toBeLessThan(0.01);
    });

    it('should handle fractional-cent amounts during cap crossing correctly', () => {
      // Use a rate that creates fractional cents
      const fractionalEmployee = createTestEmployee({
        rate: 19.33,
        fedTaxRate: 12,
        stateTaxRate: 5,
        localTaxRate: 2
      });
      appData.employees.push(fractionalEmployee);
      generatePayPeriods();

      appData.settings.futaWageBase = 5000;

      const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

      // Calculate periods until FUTA cap is crossed
      for (let i = 1; i <= 5; i++) {
        calculatePayFromData(fractionalEmployee.id, i, hours);
      }

      // Total FUTA should equal exactly: $5,000 * 0.6% = $30
      const periods = appData.payPeriods[fractionalEmployee.id];
      const totalFuta = periods.slice(0, 5).reduce((sum, p) => sum + p.taxes.futa, 0);
      expect(totalFuta).toBeCloseTo(30, 0); // Within $1 due to rounding
    });
  });
});

/**
 * Report Consistency Tests with Wage Base Caps
 *
 * Verifies that reports (W-2, 940, tax deposit) produce correct results
 * when per-period tax amounts are already capped. Reports should NOT
 * double-apply caps.
 */
describe('Report Consistency with Wage Base Caps', () => {
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
      futaRate: 0.6,
      ssWageBase: 5000,   // Low for testing
      futaWageBase: 7000,
      sutaWageBase: 25000,
      taxFrequencies: {
        federal: 'quarterly',
        futa: 'quarterly',
        suta: 'quarterly',
        state: 'quarterly',
        local: 'quarterly'
      }
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

  it('W-2 Box 4 (SS tax) should closely match Box 3 (SS wages) * 6.2%', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 10; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    // Sum of per-period FICA = Box 4
    const periods = appData.payPeriods[employee.id].filter(p =>
      new Date(p.payDate).getFullYear() === 2024 && p.grossPay > 0
    );
    const box4 = periods.reduce((sum, p) => sum + p.taxes.fica, 0);

    // Box 3 (SS wages) = min(total gross, SS wage base) = $5,000
    // Expected Box 4 = $5,000 * 6.2% = $310
    expect(box4).toBe(310);
    expect(box4).toBeCloseTo(5000 * 0.062, 0);
  });

  it('940 report FUTA tax should match sum of per-period FUTA taxes', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 10; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    // Sum of per-period FUTA
    const periods = appData.payPeriods[employee.id].filter(p =>
      new Date(p.payDate).getFullYear() === 2024 && p.grossPay > 0
    );
    const sumFuta = periods.reduce((sum, p) => sum + p.taxes.futa, 0);

    // 940 report computes FUTA independently from wages
    // Both should agree: $7,000 * 0.6% = $42
    expect(sumFuta).toBe(42);

    const report = generate940Report('2024');
    expect(report).toContain('$42.00');
  });

  it('tax deposit report should use capped per-period FUTA amounts', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 6; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generateTaxDepositReportFromData('quarterly', 'Q1 2024');

    // FUTA in deposit report sums p.taxes.futa directly
    // With cap: P1-3=$12 each, P4=$6, P5-6=$0, total=$42
    if (report.liabilities['FUTA (940)']) {
      expect(report.liabilities['FUTA (940)'].amount).toBe(42);
    }
  });

  it('tax deposit report FICA should reflect capped amounts', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 6; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generateTaxDepositReportFromData('quarterly', 'Q1 2024');

    // Federal Payroll includes FICA * 2
    // With SS wage base = $5,000: P1=$124, P2=$62 (partial), P3-6=$0
    // Sum FICA = $310 (= $5000 * 6.2%), FICA*2 = $620
    const federal = report.liabilities['Federal Payroll (941)'];
    if (federal) {
      expect(federal.breakdown.fica).toBe(620); // $310 * 2
    }
  });
});
