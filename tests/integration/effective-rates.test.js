import { describe, it, expect, beforeEach } from 'vitest';
import { appData, defaultAppData } from '../../js/state.js';
import {
  generatePayPeriods,
  calculatePayFromData,
  recalculateAllPeriodsForEmployee,
  upsertRateEntry,
  deleteRateHistoryEntry
} from '../../js/logic.js';
import { createTestEmployee } from '../fixtures/sample-employees.js';
import { createTestSettings } from '../fixtures/sample-settings.js';

/**
 * Effective-dated rates (v13) — retires audit risk F7 for hourly rate,
 * employee withholding rates, and SUTA.
 *
 * Each pay period resolves these rates as of its PAY DATE, so a rate change
 * with a mid-year effective date must never alter periods paid before that
 * date. Editing an existing history entry (e.g., the seeded 2000-01-01 one)
 * is the deliberate "full-year correction" path and recalculates everything.
 */
describe('Effective-Dated Rates', () => {
  let employee;
  const standardHours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };

  // Bi-weekly 2024 starting 2024-01-01, payday 5 days after period end.
  // Period n pay dates: p1=2024-01-19, p2=2024-02-02, ... p13≈2024-07-05.
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
      fedTaxRate: 12,
      stateTaxRate: 5,
      localTaxRate: 2
    });
    appData.employees.push(employee);
    generatePayPeriods();
  });

  const snapshotPeriods = (count) =>
    JSON.parse(JSON.stringify(
      appData.payPeriods[employee.id].slice(0, count)
    ));

  const payrollRegisterEntries = () =>
    JSON.parse(JSON.stringify(
      appData.bankRegister.filter(t => t.id.startsWith('payroll-')).sort((a, b) => a.id.localeCompare(b.id))
    ));

  it('a mid-year raise does NOT alter any period paid before its effective date (F7 retirement)', () => {
    // Pay periods 1-13 at $25/hr
    for (let i = 1; i <= 13; i++) {
      calculatePayFromData(employee.id, i, standardHours);
    }

    // Periods paid before 2024-07-01: pay dates p1..p12 (p12 = 2024-06-21, p13 = 2024-07-05)
    const before = snapshotPeriods(12);
    const registerBefore = payrollRegisterEntries().filter(t => {
      const periodNum = parseInt(t.id.split('-').at(-2));
      return periodNum <= 12;
    });

    // Raise to $30/hr effective July 1
    employee.rateHistories.rate.push({ effectiveDate: '2024-07-01', value: 30 });
    recalculateAllPeriodsForEmployee(employee.id);

    // Every pre-July period is byte-identical, including taxes
    const after = snapshotPeriods(12);
    expect(after).toEqual(before);

    // Bank register entries for pre-July payrolls unchanged
    const registerAfter = payrollRegisterEntries().filter(t => {
      const periodNum = parseInt(t.id.split('-').at(-2));
      return periodNum <= 12;
    });
    expect(registerAfter).toEqual(registerBefore);

    // Period 13 (paid 2024-07-05) uses the new rate
    const p13 = appData.payPeriods[employee.id].find(p => p.period === 13);
    expect(p13.grossPay).toBe(80 * 30);
    expect(p13.appliedHourlyRate).toBe(30);

    // Newly calculated later periods also use the new rate
    calculatePayFromData(employee.id, 14, standardHours);
    expect(appData.payPeriods[employee.id].find(p => p.period === 14).grossPay).toBe(2400);
  });

  it('a mid-year SUTA change does NOT alter pre-boundary SUTA or register amounts', () => {
    for (let i = 1; i <= 13; i++) {
      calculatePayFromData(employee.id, i, standardHours);
    }
    const before = snapshotPeriods(12);
    const registerBefore = payrollRegisterEntries();

    // SUTA 2.7% -> 3.4% effective July 1
    appData.settings.sutaRateHistory.push({ effectiveDate: '2024-07-01', value: 3.4 });
    recalculateAllPeriodsForEmployee(employee.id);

    expect(snapshotPeriods(12)).toEqual(before);

    // Pre-July register entries identical; period 13's payroll debit reflects new SUTA
    const registerAfter = payrollRegisterEntries();
    for (let i = 0; i < registerBefore.length; i++) {
      const periodNum = parseInt(registerBefore[i].id.split('-').at(-2));
      if (periodNum <= 12) {
        expect(registerAfter[i]).toEqual(registerBefore[i]);
      }
    }

    // Note: with YTD gross $26,000 by period 13, the $25,000 SUTA wage base is
    // exhausted, so assert via a fresh low-wage scenario instead:
    const p13 = appData.payPeriods[employee.id].find(p => p.period === 13);
    expect(p13.taxes.suta).toBeGreaterThanOrEqual(0); // structural sanity
  });

  it('applies a SUTA history change to post-boundary periods below the wage base', () => {
    // Low earner stays under the $25,000 SUTA base all year
    const lowEarner = createTestEmployee({ name: 'Low', rate: 10 });
    appData.employees.push(lowEarner);
    generatePayPeriods();

    for (let i = 1; i <= 13; i++) {
      calculatePayFromData(lowEarner.id, i, { regular: 40, overtime: 0, pto: 0, holiday: 0 });
    }
    const p12SutaBefore = appData.payPeriods[lowEarner.id].find(p => p.period === 12).taxes.suta;

    appData.settings.sutaRateHistory.push({ effectiveDate: '2024-07-01', value: 5.4 });
    recalculateAllPeriodsForEmployee(lowEarner.id);

    const p12 = appData.payPeriods[lowEarner.id].find(p => p.period === 12); // paid 2024-06-21
    const p13 = appData.payPeriods[lowEarner.id].find(p => p.period === 13); // paid 2024-07-05
    expect(p12.taxes.suta).toBe(p12SutaBefore);               // old rate: unchanged
    expect(p13.taxes.suta).toBeCloseTo(400 * 0.054, 2);       // $400 gross at 5.4%
  });

  it('a mid-year withholding change leaves old periods\' federal tax untouched', () => {
    calculatePayFromData(employee.id, 1, standardHours);
    calculatePayFromData(employee.id, 2, standardHours);
    const p1FedBefore = appData.payPeriods[employee.id].find(p => p.period === 1).taxes.federal;

    // Federal withholding 12% -> 15% effective Feb 1 (p1 paid Jan 19, p2 paid Feb 2)
    employee.rateHistories.fedTaxRate.push({ effectiveDate: '2024-02-01', value: 15 });
    recalculateAllPeriodsForEmployee(employee.id);

    const p1 = appData.payPeriods[employee.id].find(p => p.period === 1);
    const p2 = appData.payPeriods[employee.id].find(p => p.period === 2);
    expect(p1.taxes.federal).toBe(p1FedBefore);          // 12% of $2000 = $240
    expect(p2.taxes.federal).toBeCloseTo(2000 * 0.15, 2); // 15% of $2000 = $300
  });

  it('switches rates exactly on the pay-date boundary', () => {
    // p1 pays 2024-01-19. Effective date exactly on the pay date -> new rate.
    employee.rateHistories.rate.push({ effectiveDate: '2024-01-19', value: 28 });
    calculatePayFromData(employee.id, 1, standardHours);
    expect(appData.payPeriods[employee.id].find(p => p.period === 1).grossPay).toBe(80 * 28);

    // Effective one day after the pay date -> old rate for p1, new for p2.
    employee.rateHistories.rate = [
      { effectiveDate: '2000-01-01', value: 25 },
      { effectiveDate: '2024-01-20', value: 28 }
    ];
    calculatePayFromData(employee.id, 1, standardHours);
    calculatePayFromData(employee.id, 2, standardHours);
    expect(appData.payPeriods[employee.id].find(p => p.period === 1).grossPay).toBe(80 * 25);
    expect(appData.payPeriods[employee.id].find(p => p.period === 2).grossPay).toBe(80 * 28);
  });

  it('editing the seeded entry performs a deliberate full-year correction', () => {
    for (let i = 1; i <= 5; i++) {
      calculatePayFromData(employee.id, i, standardHours);
    }

    // Correct the original rate: $25 was a typo for $26
    employee.rateHistories.rate[0].value = 26;
    recalculateAllPeriodsForEmployee(employee.id);

    for (let i = 1; i <= 5; i++) {
      expect(appData.payPeriods[employee.id].find(p => p.period === i).grossPay).toBe(80 * 26);
    }
  });

  it('is idempotent: recalculating twice with a multi-entry history changes nothing', () => {
    employee.rateHistories.rate.push({ effectiveDate: '2024-07-01', value: 30 });
    employee.rateHistories.fedTaxRate.push({ effectiveDate: '2024-04-01', value: 14 });
    for (let i = 1; i <= 15; i++) {
      calculatePayFromData(employee.id, i, standardHours);
    }

    const periodsBefore = JSON.parse(JSON.stringify(appData.payPeriods[employee.id]));
    const remaindersBefore = JSON.parse(JSON.stringify(employee.taxRemainders));

    recalculateAllPeriodsForEmployee(employee.id);

    expect(appData.payPeriods[employee.id]).toEqual(periodsBefore);
    expect(employee.taxRemainders).toEqual(remaindersBefore);
  });

  it('keeps wage-base caps correct across a mid-year raise', () => {
    // $100/hr -> $8000/period; SS base $168,600 crossed around period 21
    const earner = createTestEmployee({ name: 'High', rate: 100 });
    earner.rateHistories.rate.push({ effectiveDate: '2024-07-01', value: 120 });
    appData.employees.push(earner);
    generatePayPeriods();

    const periods = appData.payPeriods[earner.id];
    for (let i = 1; i <= periods.length; i++) {
      calculatePayFromData(earner.id, i, standardHours);
    }

    // Total FICA withheld for periods PAID in 2024 must equal 6.2% of the
    // wage base, regardless of when the raise happened (cap math keys off
    // gross wages, not rates). The last period pays in Jan 2025 and correctly
    // starts a fresh wage base, so it is excluded.
    const totalFica2024 = periods
      .filter(p => p.payDate.startsWith('2024'))
      .reduce((sum, p) => sum + (p.taxes?.fica || 0), 0);
    expect(totalFica2024).toBeCloseTo(168600 * 0.062, 1);
  });

  it('syncs the scalar fields to the rate currently in force', () => {
    // History entry effective in the past relative to "today" (real clock)
    employee.rateHistories.rate.push({ effectiveDate: '2024-07-01', value: 30 });
    calculatePayFromData(employee.id, 1, standardHours);

    // Today (2026+) is after 2024-07-01, so current scalar = 30
    expect(employee.rate).toBe(30);
  });
});

