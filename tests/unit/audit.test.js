import { describe, it, expect, beforeEach, vi } from 'vitest';

// We need to mock the state module before importing audit
// Since audit.js imports from state.js which imports from db.js,
// we'll work with the actual appData
import { appData } from '../../js/state.js';
import { logAudit, getAuditLog, clearAuditLog } from '../../js/audit.js';

describe('audit.js', () => {
  beforeEach(() => {
    // Reset the audit log before each test
    appData.auditLog = [];
  });

  describe('logAudit()', () => {
    it('should add an entry with correct structure', () => {
      logAudit('Employee Added', 'John Doe');

      expect(appData.auditLog).toHaveLength(1);
      expect(appData.auditLog[0]).toHaveProperty('timestamp');
      expect(appData.auditLog[0].action).toBe('Employee Added');
      expect(appData.auditLog[0].details).toBe('John Doe');
    });

    it('should have a valid ISO timestamp', () => {
      logAudit('Test', 'details');

      const timestamp = appData.auditLog[0].timestamp;
      const date = new Date(timestamp);
      expect(date.getTime()).not.toBeNaN();
    });

    it('should prepend entries (newest first)', () => {
      logAudit('First', 'details 1');
      logAudit('Second', 'details 2');
      logAudit('Third', 'details 3');

      expect(appData.auditLog).toHaveLength(3);
      expect(appData.auditLog[0].action).toBe('Third');
      expect(appData.auditLog[1].action).toBe('Second');
      expect(appData.auditLog[2].action).toBe('First');
    });

    it('should auto-prune at 500 entries', () => {
      // Add 505 entries
      for (let i = 0; i < 505; i++) {
        appData.auditLog.push({
          timestamp: new Date().toISOString(),
          action: `Action ${i}`,
          details: `Details ${i}`
        });
      }

      // Now add one more via logAudit which should trigger pruning
      logAudit('Overflow', 'should trigger prune');

      expect(appData.auditLog.length).toBe(500);
      expect(appData.auditLog[0].action).toBe('Overflow');
    });

    it('should initialize auditLog if missing', () => {
      delete appData.auditLog;

      logAudit('Init Test', 'should create array');

      expect(Array.isArray(appData.auditLog)).toBe(true);
      expect(appData.auditLog).toHaveLength(1);
    });
  });

  describe('getAuditLog()', () => {
    beforeEach(() => {
      appData.auditLog = [
        { timestamp: '2026-02-25T10:00:00.000Z', action: 'Employee Added', details: 'John' },
        { timestamp: '2026-02-24T09:00:00.000Z', action: 'Settings Changed', details: 'Tax year' },
        { timestamp: '2026-02-23T08:00:00.000Z', action: 'Employee Deleted', details: 'Jane' }
      ];
    });

    it('should return all entries when no filters', () => {
      const log = getAuditLog();
      expect(log).toHaveLength(3);
    });

    it('should filter by action (case-insensitive partial match)', () => {
      const log = getAuditLog({ action: 'employee' });
      expect(log).toHaveLength(2);
      expect(log[0].details).toBe('John');
      expect(log[1].details).toBe('Jane');
    });

    it('should filter by startDate', () => {
      const log = getAuditLog({ startDate: '2026-02-24T00:00:00.000Z' });
      expect(log).toHaveLength(2);
    });

    it('should filter by endDate', () => {
      const log = getAuditLog({ endDate: '2026-02-24' });
      expect(log).toHaveLength(2);
    });
  });

  describe('clearAuditLog()', () => {
    it('should empty the audit log', () => {
      appData.auditLog = [
        { timestamp: '2026-02-25T10:00:00.000Z', action: 'Test', details: 'data' }
      ];

      clearAuditLog();

      expect(appData.auditLog).toEqual([]);
    });
  });
});
