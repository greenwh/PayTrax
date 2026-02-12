import { describe, it, expect } from 'vitest';
import {
  ValidationError,
  validateNumber,
  validateString,
  validateDate,
  validateEmployee,
  validateHours,
  validateSettings,
  validateTransaction,
  validateDeduction
} from '../../js/validation.js';

describe('validation.js', () => {
  describe('ValidationError', () => {
    it('should create error with field and message', () => {
      const error = new ValidationError('testField', 'test message');
      expect(error.field).toBe('testField');
      expect(error.message).toBe('test message');
    });
  });

  describe('validateNumber()', () => {
    it('should return null for valid number', () => {
      expect(validateNumber(10, 'Test')).toBeNull();
    });

    it('should return error for required field that is empty', () => {
      const error = validateNumber('', 'Test', 0, 100, true);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Test is required');
    });

    it('should return null for empty non-required field', () => {
      expect(validateNumber('', 'Test', 0, 100, false)).toBeNull();
    });

    it('should return error for non-numeric value', () => {
      const error = validateNumber('abc', 'Test');
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Test must be a valid number');
    });

    it('should return error for value below minimum', () => {
      const error = validateNumber(5, 'Test', 10, 100);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Test must be at least 10');
    });

    it('should return error for value above maximum', () => {
      const error = validateNumber(150, 'Test', 10, 100);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Test must be at most 100');
    });

    it('should accept string numbers', () => {
      expect(validateNumber('25.5', 'Test', 0, 100)).toBeNull();
    });

    it('should handle null and undefined for non-required fields', () => {
      expect(validateNumber(null, 'Test', 0, 100, false)).toBeNull();
      expect(validateNumber(undefined, 'Test', 0, 100, false)).toBeNull();
    });
  });

  describe('validateString()', () => {
    it('should return null for valid string', () => {
      expect(validateString('test', 'Test')).toBeNull();
    });

    it('should return error for required field that is empty', () => {
      const error = validateString('', 'Test', 1, 100, true);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Test is required');
    });

    it('should return null for empty non-required field', () => {
      expect(validateString('', 'Test', 1, 100, false)).toBeNull();
    });

    it('should return error for string too short', () => {
      const error = validateString('a', 'Test', 5, 100);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Test must be at least 5 characters');
    });

    it('should return error for string too long', () => {
      const longString = 'a'.repeat(300);
      const error = validateString(longString, 'Test', 0, 255);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Test must be at most 255 characters');
    });

    it('should trim whitespace', () => {
      expect(validateString('  test  ', 'Test', 1, 100)).toBeNull();
    });

    it('should return error for whitespace-only string', () => {
      const error = validateString('   ', 'Test', 1, 100, true);
      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  describe('validateDate()', () => {
    it('should return null for valid date', () => {
      expect(validateDate('2024-01-15', 'Test')).toBeNull();
    });

    it('should return error for required field that is empty', () => {
      const error = validateDate('', 'Test', true);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Test is required');
    });

    it('should return null for empty non-required field', () => {
      expect(validateDate('', 'Test', false)).toBeNull();
    });

    it('should return error for invalid date', () => {
      const error = validateDate('not-a-date', 'Test');
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Test must be a valid date');
    });

    it('should return error for date before minimum', () => {
      const minDate = new Date('2024-01-01');
      const error = validateDate('2023-12-31', 'Test', true, minDate);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toContain('on or after');
    });

    it('should return error for date after maximum', () => {
      const maxDate = new Date('2024-12-31');
      const error = validateDate('2025-01-01', 'Test', true, null, maxDate);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toContain('on or before');
    });

    it('should accept date within range', () => {
      const minDate = new Date('2024-01-01');
      const maxDate = new Date('2024-12-31');
      expect(validateDate('2024-06-15', 'Test', true, minDate, maxDate)).toBeNull();
    });
  });

  describe('validateEmployee()', () => {
    const validEmployee = {
      name: 'John Doe',
      rate: 20,
      overtimeMultiplier: 1.5,
      holidayMultiplier: 2.0,
      fedTaxRate: 12,
      stateTaxRate: 5,
      localTaxRate: 2,
      ptoAccrualRate: 0.0385,
      ptoBalance: 10
    };

    it('should return no errors for valid employee', () => {
      const errors = validateEmployee(validEmployee);
      expect(errors).toHaveLength(0);
    });

    it('should return error for missing name', () => {
      const errors = validateEmployee({ ...validEmployee, name: '' });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].field).toBe('Employee Name');
    });

    it('should return error for invalid rate', () => {
      const errors = validateEmployee({ ...validEmployee, rate: 0 });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.field === 'Hourly Rate')).toBe(true);
    });

    it('should return error for overtime multiplier < 1', () => {
      const errors = validateEmployee({ ...validEmployee, overtimeMultiplier: 0.5 });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.field === 'Overtime Multiplier')).toBe(true);
    });

    it('should return error for holiday multiplier < 1', () => {
      const errors = validateEmployee({ ...validEmployee, holidayMultiplier: 0.8 });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.field === 'Holiday Multiplier')).toBe(true);
    });

    it('should return error for negative tax rate', () => {
      const errors = validateEmployee({ ...validEmployee, fedTaxRate: -5 });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should return error for excessively high tax rate', () => {
      const errors = validateEmployee({ ...validEmployee, fedTaxRate: 60 });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should return error for negative PTO balance', () => {
      const errors = validateEmployee({ ...validEmployee, ptoBalance: -10 });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should return multiple errors for multiple invalid fields', () => {
      const invalidEmployee = {
        name: '',
        rate: -5,
        overtimeMultiplier: 0.5,
        holidayMultiplier: 0,
        fedTaxRate: 100,
        stateTaxRate: 20,
        localTaxRate: -5,
        ptoAccrualRate: -1,
        ptoBalance: -10
      };
      const errors = validateEmployee(invalidEmployee);
      expect(errors.length).toBeGreaterThan(5);
    });
  });

  describe('validateHours()', () => {
    it('should return no errors for valid hours', () => {
      const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
      const errors = validateHours(hours);
      expect(errors).toHaveLength(0);
    });

    it('should return error for negative regular hours', () => {
      const hours = { regular: -10, overtime: 0, pto: 0, holiday: 0 };
      const errors = validateHours(hours);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should return error for hours exceeding 168', () => {
      const hours = { regular: 100, overtime: 50, pto: 20, holiday: 10 };
      const errors = validateHours(hours);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.field === 'Total Hours')).toBe(true);
    });

    it('should accept total hours exactly at 168', () => {
      const hours = { regular: 168, overtime: 0, pto: 0, holiday: 0 };
      const errors = validateHours(hours);
      expect(errors).toHaveLength(0);
    });

    it('should handle zero hours', () => {
      const hours = { regular: 0, overtime: 0, pto: 0, holiday: 0 };
      const errors = validateHours(hours);
      expect(errors).toHaveLength(0);
    });

    it('should return error for overtime hours > 168', () => {
      const hours = { regular: 0, overtime: 200, pto: 0, holiday: 0 };
      const errors = validateHours(hours);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateSettings()', () => {
    const validSettings = {
      companyName: 'Test Company',
      taxYear: 2024,
      firstPayPeriodStartDate: '2024-01-01',
      daysUntilPayday: 5,
      socialSecurity: 6.2,
      medicare: 1.45,
      sutaRate: 2.7,
      futaRate: 0.6,
      ssWageBase: 168600,
      futaWageBase: 7000,
      additionalMedicareThreshold: 200000,
      additionalMedicareRate: 0.9
    };

    it('should return no errors for valid settings', () => {
      const errors = validateSettings(validSettings);
      expect(errors).toHaveLength(0);
    });

    it('should return error for missing company name', () => {
      const errors = validateSettings({ ...validSettings, companyName: '' });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].field).toBe('Company Name');
    });

    it('should return error for invalid tax year', () => {
      const errors = validateSettings({ ...validSettings, taxYear: 1999 });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should return error for missing start date', () => {
      const errors = validateSettings({ ...validSettings, firstPayPeriodStartDate: '' });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should return error for excessive days until payday', () => {
      const errors = validateSettings({ ...validSettings, daysUntilPayday: 50 });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should return error for negative tax rate', () => {
      const errors = validateSettings({ ...validSettings, socialSecurity: -1 });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should return error for zero wage base', () => {
      const errors = validateSettings({ ...validSettings, ssWageBase: 0 });
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateTransaction()', () => {
    const validTransaction = {
      date: '2024-01-15',
      description: 'Test transaction',
      amount: 100
    };

    it('should return no errors for valid transaction', () => {
      const errors = validateTransaction(validTransaction);
      expect(errors).toHaveLength(0);
    });

    it('should return error for missing date', () => {
      const errors = validateTransaction({ ...validTransaction, date: '' });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should return error for missing description', () => {
      const errors = validateTransaction({ ...validTransaction, description: '' });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should return error for zero amount', () => {
      const errors = validateTransaction({ ...validTransaction, amount: 0 });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should return error for negative amount', () => {
      const errors = validateTransaction({ ...validTransaction, amount: -50 });
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateDeduction()', () => {
    const validFixedDeduction = {
      name: '401(k)',
      amount: 100,
      type: 'fixed'
    };

    const validPercentDeduction = {
      name: 'Health Insurance',
      amount: 5,
      type: 'percent'
    };

    it('should return no errors for valid fixed deduction', () => {
      const errors = validateDeduction(validFixedDeduction);
      expect(errors).toHaveLength(0);
    });

    it('should return no errors for valid percent deduction', () => {
      const errors = validateDeduction(validPercentDeduction);
      expect(errors).toHaveLength(0);
    });

    it('should return error for missing name', () => {
      const errors = validateDeduction({ ...validFixedDeduction, name: '' });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should return error for zero amount', () => {
      const errors = validateDeduction({ ...validFixedDeduction, amount: 0 });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should return error for invalid type', () => {
      const errors = validateDeduction({ ...validFixedDeduction, type: 'invalid' });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.field === 'Deduction Type')).toBe(true);
    });

    it('should return error for percent > 100', () => {
      const errors = validateDeduction({ ...validPercentDeduction, amount: 150 });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept percent exactly at 100', () => {
      const errors = validateDeduction({ ...validPercentDeduction, amount: 100 });
      expect(errors).toHaveLength(0);
    });

    it('should return error for missing type', () => {
      const deduction = { name: 'Test', amount: 50 };
      const errors = validateDeduction(deduction);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
