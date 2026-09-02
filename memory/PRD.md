# TAPASH SIR - Tuition Fee Management

## Original Problem
Modern responsive tuition/teacher fee-management web app for private tutor "TAPASH SIR" to manage batches, students, monthly fees, payments, dues, reminders, history, and calendar. iPad-first, purple/indigo primary, green paid, red unpaid, yellow partial.

## Users
Single tutor persona; iPad landscape primary; mobile & desktop supported.

## Architecture
- Backend: FastAPI + MongoDB (batches, students, payments, events)
- Frontend: React + shadcn/ui + Plus Jakarta Sans + Tailwind
- Data: persistent MongoDB with seeded demo data

## Implemented (2026-02)
- Header: purple graduation-cap logo, TAPASH SIR title, Licensed pill, Undo/Redo
- Bottom nav: Dashboard, Batches, Students, Overview, Calendar
- Dashboard: month selector, Monthly/Overall toggle, 4 stat cards, PAYMENT OVERVIEW bar, Remind All Unpaid (wa.me), Export/Import JSON
- Batches: add/edit/delete with confirm, student count + fee chips
- Students: month nav, batch filter chips, search, payment status filter, per-student cards with Total/Paid/Remaining, Edit/Mark Paid/Remind/Move/History/Delete
- Payment modal with full/partial amounts, note, date
- Payment History modal (chronological, per-month)
- Move Student modal
- Overview: Lifetime overdue table sorted, Remind All Overdue, click row for history
- Calendar: month grid with events (due/received/class/note), payment events auto-shown, add/remove events
- Undo/Redo in-session (30 actions)
- CSV export on Students
- Seed data on first load

## Bug Fixes (2026-02)
- Import JSON: fixed silent failure — backend `/api/import` now sanitizes malformed payloads (200 + counts instead of 422), frontend validates files with clear error toasts, file input switched from display:none to visually-hidden for iPad Safari compatibility; frontend export now includes calendar events (verified by testing_agent iteration 2, 100% pass)
- Code-review refactor (2026-02): extracted `useOperations` (lib/operations.js), `useBackup` (lib/useBackup.js), `StatCard`, `PaymentOverview`, `StudentCard`, `DayCell`, `EventDialog` components; `filterStudents`/`reminderMessage`/`openWhatsApp` helpers in calc.js; StudentForm single-state rewrite; MoveStudentModal useMemo; seed() split into `_seed_batch_docs`/`_seed_student_docs`/`_prev_month`; seed error now logged via console.error. Note: `is not None` in server.py update_student kept intentionally (correct Python idiom; linter false positive).
- Stuck-loading fix (2026-09): boot sequence (`retryLoad`) now uses try/catch/finally so the app never hangs on "Loading TAPASH SIR…"; axios 20s timeout; ErrorScreen with Retry button (data-testid=retry-load-btn). Verified by testing_agent iteration 3 (100%).
- Real data import (2026-09): imported user's Now.json backup from the previous app version (different schema: students nested per batch→month with per-record unique ids, `time`/`fees` fields, status-based payments incl. "Moved" markers) — converted to app schema via /api/import: 16 batches, 2,855 student-month records → 629 unique students (deduped by name+phone, latest record decides current batch/fee, "Moved" markers excluded), 2,088 reconstructed payments.

## Feature Update (2026-09) — Colourful UI + Pay-any-month + WhatsApp confirmations
- Colourful UI: pastel gradient page background, indigo→violet gradient header/nav, coloured stat values, status-coloured student card accents + avatars (green/amber/red), coloured status filter chips, rotating pastel batch icons
- Pay any pending month: Payment History rows have per-month "✅ Mark Paid" (history-mark-paid-YYYY-MM) on unpaid/partial months; records payment for THAT month with today's payment_date; other months untouched; wired on both Students and Overview pages
- WhatsApp confirmation after Mark Paid: saves first, then opens wa.me with pre-filled "payment of ₹X for <Month> tuition fee has been received successfully. Thank you. — <Org Name>"; normalizePhone adds +91 for 10-digit Indian numbers; PaymentModal save button disables while saving (no duplicate payments); paid months show Paid badge only
- Backend: settings (org_name, auto_advance_day) + activity log (Marked paid / Partial / Added/Moved/Deleted) with cumulative-month-total wording; export/import includes settings+activities; 20 legacy activityLog entries imported
- Perf: indexPayments/paysFor O(S+P) lookups; Students renders 60 + show-more, Overview 100 + show-more; calendar events indexed by date
- Verified by testing_agent iteration 5: backend 21/22, frontend 100% (incl. stubbed wa.me link capture, double-click guard, no-phone toast, reload persistence)
- Cleanup: removed 19 TEST activity entries + duplicate "Diya majumdar" record from test rounds

## Code Quality Round 2 (2026-09)
- Hook deps completed across Students/Overview/Dashboard/StudentForm/SettingsCards/PaymentModal/store; server.py `is not None` → `model_dump(exclude_none=True)`; console statements dev-gated (store.js, craco.config.js)
- Splits: store.js → +useStacks.js with useMemo context value; operations.js all useCallback/useMemo; Students.jsx → StudentsToolbar + StudentModals; Overview.jsx → OverdueTable; CalendarPage → CalendarHeader; PaymentModal → FeeSummary; server.py import_all → _replace_collection helper
- Left as-is (with reason): test-file complexity (test scaffolding, suites passing), operations.js kept as one cohesive hook file (11 related ops)
- Iteration 6-9 hardening loop (2026-09): fixed StrictMode undo/redo double-fire (side effects moved out of setState updaters in useStacks.js); fixed stale-id undo-after-redo (liveId ref in addBatch/addStudent/addPayment); fixed orphaned children on delete-undo (id/created_at passthrough on create endpoints, restore with original ids); fixed PUT /api/batches null-id corruption (exclude_none + exclude id/created_at); delete endpoints return 404 for unknown ids; partial PUTs hardened with exclude_unset; created_at backfilled on 16 imported batches; aria-describedby added to all dialogs. Verified across iterations 7-9 (final: 49 backend tests passed, frontend 100%, 0 orphans, baseline 16/630/2094).

## Deferred / Backlog
- Persistent undo/redo across sessions
- Recurring class schedule generation on calendar
- Fee override per month per student
- Charts for collection trends
