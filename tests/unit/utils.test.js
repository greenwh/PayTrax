import { describe, it, expect, beforeEach } from 'vitest';
import { formatDate, parseDateInput, toStorageDate, fromStorageDate, toDisplayDate, fromLegacyDate, getQuarterForDate } from '../../js/utils.js';
import { appData } from '../../js/state.js';

describe('utils.js', () => {
  describe('formatDate() / toStorageDate()', () => {
    it('should format a Date object to YYYY-MM-DD', () => {
      const date = new Date('2024-03-15T12:00:00Z');
      expect(formatDate(date)).toBe('2024-03-15');
    });

    it('should zero-pad single-digit months and days', () => {
      const date = new Date('2024-01-05T12:00:00Z');
      expect(formatDate(date)).toBe('2024-01-05');
    });

    it('should handle December 31st', () => {
      const date = new Date('2024-12-31T12:00:00Z');
      expect(formatDate(date)).toBe('2024-12-31');
    });

    it('should handle January 1st', () => {
      const date = new Date('2024-01-01T12:00:00Z');
      expect(formatDate(date)).toBe('2024-01-01');
    });

    it('should use UTC methods to avoid timezone issues', () => {
      const date = new Date(Date.UTC(2024, 5, 15)); // June 15, 2024 UTC
      expect(formatDate(date)).toBe('2024-06-15');
    });

    it('should be aliased as toStorageDate', () => {
      const date = new Date('2024-07-04T12:00:00Z');
      expect(toStorageDate(date)).toBe('2024-07-04');
      expect(toStorageDate(date)).toBe(formatDate(date));
    });
  });

  describe('fromStorageDate()', () => {
    it('should parse YYYY-MM-DD to local noon Date', () => {
      const date = fromStorageDate('2024-03-15');
      expect(date.getFullYear()).toBe(2024);
      expect(date.getMonth()).toBe(2); // March = 2
      expect(date.getDate()).toBe(15);
      expect(date.getHours()).toBe(12); // noon local
    });

    it('should return invalid date for null/undefined', () => {
      expect(isNaN(fromStorageDate(null))).toBe(true);
      expect(isNaN(fromStorageDate(undefined))).toBe(true);
    });
  });

  describe('toDisplayDate()', () => {
    it('should convert YYYY-MM-DD to M/D/YYYY', () => {
      expect(toDisplayDate('2024-03-15')).toBe('3/15/2024');
    });

    it('should strip leading zeros', () => {
      expect(toDisplayDate('2024-01-05')).toBe('1/5/2024');
    });

    it('should handle December 31st', () => {
      expect(toDisplayDate('2024-12-31')).toBe('12/31/2024');
    });

    it('should return empty string for null/undefined', () => {
      expect(toDisplayDate(null)).toBe('');
      expect(toDisplayDate(undefined)).toBe('');
    });

    it('should return original string for non-YYYY-MM-DD format', () => {
      expect(toDisplayDate('not a date')).toBe('not a date');
    });
  });

  describe('fromLegacyDate()', () => {
    it('should convert M/D/YYYY to YYYY-MM-DD', () => {
      expect(fromLegacyDate('1/5/2024')).toBe('2024-01-05');
    });

    it('should convert MM/DD/YYYY to YYYY-MM-DD', () => {
      expect(fromLegacyDate('03/15/2024')).toBe('2024-03-15');
    });

    it('should pass through YYYY-MM-DD unchanged', () => {
      expect(fromLegacyDate('2024-03-15')).toBe('2024-03-15');
    });

    it('should return null/undefined as-is', () => {
      expect(fromLegacyDate(null)).toBe(null);
      expect(fromLegacyDate(undefined)).toBe(undefined);
    });
  });

  describe('parseDateInput()', () => {
    beforeEach(() => {
      // Set default tax year for tests
      appData.settings = { taxYear: 2024 };
    });

    describe('monthly frequency', () => {
      it('should parse numeric MM/YYYY format', () => {
        const result = parseDateInput('03/2024', 'monthly');
        expect(result.title).toBe('March 2024');
        expect(result.start).toEqual(new Date(2024, 2, 1));
        expect(result.end).toEqual(new Date(2024, 2, 31, 23, 59, 59));
      });

      it('should parse numeric MM/YY format', () => {
        const result = parseDateInput('03/24', 'monthly');
        expect(result.title).toBe('March 2024');
        expect(result.start).toEqual(new Date(2024, 2, 1));
      });

      it('should parse month name', () => {
        const result = parseDateInput('January', 'monthly');
        expect(result.title).toBe('Jan 2024');
        expect(result.start).toEqual(new Date(2024, 0, 1));
        expect(result.end).toEqual(new Date(2024, 0, 31, 23, 59, 59));
      });

      it('should parse month abbreviation', () => {
        const result = parseDateInput('jun', 'monthly');
        expect(result.title).toBe('Jun 2024');
        expect(result.start).toEqual(new Date(2024, 5, 1));
      });

      it('should parse month with explicit year', () => {
        const result = parseDateInput('mar 2023', 'monthly');
        expect(result.title).toBe('Mar 2023');
        expect(result.start).toEqual(new Date(2023, 2, 1));
      });

      it('should handle case-insensitive input', () => {
        const result = parseDateInput('JUNE', 'monthly');
        expect(result.title).toBe('Jun 2024');
      });

      it('should return invalid period for unrecognized month', () => {
        const result = parseDateInput('xyz', 'monthly');
        expect(result.title).toBe('Invalid Period');
        expect(result.start).toBeNull();
        expect(result.end).toBeNull();
      });
    });

    describe('quarterly frequency', () => {
      it('should parse Q1', () => {
        const result = parseDateInput('Q1', 'quarterly');
        expect(result.title).toBe('Q1 2024');
        expect(result.start).toEqual(new Date(2024, 0, 1));
        expect(result.end).toEqual(new Date(2024, 2, 31, 23, 59, 59));
      });

      it('should parse Q2', () => {
        const result = parseDateInput('Q2', 'quarterly');
        expect(result.title).toBe('Q2 2024');
        expect(result.start).toEqual(new Date(2024, 3, 1));
        expect(result.end).toEqual(new Date(2024, 5, 30, 23, 59, 59));
      });

      it('should parse Q3', () => {
        const result = parseDateInput('Q3', 'quarterly');
        expect(result.title).toBe('Q3 2024');
        expect(result.start).toEqual(new Date(2024, 6, 1));
        expect(result.end).toEqual(new Date(2024, 8, 30, 23, 59, 59));
      });

      it('should parse Q4', () => {
        const result = parseDateInput('Q4', 'quarterly');
        expect(result.title).toBe('Q4 2024');
        expect(result.start).toEqual(new Date(2024, 9, 1));
        expect(result.end).toEqual(new Date(2024, 11, 31, 23, 59, 59));
      });

      it('should parse quarter with explicit year', () => {
        const result = parseDateInput('Q1 2023', 'quarterly');
        expect(result.title).toBe('Q1 2023');
        expect(result.start).toEqual(new Date(2023, 0, 1));
      });

      it('should handle lowercase', () => {
        const result = parseDateInput('q2', 'quarterly');
        expect(result.title).toBe('Q2 2024');
      });

      it('should return invalid period for unrecognized quarter', () => {
        const result = parseDateInput('Q5', 'quarterly');
        expect(result.title).toBe('Invalid Period');
      });
    });

    describe('annual frequency', () => {
      it('should parse year only', () => {
        const result = parseDateInput('2024', 'annual');
        expect(result.title).toBe('Year 2024');
        expect(result.start).toEqual(new Date(2024, 0, 1));
        expect(result.end).toEqual(new Date(2024, 11, 31, 23, 59, 59));
      });

      it('should use default tax year if no year specified', () => {
        const result = parseDateInput('', 'annual');
        expect(result.title).toBe('Year 2024');
        expect(result.start).toEqual(new Date(2024, 0, 1));
      });

      it('should parse different year', () => {
        const result = parseDateInput('2023', 'annual');
        expect(result.title).toBe('Year 2023');
        expect(result.start).toEqual(new Date(2023, 0, 1));
      });
    });

    describe('edge cases', () => {
      it('should trim whitespace', () => {
        const result = parseDateInput('  Q1 2024  ', 'quarterly');
        expect(result.title).toBe('Q1 2024');
      });

      it('should handle February in leap year', () => {
        const result = parseDateInput('02/2024', 'monthly');
        expect(result.end).toEqual(new Date(2024, 1, 29, 23, 59, 59)); // Feb 29 in leap year
      });

      it('should handle February in non-leap year', () => {
        const result = parseDateInput('02/2023', 'monthly');
        expect(result.end).toEqual(new Date(2023, 1, 28, 23, 59, 59)); // Feb 28
      });
    });
  });

  describe('getQuarterForDate()', () => {
    it('should return Q1 for January 15', () => {
      const result = getQuarterForDate(new Date(2026, 0, 15));
      expect(result.quarter).toBe('Q1');
      expect(result.quarterNum).toBe(1);
      expect(result.start).toBe('2026-01-01');
      expect(result.end).toBe('2026-03-31');
      expect(result.year).toBe(2026);
    });

    it('should return Q2 for April 1', () => {
      const result = getQuarterForDate(new Date(2026, 3, 1));
      expect(result.quarter).toBe('Q2');
      expect(result.quarterNum).toBe(2);
      expect(result.start).toBe('2026-04-01');
      expect(result.end).toBe('2026-06-30');
    });

    it('should return Q3 for July 31', () => {
      const result = getQuarterForDate(new Date(2026, 6, 31));
      expect(result.quarter).toBe('Q3');
      expect(result.quarterNum).toBe(3);
      expect(result.start).toBe('2026-07-01');
      expect(result.end).toBe('2026-09-30');
    });

    it('should return Q4 for December 31', () => {
      const result = getQuarterForDate(new Date(2026, 11, 31));
      expect(result.quarter).toBe('Q4');
      expect(result.quarterNum).toBe(4);
      expect(result.start).toBe('2026-10-01');
      expect(result.end).toBe('2026-12-31');
    });

    it('should handle leap year February correctly', () => {
      const result = getQuarterForDate(new Date(2024, 1, 29)); // Feb 29 leap year
      expect(result.quarter).toBe('Q1');
      expect(result.end).toBe('2024-03-31');
    });
  });
});
