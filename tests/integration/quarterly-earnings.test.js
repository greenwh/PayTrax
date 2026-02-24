import { describe, it, expect, beforeEach } from 'vitest';
import { appData } from '../../js/state.js';
import { calculateQuarterlyEarningsStatus } from '../../js/logic.js';
import { createTestEmployee } from '../fixtures/sample-employees.js';
import { createTestSettings } from '../fixtures/sample-settings.js';

/**
 * Helper: creates a weekly pay period structure for a given employee in a quarter.
 * Generates `count` periods with pay dates starting from `firstPayDate` spaced 7 days apart.
 * @param {string} employeeId
 * @param {number} count - number of periods
 * @param {string} firstPayDate - YYYY-MM-DD of first pay date
 * @param {Array} completedPeriods - array of {period, hours} objects for completed periods
 */
function setupQuarterPeriods(employeeId, count, firstPayDate, completedPeriods = []) {
  const periods = [];
  const startDate = new Date(firstPayDate + 'T12:00:00');

  for (let i = 0; i < count; i++) {
    const payDate = new Date(startDate);
    payDate.setDate(startDate.getDate() + i * 7);
    const payDateStr = `${payDate.getFullYear()}-${String(payDate.getMonth() + 1).padStart(2, '0')}-${String(payDate.getDate()).padStart(2, '0')}`;

    // Check if this period is in the completed list
    const completed = completedPeriods.find(c => c.period === i + 1);
    const hours = completed ? completed.hours : 0;
    const rate = appData.employees.find(e => e.id === employeeId)?.rate || 0;
    const grossPay = hours * rate;

    // Build period start/end dates (period ends day before pay date - 3 days, roughly)
    const periodStart = new Date(payDate);
    periodStart.setDate(payDate.getDate() - 9);
    const periodEnd = new Date(payDate);
    periodEnd.setDate(payDate.getDate() - 3);

    const pStartStr = `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}-${String(periodStart.getDate()).padStart(2, '0')}`;
    const pEndStr = `${periodEnd.getFullYear()}-${String(periodEnd.getMonth() + 1).padStart(2, '0')}-${String(periodEnd.getDate()).padStart(2, '0')}`;

    periods.push({
      period: i + 1,
      startDate: pStartStr,
      endDate: pEndStr,
      payDate: payDateStr,
      hours: { regular: hours, overtime: 0, pto: 0, holiday: 0 },
      earnings: { regular: grossPay, overtime: 0, pto: 0, holiday: 0 },
      grossPay,
      netPay: grossPay * 0.8, // simplified
      ptoAccrued: 0,
      taxes: { federal: 0, fica: 0, medicare: 0, state: 0, local: 0, suta: 0, futa: 0, total: 0, unrounded: {} },
      deductions: [],
      totalDeductions: 0
    });
  }

  appData.payPeriods[employeeId] = periods;
}

