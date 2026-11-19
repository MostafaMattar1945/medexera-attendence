---
name: medexera-attendance-frontend
description: Complete blueprint and rules for refactoring the Medexera Attendance system from monolithic HTML into React 19 + TypeScript + Vite with 100% UI/UX fidelity, Black & Gold theme preservation, and Cloudflare-ready storage architecture.
---

# Medexera Attendance — Frontend Engineering Skill

Use this skill when developing, refactoring, or extending the frontend of the **Medexera Attendance System**.

---

## 1. Prime Directive: 100% UI/UX Fidelity

When refactoring from `_t.html` into modern React components, **never simplify, alter, or modernize the UI/UX beyond the exact design established in `_t.html`**. 

Every visual component, micro-animation, color gradient, typography choice, and interaction pattern must look and behave identically:
- The luxury **Black & Gold theme** (obsidian glass, metallic gold gradients).
- The **login experience** with animated floating orbs, backdrop blur, and eye toggle.
- The **New Entry grid** with department pills, dynamic team sections, agent cards, status buttons, and floating bottom save bar (`#nrw`).
- The **Records, Dashboard, Live Attendance, Requests, Inbox, Disciplinary Actions, and Settings** tabs.
- The printable **Violation Forms** and **Leave Receipts** with borders, checkboxes, and Cairo date stamps.

---

## 2. Design Tokens & Styling Specification

### 2.1 CSS Custom Properties (Theme Tokens)

```css
:root {
  /* Star White (Light) Theme */
  --bg: #f7f2e5;
  --cd: #fffdf6;
  --in: #ffffff;
  --tx: #241d0b;
  --mu: #7a6c45;
  --bd: #dccb91;
  --g1: #a97a1c;
  --g2: #e5c25c;
  --rd: #c0392b;
  --bt: #1a1405;
}

:root[data-theme="dark"],
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    /* Obsidian & Gold (Dark) Theme */
    --bg: #09090b;
    --cd: #111114;
    --in: #050506;
    --tx: #f3ecd6;
    --mu: #b5a574;
    --bd: #2c2512;
    --g1: #b8892a;
    --g2: #f1d98a;
    --rd: #c0392b;
    --bt: #1a1405;
  }
}
```

### 2.2 Typography
- **Headings & Brand Title:** `'Playfair Display', Georgia, serif` (weights: 700, letter-spacing: 0.02em - 0.03em).
- **Interface & Data Grids:** `'Plus Jakarta Sans', system-ui, sans-serif` (weights: 500, 600, 700).
- **Handwritten / Typed Signatures:** `'Dancing Script', cursive` (weight: 700).
- **Printable Legal Forms & Tables:** `Arial, sans-serif` (weight: 700 / 400, crisp 1px solid black borders).

### 2.3 Core Animations
- **Header Line Sweep:**
  ```css
  @keyframes draw { from { width: 0 } to { width: 100% } }
  ```
- **Panel & Modal Pop (Ease-Out Spring):**
  ```css
  @keyframes rise {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: none; }
  }
  ```
- **Login Background Floating Orbs:**
  ```css
  @keyframes drift {
    to { transform: translate(70px, 50px) scale(1.15); }
  }
  ```
- **Status Badge Shimmer:**
  ```css
  @keyframes shine {
    from { background-position: 120% 0; }
    to { background-position: -120% 0; }
  }
  ```
- **Probation Indicator Pulse:**
  ```css
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.35; transform: scale(0.7); }
  }
  ```

---

## 3. Data Model & Compatibility Contract

The app must maintain 100% compatibility with the historical state object `S`:

```typescript
export interface StateData {
  emps: Employee[];
  recs: AttendanceRecord[];
  reqs: RequestItem[];
  acts: DisciplinaryAction[];
  aud: AuditEntry[];
  users: UserAccount[];
  leaders: Record<string, string>; // 'Dept|Team': empId
  oms: Record<string, string>;     // 'Dept|Team': empId
  pts: ScoringRules;
  departments: string[];
  me?: number;                     // Current user index
}
```

