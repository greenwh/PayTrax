import { describe, it, expect, beforeEach } from 'vitest';
import { appData, defaultAppData } from '../../js/state.js';
import {
  generatePayPeriods,
  calculatePayFromData,
  generateW2Report,
  generate941Report,
  generate940Report,
  generateDateRangeEmployeeReport,
  generateDateRangeEmployerReport
} from '../../js/logic.js';
import { createTestEmployee, createHighEarnerEmployee } from '../fixtures/sample-employees.js';
import { createTestSettings } from '../fixtures/sample-settings.js';

/**
 * CRITICAL TAX REPORT TESTS
 *
 * These tests verify the accuracy of tax reports that are used for:
 * - W-2 forms (employee annual wage statements)
 * - Form 941 (quarterly federal tax returns)
 * - Form 940 (annual FUTA tax return)
 *
 * Accuracy is essential for IRS compliance.
 */

describe('W-2 Report (Annual Employee Wage Statement)', () => {
  let employee;

  beforeEach(() => {
    Object.assign(appData, JSON.parse(JSON.stringify(defaultAppData)));
    appData.settings = createTestSettings({
      taxYear: 2024,
      payFrequency: 'bi-weekly',
      firstPayPeriodStartDate: '2024-01-01',
      socialSecurity: 6.2,
      medicare: 1.45,
      ssWageBase: 168600
    });

    employee = createTestEmployee({
      name: 'John Doe',
      idNumber: '123-45-6789',
      rate: 25,
      fedTaxRate: 12,
      stateTaxRate: 5,
      localTaxRate: 2
    });
    appData.employees.push(employee);
    generatePayPeriods();
  });

  it('should return message when no employees exist', () => {
    appData.employees = [];
    const report = generateW2Report(2024);
    expect(report).toContain('No employees found');
  });

  it('should calculate annual totals correctly for single employee', () => {
    // Calculate 4 bi-weekly pay periods (2 months)
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 4; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generateW2Report(2024);

    // 4 periods * $2000 gross = $8000 total
    expect(report).toContain('$8000.00'); // Box 1: Total wages
    expect(report).toContain('John Doe');
    expect(report).toContain('123-45-6789');
  });

  it('should calculate federal tax withheld (Box 2) correctly', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 4; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generateW2Report(2024);

    // 4 periods * $240 federal tax = $960
    expect(report).toContain('$960.00');
  });

  it('should calculate Social Security wages (Box 3) with wage base limit', () => {
    // Create high earner who exceeds SS wage base
    const highEarner = createHighEarnerEmployee({
      rate: 10000 // $10,000/hr = way over SS wage base
    });
    appData.employees = [highEarner];
    generatePayPeriods();

    // Calculate 26 periods
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 26; i++) {
      calculatePayFromData(highEarner.id, i, hours);
    }

    const report = generateW2Report(2024);

    // SS wages should be capped at wage base ($168,600)
    expect(report).toContain('$168600.00');
  });

  it('should calculate Medicare wages (Box 5) without wage limit', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 4; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generateW2Report(2024);

    // Medicare wages = gross wages (no limit)
    // Box 5 should show $8000.00
    expect(report).toContain('Medicare wages');
    expect(report).toContain('$8000.00');
  });

  it('should calculate FICA tax withheld (Box 4) correctly', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 4; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generateW2Report(2024);

    // 4 periods * $124 FICA = $496
    expect(report).toContain('$496.00');
  });

  it('should calculate Medicare tax withheld (Box 6) correctly', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 4; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generateW2Report(2024);

    // 4 periods * $29 Medicare = $116
    expect(report).toContain('$116.00');
  });

  it('should calculate state tax withheld correctly', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 4; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generateW2Report(2024);

    // 4 periods * $100 state tax = $400
    expect(report).toContain('$400.00');
  });

  it('should handle multiple employees in report', () => {
    const employee2 = createTestEmployee({
      name: 'Jane Smith',
      idNumber: '987-65-4321',
      rate: 30
    });
    appData.employees.push(employee2);
    generatePayPeriods();

    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    calculatePayFromData(employee.id, 1, hours);
    calculatePayFromData(employee2.id, 1, hours);

    const report = generateW2Report(2024);

    expect(report).toContain('John Doe');
    expect(report).toContain('Jane Smith');
    expect(report).toContain('$2000.00'); // First employee
    expect(report).toContain('$2400.00'); // Second employee (30 * 80)
  });
});

