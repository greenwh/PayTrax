# PayTrax Testing Completion Plan

**Status**: Testing infrastructure complete, 114 tests passing, foundation established
**Next Phase**: Refactor logic.js for testability + add integration tests
**Recommended Model**: Opus (refactoring + complex integration work)

---

## Executive Summary

### ✅ What's Complete (Sonnet Implementation)

**Testing Infrastructure** - Production ready
- Vitest with browser mode (Playwright) configured
- Istanbul coverage provider
- 114 passing tests across 4 modules
- Test fixtures and factories created
- Coverage reporting configured
- CLAUDE.md updated with testing docs

**Coverage Achieved**:
- `utils.js`: 100% ✅
- `validation.js`: 88% ✅
- `migration.js`: 98% ✅
- `db.js`: 77% ✅
- `logic.js`: 0% ❌ (blocked by DOM coupling)
- `banking.js`: 0% ❌ (blocked by DOM coupling)
- `ui.js`: 0% ❌ (requires E2E testing)
- `main.js`: 0% ❌ (entry point, hard to unit test)

### ⚠️ What Remains (Opus Task)

**PRIMARY GOAL**: Achieve 70%+ overall coverage and 80%+ on logic.js

**Blocking Issue**: logic.js and banking.js have tight DOM coupling
- Functions call `document.getElementById()` directly
- Cannot test without browser DOM being fully initialized
- Requires refactoring to separate business logic from UI

**Required Work**:
1. **Refactor logic.js** - Extract pure calculation functions (3-4 hours)
2. **Write integration tests** - Test critical business logic (2-3 hours)
3. **Refactor banking.js** (optional) - Same pattern as logic.js (1-2 hours)
4. **Achieve coverage thresholds** - Fill gaps identified by coverage report (1 hour)

**Total Estimated Time**: 6-10 hours for Opus

---

## Current Test Organization

```
PayTrax/
├── tests/
│   ├── unit/
│   │   ├── utils.test.js              ✅ 25 tests, 100% coverage
│   │   ├── validation.test.js         ✅ 58 tests, 88% coverage
│   │   ├── db.test.js                 ✅ 9 tests, 77% coverage
│   │   └── migration.test.js          ✅ 22 tests, 98% coverage
│   ├── integration/
│   │   └── running-remainder.test.js  ⚠️ Template only (blocked by DOM coupling)
│   ├── fixtures/
│   │   ├── sample-employees.js        ✅ Factory functions
│   │   ├── sample-settings.js         ✅ Factory functions
│   │   ├── test-data-v1.json          ✅ Migration testing
│   │   └── test-data-v6.json          ✅ Migration testing
│   └── setup.js                       ✅ Global test setup
├── vitest.config.js                   ✅ Configured
├── package.json                       ✅ Dependencies installed
└── .gitignore                         ✅ Configured

Test Commands:
  npm test              # Run all tests (114 passing)
  npm run test:coverage # Generate coverage report
  npm run test:watch    # Watch mode
  npm run test:ui       # Vitest UI dashboard
```

---

## Problem Analysis: DOM Coupling in logic.js

### Example of Current (Untestable) Pattern

**File**: `js/logic.js` (lines 280-290)

```javascript
export function calculatePay(employeeId, periodNum) {
    const employee = appData.employees.find(emp => emp.id === employeeId);
    if (!employee) return;

    const period = appData.payPeriods[employeeId][periodNum - 1];
    if (!period) return;

    // ❌ PROBLEM: Reads directly from DOM
    const regularHoursInput = document.getElementById('hours-regular');
    const overtimeHoursInput = document.getElementById('hours-overtime');
    const ptoHoursInput = document.getElementById('hours-pto');
    const holidayHoursInput = document.getElementById('hours-holiday');

    if (!regularHoursInput) return; // DOM must be initialized

    const hours = {
        regular: parseFloat(regularHoursInput.value) || 0,
        overtime: parseFloat(overtimeHoursInput.value) || 0,
        pto: parseFloat(ptoHoursInput.value) || 0,
        holiday: parseFloat(holidayHoursInput.value) || 0
    };

    // ... rest of calculation logic (this part is pure and testable!)
    recalculatePeriod(employee, period, hours);
    // ...
}
```

