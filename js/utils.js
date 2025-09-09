/*
  PayTrax Payroll Management
  Copyright (c) 2025 greenwh

  Developed by greenwh with substantial assistance from AI coding tools (Claude, ChatGPT, Gemini).
  This file is original work based on documentation and prompts by greenwh.
  Licensed under the MIT License.
*/
import { appData } from './state.js';

/**
 * Formats a Date object into a "MM/DD/YYYY" string.
 * @param {Date} date - The date to format.
 * @returns {string} The formatted date string.
 */
export function formatDate(date) {
    const d = new Date(date);
    // Use UTC methods to avoid timezone issues with date-only objects
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const year = d.getUTCFullYear();
    return `${month}/${day}/${year}`;
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