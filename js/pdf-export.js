/*
  PayTrax Payroll Management
  Copyright (c) 2025 greenwh

  Developed by greenwh with substantial assistance from AI coding tools (Claude, ChatGPT, Gemini).
  This file is original work based on documentation and prompts by greenwh.
  Licensed under the MIT License.
*/
// js/pdf-export.js - PDF export functionality using jsPDF

import { appData } from './state.js';
import { SS_WAGE_BASE, FUTA_WAGE_BASE } from './state.js';

/**
 * Exports pay stub to PDF
 * @param {string} employeeId - The employee ID
 * @param {number} periodNum - The pay period number
 */
export function exportPayStubToPDF(employeeId, periodNum) {
    const employee = appData.employees.find(e => e.id === employeeId);
    if (!employee) {
        alert('Employee not found');
        return;
    }

    const periods = appData.payPeriods[employeeId];
    if (!periods) {
        alert('No pay periods found');
        return;
    }

    const period = periods[parseInt(periodNum) - 1];
    if (!period) {
        alert('Pay period not found');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Company header
    const companyName = appData.settings.companyName || 'Company Name';
    const companyAddress = appData.settings.companyAddress || '';
    doc.setFontSize(18);
    doc.text(companyName, 105, 20, { align: 'center' });

    if (companyAddress) {
        doc.setFontSize(9);
        doc.text(companyAddress, 105, 27, { align: 'center' });
    }

    doc.setFontSize(14);
    doc.text('Pay Stub', 105, 35, { align: 'center' });

    // Employee info
    doc.setFontSize(10);
    doc.text('PAY TO THE ORDER OF:', 20, 50);
    doc.setFont(undefined, 'bold');
    doc.text(employee.name.toUpperCase(), 20, 57);
    doc.setFont(undefined, 'normal');

    if (employee.address) {
        doc.setFontSize(9);
        doc.text(employee.address, 20, 63);
        doc.setFontSize(10);
    }

    const employeeInfoY = employee.address ? 70 : 63;
    doc.text(`Employee ID: ${employee.idNumber}`, 20, employeeInfoY);
    doc.text(`Pay Period: ${period.startDate} - ${period.endDate}`, 20, employeeInfoY + 7);
    doc.text(`Pay Date: ${period.payDate}`, 20, employeeInfoY + 14);

    // Calculate YTD earnings
    const ytdEarnings = calculateYTDEarnings(employeeId, periodNum);

    // Hours and earnings table with YTD
    const earningsData = [
        ['Type', 'Hours', 'Rate', 'Current', 'YTD'],
        ['Regular', (period.hours.regular || 0).toFixed(2), `$${employee.rate.toFixed(2)}`, `$${(period.earnings.regular || 0).toFixed(2)}`, `$${ytdEarnings.regular.toFixed(2)}`],
        ['Overtime', (period.hours.overtime || 0).toFixed(2), `$${(employee.rate * employee.overtimeMultiplier).toFixed(2)}`, `$${(period.earnings.overtime || 0).toFixed(2)}`, `$${ytdEarnings.overtime.toFixed(2)}`],
        ['Holiday', (period.hours.holiday || 0).toFixed(2), `$${(employee.rate * employee.holidayMultiplier).toFixed(2)}`, `$${(period.earnings.holiday || 0).toFixed(2)}`, `$${ytdEarnings.holiday.toFixed(2)}`],
        ['PTO', (period.hours.pto || 0).toFixed(2), `$${employee.rate.toFixed(2)}`, `$${(period.earnings.pto || 0).toFixed(2)}`, `$${ytdEarnings.pto.toFixed(2)}`]
    ];

    const tableStartY = employee.address ? 90 : 82;
    doc.autoTable({
        startY: tableStartY,
        head: [earningsData[0]],
        body: earningsData.slice(1),
        theme: 'striped',
        headStyles: { fillColor: [44, 62, 80] }
    });

    // Taxes table
    const taxesData = [
        ['Tax Type', 'Current', 'YTD'],
        ['Federal', `$${period.taxes.federal.toFixed(2)}`, calculateYTD(employeeId, periodNum, 'federal')],
        ['FICA', `$${period.taxes.fica.toFixed(2)}`, calculateYTD(employeeId, periodNum, 'fica')],
        ['Medicare', `$${period.taxes.medicare.toFixed(2)}`, calculateYTD(employeeId, periodNum, 'medicare')],
        ['State', `$${period.taxes.state.toFixed(2)}`, calculateYTD(employeeId, periodNum, 'state')],
        ['Local', `$${period.taxes.local.toFixed(2)}`, calculateYTD(employeeId, periodNum, 'local')]
    ];

    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 10,
        head: [taxesData[0]],
        body: taxesData.slice(1),
        theme: 'striped',
        headStyles: { fillColor: [44, 62, 80] }
    });

    // Deductions (if any)
    if (period.deductions && period.deductions.length > 0) {
        const deductionsData = [
            ['Deduction', 'Amount']
        ];
        period.deductions.forEach(ded => {
            deductionsData.push([ded.name, `$${ded.calculatedAmount.toFixed(2)}`]);
        });

        doc.autoTable({
            startY: doc.lastAutoTable.finalY + 10,
            head: [deductionsData[0]],
            body: deductionsData.slice(1),
            theme: 'striped',
            headStyles: { fillColor: [44, 62, 80] }
        });
    }

    // Calculate YTD totals
    const ytdGross = ytdEarnings.regular + ytdEarnings.overtime + ytdEarnings.holiday + ytdEarnings.pto;
    const ytdTaxes = calculateYTDTotal(employeeId, periodNum, ['federal', 'fica', 'medicare', 'state', 'local']);
    const ytdDeductions = calculateYTDDeductions(employeeId, periodNum);

    // Current Period Summary
    let summaryY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('CURRENT PERIOD TOTALS', 20, summaryY);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    doc.text(`Gross Pay: $${period.grossPay.toFixed(2)}`, 20, summaryY + 7);
    doc.text(`Total Taxes: $${period.taxes.total.toFixed(2)}`, 20, summaryY + 14);
    doc.text(`Total Deductions: $${(period.totalDeductions || 0).toFixed(2)}`, 20, summaryY + 21);

    // YTD Summary
    summaryY = summaryY + 32;
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('YEAR-TO-DATE TOTALS', 20, summaryY);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    doc.text(`YTD Earnings: $${ytdGross.toFixed(2)}`, 20, summaryY + 7);
    doc.text(`YTD Taxes: $${ytdTaxes.toFixed(2)}`, 20, summaryY + 14);
    doc.text(`YTD Deductions: $${ytdDeductions.toFixed(2)}`, 20, summaryY + 21);

    // Net Pay
    summaryY = summaryY + 32;
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text(`NET PAY: $${period.netPay.toFixed(2)}`, 20, summaryY);

    // PTO Summary - check if we need a new page
    summaryY = summaryY + 15;

    // If PTO section would overflow the page (need ~30mm space), add new page
    const pageHeight = doc.internal.pageSize.height;
    const bottomMargin = 20; // Reserve 20mm from bottom

    if (summaryY + 30 > pageHeight - bottomMargin) {
        doc.addPage();
        summaryY = 20; // Start from top of new page
    }

    const ptoUsed = period.hours.pto || 0;
    const ptoEarned = period.ptoAccrued || 0;
    const ptoEnd = employee.ptoBalance || 0;
    const ptoBegin = (ptoEnd - ptoEarned) + ptoUsed;

    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('PAID TIME OFF SUMMARY', 20, summaryY);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    doc.text(`Beginning: ${ptoBegin.toFixed(2)} hrs`, 20, summaryY + 7);
    doc.text(`Earned: ${ptoEarned.toFixed(2)} hrs`, 70, summaryY + 7);
    doc.text(`Used: ${ptoUsed.toFixed(2)} hrs`, 120, summaryY + 7);
    doc.text(`Ending Balance: ${ptoEnd.toFixed(2)} hrs`, 20, summaryY + 14);

    // Save
    doc.save(`PayStub_${employee.name.replace(/\s+/g, '_')}_${period.payDate}.pdf`);
}