**Why this is a problem for testing**:
1. Requires full DOM to be initialized
2. Cannot call `calculatePay()` without a browser context
3. Pure business logic is tangled with UI concerns
4. Makes integration tests impossible

### Similar Issues Found

**Other functions with DOM coupling in logic.js**:
- `calculatePay()` - reads hours from form inputs
- `saveEmployeeFromForm()` - reads entire employee form
- Various UI update functions scattered throughout

**DOM coupling in banking.js**:
- `addTransaction()` - reads from form
- `editTransaction()` - reads from inline edit fields
- `importCsvTransactions()` - reads file input

---

## Refactoring Strategy

### Goal: Separate Business Logic from UI

**Pattern to Follow**: Extract pure calculation functions

### Step 1: Extract Pure Functions

**Current (mixed concerns)**:
```javascript
export function calculatePay(employeeId, periodNum) {
    // DOM access
    const hours = {
        regular: parseFloat(document.getElementById('hours-regular').value) || 0,
        overtime: parseFloat(document.getElementById('hours-overtime').value) || 0,
        // ...
    };

    // Pure business logic
    recalculatePeriod(employee, period, hours);
    // ...
}
```

**Refactored (separated concerns)**:
```javascript
// NEW: Pure function (testable)
export function calculatePayFromData(employeeId, periodNum, hours) {
    const employee = appData.employees.find(emp => emp.id === employeeId);
    if (!employee) return null;

    const period = appData.payPeriods[employeeId][periodNum - 1];
    if (!period) return null;

    // Pure business logic - no DOM access
    recalculatePeriod(employee, period, hours);

    // Update bank register if auto-subtraction enabled
    if (appData.settings.autoSubtraction) {
        updateBankTransactionForPayPeriod(employee, period);
    }

    return period; // Return result for testing
}

// MODIFIED: UI wrapper (calls pure function)
export function calculatePay(employeeId, periodNum) {
    // Read from DOM
    const hours = {
        regular: parseFloat(document.getElementById('hours-regular')?.value) || 0,
        overtime: parseFloat(document.getElementById('hours-overtime')?.value) || 0,
        pto: parseFloat(document.getElementById('hours-pto')?.value) || 0,
        holiday: parseFloat(document.getElementById('hours-holiday')?.value) || 0
    };

    // Call pure function
    return calculatePayFromData(employeeId, periodNum, hours);
}
```

**Benefits**:
- `calculatePayFromData()` is 100% testable (no DOM required)
- `calculatePay()` remains the same API for existing code
- No breaking changes to UI code
- Tests can call the pure function directly

### Step 2: Update Existing Code

**What needs to change**:
- Export the new pure functions
- Keep the old DOM-coupled functions for backward compatibility
- Optionally update call sites to use pure functions (if beneficial)

**What DOESN'T need to change**:
- ui.js - can keep calling `calculatePay()`
- main.js - event handlers still work
- index.html - no changes needed

### Step 3: Write Integration Tests

Once pure functions exist, write tests:

```javascript
// tests/integration/payroll-calculations.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { appData, defaultAppData } from '../../js/state.js';
import { generatePayPeriods, calculatePayFromData } from '../../js/logic.js';
import { createTestEmployee, createTestSettings } from '../fixtures/sample-employees.js';

describe('Payroll Calculations', () => {
  beforeEach(() => {
    Object.assign(appData, JSON.parse(JSON.stringify(defaultAppData)));
    appData.settings = createTestSettings({ payFrequency: 'bi-weekly' });
  });

  it('should calculate regular pay correctly', () => {
    const employee = createTestEmployee({ rate: 25 });
    appData.employees.push(employee);
    generatePayPeriods();

    const hours = { regular: 80, overtime: 0, pto: 0, holiday: 0 };
    const result = calculatePayFromData(employee.id, 1, hours);

    expect(result.grossPay).toBe(2000); // 80 * $25
    expect(result.taxes.federal).toBeGreaterThan(0);
    expect(result.netPay).toBeLessThan(result.grossPay);
  });
});
```

