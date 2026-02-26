/*
  PayTrax Payroll Management
  Copyright (c) 2025 greenwh

  Developed by greenwh with substantial assistance from AI coding tools (Claude, ChatGPT, Gemini).
  This file is original work based on documentation and prompts by greenwh.
  Licensed under the MIT License.
*/
// js/audit.js - Audit trail logging

import { appData, saveData } from './state.js';

const MAX_AUDIT_ENTRIES = 500;

/**
 * Logs an audit event. Newest entries are first (prepended).
 * Auto-prunes to MAX_AUDIT_ENTRIES.
 * @param {string} action - The action performed (e.g. "Employee Added")
 * @param {string} details - Human-readable details
 */
export function logAudit(action, details) {
    if (!Array.isArray(appData.auditLog)) {
        appData.auditLog = [];
    }

    appData.auditLog.unshift({
        timestamp: new Date().toISOString(),
        action,
        details
    });

    // Auto-prune
    if (appData.auditLog.length > MAX_AUDIT_ENTRIES) {
        appData.auditLog.length = MAX_AUDIT_ENTRIES;
    }

    saveData();
}

/**
 * Returns the audit log, optionally filtered.
 * @param {object} [filters] - Optional filters
 * @param {string} [filters.action] - Filter by action string (case-insensitive partial match)
 * @param {string} [filters.startDate] - Filter entries on or after this ISO date
 * @param {string} [filters.endDate] - Filter entries on or before this ISO date
 * @returns {Array} Filtered audit log entries
 */
export function getAuditLog(filters = {}) {
    let log = appData.auditLog || [];

    if (filters.action) {
        const search = filters.action.toLowerCase();
        log = log.filter(e => e.action.toLowerCase().includes(search));
    }

    if (filters.startDate) {
        log = log.filter(e => e.timestamp >= filters.startDate);
    }

    if (filters.endDate) {
        const endDate = filters.endDate + (filters.endDate.length === 10 ? 'T23:59:59.999Z' : '');
        log = log.filter(e => e.timestamp <= endDate);
    }

    return log;
}

/**
 * Clears the entire audit log.
 */
export function clearAuditLog() {
    appData.auditLog = [];
    saveData();
}
