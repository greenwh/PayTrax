/*
  PayTrax Payroll Management
  Copyright (c) 2025 greenwh

  Developed by greenwh with substantial assistance from AI coding tools (Claude, ChatGPT, Gemini).
  This file is original work based on documentation and prompts by greenwh.
  Licensed under the MIT License.
*/
import { appData } from './state.js';
import * as logic from './logic.js';
import { formatDate, parseDateInput, fromStorageDate, toDisplayDate, getQuarterForDate, escapeHtml } from './utils.js';
import { getAuditLog } from './audit.js';

// --- UI & TAB MANAGEMENT ---

/**
 * Shows a specific tab and hides others.
 * @param {string} tabName - The ID of the tab content to show.
 * @param {HTMLElement} tabButton - The button element that was clicked.
 */
export function showTab(tabName, tabButton) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(nav => nav.classList.remove('active'));
    
    const tabElement = document.getElementById(tabName);
    if (tabElement) {
        tabElement.classList.add('active');
    }
    if (tabButton) {
        tabButton.classList.add('active');
    }
}

/**
 * Populates the settings forms with data from the appData object.
 */
export function displaySettings() {
    const settings = appData.settings;
    document.getElementById('companyName').value = settings.companyName;
    document.getElementById('taxYear').value = settings.taxYear;
    document.getElementById('payFrequency').value = settings.payFrequency;
    document.getElementById('firstPayPeriodStartDate').value = settings.firstPayPeriodStartDate;
    document.getElementById('daysUntilPayday').value = settings.daysUntilPayday;
    document.getElementById('companyAddress').value = settings.companyAddress;
    document.getElementById('companyPhone').value = settings.companyPhone;
    document.getElementById('socialSecurity').value = settings.socialSecurity;
    document.getElementById('medicare').value = settings.medicare;
    document.getElementById('sutaRate').value = settings.sutaRate;
    document.getElementById('futaRate').value = settings.futaRate;
    document.getElementById('ssWageBase').value = settings.ssWageBase;
    document.getElementById('futaWageBase').value = settings.futaWageBase;
    document.getElementById('sutaWageBase').value = settings.sutaWageBase;
    document.getElementById('additionalMedicareThreshold').value = settings.additionalMedicareThreshold;
    document.getElementById('additionalMedicareRate').value = settings.additionalMedicareRate;
    document.getElementById('federalTaxFrequency').value = settings.taxFrequencies.federal;
    document.getElementById('futaTaxFrequency').value = settings.taxFrequencies.futa;
    document.getElementById('sutaTaxFrequency').value = settings.taxFrequencies.suta;
    document.getElementById('stateTaxFrequency').value = settings.taxFrequencies.state;
    document.getElementById('localTaxFrequency').value = settings.taxFrequencies.local;
    document.getElementById('autoSubtraction').checked = settings.autoSubtraction !== false;
    document.getElementById('quarterlyEarningsTarget').value = settings.quarterlyEarningsTarget;
    document.getElementById('minimumWeeklyHours').value = settings.minimumWeeklyHours;
}

/**
 * Populates all employee dropdowns across the application.
 */
export function populateEmployeeDropdowns() {
    const lists = [document.getElementById('employeeList'), document.getElementById('currentEmployee'), document.getElementById('reportEmployee')];
    lists.forEach(list => {
        const currentVal = list.value;
        list.innerHTML = list.id === 'reportEmployee' ? '<option value="all">All Employees</option>' : `<option value="">${list.id === 'employeeList' ? 'Select Employee to Edit...' : 'Select Employee...'}</option>`;
        appData.employees.forEach(emp => {
            const option = document.createElement('option');
            option.value = emp.id;
            option.textContent = `${emp.name} (${emp.idNumber || 'No ID'})`;
            list.appendChild(option);
        });
        // Try to preserve the selected value
        if (Array.from(list.options).some(opt => opt.value === currentVal)) {
            list.value = currentVal;
        }
    });
}

/**
 * Populates the pay period dropdown for a specific employee.
 * @param {string} employeeId - The ID of the selected employee.
 */
export function populatePeriodDropdown(employeeId) {
    const dropdown = document.getElementById('currentPeriod');
    const currentVal = dropdown.value;
    dropdown.innerHTML = '<option value="">Select Pay Period...</option>';
    if (!employeeId || !appData.payPeriods[employeeId]) return;

    appData.payPeriods[employeeId].forEach(period => {
        const option = document.createElement('option');
        option.value = period.period;
        option.textContent = `Period ${period.period}: ${toDisplayDate(period.startDate)} - ${toDisplayDate(period.endDate)}`;
        dropdown.appendChild(option);
    });
    if (Array.from(dropdown.options).some(opt => opt.value === currentVal)) {
        dropdown.value = currentVal;
    }
}

/**
 * Displays the list of pay periods for an employee in the "Pay Periods" tab.
 * @param {string} employeeId - The ID of the selected employee.
 */