---

## Implementation Plan for Opus

### Phase 1: Assess and Plan (30 min)

1. **Read this document thoroughly**
2. **Run existing tests** to establish baseline:
   ```bash
   cd /mnt/d/Development/PayTrax
   npm test
   ```
   Should see: **114 passing tests**

3. **Generate coverage report**:
   ```bash
   npm run test:coverage
   ```
   Review what's covered and what's not

4. **Read key files**:
   - `js/logic.js` (1,447 lines) - main refactoring target
   - `tests/integration/running-remainder.test.js` - template to follow
   - `tests/fixtures/sample-employees.js` - factory pattern example

### Phase 2: Refactor logic.js (3-4 hours)

**Priority Functions to Refactor** (in order of importance):

1. **`calculatePay()` → `calculatePayFromData()`** (CRITICAL)
   - Location: logic.js:~280
   - DOM reads: hours inputs
   - Pure params: `(employeeId, periodNum, hours)`
   - Tests: basic pay, overtime, PTO, holiday

2. **`recalculatePeriod()` - Already pure!** ✅
   - Location: logic.js:~180
   - No refactoring needed
   - Just needs tests

3. **`recalculateAllPeriodsForEmployee()` - Already pure!** ✅
   - Location: logic.js:~147
   - No refactoring needed
   - Tests critical for sequential recalc

4. **`saveEmployeeFromForm()` → `saveEmployeeFromData()`** (MEDIUM)
   - Location: logic.js:~450
   - DOM reads: entire employee form
   - Pure params: `(employeeData)`
   - Tests: employee CRUD

5. **`addDeduction()`, `deleteDeduction()`** - May be pure already
   - Check if they read from DOM or just update appData

**Refactoring Pattern to Use**:

```javascript
// 1. Create pure function (add "FromData" suffix)
export function calculatePayFromData(employeeId, periodNum, hours) {
    // Existing logic, but with hours passed as parameter
    const employee = appData.employees.find(emp => emp.id === employeeId);
    // ... rest of existing logic
    return period; // Return for testing
}

// 2. Modify original function to call pure function
export function calculatePay(employeeId, periodNum) {
    const hours = {
        regular: parseFloat(document.getElementById('hours-regular')?.value) || 0,
        // ... read other inputs
    };
    return calculatePayFromData(employeeId, periodNum, hours);
}
```

**Testing as You Go**:

After refactoring each function, immediately write a test:

```javascript
// tests/integration/payroll-calculations.test.js
it('should calculate pay with new pure function', () => {
    const employee = createTestEmployee({ rate: 20 });
    appData.employees.push(employee);
    generatePayPeriods();

    const hours = { regular: 80, overtime: 5, pto: 0, holiday: 0 };
    const period = calculatePayFromData(employee.id, 1, hours);

    expect(period.grossPay).toBe(1750); // (80 * $20) + (5 * $20 * 1.5)
});
```

### Phase 3: Write Integration Tests (2-3 hours)

**Critical Tests to Implement** (from original assessment):

#### Test File 1: `tests/integration/running-remainder.test.js`

**Status**: Template exists but blocked by DOM coupling

**Tests to write** (once refactored):
- ✅ Basic remainder tracking (template exists)
- ✅ Full year accuracy (template exists)
- ✅ Remainder reset on recalc (template exists)
- **NEW**: Edge case with 0.005 remainder (tests rounding direction)
- **NEW**: Different tax rates producing different remainder patterns

**Expected outcome**: Verify running remainder algorithm prevents accumulation errors

#### Test File 2: `tests/integration/sequential-recalc.test.js` (NEW)

