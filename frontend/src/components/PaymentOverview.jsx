import React, { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  X,
  MessageCircle,
  CheckCircle2,
} from "lucide-react";
import { useData } from "@/lib/store";
import {
  currentMonth,
  shiftMonth,
  monthLabel,
  monthsElapsed,
  inr,
  openWhatsApp,
} from "@/lib/calc";

export const PaymentOverview = ({ paid, partial, unpaid }) => {
  const total = Math.max(1, paid + partial + unpaid);

  const { students, batches, payments, addPayment } = useData();

  const [open, setOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(
    shiftMonth(currentMonth(), -1)
  );
  const [selectedClass, setSelectedClass] = useState(null);
  const [processingId, setProcessingId] = useState(null);

  // New: controls the instant confirmation popup
  const [confirmRow, setConfirmRow] = useState(null);

  const thisMonth = currentMonth();
  const previousMonth = shiftMonth(thisMonth, -1);

  /*
   * Parent WhatsApp number
   *
   * IMPORTANT:
   * Never use the student's phone number for payment reminders.
   */
  const getParentWhatsApp = (student) => {
    return (
      student.parent_phone ||
      student.guardian_whatsapp ||
      ""
    );
  };

  /*
   * PERFORMANCE OPTIMIZATION
   *
   * Create lookup maps once instead of repeatedly searching
   * through all payments and batches for every student.
   */

  const paymentsByStudent = useMemo(() => {
    const map = new Map();

    payments.forEach((payment) => {
      if (!map.has(payment.student_id)) {
        map.set(payment.student_id, []);
      }

      map.get(payment.student_id).push(payment);
    });

    return map;
  }, [payments]);

  const batchNameById = useMemo(() => {
    const map = new Map();

    batches.forEach((batch) => {
      map.set(batch.id, batch.name);
    });

    return map;
  }, [batches]);

  const studentRows = useMemo(() => {
    return students
      .filter((student) => {
        const joinMonth = student.join_month || thisMonth;
        return joinMonth <= thisMonth;
      })
      .map((student) => {
        const studentPayments =
          paymentsByStudent.get(student.id) || [];

        const fee = Number(student.monthly_fee || 0);
        const joinMonth =
          student.join_month || thisMonth;

        let previousTotalDue = 0;

        if (joinMonth <= previousMonth) {
          const elapsed = monthsElapsed(
            joinMonth,
            previousMonth
          );

          previousTotalDue = fee * elapsed;
        }

        const previousPaid = studentPayments
          .filter(
            (p) =>
              p.month &&
              p.month <= previousMonth
          )
          .reduce(
            (sum, p) =>
              sum + Number(p.amount || 0),
            0
          );

        const previousDue = Math.max(
          0,
          previousTotalDue - previousPaid
        );

        const currentPaid = studentPayments
          .filter(
            (p) => p.month === thisMonth
          )
          .reduce(
            (sum, p) =>
              sum + Number(p.amount || 0),
            0
          );

        const currentDue = Math.max(
          0,
          fee - currentPaid
        );

        const selectedMonthActive =
          joinMonth <= selectedMonth;

        const selectedMonthPaid = studentPayments
          .filter(
            (p) =>
              p.month === selectedMonth
          )
          .reduce(
            (sum, p) =>
              sum + Number(p.amount || 0),
            0
          );

        const selectedMonthDue =
          selectedMonthActive
            ? Math.max(
                0,
                fee - selectedMonthPaid
              )
            : 0;

        return {
          student,
          batchName:
            batchNameById.get(
              student.batch_id
            ) || "No Class",
          fee,
          previousDue,
          currentDue,
          totalDue:
            previousDue + currentDue,
          selectedMonthDue,
        };
      });
  }, [
    students,
    paymentsByStudent,
    batchNameById,
    thisMonth,
    previousMonth,
    selectedMonth,
  ]);

  /*
   * Display every class that has any outstanding fee.
   * This includes previous-month dues AND current-month dues,
   * so students who have only the current month's fee pending
   * are not omitted from the reminder list.
   */
  const classGroups = useMemo(() => {
    const groups = new Map();

    studentRows
      .filter(
        (row) => row.totalDue > 0
      )
      .forEach((row) => {
        if (!groups.has(row.batchName)) {
          groups.set(row.batchName, []);
        }

        groups
          .get(row.batchName)
          .push(row);
      });

    return Array.from(groups.entries())
      .map(([name, rows]) => ({
        name,
        students: rows,
        previous: rows.reduce(
          (sum, row) =>
            sum + row.previousDue,
          0
        ),
        current: rows.reduce(
          (sum, row) =>
            sum + row.currentDue,
          0
        ),
        total: rows.reduce(
          (sum, row) =>
            sum + row.totalDue,
          0
        ),
      }))
      .sort((a, b) =>
        a.name.localeCompare(b.name)
      );
  }, [studentRows]);

  const selectedGroup = classGroups.find(
    (group) =>
      group.name === selectedClass
  );

  const grandPrevious = classGroups.reduce(
    (sum, group) =>
      sum + group.previous,
    0
  );

  const grandCurrent = classGroups.reduce(
    (sum, group) =>
      sum + group.current,
    0
  );

  const grandTotal = classGroups.reduce(
    (sum, group) =>
      sum + group.total,
    0
  );

  /*
   * STEP 2:
   * Open our confirmation popup immediately.
   */
  const markPreviousPaid = (row) => {
    const amount = row.selectedMonthDue;

    if (amount <= 0) return;

    setConfirmRow(row);
  };

  /*
   * Actually save the payment only after
   * the user confirms.
   */
  const confirmMarkPreviousPaid = async () => {
    if (!confirmRow) return;

    const row = confirmRow;
    const amount = row.selectedMonthDue;

    if (amount <= 0) {
      setConfirmRow(null);
      return;
    }

    try {
      setConfirmRow(null);
      setProcessingId(row.student.id);

      await addPayment({
        student_id: row.student.id,
        amount,
        month: selectedMonth,
        payment_date: new Date()
          .toISOString()
          .slice(0, 10),
      });
    } catch (error) {
      console.error(
        "Could not mark payment",
        error
      );

      alert(
        "Payment could not be saved. Please try again."
      );
    } finally {
      setProcessingId(null);
    }
  };

  /*
   * ==========================================================
   * WHATSAPP PAYMENT REMINDER
   * ==========================================================
   *
   * Parent/Guardian number ONLY.
   *
   * Priority:
   * 1. parent_phone
   * 2. guardian_whatsapp
   *
   * Student phone is NEVER used.
   *
   * Message is Bengali only.
   */
  const sendWhatsApp = (row) => {
    const parentPhone = getParentWhatsApp(
      row.student
    );

    if (!parentPhone) {
      alert(
        `এই শিক্ষার্থীর অভিভাবকের WhatsApp নম্বর দেওয়া নেই।\n\n${row.student.name}-এর Student Details থেকে Parent's Phone Number যোগ করুন।`
      );
      return;
    }

    const message =
      `প্রিয় অভিভাবক,\n\n` +
      `আপনার সন্তানের টিউশন ফি বাবদ বকেয়া রয়েছে।\n\n` +
      `আগের মাসের বকেয়া: ${inr(
        row.previousDue
      )}\n` +
      `চলতি মাসের ফি: ${inr(
        row.currentDue
      )}\n` +
      `-------------------------\n` +
      `মোট বকেয়া: ${inr(
        row.totalDue
      )}\n\n` +
      `অনুগ্রহ করে সুবিধামতো টিউশন ফি পরিশোধ করে দিন।\n\n` +
      `ধন্যবাদ।\n` +
      `TAPASH SIR`;

    openWhatsApp(
      parentPhone,
      message
    );
  };

  const closePopup = () => {
    setOpen(false);
    setSelectedClass(null);
    setConfirmRow(null);
  };

  return (
    <>
      {/* PAYMENT OVERVIEW */}
      <div className="rounded-3xl bg-white p-5 sm:p-6 soft-shadow">
        <div className="text-xs font-bold text-slate-500 tracking-wider">
          PAYMENT OVERVIEW
        </div>

        <div className="mt-4 flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-emerald-500" />
            <span
              className="font-bold"
              data-testid="ov-paid"
            >
              {paid}
            </span>
            Paid
          </div>

          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-amber-400" />
            <span
              className="font-bold"
              data-testid="ov-partial"
            >
              {partial}
            </span>
            Partial
          </div>

          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-rose-500" />
            <span
              className="font-bold"
              data-testid="ov-unpaid"
            >
              {unpaid}
            </span>
            Unpaid
          </div>
        </div>

        <div className="mt-4 h-3 w-full rounded-full overflow-hidden bg-slate-100 flex">
          <div
            className="bg-emerald-500 h-full"
            style={{
              width: `${(paid / total) * 100}%`,
            }}
          />

          <div
            className="bg-amber-400 h-full"
            style={{
              width: `${(partial / total) * 100}%`,
            }}
          />

          <div
            className="bg-rose-500 h-full"
            style={{
              width: `${(unpaid / total) * 100}%`,
            }}
          />
        </div>

        <button
          onClick={() => setOpen(true)}
          className="mt-5 w-full rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-3 text-sm font-extrabold text-white shadow-md"
        >
          📚 Previous + Current Dues
        </button>
      </div>

      {/* PAYMENT OVERVIEW POPUP */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6">
          <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-slate-50 shadow-xl">

            {/* COMPACT HEADER */}
            <div className="shrink-0 border-b bg-white px-4 py-3 sm:px-5">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base sm:text-lg font-extrabold text-slate-900 leading-tight">
                    📚 Previous + Current Dues
                  </h2>

                  <p className="mt-0.5 text-[11px] sm:text-xs text-slate-500 truncate">
                    {selectedClass
                      ? `Students in ${selectedClass}`
                      : "Batch-wise pending dues"}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-50 px-2 py-1.5">
                  <button
                    onClick={() =>
                      setSelectedMonth(
                        shiftMonth(
                          selectedMonth,
                          -1
                        )
                      )
                    }
                    className="rounded-lg bg-white p-1.5 text-slate-700 shadow-sm"
                    aria-label="Previous month"
                  >
                    <ChevronLeft size={17} />
                  </button>

                  <div className="min-w-[108px] text-center">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Previous Month
                    </div>
                    <div className="text-sm font-extrabold text-indigo-700 leading-tight">
                      {monthLabel(selectedMonth)}
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      setSelectedMonth(
                        shiftMonth(
                          selectedMonth,
                          1
                        )
                      )
                    }
                    className="rounded-lg bg-white p-1.5 text-slate-700 shadow-sm"
                    aria-label="Next month"
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>

                <button
                  onClick={closePopup}
                  className="shrink-0 rounded-full bg-slate-100 p-2 text-slate-600"
                  aria-label="Close"
                >
                  <X size={19} />
                </button>
              </div>
            </div>

            {/* COMPACT NOTE */}
            <div className="shrink-0 border-b bg-white px-4 py-2 sm:px-5">
              <div className="text-[11px] sm:text-xs text-indigo-700">
                <b>Note:</b> Only classes with previous pending dues are shown. Current month dues are included in the total.
              </div>
            </div>

            {/* SUMMARY */}
            <div className="shrink-0 grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="text-xs font-bold text-slate-500">
                  PREVIOUS PENDING
                </div>

                <div className="mt-1 text-xl font-extrabold text-orange-600">
                  {inr(grandPrevious)}
                </div>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="text-xs font-bold text-slate-500">
                  CURRENT MONTH
                </div>

                <div className="mt-1 text-xl font-extrabold text-blue-600">
                  {inr(grandCurrent)}
                </div>
              </div>

              <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 p-4 text-white shadow-sm">
                <div className="text-xs font-bold opacity-80">
                  TOTAL TO COLLECT
                </div>

                <div className="mt-1 text-2xl font-extrabold">
                  {inr(grandTotal)}
                </div>
              </div>
            </div>

            {/* SCROLL AREA */}
            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-5 sm:px-5"
              style={{
                WebkitOverflowScrolling:
                  "touch",
                touchAction: "pan-y",
                willChange:
                  "scroll-position",
              }}
            >
              {!selectedClass ? (
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-extrabold text-slate-800">
                        Classes with pending dues
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        Tap any batch to see student-wise details
                      </div>
                    </div>

                    <div className="shrink-0 rounded-full bg-indigo-50 px-3 py-1 text-xs font-extrabold text-indigo-700">
                      {classGroups.length}{" "}
                      {classGroups.length === 1 ? "batch" : "batches"}
                    </div>
                  </div>

                  {classGroups.length === 0 ? (
                    <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
                      <div className="text-4xl">
                        🎉
                      </div>

                      <div className="mt-3 font-extrabold text-slate-800">
                        No previous dues
                      </div>

                      <div className="mt-1 text-sm text-slate-500">
                        There are no students with
                        previous-month pending dues.
                      </div>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <div className="min-w-[760px]">
                        <div className="grid grid-cols-[minmax(230px,1.7fr)_80px_115px_115px_120px_52px] items-center gap-0 border-b bg-slate-50 px-3 py-2.5 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
                          <div>Batch / Class</div>
                          <div className="text-center">Students</div>
                          <div className="text-right">Previous</div>
                          <div className="text-right">Current</div>
                          <div className="text-right">Total</div>
                          <div />
                        </div>

                        {classGroups.map((group) => (
                          <button
                            key={group.name}
                            onClick={() =>
                              setSelectedClass(
                                group.name
                              )
                            }
                            className="grid w-full grid-cols-[minmax(230px,1.7fr)_80px_115px_115px_120px_52px] items-center gap-0 border-b border-slate-100 px-3 py-3 text-left transition hover:bg-indigo-50/50 last:border-b-0"
                          >
                            <div className="min-w-0 pr-3">
                              <div className="truncate text-sm sm:text-base font-extrabold text-slate-900">
                                📚 {group.name}
                              </div>
                              <div className="mt-0.5 text-[11px] text-slate-500">
                                {group.students.length}{" "}
                                {group.students.length === 1
                                  ? "student"
                                  : "students"}{" "}
                                with previous pending
                              </div>
                            </div>

                            <div className="text-center text-sm font-extrabold text-slate-800">
                              {group.students.length}
                            </div>

                            <div className="text-right text-sm sm:text-base font-extrabold text-orange-600">
                              {inr(group.previous)}
                            </div>

                            <div className="text-right text-sm sm:text-base font-extrabold text-blue-600">
                              {inr(group.current)}
                            </div>

                            <div className="text-right text-sm sm:text-base font-extrabold text-slate-900">
                              {inr(group.total)}
                            </div>

                            <div className="flex justify-end">
                              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                                <ChevronRight size={19} />
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                    classGroups.map(
                      (group) => (
                        <button
                          key={group.name}
                          onClick={() =>
                            setSelectedClass(
                              group.name
                            )
                          }
                          className="w-full rounded-2xl bg-white p-4 text-left shadow-sm"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-lg font-extrabold text-slate-900">
                                📚 {group.name}
                              </div>

                              <div className="mt-1 text-xs text-slate-500">
                                {group.students.length}{" "}
                                student
                                {group.students.length !==
                                1
                                  ? "s"
                                  : ""}{" "}
                                with previous pending
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="text-xs font-bold text-orange-500">
                                PREVIOUS
                              </div>

                              <div className="text-lg font-extrabold text-orange-600">
                                {inr(
                                  group.previous
                                )}
                              </div>

                              <div className="mt-1 text-xs text-slate-500">
                                Total:{" "}
                                <b>
                                  {inr(
                                    group.total
                                  )}
                                </b>
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs">
                            <span className="font-bold text-blue-600">
                              Current:{" "}
                              {inr(
                                group.current
                              )}
                            </span>

                            <span className="font-extrabold text-indigo-600">
                              Tap to open →
                            </span>
                          </div>
                        </button>
                      )
                    )
                  )}
                </div>
              ) : (
                <div>
                  <button
                    onClick={() =>
                      setSelectedClass(null)
                    }
                    className="mb-4 rounded-xl bg-white px-4 py-2 text-sm font-bold text-indigo-600 shadow-sm"
                  >
                    ← Back to Classes
                  </button>

                  {selectedGroup && (
                    <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-bold text-slate-500">
                            CLASS
                          </div>

                          <div className="text-xl font-extrabold text-slate-900">
                            📚{" "}
                            {selectedGroup.name}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xs font-bold text-slate-500">
                            CLASS TOTAL
                          </div>

                          <div className="text-xl font-extrabold text-indigo-700">
                            {inr(
                              selectedGroup.total
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {selectedGroup?.students.map(
                      (row) => {
                        const parentPhone =
                          getParentWhatsApp(
                            row.student
                          );

                        return (
                          <div
                            key={row.student.id}
                            className="rounded-2xl bg-white p-4 shadow-sm"
                          >
                            <div className="font-extrabold text-slate-900">
                              {row.student.name}
                            </div>

                            <div className="mt-1 text-xs text-slate-500">
                              {parentPhone
                                ? parentPhone
                                : "Parent WhatsApp number not added"}
                            </div>

                            <div className="mt-4 grid grid-cols-3 gap-2">
                              <div className="rounded-xl bg-orange-50 p-3 text-center">
                                <div className="text-[10px] font-bold uppercase text-orange-600">
                                  Previous
                                </div>

                                <div className="mt-1 text-sm font-extrabold text-orange-700">
                                  {inr(
                                    row.previousDue
                                  )}
                                </div>
                              </div>

                              <div className="rounded-xl bg-blue-50 p-3 text-center">
                                <div className="text-[10px] font-bold uppercase text-blue-600">
                                  Current
                                </div>

                                <div className="mt-1 text-sm font-extrabold text-blue-700">
                                  {inr(
                                    row.currentDue
                                  )}
                                </div>
                              </div>

                              <div className="rounded-xl bg-indigo-50 p-3 text-center">
                                <div className="text-[10px] font-bold uppercase text-indigo-600">
                                  TOTAL
                                </div>

                                <div className="mt-1 text-sm font-extrabold text-indigo-700">
                                  {inr(
                                    row.totalDue
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              <button
                                onClick={() =>
                                  sendWhatsApp(
                                    row
                                  )
                                }
                                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-3 text-xs font-extrabold text-white"
                              >
                                <MessageCircle
                                  size={16}
                                />
                                WhatsApp
                              </button>

                              {row.selectedMonthDue >
                                0 && (
                                <button
                                  onClick={() =>
                                    markPreviousPaid(
                                      row
                                    )
                                  }
                                  disabled={
                                    processingId ===
                                    row.student
                                      .id
                                  }
                                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-3 text-xs font-extrabold text-white disabled:opacity-50"
                                >
                                  <CheckCircle2
                                    size={16}
                                  />

                                  {processingId ===
                                  row.student
                                    .id
                                    ? "Saving..."
                                    : `Mark ${monthLabel(
                                        selectedMonth
                                      ).split(
                                        " "
                                      )[0]} Paid`}
                                </button>
                              )}
                            </div>

                            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                              WhatsApp will show:{" "}
                              <b className="text-indigo-700">
                                {inr(
                                  row.totalDue
                                )}
                              </b>{" "}
                              (Previous + Current)
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* FOOTER */}
            <div className="shrink-0 border-t bg-white px-5 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs font-bold uppercase text-slate-500">
                    Grand Total
                  </div>

                  <div className="text-2xl font-extrabold text-indigo-700">
                    {inr(grandTotal)}
                  </div>
                </div>

                <button
                  onClick={closePopup}
                  className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-extrabold text-white"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          INSTANT PAYMENT CONFIRMATION POPUP
          ===================================================== */}
      {confirmRow && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">

            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-indigo-600">
                  Confirm Payment
                </div>

                <h3 className="mt-1 text-xl font-extrabold text-slate-900">
                  Mark Fee as Paid?
                </h3>
              </div>

              <button
                onClick={() =>
                  setConfirmRow(null)
                }
                className="rounded-full bg-slate-100 p-2 text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 rounded-2xl bg-slate-50 p-4">
              <div className="text-sm text-slate-500">
                Student
              </div>

              <div className="mt-1 text-lg font-extrabold text-slate-900">
                {confirmRow.student.name}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white p-3">
                  <div className="text-[10px] font-bold uppercase text-slate-500">
                    Month
                  </div>

                  <div className="mt-1 font-extrabold text-indigo-700">
                    {monthLabel(
                      selectedMonth
                    )}
                  </div>
                </div>

                <div className="rounded-xl bg-white p-3">
                  <div className="text-[10px] font-bold uppercase text-slate-500">
                    Amount
                  </div>

                  <div className="mt-1 text-lg font-extrabold text-emerald-600">
                    {inr(
                      confirmRow.selectedMonthDue
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={() =>
                  setConfirmRow(null)
                }
                className="flex-1 rounded-xl bg-slate-100 px-4 py-3 font-extrabold text-slate-700"
              >
                Cancel
              </button>

              <button
                onClick={
                  confirmMarkPreviousPaid
                }
                className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 font-extrabold text-white"
              >
                ✓ Confirm & Mark Paid
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
