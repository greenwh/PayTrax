# Project Overview
PayTrax is a standalone, client-side payroll management PWA for small businesses. It handles payroll processing, tax compliance (941/940/W-2), and bank ledger management without server dependencies.

## Technical Stack
- **Frontend**: Vanilla JavaScript (ES6 Modules), HTML5, CSS3.
- **Storage**: IndexedDB (`appData`) + LocalStorage fallback.
- **Platform**: PWA (Service Worker, Offline-capable).

## Key Features
- **Payroll**: Real-time tax calc, check generation.
- **Compliance**: Tax deposit schedules, W-2 data.
- **Banking**: Integrated ledger, reconciliation.
- **Privacy**: 100% Client-side.

## Directory Structure
- `js/`: Modular logic (`logic.js`, `banking.js`, `db.js`).
- `index.html`: Entry point.
- `style.css`: Comprehensive styling.

## Current Status
- **Production Ready**: Feature complete and stable.