/**
 * Helper function to calculate YTD tax amounts
 */
function calculateYTD(employeeId, periodNum, taxType) {
    const periods = appData.payPeriods[employeeId] || [];
    let ytd = 0;
    for (let i = 0; i < periodNum; i++) {
        const p = periods[i];
        if (p && p.taxes) {
            ytd += p.taxes[taxType] || 0;
        }
    }
    return `$${ytd.toFixed(2)}`;
}

/**
 * Helper function to calculate YTD earnings by type
 */
function calculateYTDEarnings(employeeId, periodNum) {
    const periods = appData.payPeriods[employeeId] || [];
    const ytd = { regular: 0, overtime: 0, holiday: 0, pto: 0 };
    for (let i = 0; i < periodNum; i++) {
        const p = periods[i];
        if (p && p.earnings) {
            ytd.regular += p.earnings.regular || 0;
            ytd.overtime += p.earnings.overtime || 0;
            ytd.holiday += p.earnings.holiday || 0;
            ytd.pto += p.earnings.pto || 0;
        }
    }
    return ytd;
}

/**
 * Helper function to calculate YTD total for multiple tax types
 */
function calculateYTDTotal(employeeId, periodNum, taxTypes) {
    const periods = appData.payPeriods[employeeId] || [];
    let total = 0;
    for (let i = 0; i < periodNum; i++) {
        const p = periods[i];
        if (p && p.taxes) {
            taxTypes.forEach(type => {
                total += p.taxes[type] || 0;
            });
        }
    }
    return total;
}