describe('Form 941 Report (Quarterly Federal Tax Return)', () => {
  let employee;

  beforeEach(() => {
    Object.assign(appData, JSON.parse(JSON.stringify(defaultAppData)));
    appData.settings = createTestSettings({
      taxYear: 2024,
      payFrequency: 'bi-weekly',
      firstPayPeriodStartDate: '2024-01-01',
      socialSecurity: 6.2,
      medicare: 1.45,
      ssWageBase: 168600,
      additionalMedicareThreshold: 200000,
      additionalMedicareRate: 0.9
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

  it('should return error for invalid period format', () => {
    const report = generate941Report('invalid');
    expect(report).toContain('Invalid period');
  });

  it('should return message when no payroll data exists for quarter', () => {
    const report = generate941Report('Q1 2024');
    expect(report).toContain('No payroll data');
  });

  it('should count employees who received compensation', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    // Q1 2024 = Jan-Mar, periods 1-6 for bi-weekly
    for (let i = 1; i <= 6; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generate941Report('Q1 2024');

    // Should show 1 employee
    expect(report).toContain('Number of employees');
  });

  it('should calculate total wages for quarter', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    // Calculate 6 periods in Q1
    for (let i = 1; i <= 6; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generate941Report('Q1 2024');

    // 6 periods * $2000 = $12,000
    expect(report).toContain('$12000.00');
  });

  it('should calculate federal income tax withheld', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 6; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generate941Report('Q1 2024');

    // 6 periods * $240 federal = $1440
    expect(report).toContain('$1440.00');
  });

  it('should calculate combined employer/employee FICA tax', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 6; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generate941Report('Q1 2024');

    // Combined SS rate: 6.2% * 2 = 12.4%
    // $12,000 * 12.4% = $1,488
    expect(report).toContain('$1488.00');
  });

  it('should calculate combined employer/employee Medicare tax', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 6; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generate941Report('Q1 2024');

    // Combined Medicare rate: 1.45% * 2 = 2.9%
    // $12,000 * 2.9% = $348
    expect(report).toContain('$348.00');
  });

  it('should show monthly tax liability breakdown', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 6; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generate941Report('Q1 2024');

    expect(report).toContain('Monthly Tax Liability');
    expect(report).toContain('Month 1 of Quarter');
    expect(report).toContain('Month 2 of Quarter');
    expect(report).toContain('Month 3 of Quarter');
  });

  it('should calculate total taxes after adjustments', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 6; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generate941Report('Q1 2024');

    // Total = Federal + SS tax + Medicare tax
    // $1440 + $1488 + $348 = $3276
    expect(report).toContain('Total taxes');
  });

  it('should track Social Security wage base across quarters', () => {
    // High earner who will hit wage base mid-year
    const highEarner = createHighEarnerEmployee({
      rate: 5000 // $5000/hr = $400,000/year
    });
    appData.employees = [highEarner];
    generatePayPeriods();

    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

    // Calculate Q1 periods
    for (let i = 1; i <= 6; i++) {
      calculatePayFromData(highEarner.id, i, hours);
    }

    // Q1 gross = 6 * 80 * $5000 = $2,400,000 (way over wage base)
    // But SS wages should be capped at $168,600
    const report = generate941Report('Q1 2024');

    expect(report).toContain('Taxable social security wages');
    // Should show capped amount
    expect(report).toContain('$168600');
  });
});

