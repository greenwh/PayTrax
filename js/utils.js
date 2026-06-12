/*
  PayTrax Payroll Management
  Copyright (c) 2025 greenwh

  Developed by greenwh with substantial assistance from AI coding tools (Claude, ChatGPT, Gemini).
  This file is original work based on documentation and prompts by greenwh.
  Licensed under the MIT License.
*/
import { appData } from './state.js';

/**
 * Returns quarter info for a given date.
 * @param {Date} date
 * @returns {{ quarter: string, quarterNum: number, start: string, end: string, year: number }}
 */
export function getQuarterForDate(date) {
    const month = date.getMonth(); // 0-11
    const year = date.getFullYear();
    const quarterNum = Math.floor(month / 3) + 1;
    const startMonth = (quarterNum - 1) * 3;
    const endMonth = startMonth + 2;
    const start = `${year}-${String(startMonth + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, endMonth + 1, 0).getDate();
    const end = `${year}-${String(endMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { quarter: `Q${quarterNum}`, quarterNum, start, end, year };
}

/**
 * Formats a Date object into a "YYYY-MM-DD" storage string.
 * This is the canonical storage format for all dates in PayTrax.
 * @param {Date} date - The date to format.
 * @returns {string} The formatted date string in YYYY-MM-DD format.
 */
export function formatDate(date) {
    const d = new Date(date);
    // Use UTC methods to avoid timezone issues with date-only objects
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Alias for formatDate — converts a Date object to "YYYY-MM-DD" storage string.
 * @param {Date} date - The date to format.
 * @returns {string} "YYYY-MM-DD"
 */
export function toStorageDate(date) {
    return formatDate(date);
}

/**
 * Parses a "YYYY-MM-DD" storage string into a local Date at noon.
 * Using noon avoids day-boundary timezone issues (UTC midnight can shift the day).
 * @param {string} dateStr - Date string in "YYYY-MM-DD" format.
 * @returns {Date} Local Date object at noon.
 */
export function fromStorageDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return new Date(NaN);
    return new Date(dateStr + 'T12:00:00');
}

/**
 * Converts a "YYYY-MM-DD" storage string to "M/D/YYYY" for UI display.
 * @param {string} dateStr - Date string in "YYYY-MM-DD" format.
 * @returns {string} "M/D/YYYY" display string.
 */
export function toDisplayDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr; // Return as-is if not YYYY-MM-DD
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    const year = parts[0];
    return `${month}/${day}/${year}`;
}

/**
 * Converts a legacy "M/D/YYYY" or "MM/DD/YYYY" date string to "YYYY-MM-DD" storage format.
 * Used by migration to convert old data.
 * @param {string} dateStr - Date string in "M/D/YYYY" or "MM/DD/YYYY" format.
 * @returns {string} "YYYY-MM-DD" storage string.
 */
export function fromLegacyDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return dateStr;
    // Already in YYYY-MM-DD format
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return dateStr;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return dateStr;
    const month = parts[0].padStart(2, '0');
    const day = parts[1].padStart(2, '0');
    const year = parts[2];
    return `${year}-${month}-${day}`;
}

/**
 * Parses a string input (like "Q2 2025" or "June") into a start and end date.
 * @param {string} input - The string to parse.
 * @param {string} frequency - The context ('monthly', 'quarterly', 'annual').
 * @returns {object} An object with start, end, and title properties.
 */
export function parseDateInput(input, frequency) {
    const defaultYear = appData.settings.taxYear;
    input = input.trim().toLowerCase();
    let year = defaultYear;
    
    // Check for numeric month/year format first, e.g., "01/25" or "1/2025"
    const numericMatch = input.match(/^(\d{1,2})\/(\d{2,4})$/);
    if (numericMatch && frequency === 'monthly') {
        const month = parseInt(numericMatch[1]) - 1;
        let yearNum = parseInt(numericMatch[2]);
        if (yearNum < 100) yearNum += 2000; // Handle yy format
        
        if (month >= 0 && month < 12) {
            const monthName = new Date(yearNum, month).toLocaleString('default', { month: 'long' });
            return {
                start: new Date(yearNum, month, 1),
                end: new Date(yearNum, month + 1, 0, 23, 59, 59),
                title: `${monthName} ${yearNum}`
            };
        }
    }

    const yearMatch = input.match(/\b(20\d{2})\b/);
    if (yearMatch) {
        year = parseInt(yearMatch[0]);
        input = input.replace(yearMatch[0], '').trim();
    }

    const monthMap = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
    const quarterMap = { q1:[0,2], q2:[3,5], q3:[6,8], q4:[9,11] };

    if (frequency === 'monthly') {
        const monthStr = Object.keys(monthMap).find(m => input.includes(m));
        if (monthStr) {
            const month = monthMap[monthStr];
            return {
                start: new Date(year, month, 1),
                end: new Date(year, month + 1, 0, 23, 59, 59),
                title: `${monthStr.charAt(0).toUpperCase() + monthStr.slice(1)} ${year}`
            };
        }
    } else if (frequency === 'quarterly') {
        const quarterStr = Object.keys(quarterMap).find(q => input.includes(q));
        if (quarterStr) {
            const [startMonth, endMonth] = quarterMap[quarterStr];
            return {
                start: new Date(year, startMonth, 1),
                end: new Date(year, endMonth + 1, 0, 23, 59, 59),
                title: `${quarterStr.toUpperCase()} ${year}`
            };
        }
    } else if (frequency === 'annual') {
        return {
            start: new Date(year, 0, 1),
            end: new Date(year, 11, 31, 23, 59, 59),
            title: `Year ${year}`
        };
    }
    return { start: null, end: null, title: 'Invalid Period' };
}

/**
 * Escapes a string for safe interpolation into HTML (element content and
 * double-quoted attribute values). Used to harden innerHTML sinks against
 * tampered backup/import data.
 * @param {*} str - Value to escape (null/undefined become '')
 * @returns {string} HTML-safe string
 */
export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}


/**
 * Resolves the value of an effective-dated rate history for a given date.
 * A history is an array of { effectiveDate: 'YYYY-MM-DD', value: number }.
 * Returns the value of the latest entry whose effectiveDate is on or before
 * the given date; dates before the first entry resolve to the first entry.
 * String comparison is safe because storage dates are YYYY-MM-DD (v9+).
 * @param {Array|undefined} history - Rate history entries (any order)
 * @param {string} dateStr - The date to resolve for (YYYY-MM-DD)
 * @param {number} fallback - Returned when the history is missing or empty
 * @returns {number} The rate in force on dateStr
 */
export function resolveRate(history, dateStr, fallback) {
    if (!Array.isArray(history) || history.length === 0) return fallback;
    const sorted = history.slice().sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
    let result = sorted[0].value;
    for (const entry of sorted) {
        if (entry.effectiveDate <= dateStr) result = entry.value;
        else break;
    }
    return result;
}