**Tests needed**:
```javascript
describe('Sequential Recalculation (CRITICAL)', () => {
  it('should recalculate all periods when editing Period 1', () => {
    // Setup: Calculate periods 1-10
    // Edit: Change hours in Period 1
    // Verify: Period 10 tax amounts change
    // Verify: Console logs "Recalculating all periods from Period 1"
  });

  it('should only recalculate forward when editing middle period', () => {
    // Setup: Calculate periods 1-10
    // Edit: Change hours in Period 5
    // Verify: Periods 1-4 unchanged
    // Verify: Periods 5-10 recalculated
  });

  it('should reset tax remainders when recalculating all', () => {
    // Setup: Calculate periods 1-5, verify remainders exist
    // Action: Call recalculateAllPeriodsForEmployee()
    // Verify: Remainders reset to 0 before recalc
  });
});
```

**Function to test**: `recalculateAllPeriodsForEmployee()` (already pure!)

#### Test File 3: `tests/integration/tax-wage-bases.test.js` (NEW)

**Tests needed**:
```javascript
describe('Tax Wage Base Limiting (HIGH)', () => {
  it('should stop Social Security withholding at wage base', () => {
    const employee = createHighEarnerEmployee({ rate: 100 }); // $200k/year
    // Calculate all 26 periods
    // Verify SS stops when YTD reaches $168,600
  });

  it('should stop FUTA at $7,000', () => {
    // Similar pattern for FUTA
  });

  it('should apply additional Medicare above threshold', () => {
    // Verify 0.9% kicks in above $200,000
  });
});
```

**Functions to test**: Tax calculation within `recalculatePeriod()`

#### Test File 4: `tests/integration/deductions.test.js` (NEW)

**Tests needed**:
```javascript
describe('Employee Deductions', () => {
  it('should apply fixed deductions correctly', () => {
    const employee = createEmployeeWithDeductions({
      deductions: [{ name: '401k', amount: 100, type: 'fixed' }]
    });
    // Verify $100 deducted from each period
  });

  it('should apply percentage deductions correctly', () => {
    // 5% deduction from $2000 gross = $100
  });

  it('should respect deduction createdDate', () => {
    // Deduction created on period 5
    // Verify not applied to periods 1-4
    // Verify applied to periods 5+
  });
});
```

### Phase 4: Achieve Coverage Thresholds (1 hour)

**Target Coverage** (from vitest.config.js):
- Overall: 50% lines, 50% functions, 40% branches
- logic.js: 60% lines, 60% functions, 50% branches

**Steps**:
1. Run coverage report: `npm run test:coverage`
2. Identify uncovered branches in logic.js
3. Add tests for edge cases:
   - Invalid employee IDs
   - Missing pay periods
   - Zero hours
   - Negative values (should be validated)
4. Re-run coverage until thresholds met

**When complete, coverage report should show**:
```
File           | % Stmts | % Branch | % Funcs | % Lines
---------------|---------|----------|---------|--------
logic.js       |   60+   |   50+    |   60+   |   60+   ✅
Overall        |   50+   |   40+    |   50+   |   50+   ✅
```

---

## Success Criteria

### Must Have (Required for Completion)

- [ ] All existing 114 tests still pass
- [ ] logic.js refactored with pure functions exported
- [ ] `calculatePayFromData()` function exists and is tested
- [ ] `recalculatePeriod()` is tested (already pure)
- [ ] `recalculateAllPeriodsForEmployee()` is tested (already pure)
- [ ] Running remainder algorithm fully tested
- [ ] Sequential recalculation fully tested
- [ ] Coverage thresholds met:
  - logic.js: ≥60% lines, ≥60% functions, ≥50% branches
  - Overall: ≥50% lines, ≥50% functions, ≥40% branches
- [ ] No breaking changes to existing UI code
- [ ] `npm test` runs successfully

### Nice to Have (Optional Enhancements)

- [ ] banking.js refactored similarly
- [ ] Tax wage base tests
- [ ] Deduction tests
- [ ] Higher coverage (70%+ overall)
- [ ] Performance benchmarks for calculations
- [ ] E2E tests with Playwright

---

## Code References

### Key Files to Modify