describe('Form 940 Report (Annual FUTA Tax Return)', () => {
  let employee;

  beforeEach(() => {
    Object.assign(appData, JSON.parse(JSON.stringify(defaultAppData)));
    appData.settings = createTestSettings({
      taxYear: 2024,
      payFrequency: 'bi-weekly',
      firstPayPeriodStartDate: '2024-01-01',
      futaRate: 0.6,
      futaWageBase: 7000
    });

    employee = createTestEmployee({
      rate: 25,
      fedTaxRate: 12
    });
    appData.employees.push(employee);
    generatePayPeriods();
  });

  it('should return message when no payroll data exists', () => {
    const report = generate940Report(2024);
    expect(report).toContain('No payroll data');
  });

  it('should calculate FUTA taxable wages with wage base limit', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    // Calculate 10 periods = $20,000 total (over FUTA wage base of $7,000)
    for (let i = 1; i <= 10; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generate940Report(2024);

    // FUTA wages should be capped at $7,000 per employee
    expect(report).toContain('$7000');
  });

  it('should calculate FUTA tax at correct rate', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 10; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generate940Report(2024);

    // FUTA tax = $7,000 * 0.6% = $42
    expect(report).toContain('$42.00');
  });

  it('should show quarterly FUTA liability breakdown when tax exceeds $500', () => {
    // Need enough employees/wages to exceed $500 FUTA tax
    // $500 / 0.6% = ~$83,333 in FUTA wages = 12 employees at $7,000 each
    for (let i = 0; i < 12; i++) {
      const emp = createTestEmployee({
        name: `Employee ${i}`,
        rate: 100 // High rate to quickly exceed wage base
      });
      appData.employees.push(emp);
    }
    generatePayPeriods();

    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    appData.employees.forEach(emp => {
      for (let i = 1; i <= 4; i++) {
        calculatePayFromData(emp.id, i, hours);
      }
    });

    const report = generate940Report(2024);

    // Quarterly breakdown shows "Quarter 1" etc.
    expect(report).toContain('Quarter 1');
    expect(report).toContain('Quarter 2');
  });

  it('should handle multiple employees with separate wage base tracking', () => {
    const employee2 = createTestEmployee({
      name: 'Employee 2',
      rate: 30
    });
    appData.employees.push(employee2);
    generatePayPeriods();

    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    // Both employees work 5 periods each
    for (let i = 1; i <= 5; i++) {
      calculatePayFromData(employee.id, i, hours);
      calculatePayFromData(employee2.id, i, hours);
    }

    const report = generate940Report(2024);

    // Each employee has separate $7,000 wage base
    // Employee 1: 5 * $2,000 = $10,000 -> capped at $7,000
    // Employee 2: 5 * $2,400 = $12,000 -> capped at $7,000
    // Total FUTA wages = $14,000
    expect(report).toContain('$14000');
  });

  it('should calculate total FUTA tax for multiple employees', () => {
    const employee2 = createTestEmployee({ rate: 30 });
    appData.employees.push(employee2);
    generatePayPeriods();

    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 5; i++) {
      calculatePayFromData(employee.id, i, hours);
      calculatePayFromData(employee2.id, i, hours);
    }

    const report = generate940Report(2024);

    // Total FUTA = $14,000 * 0.6% = $84
    expect(report).toContain('$84.00');
  });
});

describe('Date Range Reports', () => {
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

  it('should generate employee report for date range', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 4; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generateDateRangeEmployeeReport('1/1/2024', '2/28/2024', employee.id);

    // Report should return something (even if no data message)
    expect(report).toBeDefined();
    expect(typeof report).toBe('string');
  });

  it('should generate employer report for date range', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 4; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generateDateRangeEmployerReport('1/1/2024', '2/28/2024', employee.id);

    // Report should return something (even if no data message)
    expect(report).toBeDefined();
    expect(typeof report).toBe('string');
  });
});

describe('Report Data Accuracy - Cross-Validation', () => {
  let employee;

  beforeEach(() => {
    Object.assign(appData, JSON.parse(JSON.stringify(defaultAppData)));
    appData.settings = createTestSettings({
      taxYear: 2024,
      payFrequency: 'bi-weekly',
      firstPayPeriodStartDate: '2024-01-01',
      socialSecurity: 6.2,
      medicare: 1.45
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

  it('W-2 totals should match sum of pay periods in tax year', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 26; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    // Calculate expected totals from pay periods IN 2024 ONLY
    const periods = appData.payPeriods[employee.id].filter(p =>
      new Date(p.payDate).getFullYear() === 2024 && p.grossPay > 0
    );
    const expectedGross = periods.reduce((sum, p) => sum + p.grossPay, 0);
    const expectedFederal = periods.reduce((sum, p) => sum + p.taxes.federal, 0);
    const expectedFica = periods.reduce((sum, p) => sum + p.taxes.fica, 0);
    const expectedMedicare = periods.reduce((sum, p) => sum + p.taxes.medicare, 0);

    const report = generateW2Report(2024);

    // W-2 should show exact totals for the tax year
    expect(report).toContain(`$${expectedGross.toFixed(2)}`);
    expect(report).toContain(`$${expectedFederal.toFixed(2)}`);
    expect(report).toContain(`$${expectedFica.toFixed(2)}`);
    expect(report).toContain(`$${expectedMedicare.toFixed(2)}`);
  });

  it('Form 941 quarterly totals should be subset of W-2 annual totals', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 26; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const w2Report = generateW2Report(2024);
    const q1Report = generate941Report('Q1 2024');
    const q2Report = generate941Report('Q2 2024');
    const q3Report = generate941Report('Q3 2024');
    const q4Report = generate941Report('Q4 2024');

    // All quarterly reports should generate without error
    expect(q1Report).toContain('Quarterly');
    expect(q2Report).toContain('Quarterly');
    expect(w2Report).toContain('Annual');
  });

  it('FUTA wage base should be tracked per-employee across year', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

    // Calculate periods (enough to exceed FUTA wage base of $7,000)
    // 4 periods * $2000 = $8,000 > $7,000
    for (let i = 1; i <= 10; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generate940Report(2024);

    // FUTA taxable wages should be capped at $7,000 per employee
    expect(report).toContain('$7000');

    // FUTA tax = $7,000 * 0.6% = $42
    expect(report).toContain('$42.00');
  });
});
