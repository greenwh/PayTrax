import { describe, it, expect, beforeEach } from 'vitest';
import { formatDate, parseDateInput } from '../../js/utils.js';
import { appData } from '../../js/state.js';

describe('utils.js', () => {
  describe('formatDate()', () => {
    it('should format a Date object to MM/DD/YYYY', () => {
      const date = new Date('2024-03-15T12:00:00Z');
      expect(formatDate(date)).toBe('3/15/2024');
    });

    it('should handle single-digit months and days', () => {
      const date = new Date('2024-01-05T12:00:00Z');
      expect(formatDate(date)).toBe('1/5/2024');
    });

    it('should handle December 31st', () => {
      const date = new Date('2024-12-31T12:00:00Z');
      expect(formatDate(date)).toBe('12/31/2024');
    });

    it('should handle January 1st', () => {
      const date = new Date('2024-01-01T12:00:00Z');
      expect(formatDate(date)).toBe('1/1/2024');
    });

    it('should use UTC methods to avoid timezone issues', () => {
      const date = new Date(Date.UTC(2024, 5, 15)); // June 15, 2024 UTC
      expect(formatDate(date)).toBe('6/15/2024');
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
});