/**
 * Helper function to calculate YTD deductions
 */
function calculateYTDDeductions(employeeId, periodNum) {
    const periods = appData.payPeriods[employeeId] || [];
    let ytd = 0;
    for (let i = 0; i < periodNum; i++) {
        const p = periods[i];
        if (p && p.totalDeductions) {
            ytd += p.totalDeductions;
        }
    }
    return ytd;
}

/**
 * Exports W-2 report to PDF
 * @param {string} yearStr - The tax year
 */
export function exportW2ReportToPDF(yearStr) {
    const year = parseInt(yearStr) || appData.settings.taxYear;
    const ssWageBase = appData.settings.ssWageBase || SS_WAGE_BASE;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Title
    doc.setFontSize(16);
    doc.text(`W-2 Annual Report - ${year}`, 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(appData.settings.companyName || 'Company Name', 105, 28, { align: 'center' });

    const tableData = [];

    appData.employees.forEach(emp => {
        const periodsInYear = (appData.payPeriods[emp.id] || []).filter(
            p => new Date(p.payDate).getFullYear() === year && p.grossPay > 0
        );

        if (periodsInYear.length === 0) return;

        let totals = { gross: 0, federal: 0, fica: 0, medicare: 0, state: 0, local: 0 };
        let ssWages = 0;

        periodsInYear.forEach(p => {
            const grossBeforeThisPeriod = ssWages;
            if (grossBeforeThisPeriod < ssWageBase) {
                ssWages += Math.min(p.grossPay, ssWageBase - grossBeforeThisPeriod);
            }
            totals.gross += p.grossPay;
            totals.federal += p.taxes.federal;
            totals.fica += p.taxes.fica;
            totals.medicare += p.taxes.medicare;
            totals.state += p.taxes.state;
            totals.local += p.taxes.local;
        });

        tableData.push([
            emp.name,
            emp.idNumber,
            `$${totals.gross.toFixed(2)}`,
            `$${totals.federal.toFixed(2)}`,
            `$${totals.fica.toFixed(2)}`,
            `$${totals.medicare.toFixed(2)}`,
            `$${ssWages.toFixed(2)}`,
            `$${totals.state.toFixed(2)}`,
            `$${totals.local.toFixed(2)}`
        ]);
    });

    doc.autoTable({
        startY: 35,
        head: [['Employee', 'ID', 'Wages', 'Fed Tax', 'FICA', 'Medicare', 'SS Wages', 'State', 'Local']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [44, 62, 80], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        columnStyles: {
            0: { cellWidth: 35 },
            1: { cellWidth: 20 }
        }
    });

    doc.save(`W2_Report_${year}.pdf`);
}

/**
 * Exports 941 report to PDF
 * @param {string} periodStr - The quarter (e.g., "Q1 2025")
 */
export function export941ReportToPDF(periodStr) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Title
    doc.setFontSize(16);
    doc.text(`Form 941 Quarterly Report - ${periodStr}`, 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(appData.settings.companyName || 'Company Name', 105, 28, { align: 'center' });

    // Note: We'll need to recalculate the 941 data here
    // For simplicity, I'll create a summary table
    const ssWageBase = appData.settings.ssWageBase || SS_WAGE_BASE;
    const additionalMedicareThreshold = appData.settings.additionalMedicareThreshold || 200000;
    const ficaTotalRate = (appData.settings.socialSecurity || 6.2) / 100 * 2;
    const medicareTotalRate = (appData.settings.medicare || 1.45) / 100 * 2;

    const tableData = [
        ['Description', 'Amount'],
        ['Report Period', periodStr],
        ['Total Wages, Tips, and Other Compensation', '(calculated)'],
        ['Federal Income Tax Withheld', '(calculated)'],
        [`Social Security Wages (limit: $${ssWageBase.toLocaleString()})`, '(calculated)'],
        [`Social Security Tax (${(ficaTotalRate * 100).toFixed(1)}%)`, '(calculated)'],
        ['Medicare Wages & Tips', '(calculated)'],
        [`Medicare Tax (${(medicareTotalRate * 100).toFixed(2)}%)`, '(calculated)'],
        [`Wages Subject to Additional Medicare (over $${additionalMedicareThreshold.toLocaleString()})`, '(calculated)'],
        ['Total Taxes', '(calculated)']
    ];

    doc.autoTable({
        startY: 35,
        head: [tableData[0]],
        body: tableData.slice(1),
        theme: 'striped',
        headStyles: { fillColor: [44, 62, 80] }
    });

    doc.setFontSize(8);
    doc.text('Note: This is a summary. Refer to the HTML report for complete calculations.', 105, doc.lastAutoTable.finalY + 10, { align: 'center' });

    doc.save(`Form_941_${periodStr.replace(/\s+/g, '_')}.pdf`);
}

/**
 * Exports 940 report to PDF
 * @param {string} yearStr - The tax year
 */
export function export940ReportToPDF(yearStr) {
    const year = parseInt(yearStr) || appData.settings.taxYear;
    const futaWageBase = appData.settings.futaWageBase || FUTA_WAGE_BASE;
    const futaRate = appData.settings.futaRate / 100;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Title
    doc.setFontSize(16);
    doc.text(`Form 940 Annual FUTA Report - ${year}`, 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(appData.settings.companyName || 'Company Name', 105, 28, { align: 'center' });

    const tableData = [
        ['Description', 'Amount'],
        ['Tax Year', year.toString()],
        ['Total Payments to Employees', '(calculated)'],
        [`Payments Exceeding FUTA Wage Base ($${futaWageBase.toLocaleString()})`, '(calculated)'],
        ['Taxable FUTA Wages', '(calculated)'],
        [`FUTA Tax (${(futaRate * 100).toFixed(1)}%)`, '(calculated)']
    ];

    doc.autoTable({
        startY: 35,
        head: [tableData[0]],
        body: tableData.slice(1),
        theme: 'striped',
        headStyles: { fillColor: [44, 62, 80] }
    });

    doc.setFontSize(8);
    doc.text('Note: This is a summary. Refer to the HTML report for complete calculations.', 105, doc.lastAutoTable.finalY + 10, { align: 'center' });

    doc.save(`Form_940_${year}.pdf`);
}

/**
 * Exports custom date range report to PDF
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @param {string} employeeId - Employee ID or "all"
 * @param {string} reportType - "employee" or "employer"
 */
export function exportCustomReportToPDF(startDate, endDate, employeeId, reportType) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape'); // Landscape for wider tables

    const employeeName = employeeId === 'all' ? 'All Employees' :
        (appData.employees.find(e => e.id === employeeId)?.name || 'Unknown');

    // Title
    doc.setFontSize(16);
    doc.text(`Custom ${reportType === 'employee' ? 'Employee Wage' : 'Employer Expense'} Report`, 148, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`${startDate} to ${endDate}`, 148, 28, { align: 'center' });
    doc.text(`For: ${employeeName}`, 148, 34, { align: 'center' });

    // Data collection (simplified)
    const tableData = [];
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');

    const employeesToReport = employeeId === 'all' ? appData.employees :
        appData.employees.filter(e => e.id === employeeId);

    employeesToReport.forEach(emp => {
        const periods = (appData.payPeriods[emp.id] || []).filter(p => {
            const payDate = new Date(p.payDate);
            return payDate >= start && payDate <= end && p.grossPay > 0;
        });

        if (periods.length === 0) return;

        let totals = { gross: 0, federal: 0, fica: 0, medicare: 0, state: 0, local: 0, net: 0, hours: 0 };

        periods.forEach(p => {
            totals.hours += (p.hours.regular || 0) + (p.hours.overtime || 0) + (p.hours.holiday || 0) + (p.hours.pto || 0);
            totals.gross += p.grossPay;
            totals.federal += p.taxes.federal;
            totals.fica += p.taxes.fica;
            totals.medicare += p.taxes.medicare;
            totals.state += p.taxes.state;
            totals.local += p.taxes.local;
            totals.net += p.netPay;
        });

        if (reportType === 'employee') {
            tableData.push([
                emp.name,
                totals.hours.toFixed(2),
                `$${totals.gross.toFixed(2)}`,
                `$${totals.federal.toFixed(2)}`,
                `$${totals.state.toFixed(2)}`,
                `$${totals.local.toFixed(2)}`,
                `$${totals.fica.toFixed(2)}`,
                `$${totals.medicare.toFixed(2)}`,
                `$${totals.net.toFixed(2)}`
            ]);
        } else {
            const totalCost = totals.gross + totals.fica + totals.medicare;
            tableData.push([
                emp.name,
                totals.hours.toFixed(2),
                `$${totals.gross.toFixed(2)}`,
                `$${totals.fica.toFixed(2)}`,
                `$${totals.medicare.toFixed(2)}`,
                `$${totalCost.toFixed(2)}`
            ]);
        }
    });

    const headers = reportType === 'employee' ?
        [['Employee', 'Hours', 'Gross', 'Fed Tax', 'State', 'Local', 'FICA', 'Medicare', 'Net']] :
        [['Employee', 'Hours', 'Gross', 'ER FICA', 'ER Medicare', 'Total Cost']];

    doc.autoTable({
        startY: 42,
        head: headers,
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [44, 62, 80], fontSize: 9 },
        bodyStyles: { fontSize: 8 }
    });

    const filename = `Custom_Report_${startDate}_to_${endDate}.pdf`;
    doc.save(filename);
}
