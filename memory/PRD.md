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

## Deferred / Backlog
- Persistent undo/redo across sessions
- Recurring class schedule generation on calendar
- Fee override per month per student
- Charts for collection trends