### 3.1 Attendance Status Codes & Rules
- `ontime`: On Time (Default: 1.0 pt)
- `late1`: Late < 2 hours (Default: 1.0 pt)
- `late2`: Late > 2 hours (Default: 0.5 pt, half-day deduction)
- `nsnc`: No Show No Call (Default: 0 pt)
- `perm`: Permission (`late` or `early`) (Default: 1.0 pt)
- `off`: Off Day (`unpaid`, `annual`, `emergency`, `sick`)
- `term`: Terminated (auto-generated entry when status becomes Terminated)

### 3.2 Timezone & Date Constraints
- **Timezone:** Always pin calculations to **Cairo Time** (`Africa/Cairo`).
- **Borrow Requests:** Only allowable between the **15th and 20th day of the Cairo calendar month**.
- **Next ID Snapshotting:** An employee's profile `next_no` pre-populates a new record's Next ID input, but once saved, it is immutably snapshotted on that attendance record.

---

## 4. Frontend Architecture (React 19 + TypeScript + Vite)

### 4.1 Directory Structure
```
src/
├── assets/                  // Medexera logo & favicon
├── styles/
│   ├── theme.css            // Exact CSS variables, base styles, animations
│   └── forms.css            // Violation & receipt form print styles
├── types/
│   └── state.ts             // TypeScript definitions matching state S
├── services/
│   ├── storageAdapter.ts    // Bridges to localStorage['atx'] (Phase 1) and /api/* (Phase 2)
│   ├── excelExport.ts       // Browser ExcelJS workbook builder
│   └── pdfExport.ts         // Browser jsPDF + html2canvas engine
├── hooks/
│   ├── useTheme.ts          // Dark vs Star-White toggle
│   ├── useAuth.ts           // User session & role validation
│   └── useAttendance.ts     // Attendance queries & optimistic mutations
└── components/
    ├── layout/
    │   ├── Header.tsx       // Logo, search, user dropdown, theme toggle
    │   ├── Navigation.tsx   // Navigation tab pills
    │   └── LoginOverlay.tsx // Animated orb login screen
    ├── attendance/
    │   ├── DepartmentPills.tsx
    │   ├── SectionPills.tsx
    │   ├── AgentGrid.tsx
    │   └── StickySaveBar.tsx
    ├── records/
    │   ├── RecordsTable.tsx
    │   └── LeaveReport.tsx
    ├── dashboard/
    │   └── DashboardView.tsx
    ├── requests/
    │   ├── RequestsList.tsx
    │   ├── RequestModal.tsx
    │   └── SignaturePad.tsx
    ├── inbox/
    │   └── InboxList.tsx
    ├── actions/
    │   ├── ActionsList.tsx
    │   └── ViolationFormModal.tsx
    └── settings/
        ├── UsersSettings.tsx
        ├── RosterSettings.tsx
        └── RulesSettings.tsx
```

### 4.2 The Storage Adapter Pattern (`storageAdapter.ts`)
To allow the frontend to be developed, previewed, and tested immediately without waiting for Cloudflare deployment:
1. Define a unified asynchronous interface: `getInitialState()`, `saveAttendanceRecords()`, `createRequest()`, etc.
2. In Phase 1, `storageAdapter.ts` reads from and writes to `localStorage["atx"]` and `localStorage["atxth"]`.
3. In Phase 2, the implementation is swapped to HTTP `fetch("/api/...")` without changing a single line of component code.

---

## 5. Coding Principles for Claude

1. **No External UI Frameworks (No MUI, No Chakra, No Bootstrap):** The existing application uses carefully hand-crafted CSS with exact typography and custom glassmorphism. Do not pull in generic UI component libraries that clash with the custom Black & Gold aesthetic.
2. **Preserve Native Form Layouts:** The printable violation form and receipt cards must retain their exact `1px solid black` outline, letterhead, and signature slots for paper printing and PDF generation.
3. **No Dead Code:** Delete old workarounds or inline Claude-artifact sandbox constraints that are no longer relevant in a native Vite app.
4. **Strict Typing:** All components must have explicit TypeScript props and interfaces. Zero `any` where possible.
