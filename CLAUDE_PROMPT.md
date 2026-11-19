# Master Prompt for Claude: Medexera Attendance Frontend Refactor

Copy and paste the entire block below into your new Claude session (or Claude Code).

---

```markdown
# MISSION: Refactor Medexera Attendance from Monolithic HTML to Clean React 19 + TypeScript + Vite

You are an expert Senior Frontend Architect. You have been assigned to refactor the **Medexera Attendance System** from an unorganized, monolithic ~300 KB single-file HTML file (`_t.html`) into a clean, modular, production-ready **React 19 + TypeScript + Vite** application.

---

### 1. UNBREAKABLE CONSTRAINTS & CORE OBJECTIVES

1. **100% UI/UX Fidelity (Zero Visual Deviation):**
   - The UI/UX must look, feel, and animate **identically** to `_t.html`.
   - Retain the exact luxury **Black & Gold aesthetic** (Obsidian dark mode `--bg: #09090b`, `--cd: #111114`, `--g1: #b8892a`, `--g2: #f1d98a` and Star White light mode `--bg: #f7f2e5`).
   - Retain the exact typography: `'Playfair Display'` (headings), `'Plus Jakarta Sans'` (body & tables), `'Dancing Script'` (typed signatures), and `Arial` (printable violation and receipt forms).
   - Retain all micro-animations: the header line sweep (`@keyframes draw`), floating orbs on the login modal (`@keyframes drift`), modal/panel spring entrance (`@keyframes rise`), status badge shimmer (`@keyframes shine`), and probation pulse.
   - DO NOT import generic UI libraries like Material UI, AntD, or Chakra. Use clean, modular CSS that directly preserves the existing styling rules.

2. **The Storage Adapter Pattern (Zero Downtime / Local-First):**
   - The application must initially read and write to the existing `localStorage["atx"]` and `localStorage["atxth"]` so staff can immediately test the React build with their real historical data.
   - Encapsulate all database/state interactions behind an asynchronous service layer (`src/services/storageAdapter.ts`).
   - When we deploy to Cloudflare Pages + D1 later, we will only need to swap the adapter to call `/api/...` without rewriting components.

3. **Client-Side Export Engine:**
   - Keep Excel generation (`ExcelJS`) and PDF/canvas generation (`jsPDF` + `html2canvas`) strictly on the client side.

4. **Reference Files in the Project Directory:**
   - `_t.html`: The definitive source of truth for all HTML layouts, styles, and legacy DOM logic.
   - `HANDOFF.md`: Contains the documentation for state object `S`, status codes (`ontime`, `late1`, `late2`, `nsnc`, `perm`, `off`, `term`), and rules.
   - `skills/medexera-frontend/SKILL.md`: Contains the exact design tokens, typography, animations, and data interfaces.
   - `BACKEND_PLAN.md`: The Cloudflare D1 + Workers architecture blueprint.

---

### 2. TARGET PROJECT STRUCTURE

Organize the code into this clean, modular folder tree:

```
medexera-attendance/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── assets/                      // Embedded SVG/PNG logos
│   ├── styles/
│   │   ├── theme.css                // 100% of exact design tokens, CSS variables & animations
│   │   └── forms.css                // Printable legal forms & PDF styling
│   ├── types/
│   │   └── state.ts                 // Full TypeScript interfaces for Emps, Recs, Reqs, Acts, etc.
│   ├── services/
│   │   ├── storageAdapter.ts        // LocalStorage bridge (Phase 1) -> Cloudflare API (Phase 2)
│   │   ├── excelExport.ts           // ExcelJS export utilities
│   │   └── pdfExport.ts             // jsPDF & html2canvas export utilities
│   ├── hooks/
│   │   ├── useTheme.ts              // Dark vs Star White toggle
│   │   ├── useAuth.ts               // Signed-in user state & role permissions
│   │   └── useAttendance.ts         // Attendance sheet state & mutation handlers
│   └── components/
│       ├── layout/
│       │   ├── Header.tsx           // Logo, search bar, active user indicator, theme selector
│       │   ├── Navigation.tsx       // Tab pills (New Entry, Records, Dashboard, etc.)
│       │   └── LoginOverlay.tsx     // Animated orb login screen with password toggle
│       ├── attendance/
│       │   ├── DepartmentPills.tsx  // Department selector buttons
│       │   ├── SectionPills.tsx     // Team/Section dynamic pills
│       │   ├── AgentGrid.tsx        // Roster cards with status toggle buttons
│       │   └── StickySaveBar.tsx    // Floating bottom bar (#nrw) with Save & Clear buttons
│       ├── records/
│       │   ├── RecordsTable.tsx     // Filterable attendance records table
│       │   └── LeaveReport.tsx      // Leave & attendance aggregation report
│       ├── dashboard/
│       │   └── DashboardView.tsx    // KPI summary cards & category filters
│       ├── requests/
│       │   ├── RequestsList.tsx     // Leave, Permission, Borrow, Resignation requests
│       │   ├── RequestModal.tsx     // Submission modal with 15th-20th Cairo borrow check
│       │   └── SignaturePad.tsx     // Handwritten vector canvas & Dancing Script typed option
│       ├── inbox/
│       │   └── InboxList.tsx        // Pending approval queue with notification badge
│       ├── actions/
│       │   ├── ActionsList.tsx      // Disciplinary warnings list
│       │   └── ViolationFormModal.tsx // Official violation form with piastres deduction
│       └── settings/
│           ├── UsersSettings.tsx    // User management & tab access
│           ├── RosterSettings.tsx   // Employee list & department assignments
│           └── RulesSettings.tsx    // Configurable scoring points
```

---

### 3. STEP-BY-STEP EXECUTION PLAN

Do not output fragmented snippets. Provide complete, fully typed files in a structured sequence:

#### Step 1: Project Setup & Types
- Create `package.json` (React 19, Vite, TypeScript, Lucide-React or inline SVGs, ExcelJS, jsPDF, html2canvas).
- Create `tsconfig.json` and `vite.config.ts`.
- Create `src/types/state.ts` defining all types for `Employee`, `AttendanceRecord`, `RequestItem`, `DisciplinaryAction`, `UserAccount`, and `StateData`.

#### Step 2: Styling & Theme Tokens
- Create `src/styles/theme.css` importing Google Fonts (`Playfair Display`, `Plus Jakarta Sans`, `Dancing Script`).
- Port all CSS variables (`:root`, `[data-theme="dark"]`, `[data-theme="light"]`) and all keyframe animations (`draw`, `rise`, `drift`, `shine`, `pulse`).

#### Step 3: Storage Adapter & Sample State
- Create `src/services/storageAdapter.ts` that initializes with default Medexera roster data and syncs with `localStorage["atx"]`.

#### Step 4: Layout & App Shell
- Build `src/components/layout/Header.tsx`, `Navigation.tsx`, and `LoginOverlay.tsx`.
- Wire up theme switching (Dark vs Star White) and user sign-in/sign-out.

#### Step 5: The "New Entry" Tab (Core Daily Workflow)
- Build `DepartmentPills.tsx`, `SectionPills.tsx`, `AgentGrid.tsx`, and `StickySaveBar.tsx`.
- Support one-click status selection (`ontime`, `late1`, `late2`, `nsnc`, `perm`, `off`), Next ID snapshotting, and save confirmation.

---

Please start with **Step 1 (Scaffolding & TypeScript Definitions)** and **Step 2 (Theme Stylesheet)**, ensuring every single design detail from `_t.html` is meticulously preserved.
```