export function displayPayPeriods(employeeId) {
    const tbody = document.getElementById('payPeriodsBody');
    const empNameEl = document.getElementById('payrollTabEmployeeName');
    tbody.innerHTML = '';
    
    if (!employeeId) {
        empNameEl.textContent = 'None Selected';
        return;
    }
    
    const employee = appData.employees.find(e => e.id === employeeId);
    if (!employee) {
        empNameEl.textContent = 'Employee Not Found';
        return;
    }
    empNameEl.textContent = employee.name;
    
    (appData.payPeriods[employeeId] || []).forEach(period => {
        const totalHours = period.hours ? Object.values(period.hours).reduce((a, b) => a + b, 0) : 0;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${period.period}</td><td>${toDisplayDate(period.startDate)}</td><td>${toDisplayDate(period.endDate)}</td>
            <td>${toDisplayDate(period.payDate)}</td><td>${totalHours.toFixed(2)}</td><td>$${period.grossPay.toFixed(2)}</td>
            <td>$${period.taxes.federal.toFixed(2)}</td><td>$${period.taxes.state.toFixed(2)}</td>
            <td>$${period.taxes.local.toFixed(2)}</td><td>$${period.taxes.fica.toFixed(2)}</td>
            <td>$${period.taxes.medicare.toFixed(2)}</td>
            <td>$${period.netPay.toFixed(2)}</td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * Updates all the calculated fields on the dashboard UI.
 * @param {string} employeeId - The ID of the current employee.
 * @param {string} periodNum - The current pay period number.
 */
export function updateDashboardUI(employeeId, periodNum) {
    const periodDetailsEl = document.getElementById('periodDetails');
    const ptoDisplay = document.getElementById('ptoBalanceDisplay');

    const employee = appData.employees.find(e => e.id === employeeId);
    ptoDisplay.textContent = employee ? employee.ptoBalance.toFixed(2) : '0.00';

    if (!employeeId || !periodNum || !employee) {
        periodDetailsEl.style.display = 'none';
        return;
    }
    
    const period = appData.payPeriods[employeeId].find(p => p.period == periodNum);
    if (!period) {
        periodDetailsEl.style.display = 'none';
        return;
    }

    document.getElementById('periodNumber').textContent = period.period;
    document.getElementById('startDate').textContent = toDisplayDate(period.startDate);
    document.getElementById('endDate').textContent = toDisplayDate(period.endDate);
    document.getElementById('payDate').textContent = toDisplayDate(period.payDate);
    
    const employerTaxes = period.taxes.suta + period.taxes.futa + period.taxes.fica + period.taxes.medicare;
    const totalPayrollCost = period.grossPay + employerTaxes;

    document.getElementById('grossPay').textContent = period.grossPay.toFixed(2);
    document.getElementById('totalTaxes').textContent = period.taxes.total.toFixed(2);
    document.getElementById('netPay').textContent = period.netPay.toFixed(2);
    document.getElementById('employerTaxes').textContent = employerTaxes.toFixed(2);
    document.getElementById('totalPayrollCost').textContent = totalPayrollCost.toFixed(2);
    
    periodDetailsEl.style.display = 'block';
}

/**
 * Resets the employee form to its default state for adding a new employee.
 */
export function resetEmployeeForm() {
    document.getElementById('employeeFormTitle').textContent = 'Add New Employee';
    document.getElementById('employeeForm').reset();
    document.getElementById('employeeId').value = '';
    document.getElementById('deleteEmployeeBtn').style.display = 'none';
    document.getElementById('employeeList').value = '';

    // Hide deductions section for new employees
    document.getElementById('deductionsSection').style.display = 'none';
    document.getElementById('noEmployeeDeductionMsg').style.display = 'block';
}

/**
 * Fills the employee form with data for editing.
 * @param {string} employeeId - The ID of the employee to edit.
 */
export function renderEmployeeFormForEdit(employeeId) {
    if (!employeeId) {
        resetEmployeeForm();
        return;
    }
    const employee = appData.employees.find(e => e.id === employeeId);
    if (!employee) return;

    document.getElementById('employeeFormTitle').textContent = 'Edit Employee';
    document.getElementById('employeeId').value = employee.id;
    document.getElementById('idNumber').value = employee.idNumber;
    document.getElementById('employeeName').value = employee.name;
    document.getElementById('employeeAddress').value = employee.address;
    document.getElementById('hourlyRate').value = employee.rate;
    document.getElementById('overtimeRate').value = employee.overtimeMultiplier;
    document.getElementById('holidayRate').value = employee.holidayMultiplier;
    document.getElementById('federalTax').value = employee.fedTaxRate;
    document.getElementById('stateTax').value = employee.stateTaxRate;
    document.getElementById('localTax').value = employee.localTaxRate;
    document.getElementById('ptoAccrualRate').value = employee.ptoAccrualRate;
    // Fixing long decimals in PTO
	// The form edits the starting balance; ptoBalance is the computed current balance
	document.getElementById('ptoBalance').value = (employee.ptoStartingBalance || 0).toFixed(2);
    document.getElementById('deleteEmployeeBtn').style.display = 'inline-block';

    // Show and populate deductions section
    document.getElementById('deductionsSection').style.display = 'block';
    document.getElementById('noEmployeeDeductionMsg').style.display = 'none';
    renderDeductionsTable(employeeId);
}

/**
 * Renders the deductions table for an employee.
 * @param {string} employeeId - The ID of the employee
 */
export function renderDeductionsTable(employeeId) {
    const employee = appData.employees.find(e => e.id === employeeId);
    if (!employee) return;

    const tbody = document.getElementById('deductionsTableBody');
    tbody.innerHTML = '';

    if (!employee.deductions || employee.deductions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; font-style:italic; color:#6c757d;">No deductions configured</td></tr>';
        return;
    }

    employee.deductions.forEach(ded => {
        const row = document.createElement('tr');
        const typeDisplay = ded.type === 'fixed' ? `$${ded.amount.toFixed(2)}` : `${ded.amount.toFixed(2)}%`;
        const typeLabel = ded.type === 'fixed' ? 'Fixed' : 'Percent';
        const effectiveDate = ded.createdDate || 'N/A';

        row.innerHTML = `
            <td>${escapeHtml(ded.name)}</td>
            <td>${typeLabel}</td>
            <td>${typeDisplay}</td>
            <td>${effectiveDate}</td>
            <td>
                <button class="btn btn-danger btn-sm delete-deduction-btn" data-deduction-id="${ded.id}">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * Renders the pay stub UI based on the current employee and period.
 * @param {string} employeeId - The ID of the current employee.
 * @param {string} periodNum - The current pay period number.
 */
export function renderPayStubUI(employeeId, periodNum) {
    const { employee, period, ytd } = logic.getPayStubData(employeeId, periodNum);
    if (!employee || !period) return;

    document.getElementById('paystubCompanyName').textContent = appData.settings.companyName;
    document.getElementById('paystubCompanyAddress').textContent = appData.settings.companyAddress;
    document.getElementById('paystubEmployeeName').textContent = employee.name.toUpperCase();
    document.getElementById('paystubEmployeeAddress').textContent = employee.address;
    document.getElementById('paystubEmployeeId').textContent = employee.idNumber;
    document.getElementById('paystubStartDate').textContent = toDisplayDate(period.startDate);
    document.getElementById('paystubEndDate').textContent = toDisplayDate(period.endDate);
    document.getElementById('paystubPayDate').textContent = toDisplayDate(period.payDate);
    
    const earningsBody = document.getElementById('paystubEarningsBody');
    earningsBody.innerHTML = '';
    if (period.earnings.regular > 0) earningsBody.innerHTML += `<tr><td>Regular</td><td class="text-right">${employee.rate.toFixed(2)}</td><td class="text-right">${period.hours.regular.toFixed(2)}</td><td class="text-right">$${period.earnings.regular.toFixed(2)}</td><td class="text-right">$${(ytd.earnings.regular || 0).toFixed(2)}</td></tr>`;
    if (period.earnings.overtime > 0) earningsBody.innerHTML += `<tr><td>Overtime</td><td class="text-right">${(employee.rate * employee.overtimeMultiplier).toFixed(2)}</td><td class="text-right">${period.hours.overtime.toFixed(2)}</td><td class="text-right">$${period.earnings.overtime.toFixed(2)}</td><td class="text-right">$${(ytd.earnings.overtime || 0).toFixed(2)}</td></tr>`;
    if (period.earnings.holiday > 0) earningsBody.innerHTML += `<tr><td>Holiday</td><td class="text-right">${(employee.rate * employee.holidayMultiplier).toFixed(2)}</td><td class="text-right">${period.hours.holiday.toFixed(2)}</td><td class="text-right">$${period.earnings.holiday.toFixed(2)}</td><td class="text-right">$${(ytd.earnings.holiday || 0).toFixed(2)}</td></tr>`;
    if (period.earnings.pto > 0) earningsBody.innerHTML += `<tr><td>Paid Time Off</td><td class="text-right">${employee.rate.toFixed(2)}</td><td class="text-right">${period.hours.pto.toFixed(2)}</td><td class="text-right">$${period.earnings.pto.toFixed(2)}</td><td class="text-right">$${(ytd.earnings.pto || 0).toFixed(2)}</td></tr>`;
    
    const totalHours = Object.values(period.hours).reduce((sum, h) => sum + h, 0);
    document.getElementById('paystubTotalHours').textContent = totalHours.toFixed(2);
    document.getElementById('paystubTotalCurrent').textContent = period.grossPay.toFixed(2);
    document.getElementById('paystubTotalYTD').textContent = ytd.gross.toFixed(2);

    const ytdTaxesTotal = ytd.federal + ytd.fica + ytd.medicare + ytd.state + ytd.local;
    document.getElementById('paystubTaxesBody').innerHTML = `
        <tr><td>FED WTH</td><td class="text-right">$${period.taxes.federal.toFixed(2)}</td><td class="text-right">$${ytd.federal.toFixed(2)}</td></tr>
        <tr><td>FICA</td><td class="text-right">$${period.taxes.fica.toFixed(2)}</td><td class="text-right">$${ytd.fica.toFixed(2)}</td></tr>
        <tr><td>MEDFICA</td><td class="text-right">$${period.taxes.medicare.toFixed(2)}</td><td class="text-right">$${ytd.medicare.toFixed(2)}</td></tr>
        <tr><td>STATE</td><td class="text-right">$${period.taxes.state.toFixed(2)}</td><td class="text-right">$${ytd.state.toFixed(2)}</td></tr>
        <tr><td>LOCAL</td><td class="text-right">$${period.taxes.local.toFixed(2)}</td><td class="text-right">$${ytd.local.toFixed(2)}</td></tr>
    `;

    // Calculate YTD deductions
    const empPayPeriods = appData.payPeriods[employeeId] || [];
    let ytdDeductions = 0;
    for (let i = 0; i < period.period; i++) {
        const p = empPayPeriods[i];
        if (p && p.totalDeductions > 0) {
            ytdDeductions += p.totalDeductions;
        }
    }

    document.getElementById('paystubSummaryGross').textContent = period.grossPay.toFixed(2);
    document.getElementById('paystubSummaryTaxes').textContent = period.taxes.total.toFixed(2);
    document.getElementById('paystubYTDEarnings').textContent = ytd.gross.toFixed(2);
    document.getElementById('paystubYTDTaxes').textContent = ytdTaxesTotal.toFixed(2);
    document.getElementById('paystubNetPay').textContent = period.netPay.toFixed(2);

    // Update deductions display - both totals and itemized
    const deductionsDisplay = period.totalDeductions || 0;
    document.getElementById('paystubSummaryDeductions').textContent = deductionsDisplay.toFixed(2);
    document.getElementById('paystubYTDDeductions').textContent = ytdDeductions.toFixed(2);

    // Populate itemized deductions table
    const deductionsSection = document.getElementById('paystubDeductionsSection');
    const deductionsBody = document.getElementById('paystubDeductionsBody');
    deductionsBody.innerHTML = '';

    if (period.deductions && period.deductions.length > 0) {
        deductionsSection.style.display = 'block';
        period.deductions.forEach(ded => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${escapeHtml(ded.name)}</td>
                <td class="text-right">$${ded.calculatedAmount.toFixed(2)}</td>
            `;
            deductionsBody.appendChild(row);
        });
    } else {
        deductionsSection.style.display = 'none';
    }

    // Use period-level values so historical stubs are correct, not just the latest
    const ptoUsed = period.hours.pto || 0;
    const ptoEarned = period.ptoAccrued || 0;
    const ptoEnd = period.ptoBalanceAfter ?? employee.ptoBalance;
    const ptoBegin = (ptoEnd - ptoEarned) + ptoUsed;

    document.getElementById('ptoBegin').textContent = ptoBegin.toFixed(2);
    document.getElementById('ptoEarned').textContent = ptoEarned.toFixed(2);
    document.getElementById('ptoUsed').textContent = ptoUsed.toFixed(2);
    document.getElementById('ptoEnd').textContent = ptoEnd.toFixed(2);
}

/**
 * Toggles the visibility of report input fields based on the selected report type.
 */
export function toggleReportInputs() {
    const reportType = document.getElementById('reportType').value;
    const periodGroup = document.getElementById('reportPeriodGroup');
    const dateRangeGroup = document.getElementById('reportDateRangeGroup');
    const employeeGroup = document.getElementById('reportEmployeeGroup');
    
    document.getElementById('reportOutput').innerHTML = '<div class="alert alert-info">Select a report type and period, then click "Generate Report" to view tax calculations and compliance data.</div>';

    const freqSelector = document.getElementById('reportTaxFrequency');
    const currentFreq = freqSelector ? freqSelector.value : null;

    periodGroup.innerHTML = ''; 
    dateRangeGroup.style.display = 'none';
    employeeGroup.style.display = 'none';
    periodGroup.style.display = 'block';

    if (reportType === 'taxdeposit') {
        const reportFrequencies = ['monthly', 'quarterly', 'weekly', 'bi-weekly', 'annual'];
        
        let html = `<label class="form-label">Tax Deposit Frequency</label>
                    <select id="reportTaxFrequency" class="form-input">`;
        reportFrequencies.forEach(f => {
            html += `<option value="${f}" ${f === currentFreq ? 'selected' : ''}>${f.charAt(0).toUpperCase() + f.slice(1)}</option>`;
        });
        html += `</select>`;
        periodGroup.innerHTML = html;
        
        // The event listener is now handled by event delegation in main.js
        // So the addEventListener line that was here has been removed.

        const selectedFreq = document.getElementById('reportTaxFrequency').value;
        const freqToActOn = currentFreq || selectedFreq;

        if (['weekly', 'bi-weekly'].includes(freqToActOn)) {
            const allPeriods = [].concat.apply([], Object.values(appData.payPeriods))
                .filter(p => p.grossPay > 0)
                .sort((a,b) => fromStorageDate(a.payDate) - fromStorageDate(b.payDate));
            
            let periodSelector = `<div class="form-group" style="margin-top: 15px;"><label class="form-label">Select Pay Period</label><select id="reportPayPeriod" class="form-input">`;
            if (allPeriods.length > 0) {
                allPeriods.forEach(p => {
                    periodSelector += `<option value="${p.payDate}">Pay Date: ${toDisplayDate(p.payDate)} (Period ${p.period})</option>`;
                });
            } else {
                periodSelector += `<option value="">No pay periods with data</option>`;
            }
            periodSelector += `</select></div>`;
            periodGroup.innerHTML += periodSelector;
        } else {
             periodGroup.innerHTML += `<div class="form-group" style="margin-top: 15px;"><label class="form-label">Enter Period</label><input type="text" id="reportPeriodText" class="form-input" placeholder="e.g., June, Q2, 08/25"></div>`;
        }

    } else if (['annual', '941', '940'].includes(reportType)) {
        let placeholder = 'e.g., 2025';
        if (reportType === '941') placeholder = 'e.g., Q1 2025';
        periodGroup.innerHTML = `<label class="form-label">Period/Year</label><input type="text" id="reportPeriodText" class="form-input" placeholder="${placeholder}">`;
    } else if (reportType.includes('daterange')) {
        dateRangeGroup.style.display = 'block';
        employeeGroup.style.display = 'block';
        periodGroup.style.display = 'none';
    }
}

/**
 * Generates and displays the selected report.
 */
export function renderReportUI() {
    const reportType = document.getElementById('reportType').value;
    const output = document.getElementById('reportOutput');
    let reportHTML = '';

    // Add export buttons HTML (CSV and PDF)
    let exportButtons = '';

    switch (reportType) {
        case 'taxdeposit':
            reportHTML = logic.generateTaxDepositReport();
            break;
        case 'annual':
        case '941':
        case '940':
            const periodStr = document.getElementById('reportPeriodText').value;
            if (reportType === 'annual') {
                reportHTML = logic.generateW2Report(periodStr);
                exportButtons = `
                    <button class="btn btn-success" id="exportReportCSVBtn" data-report-type="w2" data-period="${escapeHtml(periodStr)}">Export to CSV</button>
                    <button class="btn btn-primary" id="exportReportPDFBtn" data-report-type="w2" data-period="${escapeHtml(periodStr)}">Export to PDF</button>
                `;
            }
            if (reportType === '941') {
                reportHTML = logic.generate941Report(periodStr);
                exportButtons = `
                    <button class="btn btn-success" id="exportReportCSVBtn" data-report-type="941" data-period="${escapeHtml(periodStr)}">Export to CSV</button>
                    <button class="btn btn-primary" id="exportReportPDFBtn" data-report-type="941" data-period="${escapeHtml(periodStr)}">Export to PDF</button>
                `;
            }
            if (reportType === '940') {
                reportHTML = logic.generate940Report(periodStr);
                exportButtons = `
                    <button class="btn btn-success" id="exportReportCSVBtn" data-report-type="940" data-period="${escapeHtml(periodStr)}">Export to CSV</button>
                    <button class="btn btn-primary" id="exportReportPDFBtn" data-report-type="940" data-period="${escapeHtml(periodStr)}">Export to PDF</button>
                `;
            }
            break;
        case 'daterange-employee':
        case 'daterange-employer':
            let startDateRangeStr = document.getElementById('reportStartDate').value;
            let endDateRangeStr = document.getElementById('reportEndDateRange').value;
            const reportEmployeeId = document.getElementById('reportEmployee').value;

            if (!startDateRangeStr && !endDateRangeStr) {
                const year = appData.settings.taxYear;
                startDateRangeStr = `${year}-01-01`;
                endDateRangeStr = `${year}-12-31`;
            }

            if (reportType === 'daterange-employee') {
                reportHTML = logic.generateDateRangeEmployeeReport(startDateRangeStr, endDateRangeStr, reportEmployeeId);
                exportButtons = `
                    <button class="btn btn-success" id="exportReportCSVBtn" data-report-type="daterange-employee" data-start="${escapeHtml(startDateRangeStr)}" data-end="${escapeHtml(endDateRangeStr)}" data-employee="${escapeHtml(reportEmployeeId)}">Export to CSV</button>
                    <button class="btn btn-primary" id="exportReportPDFBtn" data-report-type="daterange" data-start="${escapeHtml(startDateRangeStr)}" data-end="${escapeHtml(endDateRangeStr)}" data-employee="${escapeHtml(reportEmployeeId)}" data-subtype="employee">Export to PDF</button>
                `;
            }
            if (reportType === 'daterange-employer') {
                reportHTML = logic.generateDateRangeEmployerReport(startDateRangeStr, endDateRangeStr, reportEmployeeId);
                exportButtons = `
                    <button class="btn btn-success" id="exportReportCSVBtn" data-report-type="daterange-employer" data-start="${escapeHtml(startDateRangeStr)}" data-end="${escapeHtml(endDateRangeStr)}" data-employee="${escapeHtml(reportEmployeeId)}">Export to CSV</button>
                    <button class="btn btn-primary" id="exportReportPDFBtn" data-report-type="daterange" data-start="${escapeHtml(startDateRangeStr)}" data-end="${escapeHtml(endDateRangeStr)}" data-employee="${escapeHtml(reportEmployeeId)}" data-subtype="employer">Export to PDF</button>
                `;
            }
            break;
    }

    // Add export buttons if available
    if (exportButtons && !reportHTML.includes('alert alert-info')) {
        reportHTML = `<div style="text-align: right; margin-bottom: 15px; display: flex; gap: 10px; justify-content: flex-end;">${exportButtons}</div>` + reportHTML;
    }

    output.innerHTML = reportHTML;
}

/**
 * Opens a print dialog for the pay stub content.
 */
export function printPayStub() {
    const printContent = document.getElementById('paystubContent').innerHTML;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<html><head><title>Pay Stub</title><style>
        body { font-family: 'Courier New', monospace; margin: 20px; } .paystub { max-width: 800px; margin: auto; border: 2px solid #000; }
        .paystub-header, .pay-info, .totals-section { display: block; } .paystub-table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        .paystub-table th, .paystub-table td { border: 1px solid #000; padding: 8px; text-align: left; } .text-right { text-align: right; }
        .pto-summary { padding: 10px; border: 1px solid #000; margin-top: 10px; } .pto-summary > div { display: flex; justify-content: space-around; }
        .company-info, .non-negotiable { text-align: center; } .net-pay { font-weight: bold; text-align: center; padding: 10px; border: 1px solid black; margin: 10px 0;}
    </style></head><body><div class="paystub">${printContent}</div></body></html>`);
    printWindow.document.close();
    printWindow.print();
}

// --- QUARTERLY EARNINGS TARGET WIDGET ---

/**
 * Renders the quarterly earnings widget on the dashboard.
 * Shows per-employee detail when an employee is selected,
 * or all-employees summary when none is selected.
 */
export function refreshQuarterlyEarningsWidget() {
    const widget = document.getElementById('quarterlyEarningsWidget');
    if (!widget) return;

    const target = appData.settings.quarterlyEarningsTarget || 0;

    // Hide widget if target is 0 (feature disabled)
    if (target === 0) {
        widget.style.display = 'none';
        return;
    }

    // Show widget
    widget.style.display = 'block';

    const employeeId = document.getElementById('currentEmployee')?.value;

    if (!appData.employees || appData.employees.length === 0) {
        document.getElementById('qetHeader').textContent = 'Quarterly Earnings Target';
        document.getElementById('qetBody').innerHTML =
            '<p style="text-align:center; font-style:italic; color:#6c757d;">Add an employee to see quarterly earnings tracking.</p>';
        return;
    }

    if (employeeId) {
        // Per-employee detail view
        const status = logic.calculateQuarterlyEarningsStatus(employeeId);
        renderQuarterlyEarningsWidget(status, employeeId);
    } else {
        // All-employees summary
        renderAllEmployeesQuarterlySummary();
    }
}

/**
 * Renders the per-employee quarterly earnings detail widget.
 * @param {object} status - Return object from calculateQuarterlyEarningsStatus()
 * @param {string} employeeId - The employee ID
 */
function renderQuarterlyEarningsWidget(status, employeeId) {
    const employee = appData.employees.find(e => e.id === employeeId);
    const empName = employee ? employee.name : 'Unknown';
    const header = document.getElementById('qetHeader');
    const body = document.getElementById('qetBody');

    header.textContent = `${status.quarter} ${status.quarterStart.substring(0, 4)} Earnings Target — ${empName}`;

    // Determine progress bar class
    let barClass = 'qet-on-track';
    if (!status.targetReachable) barClass = 'qet-unreachable';
    else if (status.percentComplete < 50 && status.remainingPeriods <= 3) barClass = 'qet-tight';

    const pct = Math.min(status.percentComplete, 100);

    let html = '';

    // Section 1: Quarter Progress Summary
    html += `<div style="margin-bottom: 15px;">`;
    html += `<div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:5px;">`;
    html += `<span><strong>Target:</strong> $${status.target.toFixed(2)}</span>`;
    html += `<span><strong>Earned:</strong> $${status.quarterGross.toFixed(2)} (${status.percentComplete}%)</span>`;
    html += `</div>`;
    html += `<div class="qet-progress-bar"><div class="qet-progress-fill ${barClass}" style="width:${pct}%"></div></div>`;

    if (status.targetMet) {
        html += `<div class="qet-status-met">&#10003; Target Met — $${status.quarterGross.toFixed(2)} earned</div>`;
    } else if (!status.targetReachable) {
        html += `<div class="qet-status-unreachable">&#9888; Target unreachable — $${status.shortfall.toFixed(2)} shortfall</div>`;
    } else {
        html += `<span><strong>Remaining:</strong> $${status.remaining.toFixed(2)}</span>`;
    }

    html += `<div style="margin-top:5px; font-size:0.9em; color:#6c757d;">`;
    html += `Periods: ${status.completedPeriods} of ${status.totalPeriodsInQuarter} complete`;
    if (status.missedPeriods > 0) html += ` · ${status.missedPeriods} missed`;
    html += ` · ${status.remainingPeriods} remaining`;
    html += `<br>Hours worked: ${status.quarterHours} · Projected total: ${status.projectedQuarterHours}`;
    html += `</div></div>`;

    // Section 2: Next Period Recommendation
    if (status.schedule.length > 0) {
        html += `<hr style="margin:10px 0;">`;

        if (status.targetMet) {
            html += `<div><strong>Target met.</strong> Schedule remaining periods at minimum (${appData.settings.minimumWeeklyHours} hrs).</div>`;
        } else {
            html += `<div style="margin-bottom:8px;">`;
            html += `<strong>NEXT PERIOD:</strong> #${status.nextPeriodNumber} (Pay date: ${status.nextPeriodPayDate})`;
            html += `<div style="font-size:1.3em; font-weight:bold; color:#0056b3; margin:4px 0;">Recommended hours: ${status.nextPeriodHours}</div>`;
            html += `</div>`;
        }

        html += `<div style="font-size:0.9em;"><strong>Remaining schedule:</strong></div>`;
        html += `<div class="qet-schedule">`;
        for (const s of status.schedule) {
            html += `<span class="qet-schedule-item">P${s.period}: ${s.hours}</span>`;
        }
        html += `</div>`;

        html += `<div style="font-size:0.9em; color:#6c757d;">Projected quarter total: $${status.projectedQuarterGross.toFixed(2)} (${status.projectedQuarterHours} hrs)</div>`;
    } else if (!status.targetMet && status.remainingPeriods === 0) {
        html += `<hr style="margin:10px 0;">`;
        html += `<div class="qet-status-unreachable">No remaining periods this quarter.</div>`;
    }

    body.innerHTML = html;
}

/**
 * Renders an all-employees summary table for the quarterly earnings widget.
 */
function renderAllEmployeesQuarterlySummary() {
    const header = document.getElementById('qetHeader');
    const body = document.getElementById('qetBody');
    const today = new Date();
    const qInfo = getQuarterForDate(today);

    header.textContent = `${qInfo.quarter} ${qInfo.year} Quarterly Earnings Summary`;

    let html = `<table class="qet-summary-table">`;
    html += `<thead><tr><th>Employee</th><th>Earned</th><th>Target</th><th>%</th><th>Status</th></tr></thead>`;
    html += `<tbody>`;

    for (const emp of appData.employees) {
        const status = logic.calculateQuarterlyEarningsStatus(emp.id);
        let statusText, statusClass;

        if (status.targetMet) {
            statusText = '&#10003; Met';
            statusClass = 'qet-status-met';
        } else if (!status.targetReachable) {
            statusText = '&#9888; Unreachable';
            statusClass = 'qet-status-unreachable';
        } else if (status.percentComplete >= 50 || status.remainingPeriods > 3) {
            statusText = 'On Track';
            statusClass = 'qet-status-track';
        } else {
            statusText = 'Tight';
            statusClass = 'qet-status-tight';
        }

        html += `<tr>`;
        html += `<td>${escapeHtml(emp.name)}</td>`;
        html += `<td>$${status.quarterGross.toFixed(2)}</td>`;
        html += `<td>$${status.target.toFixed(2)}</td>`;
        html += `<td>${status.percentComplete}%</td>`;
        html += `<td class="${statusClass}">${statusText}</td>`;
        html += `</tr>`;
    }

    html += `</tbody></table>`;
    body.innerHTML = html;
}

// --- COMPLIANCE SUMMARY ---

/**
 * Refreshes the compliance summary widget on the dashboard.
 */
export function refreshComplianceSummary() {
    const widget = document.getElementById('complianceSummaryWidget');
    if (!widget) return;

    const taxYear = appData.settings.taxYear || new Date().getFullYear();
    const today = new Date();

    // 1. Next Filing Deadline
    const deadlineEl = document.getElementById('csNextDeadline');
    const deadlineTypeEl = document.getElementById('csDeadlineType');
    const { deadlineDate, deadlineLabel } = getNextFilingDeadline(today, taxYear);
    deadlineEl.textContent = deadlineDate;
    deadlineTypeEl.textContent = deadlineLabel;

    // 2. YTD Wages & Taxes
    let ytdGross = 0;
    let ytdEmployeeTaxes = 0;
    let ytdEmployerTaxes = 0;

    for (const employeeId of Object.keys(appData.payPeriods)) {
        const periods = appData.payPeriods[employeeId] || [];
        for (const p of periods) {
            if (!p.grossPay || p.grossPay === 0) continue;
            const payDate = fromStorageDate(p.payDate);
            if (payDate.getFullYear() !== taxYear) continue;

            ytdGross += p.grossPay;
            ytdEmployeeTaxes += (p.taxes.federal || 0) + (p.taxes.fica || 0) +
                (p.taxes.medicare || 0) + (p.taxes.state || 0) + (p.taxes.local || 0);
            ytdEmployerTaxes += (p.taxes.suta || 0) + (p.taxes.futa || 0) +
                (p.taxes.fica || 0) + (p.taxes.medicare || 0);
        }
    }

    document.getElementById('csYtdWages').textContent = `$${ytdGross.toFixed(2)}`;
    document.getElementById('csYtdTaxes').textContent = `Taxes: $${(ytdEmployeeTaxes + ytdEmployerTaxes).toFixed(2)}`;

    // 3. Pay Period Status
    let totalPeriods = 0;
    let periodsWithHours = 0;

    for (const employeeId of Object.keys(appData.payPeriods)) {
        const periods = appData.payPeriods[employeeId] || [];
        for (const p of periods) {
            const payDate = fromStorageDate(p.payDate);
            if (payDate.getFullYear() !== taxYear) continue;
            totalPeriods++;
            const totalHours = p.hours ? Object.values(p.hours).reduce((a, b) => a + b, 0) : 0;
            if (totalHours > 0) periodsWithHours++;
        }
    }

    document.getElementById('csPeriodStatus').textContent = `${periodsWithHours} of ${totalPeriods}`;

    // 4. Last Backup
    const lastBackup = appData.lastBackupDate;
    const backupEl = document.getElementById('csLastBackup');
    if (lastBackup) {
        const backupDate = new Date(lastBackup);
        backupEl.textContent = backupDate.toLocaleDateString();
        const daysSince = Math.floor((today - backupDate) / (1000 * 60 * 60 * 24));
        document.getElementById('csBackupLabel').textContent = daysSince === 0
            ? 'Backed up today'
            : `${daysSince} day${daysSince === 1 ? '' : 's'} ago`;
    } else {
        backupEl.textContent = 'Never';
        document.getElementById('csBackupLabel').textContent = 'Export a backup regularly';
    }
}

/**
 * Calculates the next filing deadline based on current date.
 * @param {Date} today
 * @param {number} taxYear
 * @returns {{ deadlineDate: string, deadlineLabel: string }}
 */
function getNextFilingDeadline(today, taxYear) {
    // Quarterly 941 deadlines: Q1=Apr 30, Q2=Jul 31, Q3=Oct 31, Q4=Jan 31 (next year)
    const deadlines = [
        { date: new Date(taxYear, 3, 30), label: 'Form 941 — Q1' },
        { date: new Date(taxYear, 6, 31), label: 'Form 941 — Q2' },
        { date: new Date(taxYear, 9, 31), label: 'Form 941 — Q3' },
        { date: new Date(taxYear + 1, 0, 31), label: 'Form 941 — Q4 / Form 940 Annual' }
    ];

    for (const d of deadlines) {
        if (today <= d.date) {
            return {
                deadlineDate: toDisplayDate(`${d.date.getFullYear()}-${String(d.date.getMonth() + 1).padStart(2, '0')}-${String(d.date.getDate()).padStart(2, '0')}`),
                deadlineLabel: d.label
            };
        }
    }

    // Past all deadlines for this year — show next year Q1
    const nextYear = taxYear + 1;
    return {
        deadlineDate: toDisplayDate(`${nextYear}-04-30`),
        deadlineLabel: `Form 941 — Q1 ${nextYear}`
    };
}

// --- AUDIT LOG UI ---

/**
 * Renders the audit log table in the Settings tab.
 */
export function renderAuditLog() {
    const tbody = document.getElementById('auditLogTableBody');
    const countEl = document.getElementById('auditLogCount');
    if (!tbody) return;

    const log = getAuditLog();
    tbody.innerHTML = '';

    countEl.textContent = `${log.length} entries`;

    if (log.length === 0) {
        const row = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 3;
        td.style.textAlign = 'center';
        td.style.fontStyle = 'italic';
        td.style.color = '#6c757d';
        td.textContent = 'No audit log entries';
        row.appendChild(td);
        tbody.appendChild(row);
        return;
    }

    for (const entry of log) {
        const row = document.createElement('tr');

        const timestampTd = document.createElement('td');
        timestampTd.style.whiteSpace = 'nowrap';
        const date = new Date(entry.timestamp);
        timestampTd.textContent = date.toLocaleString();

        const actionTd = document.createElement('td');
        actionTd.textContent = entry.action;

        const detailsTd = document.createElement('td');
        detailsTd.textContent = entry.details;

        row.appendChild(timestampTd);
        row.appendChild(actionTd);
        row.appendChild(detailsTd);
        tbody.appendChild(row);
    }
}