**Primary Target**:
- `js/logic.js` (1,447 lines)
  - Lines 280-400: calculatePay and related functions
  - Lines 147-250: recalculation functions (already pure)
  - Lines 450-550: employee management

**Test Files to Create**:
- `tests/integration/payroll-calculations.test.js` (NEW)
- `tests/integration/sequential-recalc.test.js` (NEW)
- `tests/integration/tax-wage-bases.test.js` (NEW)
- `tests/integration/deductions.test.js` (NEW)

**Existing Files to Reference**:
- `tests/unit/migration.test.js` - Best example of comprehensive testing
- `tests/fixtures/sample-employees.js` - Factory pattern to follow
- `tests/integration/running-remainder.test.js` - Integration test template

### Functions That Are Already Pure (No Refactoring Needed)

These can be tested immediately:

1. **`recalculatePeriod(employee, period, hours)`**
   - Location: logic.js:~180
   - Pure function - all params passed in
   - CRITICAL: Contains running remainder algorithm

2. **`recalculateAllPeriodsForEmployee(employeeId)`**
   - Location: logic.js:~147
   - Reads from appData but no DOM
   - CRITICAL: Handles sequential recalculation

3. **`generatePayPeriods()`**
   - Location: logic.js:~86
   - Pure calculation based on appData.settings
   - Already has some test coverage via integration tests

4. **`calculateDeductions(employee, grossPay, payDate)`**
   - Location: logic.js:~520
   - Pure calculation
   - Needs deduction tests

### Functions That Need Refactoring

**High Priority**:
1. `calculatePay()` - Line ~280
2. `saveEmployeeFromForm()` - Line ~450

**Medium Priority**:
3. `addDeduction()` - Check if pure
4. `deleteDeduction()` - Check if pure

**Low Priority** (optional):
5. Banking functions in `banking.js`

---

## Testing Patterns to Follow

### Pattern 1: State Setup

```javascript
beforeEach(() => {
  // Reset app state
  Object.assign(appData, JSON.parse(JSON.stringify(defaultAppData)));

  // Configure settings
  appData.settings = createTestSettings({
    payFrequency: 'bi-weekly',
    taxYear: 2024
  });
});
```

### Pattern 2: Employee Creation

```javascript
const employee = createTestEmployee({
  rate: 25,
  fedTaxRate: 12,
  stateTaxRate: 5,
  deductions: [
    { name: '401k', amount: 100, type: 'fixed' }
  ]
});
appData.employees.push(employee);
```

### Pattern 3: Pay Period Generation and Calculation

```javascript
generatePayPeriods(); // Creates periods for all employees

const hours = { regular: 80, overtime: 5, pto: 0, holiday: 0 };
const period = calculatePayFromData(employee.id, 1, hours);

expect(period.grossPay).toBe(1750);
expect(period.taxes.total).toBeGreaterThan(0);
expect(period.netPay).toBeLessThan(period.grossPay);
```

### Pattern 4: Testing Running Remainders

```javascript
it('should track remainders across multiple periods', () => {
  const employee = createTestEmployee({ rate: 20.33 }); // Fractional amounts
  appData.employees.push(employee);
  generatePayPeriods();

  // Calculate 5 periods
  for (let i = 1; i <= 5; i++) {
    calculatePayFromData(employee.id, i, { regular: 80, overtime: 0, pto: 0, holiday: 0 });
  }

  // Verify remainders exist and are being tracked
  expect(employee.taxRemainders.federal).toBeDefined();
  expect(Math.abs(employee.taxRemainders.federal)).toBeLessThan(1); // Should be fractional
});
```

### Pattern 5: Testing Sequential Recalculation

