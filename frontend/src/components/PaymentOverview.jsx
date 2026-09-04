import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X, MessageCircle, CheckCircle2 } from "lucide-react";
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
  const [processingId, setProcessingId] = useState(null);

  const thisMonth = currentMonth();

  /*
   * Previous dues = all unpaid tuition up to the month before
   * the current month.
   *
   * Current dues = current month's fee minus current month's payment.
   *
   * This makes the WhatsApp amount show the COMPLETE amount,
   * so parents do not see only the old pending amount.
   */
  const rows = useMemo(() => {
    const previousMonth = shiftMonth(thisMonth, -1);

    return students
      .filter((student) => {
        return (student.join_month || thisMonth) <= thisMonth;
      })
      .map((student) => {
        const studentPayments = payments.filter(
          (p) => p.student_id === student.id
        );

        const fee = Number(student.monthly_fee || 0);

        const joinMonth = student.join_month || thisMonth;

        // Total fees due from joining month through previous month
        let previousTotalDue = 0;

        if (joinMonth <= previousMonth) {
          const elapsed = monthsElapsed(joinMonth, previousMonth);
          previousTotalDue = fee * elapsed;
        }

        // Payments made for previous months only
        const previousPaid = studentPayments
          .filter((p) => p.month && p.month <= previousMonth)
          .reduce((sum, p) => sum + Number(p.amount || 0), 0);

        const previousDue = Math.max(
          0,
          previousTotalDue - previousPaid
        );

        // Current month
        const currentPaid = studentPayments
          .filter((p) => p.month === thisMonth)
          .reduce((sum, p) => sum + Number(p.amount || 0), 0);

        const currentDue = Math.max(
          0,
          fee - currentPaid
        );

        // Selected previous month
        const selectedMonthPaid = studentPayments
          .filter((p) => p.month === selectedMonth)
          .reduce((sum, p) => sum + Number(p.amount || 0), 0);

        const selectedMonthActive =
          joinMonth <= selectedMonth;

        const selectedMonthDue = selectedMonthActive
          ? Math.max(0, fee - selectedMonthPaid)
          : 0;

        const totalDue = previousDue + currentDue;

        const batch = batches.find(
          (b) => b.id === student.batch_id
        );

        return {
          student,
          batchName: batch?.name || "No Class",
          fee,
          previousDue,
          currentDue,
          totalDue,
          selectedMonthDue,
          selectedMonthPaid,
        };
      })
      .filter((row) => row.totalDue > 0);
  }, [students, payments, batches, thisMonth, selectedMonth]);

  const classGroups = useMemo(() => {
    const groups = new Map();

    for (const row of rows) {
      if (!groups.has(row.batchName)) {
        groups.set(row.batchName, []);
      }

      groups.get(row.batchName).push(row);
    }

    return Array.from(groups.entries())
      .map(([name, students]) => ({
        name,
        students,
        previous: students.reduce(
          (sum, s) => sum + s.previousDue,
          0
        ),
        current: students.reduce(
          (sum, s) => sum + s.currentDue,
          0
        ),
        total: students.reduce(
          (sum, s) => sum + s.totalDue,
          0
        ),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const grandPrevious = rows.reduce(
    (sum, row) => sum + row.previousDue,
    0
  );

  const grandCurrent = rows.reduce(
    (sum, row) => sum + row.currentDue,
    0
  );

  const grandTotal = rows.reduce(
    (sum, row) => sum + row.totalDue,
    0
  );

  const markPreviousPaid = async (row) => {
    const amount = row.selectedMonthDue;

    if (amount <= 0) return;

    const ok = window.confirm(
      `Mark ${monthLabel(selectedMonth)} fee as PAID for ${row.student.name}?\n\nAmount: ${inr(amount)}`
    );

    if (!ok) return;

    try {
      setProcessingId(row.student.id);

      await addPayment({
        student_id: row.student.id,
        amount,
        month: selectedMonth,
        payment_date: new Date().toISOString().slice(0, 10),
      });
    } catch (error) {
      console.error("Could not mark previous payment", error);
      alert("Payment could not be saved. Please try again.");
    } finally {
      setProcessingId(null);
    }
  };

  const sendWhatsApp = (row) => {
    const message =
      `Hello ${row.student.name},\n\n` +
      `This is a reminder regarding the tuition fee.\n\n` +
      `Previous pending dues: ${inr(row.previousDue)}\n` +
      `Current month fee: ${inr(row.currentDue)}\n` +
      `-------------------------\n` +
      `TOTAL AMOUNT DUE: ${inr(row.totalDue)}\n\n` +
      `Please make the payment at your convenience.\n\n` +
      `Thank you.\n` +
      `TAPASH SIR`;

    openWhatsApp(row.student.phone, message);
  };

  return (
    <>
      {/* EXISTING PAYMENT OVERVIEW */}
      <div className="rounded-3xl bg-white p-5 sm:p-6 soft-shadow">
        <div className="text-xs font-bold text-slate-500 tracking-wider">
          PAYMENT OVERVIEW
        </div>

        <div className="mt-4 flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-emerald-500" />
            <span className="font-bold" data-testid="ov-paid">
              {paid}
            </span>
            Paid
          </div>

          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-amber-400" />
            <span className="font-bold" data-testid="ov-partial">
              {partial}
            </span>
            Partial
          </div>

          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-rose-500" />
            <span className="font-bold" data-testid="ov-unpaid">
              {unpaid}
            </span>
            Unpaid
          </div>
        </div>

        <div className="mt-4 h-3 w-full rounded-full overflow-hidden bg-slate-100 flex">
          <div
            className="bg-emerald-500 h-full"
            style={{ width: `${(paid / total) * 100}%` }}
          />

          <div
            className="bg-amber-400 h-full"
            style={{ width: `${(partial / total) * 100}%` }}
          />

          <div
            className="bg-rose-500 h-full"
            style={{ width: `${(unpaid / total) * 100}%` }}
          />
        </div>

        {/* NEW BUTTON */}
        <button
          onClick={() => setOpen(true)}
          className="mt-5 w-full rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-3 text-sm font-extrabold text-white shadow-md hover:opacity-95 transition"
        >
          📚 Previous + Current Dues
        </button>
      </div>

      {/* PREVIOUS + CURRENT DUES POPUP */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6">
          <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-slate-50 shadow-2xl">

            {/* HEADER */}
            <div className="flex items-center justify-between border-b bg-white px-5 py-4">
              <div>
                <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
                  📚 Previous + Current Dues
                </h2>

                <p className="mt-1 text-xs sm:text-sm text-slate-500">
                  Full outstanding amount for parent reminders
                </p>
              </div>

              <button
                onClick={() => setOpen(false)}
                className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"
              >
                <X size={20} />
              </button>
            </div>

            {/* MONTH SELECTOR */}
            <div className="border-b bg-white px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">

                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Select Previous Month
                  </div>

                  <div className="mt-1 text-lg font-extrabold text-indigo-700">
                    {monthLabel(selectedMonth)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setSelectedMonth(
                        shiftMonth(selectedMonth, -1)
                      )
                    }
                    className="rounded-xl bg-slate-100 p-2 hover:bg-slate-200"
                  >
                    <ChevronLeft size={20} />
                  </button>

                  <button
                    onClick={() =>
                      setSelectedMonth(
                        shiftMonth(selectedMonth, 1)
                      )
                    }
                    className="rounded-xl bg-slate-100 p-2 hover:bg-slate-200"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>

              <div className="mt-3 rounded-2xl bg-indigo-50 px-4 py-3 text-xs sm:text-sm text-indigo-800">
                <b>Important:</b> Previous dues and the current month's
                dues are shown together. WhatsApp will use the complete
                total amount.
              </div>
            </div>

            {/* SUMMARY */}
            <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-3">

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

            {/* CONTENT */}
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-5 sm:px-5">

              {classGroups.length === 0 ? (
                <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
                  <div className="text-4xl">🎉</div>
                  <div className="mt-3 font-extrabold text-slate-800">
                    No pending dues
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    Everyone is up to date.
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {classGroups.map((group) => (
                    <div
                      key={group.name}
                      className="overflow-hidden rounded-3xl bg-white shadow-sm"
                    >
                      {/* CLASS HEADER */}
                      <div className="border-b bg-gradient-to-r from-slate-800 to-slate-700 px-4 py-4 text-white">
                        <div className="flex flex-wrap items-center justify-between gap-3">

                          <div>
                            <div className="text-xs font-bold uppercase tracking-wider opacity-70">
                              CLASS / BATCH
                            </div>

                            <div className="mt-1 text-lg font-extrabold">
                              {group.name}
                            </div>

                            <div className="mt-1 text-xs opacity-75">
                              {group.students.length} student
                              {group.students.length !== 1 ? "s" : ""}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-xs opacity-70">
                              CLASS TOTAL
                            </div>

                            <div className="text-xl font-extrabold">
                              {inr(group.total)}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-white/10 px-3 py-1">
                            Previous: {inr(group.previous)}
                          </span>

                          <span className="rounded-full bg-white/10 px-3 py-1">
                            Current: {inr(group.current)}
                          </span>
                        </div>
                      </div>

                      {/* STUDENTS */}
                      <div className="divide-y">

                        {group.students.map((row) => (
                          <div
                            key={row.student.id}
                            className="px-4 py-4"
                          >
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

                              {/* NAME */}
                              <div className="min-w-0 lg:flex-1">
                                <div className="font-extrabold text-slate-900">
                                  {row.student.name}
                                </div>

                                {row.student.phone && (
                                  <div className="mt-1 text-xs text-slate-500">
                                    {row.student.phone}
                                  </div>
                                )}
                              </div>

                              {/* AMOUNTS */}
                              <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[390px]">

                                <div className="rounded-xl bg-orange-50 px-2 py-2">
                                  <div className="text-[10px] font-bold uppercase text-orange-600">
                                    Previous
                                  </div>
                                  <div className="mt-1 text-sm font-extrabold text-orange-700">
                                    {inr(row.previousDue)}
                                  </div>
                                </div>

                                <div className="rounded-xl bg-blue-50 px-2 py-2">
                                  <div className="text-[10px] font-bold uppercase text-blue-600">
                                    Current
                                  </div>
                                  <div className="mt-1 text-sm font-extrabold text-blue-700">
                                    {inr(row.currentDue)}
                                  </div>
                                </div>

                                <div className="rounded-xl bg-indigo-50 px-2 py-2">
                                  <div className="text-[10px] font-bold uppercase text-indigo-600">
                                    Total
                                  </div>
                                  <div className="mt-1 text-sm font-extrabold text-indigo-700">
                                    {inr(row.totalDue)}
                                  </div>
                                </div>
                              </div>

                              {/* ACTIONS */}
                              <div className="flex flex-wrap gap-2 lg:justify-end">

                                <button
                                  onClick={() => sendWhatsApp(row)}
                                  disabled={!row.student.phone}
                                  className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-extrabold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <MessageCircle size={15} />
                                  WhatsApp
                                </button>

                                {row.selectedMonthDue > 0 && (
                                  <button
                                    onClick={() =>
                                      markPreviousPaid(row)
                                    }
                                    disabled={
                                      processingId === row.student.id
                                    }
                                    className="flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-extrabold text-white hover:bg-indigo-700 disabled:opacity-50"
                                  >
                                    <CheckCircle2 size={15} />

                                    {processingId === row.student.id
                                      ? "Saving..."
                                      : `Mark ${monthLabel(
                                          selectedMonth
                                        ).split(" ")[0]} Paid`}
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* MESSAGE PREVIEW */}
                            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                              <b className="text-slate-700">
                                WhatsApp amount:
                              </b>{" "}
                              {inr(row.totalDue)}
                              {" — "}
                              Previous {inr(row.previousDue)}
                              {" + "}
                              Current {inr(row.currentDue)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* FOOTER */}
            <div className="border-t bg-white px-5 py-4">
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
                  onClick={() => setOpen(false)}
                  className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-extrabold text-white hover:bg-slate-800"
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
