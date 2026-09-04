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

  const thisMonth = currentMonth();
  const previousMonth = shiftMonth(thisMonth, -1);

  const studentRows = useMemo(() => {
    return students
      .filter((student) => {
        const joinMonth = student.join_month || thisMonth;
        return joinMonth <= thisMonth;
      })
      .map((student) => {
        const studentPayments = payments.filter(
          (p) => p.student_id === student.id
        );

        const fee = Number(student.monthly_fee || 0);
        const joinMonth = student.join_month || thisMonth;

        let previousTotalDue = 0;

        if (joinMonth <= previousMonth) {
          const elapsed = monthsElapsed(joinMonth, previousMonth);
          previousTotalDue = fee * elapsed;
        }

        const previousPaid = studentPayments
          .filter((p) => p.month && p.month <= previousMonth)
          .reduce(
            (sum, p) => sum + Number(p.amount || 0),
            0
          );

        const previousDue = Math.max(
          0,
          previousTotalDue - previousPaid
        );

        const currentPaid = studentPayments
          .filter((p) => p.month === thisMonth)
          .reduce(
            (sum, p) => sum + Number(p.amount || 0),
            0
          );

        const currentDue = Math.max(
          0,
          fee - currentPaid
        );

        const selectedMonthActive =
          joinMonth <= selectedMonth;

        const selectedMonthPaid = studentPayments
          .filter((p) => p.month === selectedMonth)
          .reduce(
            (sum, p) => sum + Number(p.amount || 0),
            0
          );

        const selectedMonthDue = selectedMonthActive
          ? Math.max(
              0,
              fee - selectedMonthPaid
            )
          : 0;

        const batch = batches.find(
          (b) => b.id === student.batch_id
        );

        return {
          student,
          batchName: batch?.name || "No Class",
          fee,
          previousDue,
          currentDue,
          totalDue: previousDue + currentDue,
          selectedMonthDue,
        };
      });
  }, [
    students,
    payments,
    batches,
    thisMonth,
    previousMonth,
    selectedMonth,
  ]);

  /*
   * ONLY classes with previous pending dues
   * are displayed on the first screen.
   */
  const classGroups = useMemo(() => {
    const groups = new Map();

    studentRows
      .filter((row) => row.previousDue > 0)
      .forEach((row) => {
        if (!groups.has(row.batchName)) {
          groups.set(row.batchName, []);
        }

        groups.get(row.batchName).push(row);
      });

    return Array.from(groups.entries())
      .map(([name, rows]) => ({
        name,
        students: rows,
        previous: rows.reduce(
          (sum, row) => sum + row.previousDue,
          0
        ),
        current: rows.reduce(
          (sum, row) => sum + row.currentDue,
          0
        ),
        total: rows.reduce(
          (sum, row) => sum + row.totalDue,
          0
        ),
      }))
      .sort((a, b) =>
        a.name.localeCompare(b.name)
      );
  }, [studentRows]);

  const selectedGroup = classGroups.find(
    (group) => group.name === selectedClass
  );

  const grandPrevious = classGroups.reduce(
    (sum, group) => sum + group.previous,
    0
  );

  const grandCurrent = classGroups.reduce(
    (sum, group) => sum + group.current,
    0
  );

  const grandTotal = classGroups.reduce(
    (sum, group) => sum + group.total,
    0
  );

  const markPreviousPaid = async (row) => {
    const amount = row.selectedMonthDue;

    if (amount <= 0) return;

    const ok = window.confirm(
      `Mark ${monthLabel(
        selectedMonth
      )} fee as PAID for ${
        row.student.name
      }?\n\nAmount: ${inr(amount)}`
    );

    if (!ok) return;

    try {
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

  const sendWhatsApp = (row) => {
    const message =
      `Hello ${row.student.name},\n\n` +
      `This is a reminder regarding the tuition fee.\n\n` +
      `Previous pending dues: ${inr(
        row.previousDue
      )}\n` +
      `Current month fee: ${inr(
        row.currentDue
      )}\n` +
      `-------------------------\n` +
      `TOTAL AMOUNT DUE: ${inr(
        row.totalDue
      )}\n\n` +
      `Please make the payment at your convenience.\n\n` +
      `Thank you.\n` +
      `TAPASH SIR`;

    openWhatsApp(
      row.student.phone,
      message
    );
  };

  const closePopup = () => {
    setOpen(false);
    setSelectedClass(null);
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

      {/* POPUP */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6">

          <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-slate-50 shadow-xl">

            {/* HEADER */}
            <div className="flex shrink-0 items-center justify-between border-b bg-white px-5 py-4">

              <div>
                <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
                  📚 Previous + Current Dues
                </h2>

                <p className="mt-1 text-xs sm:text-sm text-slate-500">
                  {selectedClass
                    ? `Students in ${selectedClass}`
                    : "Select a class to see students"}
                </p>
              </div>

              <button
                onClick={closePopup}
                className="rounded-full bg-slate-100 p-2 text-slate-600"
              >
                <X size={20} />
              </button>

            </div>

            {/* MONTH SELECTOR */}
            <div className="shrink-0 border-b bg-white px-5 py-4">

              <div className="flex flex-wrap items-center justify-between gap-3">

                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Previous Month
                  </div>

                  <div className="mt-1 text-lg font-extrabold text-indigo-700">
                    {monthLabel(selectedMonth)}
                  </div>
                </div>

                <div className="flex items-center gap-2">

                  <button
                    onClick={() =>
                      setSelectedMonth(
                        shiftMonth(
                          selectedMonth,
                          -1
                        )
                      )
                    }
                    className="rounded-xl bg-slate-100 p-2"
                  >
                    <ChevronLeft size={20} />
                  </button>

                  <button
                    onClick={() =>
                      setSelectedMonth(
                        shiftMonth(
                          selectedMonth,
                          1
                        )
                      )
                    }
                    className="rounded-xl bg-slate-100 p-2"
                  >
                    <ChevronRight size={20} />
                  </button>

                </div>

              </div>

              <div className="mt-3 rounded-2xl bg-indigo-50 px-4 py-3 text-xs sm:text-sm text-indigo-800">
                <b>Note:</b> Only classes with previous
                pending dues are shown. Current month
                dues are included in the total.
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

            {/* SMOOTH SCROLL AREA */}
            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-5 sm:px-5"
              style={{
                WebkitOverflowScrolling: "touch",
                touchAction: "pan-y",
                willChange: "scroll-position",
              }}
            >

              {!selectedClass ? (

                /* CLASS LIST */
                <div className="space-y-3">

                  <div className="mb-3 text-sm font-bold text-slate-600">
                    Select a class:
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

                    classGroups.map((group) => (

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
                              {group.students.length !== 1
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
                              {inr(group.previous)}
                            </div>

                            <div className="mt-1 text-xs text-slate-500">
                              Total:{" "}
                              <b>
                                {inr(group.total)}
                              </b>
                            </div>

                          </div>

                        </div>

                        <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs">

                          <span className="font-bold text-blue-600">
                            Current:{" "}
                            {inr(group.current)}
                          </span>

                          <span className="font-extrabold text-indigo-600">
                            Tap to open →
                          </span>

                        </div>

                      </button>

                    ))

                  )}

                </div>

              ) : (

                /* STUDENT LIST */
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
                            📚 {selectedGroup.name}
                          </div>

                        </div>

                        <div className="text-right">

                          <div className="text-xs font-bold text-slate-500">
                            CLASS TOTAL
                          </div>

                          <div className="text-xl font-extrabold text-indigo-700">
                            {inr(selectedGroup.total)}
                          </div>

                        </div>

                      </div>

                    </div>
                  )}

                  <div className="space-y-3">

                    {selectedGroup?.students.map(
                      (row) => (

                        <div
                          key={row.student.id}
                          className="rounded-2xl bg-white p-4 shadow-sm"
                        >

                          <div className="font-extrabold text-slate-900">
                            {row.student.name}
                          </div>

                          {row.student.phone && (
                            <div className="mt-1 text-xs text-slate-500">
                              {row.student.phone}
                            </div>
                          )}

                          <div className="mt-4 grid grid-cols-3 gap-2">

                            <div className="rounded-xl bg-orange-50 p-3 text-center">
                              <div className="text-[10px] font-bold uppercase text-orange-600">
                                Previous
                              </div>

                              <div className="mt-1 text-sm font-extrabold text-orange-700">
                                {inr(row.previousDue)}
                              </div>
                            </div>

                            <div className="rounded-xl bg-blue-50 p-3 text-center">
                              <div className="text-[10px] font-bold uppercase text-blue-600">
                                Current
                              </div>

                              <div className="mt-1 text-sm font-extrabold text-blue-700">
                                {inr(row.currentDue)}
                              </div>
                            </div>

                            <div className="rounded-xl bg-indigo-50 p-3 text-center">
                              <div className="text-[10px] font-bold uppercase text-indigo-600">
                                TOTAL
                              </div>

                              <div className="mt-1 text-sm font-extrabold text-indigo-700">
                                {inr(row.totalDue)}
                              </div>
                            </div>

                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">

                            <button
                              onClick={() =>
                                sendWhatsApp(row)
                              }
                              disabled={!row.student.phone}
                              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-3 text-xs font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <MessageCircle size={16} />
                              WhatsApp
                            </button>

                            {row.selectedMonthDue > 0 && (
                              <button
                                onClick={() =>
                                  markPreviousPaid(row)
                                }
                                disabled={
                                  processingId ===
                                  row.student.id
                                }
                                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-3 text-xs font-extrabold text-white disabled:opacity-50"
                              >
                                <CheckCircle2 size={16} />

                                {processingId ===
                                row.student.id
                                  ? "Saving..."
                                  : `Mark ${monthLabel(
                                      selectedMonth
                                    ).split(" ")[0]} Paid`}
                              </button>
                            )}

                          </div>

                          <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                            WhatsApp will show:{" "}
                            <b className="text-indigo-700">
                              {inr(row.totalDue)}
                            </b>{" "}
                            (Previous + Current)
                          </div>

                        </div>

                      )
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
    </>
  );
};
