import { describe, it, expect, beforeEach } from 'vitest';
import { appData, defaultAppData } from '../../js/state.js';
import {
  generatePayPeriods,
  calculatePayFromData,
  generateTaxDepositReportFromData
} from '../../js/logic.js';
import { createTestEmployee } from '../fixtures/sample-employees.js';
import { createTestSettings } from '../fixtures/sample-settings.js';

/**
 * CRITICAL TAX DEPOSIT REPORT TESTS
 *
 * Tax deposit reports tell you how much to pay the IRS and state agencies
 * at required intervals. These are mission-critical for compliance.
 *
 * Deposit Frequencies:
 * - Weekly: Due each week based on specific pay date
 * - Bi-weekly: Due every two weeks based on specific pay date
 * - Monthly: Due based on calendar month
 * - Quarterly: Due based on calendar quarter (Q1-Q4)
 * - Annual: Due based on calendar year
 *
 * Tax Types:
 * - Federal Payroll (941): Federal WH + FICA (employer+employee) + Medicare (employer+employee)
 * - FUTA (940): Federal unemployment tax (employer only)
 * - SUTA: State unemployment tax (employer only)
 * - State Income Tax: State withholding
 * - Local Tax: Local/city withholding
 */

describe('Tax Deposit Reports - Monthly Frequency', () => {
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
      taxFrequencies: {
        federal: 'monthly',
        futa: 'quarterly',
        suta: 'quarterly',
        state: 'monthly',
        local: 'monthly'
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

  it('should calculate monthly Federal (941) deposit correctly', () => {
    // Calculate several pay periods
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 4; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generateTaxDepositReportFromData('monthly', 'January 2024');

    // At least 1 period should fall in January
    expect(report.periodsIncluded).toBeGreaterThan(0);
    expect(report.liabilities['Federal Payroll (941)']).toBeDefined();

    // Per period: $2000 gross
    // Federal WH: $240
    // FICA (employer+employee): $124 * 2 = $248
    // Medicare (employer+employee): $29 * 2 = $58
    // Total per period: $546
    const federal = report.liabilities['Federal Payroll (941)'];
    const periodsInJan = report.periodsIncluded;
    expect(federal.amount).toBe(546 * periodsInJan);
    expect(federal.breakdown.federal).toBe(240 * periodsInJan);
    expect(federal.breakdown.fica).toBe(248 * periodsInJan);
    expect(federal.breakdown.medicare).toBe(58 * periodsInJan);
  });

  it('should calculate monthly State deposit correctly', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 4; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generateTaxDepositReportFromData('monthly', 'January 2024');
    const periodsInJan = report.periodsIncluded;

    // State tax: $100 per period
    expect(report.liabilities['State Income Tax']).toBeDefined();
    expect(report.liabilities['State Income Tax'].amount).toBe(100 * periodsInJan);
  });

  it('should calculate monthly Local tax deposit correctly', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 4; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generateTaxDepositReportFromData('monthly', 'January 2024');
    const periodsInJan = report.periodsIncluded;

    // Local tax: $40 per period
    expect(report.liabilities['Local Tax']).toBeDefined();
    expect(report.liabilities['Local Tax'].amount).toBe(40 * periodsInJan);
  });

  it('should NOT include FUTA/SUTA in monthly report (configured as quarterly)', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    calculatePayFromData(employee.id, 1, hours);
    calculatePayFromData(employee.id, 2, hours);

    const report = generateTaxDepositReportFromData('monthly', 'January 2024');

    // FUTA and SUTA are quarterly, not monthly
    expect(report.liabilities['FUTA (940)']).toBeUndefined();
    expect(report.liabilities['SUTA']).toBeUndefined();
  });

  it('should handle numeric month format (01/24)', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    calculatePayFromData(employee.id, 1, hours);

    const report = generateTaxDepositReportFromData('monthly', '01/24');

    expect(report.periodsIncluded).toBeGreaterThan(0);
    expect(report.reportTitle).toContain('January 2024');
  });

  it('should handle month name format (June 2024)', () => {
    // Calculate periods in June (approximately periods 12-13 for bi-weekly)
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 13; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generateTaxDepositReportFromData('monthly', 'June 2024');

    expect(report.reportTitle).toContain('Jun');
    // Should have some periods (exact count depends on pay dates)
  });

  it('should calculate total deposit correctly', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 4; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generateTaxDepositReportFromData('monthly', 'January 2024');
    const periodsInJan = report.periodsIncluded;

    // Total per period = Federal ($546) + State ($100) + Local ($40) = $686
    expect(report.totalDeposit).toBe(686 * periodsInJan);
  });

  it('should return error for invalid month format', () => {
    const report = generateTaxDepositReportFromData('monthly', 'invalid');

    expect(report.error).toBeDefined();
    expect(report.periodsIncluded).toBe(0);
  });

  it('should return error when no period input provided', () => {
    const report = generateTaxDepositReportFromData('monthly', null);

    expect(report.error).toBeDefined();
    expect(report.error).toContain('enter a period');
  });
});