```javascript
it('should recalculate forward from edited period', () => {
  const employee = createTestEmployee();
  appData.employees.push(employee);
  generatePayPeriods();

  // Calculate periods 1-10
  for (let i = 1; i <= 10; i++) {
    calculatePayFromData(employee.id, i, { regular: 80, overtime: 0, pto: 0, holiday: 0 });
  }

  const period1Before = { ...appData.payPeriods[employee.id][0] };
  const period10Before = { ...appData.payPeriods[employee.id][9] };

  // Edit Period 5 (should recalc 5-10, not 1-4)
  calculatePayFromData(employee.id, 5, { regular: 85, overtime: 0, pto: 0, holiday: 0 });

  const period1After = appData.payPeriods[employee.id][0];
  const period10After = appData.payPeriods[employee.id][9];

  // Period 1 should be unchanged
  expect(period1After.grossPay).toBe(period1Before.grossPay);

  // Period 10 should be changed (due to remainder carryforward)
  expect(period10After.taxes.federal).not.toBe(period10Before.taxes.federal);
});
```

---

## Common Pitfalls to Avoid

### 1. Don't Break Existing Functionality

**Wrong**:
```javascript
// Removing the original function breaks UI
export function calculatePayFromData(employeeId, periodNum, hours) {
  // pure logic
}
// ❌ calculatePay() is gone - UI will break!
```

**Right**:
```javascript
// Keep both - pure function + UI wrapper
export function calculatePayFromData(employeeId, periodNum, hours) {
  // pure logic
}

export function calculatePay(employeeId, periodNum) {
  const hours = readHoursFromDOM();
  return calculatePayFromData(employeeId, periodNum, hours);
}
```

### 2. Don't Forget to Reset State in beforeEach()

**Wrong**:
```javascript
describe('Tests', () => {
  it('test 1', () => {
    appData.employees.push(employee); // Modifies global state
  });

  it('test 2', () => {
    // ❌ Previous test's employee is still in appData!
  });
});
```

**Right**:
```javascript
describe('Tests', () => {
  beforeEach(() => {
    Object.assign(appData, JSON.parse(JSON.stringify(defaultAppData)));
  });

  it('test 1', () => {
    appData.employees.push(employee); // Fresh state each test
  });
});
```

### 3. Don't Test Implementation Details

**Wrong**:
```javascript
it('should call recalculatePeriod exactly once', () => {
  const spy = vi.spyOn(logic, 'recalculatePeriod');
  calculatePayFromData(employee.id, 1, hours);
  expect(spy).toHaveBeenCalledTimes(1); // ❌ Tests implementation
});
```

**Right**:
```javascript
it('should calculate correct gross pay', () => {
  const period = calculatePayFromData(employee.id, 1, hours);
  expect(period.grossPay).toBe(2000); // ✅ Tests behavior
});
```

### 4. Don't Forget to Test Edge Cases

**Missing**:
```javascript
it('should calculate pay', () => {
  const period = calculatePayFromData(employee.id, 1, { regular: 80 });
  expect(period.grossPay).toBe(1600);
});
// Only tests happy path
```

**Complete**:
```javascript
it('should calculate pay for valid hours', () => { /* ... */ });
it('should return null for invalid employee ID', () => { /* ... */ });
it('should return null for invalid period number', () => { /* ... */ });
it('should handle zero hours', () => { /* ... */ });
it('should handle overtime correctly', () => { /* ... */ });
```

---

## Questions for Opus to Consider