describe('calculateQuarterlyEarningsStatus()', () => {
  let employee;

  beforeEach(() => {
    // Reset appData with weekly settings, $7.25 rate, $1890 target, 20-hr min
    employee = createTestEmployee({
      id: 'emp-qet-test',
      name: 'Test Worker',
      rate: 7.25
    });

    appData.settings = createTestSettings({
      taxYear: 2026,
      payFrequency: 'weekly',
      quarterlyEarningsTarget: 1890,
      minimumWeeklyHours: 20
    });
    appData.employees = [employee];
    appData.payPeriods = {};
    appData.bankRegister = [];
  });

  it('should produce [22x9, 21x3] schedule for 12-period Q1 with 0 completed', () => {
    // Q1 2026: 12 weekly periods, pay dates starting 2026-01-07
    setupQuarterPeriods('emp-qet-test', 12, '2026-01-07');

    // Use a date in early Q1 so all periods are "remaining" (future)
    const today = new Date(2026, 0, 1); // Jan 1, 2026
    const status = calculateQuarterlyEarningsStatus('emp-qet-test', today);

    expect(status.quarter).toBe('Q1');
    expect(status.target).toBe(1890);
    expect(status.completedPeriods).toBe(0);
    expect(status.totalPeriodsInQuarter).toBe(12);
    expect(status.remainingPeriods).toBe(12);
    expect(status.quarterGross).toBe(0);
    expect(status.remaining).toBe(1890);
    expect(status.targetMet).toBe(false);
    expect(status.targetReachable).toBe(true);

    // Check schedule: hoursNeeded = ceil(1890 / 7.25) = ceil(260.69) = 261
    // 261 - (12 * 20) = 261 - 240 = 21 extra hours
    // Distribute +1 from front: first 9 get +1 (21 hours distributed = 9*1 rounds...wait)
    // Actually: 21 extras distributed +1 at a time from front:
    // Round 1: periods 0-11 get +1 each = 12 extras used (but only 21 needed) -> 12 extras
    // Round 2: periods 0-8 get another +1 = 9 extras -> total 21
    // Result: periods 0-8 have 22, periods 9-11 have 21
    expect(status.schedule).toHaveLength(12);
    const hoursList = status.schedule.map(s => s.hours);
    expect(hoursList.filter(h => h === 22)).toHaveLength(9);
    expect(hoursList.filter(h => h === 21)).toHaveLength(3);

    // Total scheduled hours = 9*22 + 3*21 = 198 + 63 = 261
    const totalScheduled = hoursList.reduce((a, b) => a + b, 0);
    expect(totalScheduled).toBe(261);

    // Projected gross
    expect(status.projectedQuarterGross).toBe(261 * 7.25); // $1892.25
    expect(status.projectedQuarterHours).toBe(261);
  });

  it('should recalculate for 7 remaining periods after 5 completed at 22 hrs', () => {
    setupQuarterPeriods('emp-qet-test', 12, '2026-01-07', [
      { period: 1, hours: 22 },
      { period: 2, hours: 22 },
      { period: 3, hours: 22 },
      { period: 4, hours: 22 },
      { period: 5, hours: 22 }
    ]);

    // Date is after period 5's pay date (2026-02-04) but before period 6
    const today = new Date(2026, 1, 5); // Feb 5, 2026
    const status = calculateQuarterlyEarningsStatus('emp-qet-test', today);

    expect(status.completedPeriods).toBe(5);
    expect(status.quarterGross).toBe(5 * 22 * 7.25); // $797.50
    expect(status.quarterHours).toBe(110);
    expect(status.remainingPeriods).toBe(7);
    expect(status.targetMet).toBe(false);
    expect(status.targetReachable).toBe(true);

    // remaining = 1890 - 797.50 = 1092.50
    expect(status.remaining).toBe(1092.50);

    // hoursNeeded = ceil(1092.50 / 7.25) = ceil(150.69) = 151
    // 151 - (7 * 20) = 151 - 140 = 11 extra
    // Distribute: first 4 get 22 (20+2), next 3 get 21 (20+1)
    // Wait: 11 extras, +1 at a time from front:
    // Round 1: all 7 get +1 = 7 used, 4 remaining
    // Round 2: first 4 get +1 = 4 used, 0 remaining
    // Result: first 4 have 22, last 3 have 21
    const hoursList = status.schedule.map(s => s.hours);
    expect(hoursList.filter(h => h === 22)).toHaveLength(4);
    expect(hoursList.filter(h => h === 21)).toHaveLength(3);
  });

  it('should return targetMet when gross already exceeds target', () => {
    // 10 periods at 30 hrs each = 300 hrs * $7.25 = $2175 > $1890
    setupQuarterPeriods('emp-qet-test', 12, '2026-01-07',
      Array.from({ length: 10 }, (_, i) => ({ period: i + 1, hours: 30 }))
    );

    const today = new Date(2026, 2, 15); // Mar 15
    const status = calculateQuarterlyEarningsStatus('emp-qet-test', today);

    expect(status.targetMet).toBe(true);
    expect(status.targetReachable).toBe(true);
    expect(status.remaining).toBe(0);

    // Remaining periods should all be at minHours
    for (const s of status.schedule) {
      expect(s.hours).toBe(20);
    }
  });

  it('should flag unreachable when 1 period left and need $500 more', () => {
    // Setup: 11 periods completed with enough gross to leave $500 shortfall
    // Need 1890 - $500 = $1390 earned already
    // $1390 / $7.25 = ~191.7 hrs over 11 periods
    // Use hours that give close to $1390: 11 periods at ~17.4 hrs each
    // Let's use specific: 11 * 17 * 7.25 = $1357.75, remaining = $532.25
    // At 40 hrs max: 40 * $7.25 = $290, shortfall = $532.25 - $290 = $242.25
    setupQuarterPeriods('emp-qet-test', 12, '2026-01-07',
      Array.from({ length: 11 }, (_, i) => ({ period: i + 1, hours: 17 }))
    );

    const today = new Date(2026, 2, 20); // Mar 20
    const status = calculateQuarterlyEarningsStatus('emp-qet-test', today);

    expect(status.completedPeriods).toBe(11);
    expect(status.remainingPeriods).toBe(1);
    expect(status.targetMet).toBe(false);
    expect(status.targetReachable).toBe(false);
    expect(status.shortfall).toBeGreaterThan(0);

    // The remaining period should be at 40 hours (max)
    expect(status.schedule).toHaveLength(1);
    expect(status.schedule[0].hours).toBe(40);
  });

  it('should set all periods at minHours when minimum already exceeds target (Q3 14 periods)', () => {
    // Q3 with 14 periods, 20 hrs min: 14 * 20 * 7.25 = $2030 > $1890
    setupQuarterPeriods('emp-qet-test', 14, '2026-07-01');

    const today = new Date(2026, 6, 1); // Jul 1 - all periods are remaining
    const status = calculateQuarterlyEarningsStatus('emp-qet-test', today);

    expect(status.totalPeriodsInQuarter).toBe(14);
    expect(status.targetReachable).toBe(true);

    // hoursNeeded = ceil(1890 / 7.25) = 261
    // 261 - (14 * 20) = 261 - 280 = -19 (negative, so minHours is enough)
    // All periods should be at 20 hrs
    // Actually the algorithm: extraHoursNeeded = 261 - 280 = -19, which is <= 0
    // So all remain at minHours = 20
    for (const s of status.schedule) {
      expect(s.hours).toBe(20);
    }

    expect(status.projectedQuarterGross).toBe(14 * 20 * 7.25); // $2030
  });

  it('should return targetMet true and minimal response for zero target', () => {
    appData.settings.quarterlyEarningsTarget = 0;
    setupQuarterPeriods('emp-qet-test', 12, '2026-01-07');

    const today = new Date(2026, 0, 5);
    const status = calculateQuarterlyEarningsStatus('emp-qet-test', today);

    expect(status.targetMet).toBe(true);
    expect(status.targetReachable).toBe(true);
    expect(status.shortfall).toBe(0);
  });

  it('should return sensible defaults when no pay periods exist', () => {
    // Don't set up any periods
    const today = new Date(2026, 0, 15);
    const status = calculateQuarterlyEarningsStatus('emp-qet-test', today);

    expect(status.quarter).toBe('Q1');
    expect(status.totalPeriodsInQuarter).toBe(0);
    expect(status.completedPeriods).toBe(0);
    expect(status.remainingPeriods).toBe(0);
    expect(status.targetMet).toBe(false);
    expect(status.schedule).toHaveLength(0);
  });

  it('should handle rate of 0 without crashing', () => {
    employee.rate = 0;
    setupQuarterPeriods('emp-qet-test', 12, '2026-01-07');

    const today = new Date(2026, 0, 1);
    const status = calculateQuarterlyEarningsStatus('emp-qet-test', today);

    expect(status.targetReachable).toBe(false);
    expect(status.shortfall).toBe(1890);
    // Should not throw
  });

  it('should handle non-existent employee gracefully', () => {
    const today = new Date(2026, 0, 15);
    const status = calculateQuarterlyEarningsStatus('non-existent-id', today);

    expect(status.quarter).toBe('Q1');
    expect(status.targetMet).toBe(false);
    expect(status.totalPeriodsInQuarter).toBe(0);
  });

  it('should count missed periods (past with no hours)', () => {
    // 12 periods, but set today to after period 5's pay date
    // Periods 1-3 are past with no hours (missed), 4-5 past with hours (completed)
    setupQuarterPeriods('emp-qet-test', 12, '2026-01-07', [
      { period: 4, hours: 20 },
      { period: 5, hours: 20 }
    ]);

    // Today is Feb 12 - periods 1-5 pay dates are past (Jan 7, 14, 21, 28, Feb 4)
    // Period 6 pay date is Feb 11 - also past. Let's use Feb 13 so period 6 is past too.
    const today = new Date(2026, 1, 13);
    const status = calculateQuarterlyEarningsStatus('emp-qet-test', today);

    expect(status.completedPeriods).toBe(2);
    // Periods 1-3 are missed (past, no hours), period 6 is also missed
    expect(status.missedPeriods).toBe(4); // periods 1,2,3,6 are past with 0 hours
    expect(status.remainingPeriods).toBe(6); // periods 7-12
  });
});