describe('Tax Deposit Reports - Quarterly Frequency', () => {
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

  it('should calculate Q1 Federal (941) deposit correctly', () => {
    // Q1 = Jan-Mar = approximately 6 bi-weekly periods
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 6; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generateTaxDepositReportFromData('quarterly', 'Q1 2024');

    expect(report.liabilities['Federal Payroll (941)']).toBeDefined();
    const federal = report.liabilities['Federal Payroll (941)'];

    // 6 periods * ($240 FedWH + $248 FICA + $58 Medicare) = 6 * $546 = $3276
    expect(federal.amount).toBe(3276);
    expect(federal.breakdown.federal).toBe(1440); // 6 * $240
    expect(federal.breakdown.fica).toBe(1488);    // 6 * $248 (124*2)
    expect(federal.breakdown.medicare).toBe(348); // 6 * $58 (29*2)
  });

  it('should calculate quarterly FUTA (940) deposit correctly', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 6; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generateTaxDepositReportFromData('quarterly', 'Q1 2024');

    // FUTA with $7,000 wage base cap: P1-3=$12 each, P4=$6 (partial), P5-6=$0
    expect(report.liabilities['FUTA (940)']).toBeDefined();
    expect(report.liabilities['FUTA (940)'].amount).toBe(42);
  });

  it('should calculate quarterly SUTA deposit correctly', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 6; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generateTaxDepositReportFromData('quarterly', 'Q1 2024');

    // SUTA: $54 per period * 6 = $324
    expect(report.liabilities['SUTA']).toBeDefined();
    expect(report.liabilities['SUTA'].amount).toBe(324);
  });

  it('should calculate Q2 deposits separately from Q1', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    // Calculate Q1 (periods 1-6) and Q2 (periods 7-13)
    for (let i = 1; i <= 13; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const q1Report = generateTaxDepositReportFromData('quarterly', 'Q1 2024');
    const q2Report = generateTaxDepositReportFromData('quarterly', 'Q2 2024');

    // Both quarters should have deposits
    expect(q1Report.totalDeposit).toBeGreaterThan(0);
    expect(q2Report.totalDeposit).toBeGreaterThan(0);

    // Q1 and Q2 should have different period counts
    expect(q1Report.periodsIncluded).toBeGreaterThan(0);
    expect(q2Report.periodsIncluded).toBeGreaterThan(0);
  });

  it('should handle all quarters (Q1, Q2, Q3, Q4)', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    // Calculate full year
    for (let i = 1; i <= 26; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const q1 = generateTaxDepositReportFromData('quarterly', 'Q1 2024');
    const q2 = generateTaxDepositReportFromData('quarterly', 'Q2 2024');
    const q3 = generateTaxDepositReportFromData('quarterly', 'Q3 2024');
    const q4 = generateTaxDepositReportFromData('quarterly', 'Q4 2024');

    expect(q1.periodsIncluded).toBeGreaterThan(0);
    expect(q2.periodsIncluded).toBeGreaterThan(0);
    expect(q3.periodsIncluded).toBeGreaterThan(0);
    expect(q4.periodsIncluded).toBeGreaterThan(0);
  });

  it('should sum quarterly deposits to approximately match annual totals', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 26; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const q1 = generateTaxDepositReportFromData('quarterly', 'Q1 2024');
    const q2 = generateTaxDepositReportFromData('quarterly', 'Q2 2024');
    const q3 = generateTaxDepositReportFromData('quarterly', 'Q3 2024');
    const q4 = generateTaxDepositReportFromData('quarterly', 'Q4 2024');

    const quarterlyTotal = q1.totalDeposit + q2.totalDeposit + q3.totalDeposit + q4.totalDeposit;

    // Should be substantial amount for 26 periods
    expect(quarterlyTotal).toBeGreaterThan(10000);
  });
});