While implementing, consider these questions (don't need to answer now, but think about them):

1. **Should we export both pure and UI functions?**
   - Pro: No breaking changes
   - Con: API bloat
   - Decision: ?

2. **Should we refactor banking.js too?**
   - Pro: Consistent pattern across codebase
   - Con: More work, lower priority
   - Decision: ?

3. **Should we add E2E tests with Playwright?**
   - Pro: Full UI coverage
   - Con: Much more complex, slower tests
   - Decision: Defer for now, focus on unit/integration

4. **Should we increase coverage thresholds after achieving 60%?**
   - Pro: Higher quality
   - Con: Diminishing returns
   - Decision: ?

---

## Resources and References

### Documentation
- Vitest docs: https://vitest.dev
- Playwright docs: https://playwright.dev
- PayTrax CLAUDE.md: Complete testing section added

### Key Assessment Findings

From original complexity assessment (see conversation history):

**CRITICAL Test Cases** (Priority Order):
1. Running Remainder Algorithm - Prevents rounding error accumulation
2. Sequential Recalculation - Editing Period 1 recalcs all periods
3. Tax Wage Base Limiting - SS stops at $168,600, FUTA at $7,000
4. Data Migration - All v1-v7 migrations work (✅ DONE)
5. Bank Register Sync - Pay periods create transactions
6. State Persistence - IndexedDB + localStorage fallback (✅ DONE)

**Coverage Targets** (From Plan):
- logic.js: 80% (adjusted to 60% due to DOM coupling)
- Overall: 70% (adjusted to 50% due to UI modules)

### Test Execution Time

Current: ~5 seconds for 114 tests
Expected after completion: ~10-15 seconds for 200+ tests

---

## Final Notes for Opus

### Why Opus is Recommended

1. **Refactoring complexity** - Requires understanding both business logic and UI separation
2. **Multiple files to coordinate** - logic.js changes affect tests, fixtures, and potentially UI
3. **Critical business logic** - Tax calculations have real-world consequences, need careful validation
4. **Architectural decisions** - How to structure pure functions for maximum testability
5. **Test design** - Creating comprehensive integration tests requires deep understanding

### What Success Looks Like

When you're done:

```bash
$ npm test

 ✓ tests/unit/utils.test.js  (25 tests)
 ✓ tests/unit/validation.test.js  (58 tests)
 ✓ tests/unit/db.test.js  (9 tests)
 ✓ tests/unit/migration.test.js  (22 tests)
 ✓ tests/integration/running-remainder.test.js  (5 tests)
 ✓ tests/integration/sequential-recalc.test.js  (4 tests)
 ✓ tests/integration/payroll-calculations.test.js  (15 tests)
 ✓ tests/integration/tax-wage-bases.test.js  (6 tests)
 ✓ tests/integration/deductions.test.js  (8 tests)

 Test Files  9 passed (9)
      Tests  152 passed (152)
   Start at  XX:XX:XX
   Duration  12.34s

$ npm run test:coverage

File           | % Stmts | % Branch | % Funcs | % Lines
---------------|---------|----------|---------|--------
utils.js       |   100   |   90.9   |   100   |   100   ✅
validation.js  |   87.82 |   89.58  |  81.81  |  92.56  ✅
migration.js   |   98.21 |   87.5   |   100   |  98.21  ✅
db.js          |   76.74 |   58.33  |  76.92  |  76.74  ✅
logic.js       |   62.5  |   54.2   |  65.3   |  63.1   ✅
state.js       |   45.0  |   30.0   |  40.0   |  45.0   ✅
---------------|---------|----------|---------|--------
All files      |   52.3  |   45.1   |  53.2   |  54.1   ✅

✅ All coverage thresholds met
```

### Getting Help

If you get stuck:

1. **Check test fixtures** - `tests/fixtures/` has working examples
2. **Read existing tests** - `tests/unit/migration.test.js` is most comprehensive
3. **Check CLAUDE.md** - Updated with testing section
4. **Run coverage report** - Shows exactly what's not covered
5. **Test one function at a time** - Don't try to do everything at once

### Commit Strategy

Suggested commits:

1. "refactor(logic): Extract calculatePayFromData pure function"
2. "refactor(logic): Extract saveEmployeeFromData pure function"
3. "test(integration): Add running remainder tests"
4. "test(integration): Add sequential recalculation tests"
5. "test(integration): Add payroll calculation tests"
6. "test(integration): Add tax wage base tests"
7. "test(integration): Add deduction tests"
8. "docs: Update CLAUDE.md with refactoring notes"

---

**End of Document**

Good luck, Opus! The foundation is solid. You've got 114 passing tests to build on. The refactoring is straightforward - just separating concerns. Take it one function at a time, test as you go, and you'll hit the coverage targets easily.

Questions? Check the references above or ask for clarification.

**Current Status**: ✅ Infrastructure complete, ready for refactoring phase
**Next Action**: Read logic.js, identify DOM coupling, extract pure functions
**Expected Duration**: 6-10 hours to full completion