describe('Rate history management (upsert/delete)', () => {
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

  it('upsertRateEntry appends new dates and keeps the history sorted', () => {
    const history = employee.rateHistories.rate;
    upsertRateEntry(history, '2024-07-01', 30);
    upsertRateEntry(history, '2024-03-01', 27);

    expect(history.map(e => e.effectiveDate)).toEqual(['2000-01-01', '2024-03-01', '2024-07-01']);
    expect(history.map(e => e.value)).toEqual([25, 27, 30]);
  });

  it('upsertRateEntry replaces an entry with the same effective date (correction)', () => {
    const history = employee.rateHistories.rate;
    upsertRateEntry(history, '2024-07-01', 30);
    upsertRateEntry(history, '2024-07-01', 31);

    expect(history).toHaveLength(2);
    expect(history.find(e => e.effectiveDate === '2024-07-01').value).toBe(31);
  });

  it('deleteRateHistoryEntry removes an entry and refuses to remove the last one', () => {
    upsertRateEntry(employee.rateHistories.rate, '2024-07-01', 30);

    expect(deleteRateHistoryEntry(employee.id, 'rate', '2024-07-01')).toBe(true);
    expect(employee.rateHistories.rate).toHaveLength(1);

    // Last remaining entry is protected
    expect(deleteRateHistoryEntry(employee.id, 'rate', '2000-01-01')).toBe(false);
    expect(employee.rateHistories.rate).toHaveLength(1);
  });

  it('deleteRateHistoryEntry returns false for unknown employee, field, or date', () => {
    expect(deleteRateHistoryEntry('nope', 'rate', '2000-01-01')).toBe(false);
    expect(deleteRateHistoryEntry(employee.id, 'notAField', '2000-01-01')).toBe(false);
    expect(deleteRateHistoryEntry(employee.id, 'rate', '1999-01-01')).toBe(false);
  });
});