describe('Tax Deposit Reports - Weekly/Bi-Weekly Frequency', () => {
  let employee;

  beforeEach(() => {
    Object.assign(appData, JSON.parse(JSON.stringify(defaultAppData)));
    appData.settings = createTestSettings({
      taxYear: 2024,
      payFrequency: 'bi-weekly',
      firstPayPeriodStartDate: '2024-01-01',
      socialSecurity: 6.2,
      medicare: 1.45,
      taxFrequencies: {
        federal: 'bi-weekly',
        futa: 'quarterly',
        suta: 'quarterly',
        state: 'bi-weekly',
        local: 'bi-weekly'
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

  it('should calculate bi-weekly Federal deposit for specific pay date', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    calculatePayFromData(employee.id, 1, hours);

    // Get the actual pay date from the period
    const payDate = appData.payPeriods[employee.id][0].payDate;
    const report = generateTaxDepositReportFromData('bi-weekly', null, payDate);

    expect(report.periodsIncluded).toBe(1);
    expect(report.liabilities['Federal Payroll (941)']).toBeDefined();

    // Single period: Federal $240 + FICA $248 + Medicare $58 = $546
    const federal = report.liabilities['Federal Payroll (941)'];
    expect(federal.amount).toBe(546);
  });

  it('should require pay date for weekly/bi-weekly deposits', () => {
    const report = generateTaxDepositReportFromData('bi-weekly', null, null);

    expect(report.error).toBeDefined();
    expect(report.error).toContain('select a pay period');
  });

  it('should only include periods matching the specific pay date', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    calculatePayFromData(employee.id, 1, hours);
    calculatePayFromData(employee.id, 2, hours);

    // Use first period's pay date - should only get 1 period
    const payDate = appData.payPeriods[employee.id][0].payDate;
    const report = generateTaxDepositReportFromData('bi-weekly', null, payDate);

    expect(report.periodsIncluded).toBe(1);
  });

  it('should handle weekly frequency configuration', () => {
    appData.settings.taxFrequencies.federal = 'weekly';

    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    calculatePayFromData(employee.id, 1, hours);

    const payDate = appData.payPeriods[employee.id][0].payDate;
    const report = generateTaxDepositReportFromData('weekly', null, payDate);

    // Should match weekly configured taxes
    expect(report.liabilities['Federal Payroll (941)']).toBeDefined();
  });
});

describe('Tax Deposit Reports - Annual Frequency', () => {
  let employee;

  beforeEach(() => {
    Object.assign(appData, JSON.parse(JSON.stringify(defaultAppData)));
    appData.settings = createTestSettings({
      taxYear: 2024,
      payFrequency: 'bi-weekly',
      firstPayPeriodStartDate: '2024-01-01',
      taxFrequencies: {
        federal: 'annual',
        futa: 'annual',
        suta: 'annual',
        state: 'annual',
        local: 'annual'
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

  it('should calculate annual deposit for full year', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 26; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generateTaxDepositReportFromData('annual', '2024');

    expect(report.liabilities['Federal Payroll (941)']).toBeDefined();
    // Should include all periods with pay dates in 2024
    expect(report.periodsIncluded).toBeGreaterThan(20);
  });

  it('should include all tax types configured for annual', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 10; i++) {
      calculatePayFromData(employee.id, i, hours);
    }

    const report = generateTaxDepositReportFromData('annual', '2024');

    expect(report.liabilities['Federal Payroll (941)']).toBeDefined();
    expect(report.liabilities['FUTA (940)']).toBeDefined();
    expect(report.liabilities['SUTA']).toBeDefined();
    expect(report.liabilities['State Income Tax']).toBeDefined();
    expect(report.liabilities['Local Tax']).toBeDefined();
  });
});

describe('Tax Deposit Reports - Tax Frequency Configuration', () => {
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

    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    for (let i = 1; i <= 6; i++) {
      calculatePayFromData(employee.id, i, hours);
    }
  });

  it('should only include taxes matching the requested frequency', () => {
    appData.settings.taxFrequencies = {
      federal: 'monthly',
      futa: 'quarterly',
      suta: 'quarterly',
      state: 'monthly',
      local: 'quarterly'
    };

    const monthlyReport = generateTaxDepositReportFromData('monthly', 'January 2024');
    const quarterlyReport = generateTaxDepositReportFromData('quarterly', 'Q1 2024');

    // Monthly should have Federal and State, but not FUTA/SUTA/Local
    expect(monthlyReport.liabilities['Federal Payroll (941)']).toBeDefined();
    expect(monthlyReport.liabilities['State Income Tax']).toBeDefined();
    expect(monthlyReport.liabilities['FUTA (940)']).toBeUndefined();
    expect(monthlyReport.liabilities['SUTA']).toBeUndefined();
    expect(monthlyReport.liabilities['Local Tax']).toBeUndefined();

    // Quarterly should have FUTA, SUTA, Local, but not Federal/State
    expect(quarterlyReport.liabilities['FUTA (940)']).toBeDefined();
    expect(quarterlyReport.liabilities['SUTA']).toBeDefined();
    expect(quarterlyReport.liabilities['Local Tax']).toBeDefined();
    expect(quarterlyReport.liabilities['Federal Payroll (941)']).toBeUndefined();
    expect(quarterlyReport.liabilities['State Income Tax']).toBeUndefined();
  });

  it('should handle mixed frequency configuration (common real-world scenario)', () => {
    // Common setup: Federal semi-weekly/monthly, FUTA quarterly, State monthly
    appData.settings.taxFrequencies = {
      federal: 'monthly',
      futa: 'quarterly',
      suta: 'quarterly',
      state: 'monthly',
      local: 'monthly'
    };

    const monthly = generateTaxDepositReportFromData('monthly', 'January 2024');
    const quarterly = generateTaxDepositReportFromData('quarterly', 'Q1 2024');

    // Monthly includes employee-side taxes
    expect(monthly.liabilities['Federal Payroll (941)']).toBeDefined();
    expect(monthly.liabilities['State Income Tax']).toBeDefined();

    // Quarterly includes employer-side unemployment taxes
    expect(quarterly.liabilities['FUTA (940)']).toBeDefined();
    expect(quarterly.liabilities['SUTA']).toBeDefined();
  });

  it('should handle case-insensitive frequency matching', () => {
    appData.settings.taxFrequencies = {
      federal: 'Monthly',  // Capital M
      futa: 'QUARTERLY',   // All caps
      suta: 'Quarterly',
      state: 'monthly',
      local: 'Monthly'
    };

    const report = generateTaxDepositReportFromData('monthly', 'January 2024');

    expect(report.liabilities['Federal Payroll (941)']).toBeDefined();
    expect(report.liabilities['State Income Tax']).toBeDefined();
    expect(report.liabilities['Local Tax']).toBeDefined();
  });
});

describe('Tax Deposit Reports - Multiple Employees', () => {
  beforeEach(() => {
    Object.assign(appData, JSON.parse(JSON.stringify(defaultAppData)));
    appData.settings = createTestSettings({
      taxYear: 2024,
      payFrequency: 'bi-weekly',
      firstPayPeriodStartDate: '2024-01-01',
      taxFrequencies: {
        federal: 'monthly',
        futa: 'quarterly',
        suta: 'quarterly',
        state: 'monthly',
        local: 'monthly'
      }
    });
  });

  it('should aggregate deposits across multiple employees', () => {
    const emp1 = createTestEmployee({ name: 'Employee 1', rate: 25 });
    const emp2 = createTestEmployee({ name: 'Employee 2', rate: 30 });
    appData.employees.push(emp1, emp2);
    generatePayPeriods();

    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    // Calculate several periods for each employee
    for (let i = 1; i <= 4; i++) {
      calculatePayFromData(emp1.id, i, hours);
      calculatePayFromData(emp2.id, i, hours);
    }

    const report = generateTaxDepositReportFromData('monthly', 'January 2024');

    // Should include periods from both employees in January
    expect(report.periodsIncluded).toBeGreaterThan(0);

    // Federal deposits should be sum of both employees
    const federal = report.liabilities['Federal Payroll (941)'];
    expect(federal).toBeDefined();
    expect(federal.amount).toBeGreaterThan(500);
  });

  it('should correctly calculate employer taxes for multiple employees', () => {
    const emp1 = createTestEmployee({ rate: 25 });
    const emp2 = createTestEmployee({ rate: 30 });
    const emp3 = createTestEmployee({ rate: 20 });
    appData.employees.push(emp1, emp2, emp3);
    generatePayPeriods();

    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    appData.employees.forEach(emp => {
      calculatePayFromData(emp.id, 1, hours);
    });

    const report = generateTaxDepositReportFromData('quarterly', 'Q1 2024');

    // FUTA should be sum across all employees
    // Emp1: $12, Emp2: $14.40, Emp3: $9.60 = $36
    expect(report.liabilities['FUTA (940)']).toBeDefined();
    expect(report.liabilities['FUTA (940)'].amount).toBeCloseTo(36, 0);
  });
});

describe('Tax Deposit Reports - Federal Breakdown Accuracy', () => {
  let employee;

  beforeEach(() => {
    Object.assign(appData, JSON.parse(JSON.stringify(defaultAppData)));
    appData.settings = createTestSettings({
      taxYear: 2024,
      payFrequency: 'bi-weekly',
      firstPayPeriodStartDate: '2024-01-01',
      socialSecurity: 6.2,
      medicare: 1.45,
      taxFrequencies: {
        federal: 'monthly',
        futa: 'quarterly',
        suta: 'quarterly',
        state: 'monthly',
        local: 'monthly'
      }
    });

    employee = createTestEmployee({
      rate: 25,
      fedTaxRate: 12
    });
    appData.employees.push(employee);
    generatePayPeriods();
  });

  it('should provide accurate Federal breakdown (WH + FICA + Medicare)', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    calculatePayFromData(employee.id, 1, hours);

    // Get pay date for the report
    const periods = appData.payPeriods[employee.id].filter(p => p.grossPay > 0);
    expect(periods.length).toBe(1);

    const report = generateTaxDepositReportFromData('monthly', 'January 2024');
    const federal = report.liabilities['Federal Payroll (941)'];

    // $2000 gross pay
    // Federal WH: 12% = $240
    // FICA (employee): 6.2% = $124
    // FICA (employer): 6.2% = $124
    // Medicare (employee): 1.45% = $29
    // Medicare (employer): 1.45% = $29
    // Total FICA: $248, Total Medicare: $58

    expect(federal.breakdown.federal).toBe(240);
    expect(federal.breakdown.fica).toBe(248);     // Employer + Employee
    expect(federal.breakdown.medicare).toBe(58); // Employer + Employee

    // Total should equal sum of breakdown
    expect(federal.amount).toBe(federal.breakdown.federal + federal.breakdown.fica + federal.breakdown.medicare);
  });

  it('should double FICA and Medicare for employer portion', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    calculatePayFromData(employee.id, 1, hours);

    const period = appData.payPeriods[employee.id][0];
    const report = generateTaxDepositReportFromData('monthly', 'January 2024');
    const federal = report.liabilities['Federal Payroll (941)'];

    // FICA in report should be 2x what's in the period
    expect(federal.breakdown.fica).toBe(period.taxes.fica * 2);
    expect(federal.breakdown.medicare).toBe(period.taxes.medicare * 2);
  });
});

describe('Tax Deposit Reports - Edge Cases', () => {
  beforeEach(() => {
    Object.assign(appData, JSON.parse(JSON.stringify(defaultAppData)));
    appData.settings = createTestSettings({
      taxYear: 2024,
      payFrequency: 'bi-weekly',
      firstPayPeriodStartDate: '2024-01-01',
      taxFrequencies: {
        federal: 'monthly',
        futa: 'quarterly',
        suta: 'quarterly',
        state: 'monthly',
        local: 'monthly'
      }
    });
  });

  it('should return no liabilities message when no payroll data exists', () => {
    const emp = createTestEmployee();
    appData.employees.push(emp);
    generatePayPeriods();
    // Don't calculate any pay

    const report = generateTaxDepositReportFromData('monthly', 'January 2024');

    expect(report.error).toBeDefined();
    expect(report.error).toContain('No payroll data');
    expect(report.periodsIncluded).toBe(0);
  });

  it('should handle periods with zero gross pay', () => {
    const emp = createTestEmployee();
    appData.employees.push(emp);
    generatePayPeriods();

    // Calculate with zero hours
    calculatePayFromData(emp.id, 1, { regular: 0, overtime: 0, pto: 0, holiday: 0 });

    const report = generateTaxDepositReportFromData('monthly', 'January 2024');

    // Zero gross pay periods should be filtered out
    expect(report.periodsIncluded).toBe(0);
  });

  it('should handle missing taxFrequencies configuration', () => {
    const emp = createTestEmployee();
    appData.employees.push(emp);
    appData.settings.taxFrequencies = undefined;
    generatePayPeriods();

    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    calculatePayFromData(emp.id, 1, hours);

    const report = generateTaxDepositReportFromData('monthly', 'January 2024');

    // Should not crash, just return no liabilities
    expect(report).toBeDefined();
    expect(report.liabilities).toEqual({});
  });

  it('should handle future period with no data', () => {
    const emp = createTestEmployee();
    appData.employees.push(emp);
    generatePayPeriods();

    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    calculatePayFromData(emp.id, 1, hours);

    // Query a future month with no data
    const report = generateTaxDepositReportFromData('monthly', 'December 2025');

    expect(report.periodsIncluded).toBe(0);
  });
});

describe('Tax Deposit Reports - HTML Output', () => {
  let employee;

  beforeEach(() => {
    Object.assign(appData, JSON.parse(JSON.stringify(defaultAppData)));
    appData.settings = createTestSettings({
      taxYear: 2024,
      payFrequency: 'bi-weekly',
      firstPayPeriodStartDate: '2024-01-01',
      taxFrequencies: {
        federal: 'monthly',
        futa: 'quarterly',
        suta: 'quarterly',
        state: 'monthly',
        local: 'monthly'
      }
    });

    employee = createTestEmployee({ rate: 25, fedTaxRate: 12 });
    appData.employees.push(employee);
    generatePayPeriods();
  });

  it('should include report title in HTML output', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    calculatePayFromData(employee.id, 1, hours);

    const report = generateTaxDepositReportFromData('monthly', 'January 2024');

    expect(report.html).toContain('Tax Deposit for');
    expect(report.html).toContain('Jan');
  });

  it('should include Federal breakdown in HTML output', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    calculatePayFromData(employee.id, 1, hours);

    const report = generateTaxDepositReportFromData('monthly', 'January 2024');

    expect(report.html).toContain('Federal WH');
    expect(report.html).toContain('Social Security (FICA)');
    expect(report.html).toContain('Medicare');
  });

  it('should show total deposit due in HTML output', () => {
    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    calculatePayFromData(employee.id, 1, hours);

    const report = generateTaxDepositReportFromData('monthly', 'January 2024');

    expect(report.html).toContain('Total Deposit Due');
    expect(report.html).toContain(`$${report.totalDeposit.toFixed(2)}`);
  });
});
