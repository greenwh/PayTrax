/*
  PayTrax Payroll Management
  Copyright (c) 2025 greenwh

  Developed by greenwh with substantial assistance from AI coding tools (Claude, ChatGPT, Gemini).
  This file is original work based on documentation and prompts by greenwh.
  Licensed under the MIT License.
*/
import { appData } from './state.js';
import * as logic from './logic.js';
import { formatDate, parseDateInput } from './utils.js';

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
        option.textContent = `Period ${period.period}: ${period.startDate} - ${period.endDate}`;
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
            <td>${period.period}</td><td>${period.startDate}</td><td>${period.endDate}</td>
            <td>${period.payDate}</td><td>${totalHours.toFixed(2)}</td><td>$${period.grossPay.toFixed(2)}</td>
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
    document.getElementById('startDate').textContent = period.startDate;
    document.getElementById('endDate').textContent = period.endDate;
    document.getElementById('payDate').textContent = period.payDate;
    
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
	//document.getElementById('ptoBalance').value = employee.ptoBalance;
	document.getElementById('ptoBalance').value = employee.ptoBalance.toFixed(2);
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
            <td>${ded.name}</td>
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
    document.getElementById('paystubStartDate').textContent = period.startDate;
    document.getElementById('paystubEndDate').textContent = period.endDate;
    document.getElementById('paystubPayDate').textContent = period.payDate;
    
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
                <td>${ded.name}</td>
                <td class="text-right">$${ded.calculatedAmount.toFixed(2)}</td>
            `;
            deductionsBody.appendChild(row);
        });
    } else {
        deductionsSection.style.display = 'none';
    }

    const ptoUsed = period.hours.pto;
    const ptoEarned = period.ptoAccrued;
    const ptoEnd = employee.ptoBalance;
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
                .sort((a,b) => new Date(a.payDate) - new Date(b.payDate));
            
            let periodSelector = `<div class="form-group" style="margin-top: 15px;"><label class="form-label">Select Pay Period</label><select id="reportPayPeriod" class="form-input">`;
            if (allPeriods.length > 0) {
                allPeriods.forEach(p => {
                    periodSelector += `<option value="${p.payDate}">Pay Date: ${p.payDate} (Period ${p.period})</option>`;
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
                    <button class="btn btn-success" id="exportReportCSVBtn" data-report-type="w2" data-period="${periodStr}">Export to CSV</button>
                    <button class="btn btn-primary" id="exportReportPDFBtn" data-report-type="w2" data-period="${periodStr}">Export to PDF</button>
                `;
            }
            if (reportType === '941') {
                reportHTML = logic.generate941Report(periodStr);
                exportButtons = `
                    <button class="btn btn-success" id="exportReportCSVBtn" data-report-type="941" data-period="${periodStr}">Export to CSV</button>
                    <button class="btn btn-primary" id="exportReportPDFBtn" data-report-type="941" data-period="${periodStr}">Export to PDF</button>
                `;
            }
            if (reportType === '940') {
                reportHTML = logic.generate940Report(periodStr);
                exportButtons = `
                    <button class="btn btn-success" id="exportReportCSVBtn" data-report-type="940" data-period="${periodStr}">Export to CSV</button>
                    <button class="btn btn-primary" id="exportReportPDFBtn" data-report-type="940" data-period="${periodStr}">Export to PDF</button>
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
                    <button class="btn btn-success" id="exportReportCSVBtn" data-report-type="daterange-employee" data-start="${startDateRangeStr}" data-end="${endDateRangeStr}" data-employee="${reportEmployeeId}">Export to CSV</button>
                    <button class="btn btn-primary" id="exportReportPDFBtn" data-report-type="daterange" data-start="${startDateRangeStr}" data-end="${endDateRangeStr}" data-employee="${reportEmployeeId}" data-subtype="employee">Export to PDF</button>
                `;
            }
            if (reportType === 'daterange-employer') {
                reportHTML = logic.generateDateRangeEmployerReport(startDateRangeStr, endDateRangeStr, reportEmployeeId);
                exportButtons = `
                    <button class="btn btn-success" id="exportReportCSVBtn" data-report-type="daterange-employer" data-start="${startDateRangeStr}" data-end="${endDateRangeStr}" data-employee="${reportEmployeeId}">Export to CSV</button>
                    <button class="btn btn-primary" id="exportReportPDFBtn" data-report-type="daterange" data-start="${startDateRangeStr}" data-end="${endDateRangeStr}" data-employee="${reportEmployeeId}" data-subtype="employer">Export to PDF</button>
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