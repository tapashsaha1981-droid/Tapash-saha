import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "@/lib/store";
import {
  dashboardStats,
  monthLabel,
  shiftMonth,
  currentMonth,
  inr,
  studentMonthStats,
  indexPayments,
  paysFor,
} from "@/lib/calc";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Download,
  Upload,
  Megaphone,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { StatCard } from "@/components/StatCard";
import { PaymentOverview } from "@/components/PaymentOverview";
import {
  OrganisationCard,
  AutoAdvanceCard,
} from "@/components/SettingsCards";
import { RecentActivity } from "@/components/RecentActivity";
import { useBackup } from "@/lib/useBackup";
import { toast } from "sonner";
import { api } from "@/lib/api";

export const Dashboard = () => {
  const {
    batches,
    students,
    payments,
    events,
    importAll,
    settings,
    activities,
    saveSettings,
    refresh,
    refreshing,
  } = useData();

  const navigate = useNavigate();

  const [month, setMonth] = useState(currentMonth());
  const [mode, setMode] = useState("monthly");
  const [reminderBatchPickerOpen, setReminderBatchPickerOpen] = useState(false);
  const [reminderBatchConfirmOpen, setReminderBatchConfirmOpen] = useState(false);
  const [selectedReminderBatchId, setSelectedReminderBatchId] = useState("");
  const [pendingPreviewOpen, setPendingPreviewOpen] = useState(false);
  const [pendingPreviewRows, setPendingPreviewRows] = useState([]);
  const [pendingSending, setPendingSending] = useState(false);

  const sortedReminderBatches = useMemo(
    () => [...(Array.isArray(batches) ? batches : [])].sort((a, b) =>
      String(a?.name || "").localeCompare(String(b?.name || ""), undefined, { numeric: true, sensitivity: "base" })
    ),
    [batches]
  );

  // Build a preview of every student's outstanding months through the current month.
  const openPendingFeesPreview = () => {
    const throughMonth = currentMonth();
    const rows = students.map((student) => {
      const phone = String((student.parent_phone || "").trim() || (student.phone || "").trim()).trim();
      const joinMonth = String(student.join_month || throughMonth).slice(0, 7);
      if (!phone || !/^\d{4}-(0[1-9]|1[0-2])$/.test(joinMonth) || joinMonth > throughMonth) return null;
      const studentPayments = payments.filter((payment) => String(payment.student_id) === String(student.id));
      const pendingMonths = [];
      let total = 0;
      let cursor = joinMonth;
      while (cursor <= throughMonth) {
        const monthPayments = studentPayments.filter((payment) => String(payment.month || "").slice(0, 7) === cursor);
        const feeSnapshot = monthPayments.reduce((fee, payment) => Math.max(fee, Number(payment.fee_snapshot || 0)), 0);
        const fee = feeSnapshot > 0 ? feeSnapshot : Number(student.monthly_fee || 0);
        const paid = monthPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        const due = Math.max(0, fee - paid);
        if (due > 0) {
          pendingMonths.push({ key: cursor, label: monthLabel(cursor), due });
          total += due;
        }
        cursor = shiftMonth(cursor, 1);
      }
      if (!pendingMonths.length) return null;
      return { student, id: String(student.id), name: student.name || student.student_name || "Unnamed student", months: pendingMonths, total };
    }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

    if (!rows.length) {
      toast.info("No students with pending fees and a phone number were found.", { duration: Infinity, closeButton: true });
      return;
    }
    setPendingPreviewRows(rows);
    setPendingPreviewOpen(true);
  };

  const sendPendingFeesReminders = async () => {
    setPendingSending(true);
    const throughMonth = currentMonth();
    const combined = { sent: [], skipped: [], failed: [] };
    const studentIds = pendingPreviewRows.map((row) => row.id);
    try {
      for (let offset = 0; offset < studentIds.length; offset += 200) {
        const batchIds = studentIds.slice(offset, offset + 200);
        try {
          const result = await api.sendWhatsAppFeeReminders(throughMonth, batchIds);
          ["sent", "skipped", "failed"].forEach((key) => {
            if (Array.isArray(result?.[key])) combined[key].push(...result[key]);
          });
        } catch (error) {
          const detail = error?.response?.data?.detail;
          const message = typeof detail === "string" ? detail : detail?.message || error?.message || "Batch request failed.";
          combined.failed.push(...batchIds.map((studentId) => ({ student_id: studentId, error: message })));
        }
      }
      setPendingPreviewOpen(false);
      toast.success(`Pending-fee reminders: Sent/accepted ${combined.sent.length}, skipped ${combined.skipped.length}, failed ${combined.failed.length}. Meta acceptance does not confirm delivery.`, { duration: Infinity, closeButton: true });
      if (combined.skipped.length) toast.info(`Skipped: ${combined.skipped.length}. These students were not sent a reminder.`, { duration: Infinity, closeButton: true });
      if (combined.failed.length) {
        const firstError = combined.failed[0]?.error;
        toast.error(`Failed: ${combined.failed.length}.${firstError ? ` First error: ${firstError}` : " Check backend logs for details."}`, { duration: Infinity, closeButton: true });
      }
    } finally {
      setPendingSending(false);
    }
  };

  // Monthly Collection popup
  const [monthlyReportOpen, setMonthlyReportOpen] = useState(false);
  const [reportMonth, setReportMonth] = useState(currentMonth());

  const {
    fileRef,
    importOpen,
    setImportOpen,
    exportJSON,
    onImportPick,
    doImport,
  } = useBackup({
    batches,
    students,
    payments,
    events,
    importAll,
  });

  const paymentsIndex = useMemo(
    () => indexPayments(payments),
    [payments]
  );

  const stats = useMemo(
    () =>
      dashboardStats(
        students,
        batches,
        paymentsIndex,
        month
      ),
    [students, batches, paymentsIndex, month]
  );

  // Today's collection
  const today = (() => {
    const d = new Date();
    const year = d.getFullYear();
    const monthNumber = String(
      d.getMonth() + 1
    ).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    return `${year}-${monthNumber}-${day}`;
  })();

  const todaysPayments = useMemo(
    () =>
      payments.filter((p) => {
        const paymentDate =
          p.payment_date ||
          p.paid_at ||
          p.date;

        return (
          paymentDate &&
          paymentDate.slice(0, 10) === today
        );
      }),
    [payments, today]
  );

  const todaysCollection = useMemo(
    () =>
      todaysPayments.reduce(
        (total, p) =>
          total + Number(p.amount || 0),
        0
      ),
    [todaysPayments]
  );

  const todaysPaymentCount =
    todaysPayments.length;

  // Send reminders for one selected tutorial batch at a time.
  // The user selects and confirms the batch in the dashboard UI.
  // If a batch has more than 200 eligible students, split it into API-safe requests.
  const remindAllUnpaid = async () => {
    const selectedBatch = sortedReminderBatches.find(
      (batch) => String(batch.id) === String(selectedReminderBatchId)
    );
    if (!selectedBatch) {
      toast.error("Please select a tutorial batch first.");
      return;
    }
    setReminderBatchConfirmOpen(false);
    setReminderBatchPickerOpen(false);
    const throughMonth = currentMonth();
    const eligibleStudents = students.filter((student) => {
      if (String(student.batch_id) !== String(selectedBatch.id)) return false;

      const phone = String(
        (student.parent_phone || "").trim() ||
        (student.phone || "").trim()
      ).trim();
      const joinMonth = String(student.join_month || throughMonth).slice(0, 7);

      if (
        !phone ||
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(joinMonth) ||
        joinMonth > throughMonth
      ) return false;

      const studentPayments = payments.filter(
        (payment) => String(payment.student_id) === String(student.id)
      );
      let outstanding = 0;
      let cursor = joinMonth;

      while (cursor <= throughMonth) {
        const monthPayments = studentPayments.filter(
          (payment) => String(payment.month || "").slice(0, 7) === cursor
        );
        const feeSnapshot = monthPayments.reduce(
          (fee, payment) => Math.max(fee, Number(payment.fee_snapshot || 0)),
          0
        );
        const monthlyFee = feeSnapshot > 0
          ? feeSnapshot
          : Number(student.monthly_fee || 0);
        const paid = monthPayments.reduce(
          (sum, payment) => sum + Number(payment.amount || 0),
          0
        );
        outstanding += Math.max(0, monthlyFee - paid);
        cursor = shiftMonth(cursor, 1);
      }

      return outstanding > 0;
    });

    if (eligibleStudents.length === 0) {
      toast.info(`No students with outstanding fees and a phone number were found in ${selectedBatch.name || "the selected batch"}.`);
      return;
    }

    // The confirmation dialog is shown in the dashboard before this function runs.

    const combined = { sent: [], skipped: [], failed: [] };
    const studentIds = eligibleStudents.map((student) => String(student.id));
    const batchSize = 200;

    for (let offset = 0; offset < studentIds.length; offset += batchSize) {
      const batchIds = studentIds.slice(offset, offset + batchSize);
      try {
        const batchResult = await api.sendWhatsAppFeeReminders(throughMonth, batchIds);
        ["sent", "skipped", "failed"].forEach((key) => {
          if (Array.isArray(batchResult?.[key])) combined[key].push(...batchResult[key]);
        });
      } catch (batchError) {
        const detail = batchError?.response?.data?.detail;
        const message = typeof detail === "string"
          ? detail
          : detail?.message || batchError?.message || "Batch request failed.";
        combined.failed.push(
          ...batchIds.map((studentId) => ({ student_id: studentId, error: message }))
        );
      }
    }

    toast.success(
      `${selectedBatch.name || "Selected batch"} reminders: Sent/accepted ${combined.sent.length}, skipped ${combined.skipped.length}, failed ${combined.failed.length}. Meta acceptance does not confirm delivery.`,
      { duration: Infinity, closeButton: true }
    );
    if (combined.skipped.length > 0) {
      toast.info(`Skipped: ${combined.skipped.length}. These students were not sent a reminder.`, { duration: Infinity, closeButton: true });
    }
    if (combined.failed.length > 0) {
      const firstError = combined.failed[0]?.error;
      toast.error(
        firstError ? `First failure: ${firstError}` : "Some reminders failed. Check backend logs.",
        { duration: Infinity, closeButton: true }
      );
    }
  };

  /*
   * MONTHLY COLLECTION REPORT
   *
   * Creates the class-wise monthly collection
   * data for the popup.
   */
  const monthlyReport = useMemo(() => {
    const activeStudents = students.filter(
      (student) =>
        (student.join_month || reportMonth) <=
        reportMonth
    );

    const studentRows = activeStudents.map(
      (student) => {
        const st = studentMonthStats(
          student,
          paysFor(
            paymentsIndex,
            student.id
          ),
          reportMonth
        );

        return {
          student,
          fee: Number(st.fee || 0),
          paid: Number(
            st.paidThisMonth || 0
          ),
          status: st.status,
        };
      }
    );

    let paidCount = 0;
    let partialCount = 0;
    let unpaidCount = 0;
    let collected = 0;
    let expected = 0;

    studentRows.forEach((row) => {
      expected += row.fee;
      collected += row.paid;

      if (row.status === "paid") {
        paidCount++;
      } else if (
        row.status === "partial"
      ) {
        partialCount++;
      } else {
        unpaidCount++;
      }
    });

    const rows = batches
      .map((batch) => {
        const batchStudents =
          studentRows.filter(
            (row) =>
              row.student.batch_id ===
              batch.id
          );

        if (batchStudents.length === 0) {
          return null;
        }

        const batchExpected =
          batchStudents.reduce(
            (sum, row) =>
              sum + row.fee,
            0
          );

        const batchCollected =
          batchStudents.reduce(
            (sum, row) =>
              sum + row.paid,
            0
          );

        const batchPaid =
          batchStudents.filter(
            (row) =>
              row.status === "paid"
          ).length;

        const batchPartial =
          batchStudents.filter(
            (row) =>
              row.status === "partial"
          ).length;

        const batchUnpaid =
          batchStudents.filter(
            (row) =>
              row.status === "unpaid"
          ).length;

        const rate =
          batchExpected > 0
            ? Math.round(
                (batchCollected /
                  batchExpected) *
                  100
              )
            : 0;

        return {
          id: batch.id,
          name: batch.name,
          expected: batchExpected,
          collected: batchCollected,
          rate,
          paid: batchPaid,
          partial: batchPartial,
          unpaid: batchUnpaid,
        };
      })
      .filter(Boolean);

    // Students without a valid batch
    const knownBatchIds = new Set(
      batches.map((b) => b.id)
    );

    const otherStudents =
      studentRows.filter(
        (row) =>
          !knownBatchIds.has(
            row.student.batch_id
          )
      );

    if (otherStudents.length > 0) {
      const otherExpected =
        otherStudents.reduce(
          (sum, row) =>
            sum + row.fee,
          0
        );

      const otherCollected =
        otherStudents.reduce(
          (sum, row) =>
            sum + row.paid,
          0
        );

      rows.push({
        id: "other",
        name: "OTHER",
        expected: otherExpected,
        collected: otherCollected,
        rate:
          otherExpected > 0
            ? Math.round(
                (otherCollected /
                  otherExpected) *
                  100
              )
            : 0,
        paid: otherStudents.filter(
          (row) =>
            row.status === "paid"
        ).length,
        partial: otherStudents.filter(
          (row) =>
            row.status === "partial"
        ).length,
        unpaid: otherStudents.filter(
          (row) =>
            row.status === "unpaid"
        ).length,
      });
    }

    const collectionRate =
      expected > 0
        ? Math.round(
            (collected / expected) *
              100
          )
        : 0;

    return {
      rows,
      collected,
      expected,
      collectionRate,
      paidCount,
      partialCount,
      unpaidCount,
    };
  }, [
    students,
    batches,
    paymentsIndex,
    reportMonth,
  ]);

  const openMonthlyReport = () => {
    setReportMonth(month);
    setMonthlyReportOpen(true);
  };

  return (
    <>
      <div
        className="space-y-6"
        data-testid="dashboard-page"
      >
        {/* HEADER */}
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
              Dashboard
            </h2>

            <div className="mt-2 inline-flex items-center gap-1 bg-white rounded-2xl border border-slate-200 p-1">
              <button
                data-testid="month-prev"
                onClick={() =>
                  setMonth(
                    shiftMonth(
                      month,
                      -1
                    )
                  )
                }
                className="btn-press h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100"
              >
                <ChevronLeft
                  size={18}
                />
              </button>

              <div
                className="px-3 font-semibold text-slate-900 min-w-[140px] text-center"
                data-testid="dashboard-month-label"
              >
                {monthLabel(month)}
              </div>

              <button
                data-testid="month-next"
                onClick={() =>
                  setMonth(
                    shiftMonth(
                      month,
                      1
                    )
                  )
                }
                className="btn-press h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100"
              >
                <ChevronRight
                  size={18}
                />
              </button>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              data-testid="refresh-dashboard"
              aria-label="Refresh data"
              onClick={refresh}
              disabled={refreshing}
              variant="outline"
              className="gap-2"
            >
              <RefreshCw
                size={16}
                className={
                  refreshing
                    ? "animate-spin"
                    : ""
                }
              />
              {refreshing
                ? "Refreshing..."
                : "Refresh"}
            </Button>

            <Button
              variant="outline"
              onClick={openPendingFeesPreview}
              className="gap-2"
              data-testid="send-pending-fees-reminders"
            >
              <Megaphone size={16} />
              Send Pending Fees Reminders
            </Button>

            <Button
              onClick={() => {
                if (sortedReminderBatches.length === 0) {
                  toast.error("No tutorial batches were found.");
                  return;
                }
                setReminderBatchPickerOpen(true);
              }}
              className="gap-2"
            >
              <Megaphone
                size={16}
              />
              Remind All Unpaid
            </Button>

            <Button
              variant="outline"
              onClick={exportJSON}
              className="gap-2"
            >
              <Download
                size={16}
              />
              Export JSON
            </Button>

            <Button
              variant="outline"
              onClick={() =>
                setImportOpen(true)
              }
              className="gap-2"
            >
              <Upload
                size={16}
              />
              Import JSON
            </Button>
          </div>
        </div>

        {/* MONTHLY / OVERALL */}
        <div className="inline-flex bg-white rounded-2xl border border-slate-200 p-1">
          <button
            data-testid="mode-monthly"
            onClick={() => setMode("monthly")}
            className={`px-4 py-1.5 rounded-xl text-sm font-semibold ${
              mode === "monthly"
                ? "bg-indigo-600 text-white"
                : "text-slate-600"
            }`}
          >
            Monthly
          </button>

          <button
            data-testid="mode-overall"
            onClick={() => setMode("overall")}
            className={`px-4 py-1.5 rounded-xl text-sm font-semibold ${
              mode === "overall"
                ? "bg-indigo-600 text-white"
                : "text-slate-600"
            }`}
          >
            Overall
          </button>
        </div>

        {/* MAIN DASHBOARD CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard testid="stat-students" emoji="🎓" value={stats.students}
            label="Students This Month" tint="bg-indigo-100" valueCls="text-indigo-700" />
          <StatCard testid="stat-batches" emoji="📚" value={stats.batches}
            label="Total Batches" tint="bg-violet-100" valueCls="text-violet-700" />
          <StatCard testid="stat-collected" emoji="✅" value={inr(stats.collected)}
            label="Collected This Month" tint="bg-emerald-100" valueCls="text-emerald-600" />
          <StatCard testid="stat-pending" emoji="⌛" value={inr(stats.pending)}
            label="Pending This Month" tint="bg-amber-100" valueCls="text-amber-600" />
        </div>

        {/* TODAY'S COLLECTION */}
        <div data-testid="stat-today-collection"
          className="rounded-3xl bg-white border border-slate-100 shadow-sm p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-emerald-100 flex items-center justify-center text-3xl shrink-0">
              💰
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Today's Collection
              </div>
              <div className="mt-1 text-3xl sm:text-4xl font-extrabold text-emerald-600">
                {inr(todaysCollection)}
              </div>
              <div className="mt-1 text-sm sm:text-base text-slate-500">
                {todaysPaymentCount} {todaysPaymentCount === 1 ? "payment" : "payments"} received today
              </div>
            </div>
          </div>
        </div>

        {/* PAYMENT OVERVIEW */}
        <PaymentOverview paid={stats.paid} partial={stats.partial} unpaid={stats.unpaid} />

        {/* MONTHLY REVIEW BUTTON */}
        <button data-testid="check-monthly-overview" onClick={openMonthlyReport}
          className="btn-press w-full rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 text-base sm:text-lg flex items-center justify-center gap-2 shadow-md">
          📊 Check Monthly Overview
        </button>

        {/* ORGANISATION */}
        <OrganisationCard value={settings?.org_name} onSave={saveSettings} />

        {/* AUTO MONTH ADVANCE */}
        <AutoAdvanceCard
          value={settings?.auto_advance_day}
          onSave={saveSettings}
          onPreview={() => navigate("/students")}
        />

        {/* RECENT ACTIVITY */}
        <RecentActivity activities={activities} />

        {/* FEE REMINDER BATCH PICKER */}
        {reminderBatchPickerOpen && (
          <div
            className="fixed inset-0 z-[110] bg-slate-900/55 backdrop-blur-[2px] flex items-center justify-center p-4"
            onClick={() => setReminderBatchPickerOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="reminder-batch-title"
              className="w-full max-w-md rounded-3xl bg-white p-5 sm:p-6 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <h2 id="reminder-batch-title" className="text-xl font-extrabold text-slate-900">
                Choose Fee Reminder Batch
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Select one batch. The list is sorted numerically.
              </p>
              <label htmlFor="reminder-batch-select" className="mt-4 block text-sm font-semibold text-slate-700">
                Tutorial batch
              </label>
              <select
                id="reminder-batch-select"
                value={selectedReminderBatchId}
                onChange={(event) => setSelectedReminderBatchId(event.target.value)}
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select a batch…</option>
                {sortedReminderBatches.map((batch) => (
                  <option key={String(batch.id)} value={String(batch.id)}>
                    {batch.name || "Unnamed batch"}
                  </option>
                ))}
              </select>
              <div className="mt-5 flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setReminderBatchPickerOpen(false)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  disabled={!selectedReminderBatchId}
                  onClick={() => {
                    setReminderBatchPickerOpen(false);
                    setReminderBatchConfirmOpen(true);
                  }}
                >
                  Continue
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* CONFIRM SELECTED FEE REMINDER BATCH */}
        {reminderBatchConfirmOpen && (
          <div
            className="fixed inset-0 z-[111] bg-slate-900/55 backdrop-blur-[2px] flex items-center justify-center p-4"
            onClick={() => setReminderBatchConfirmOpen(false)}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="reminder-batch-confirm-title"
              className="w-full max-w-md rounded-3xl bg-white p-5 sm:p-6 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <h2 id="reminder-batch-confirm-title" className="text-xl font-extrabold text-slate-900">
                Confirm Fee Reminder
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Send WhatsApp fee reminders only to students with outstanding fees in <strong>{sortedReminderBatches.find((batch) => String(batch.id) === String(selectedReminderBatchId))?.name || "the selected batch"}</strong>?
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Only students with a positive outstanding balance and a phone number will be included. Parent phone is used first when available. Please do not retry if a request times out until you check which messages were sent.
              </p>
              <div className="mt-5 flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setReminderBatchConfirmOpen(false)}>
                  Cancel
                </Button>
                <Button className="flex-1" onClick={remindAllUnpaid}>
                  Confirm &amp; Send
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ALL-CLASS PENDING FEES PREVIEW */}
        {pendingPreviewOpen && (
          <div className="fixed inset-0 z-[112] bg-slate-900/55 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-5" onClick={() => !pendingSending && setPendingPreviewOpen(false)}>
            <div role="dialog" aria-modal="true" aria-labelledby="pending-fees-title" className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="p-5 sm:p-6 border-b border-slate-100">
                <h2 id="pending-fees-title" className="text-xl sm:text-2xl font-extrabold text-slate-900">Pending Fees WhatsApp Reminders</h2>
                <p className="mt-2 text-sm text-slate-500">All classes · Includes every pending month, including the current month. Review before sending.</p>
              </div>
              <div className="max-h-[55vh] overflow-auto px-5 sm:px-6">
                <table className="w-full text-sm text-left">
                  <thead className="sticky top-0 bg-white border-b border-slate-200"><tr><th className="py-3 pr-3 font-bold">Student</th><th className="py-3 pr-3 font-bold">Months</th><th className="py-3 text-right font-bold">Total Fees</th></tr></thead>
                  <tbody>{pendingPreviewRows.map((row) => <tr key={row.id} className="border-b border-slate-100 align-top"><td className="py-3 pr-3 font-medium">{row.name}</td><td className="py-3 pr-3">{row.months.map((item) => item.label).join(", ")}</td><td className="py-3 text-right whitespace-nowrap">{inr(row.total)}</td></tr>)}</tbody>
                  <tfoot className="sticky bottom-0 bg-slate-50"><tr><td colSpan={2} className="py-3 pr-3 font-extrabold">{pendingPreviewRows.length} students</td><td className="py-3 text-right font-extrabold whitespace-nowrap">{inr(pendingPreviewRows.reduce((sum, row) => sum + row.total, 0))}</td></tr></tfoot>
                </table>
              </div>
              <div className="p-5 sm:p-6 flex flex-col-reverse sm:flex-row gap-3 border-t border-slate-100">
                <Button variant="outline" className="flex-1" disabled={pendingSending} onClick={() => setPendingPreviewOpen(false)}>Cancel</Button>
                <Button className="flex-1" disabled={pendingSending || pendingPreviewRows.length === 0} onClick={sendPendingFeesReminders}>{pendingSending ? "Sending…" : `Confirm & Send to ${pendingPreviewRows.length} Students`}</Button>
              </div>
            </div>
          </div>
        )}

        {/* IMPORT CONFIRM */}
        <ConfirmDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          title="Import Backup?"
          description="Importing this backup will replace the current data. Continue?"
          confirmLabel="Replace Data"
          onConfirm={doImport}
          danger
        />
      </div>

      {/* =====================================================
          MONTHLY COLLECTION POPUP
          ===================================================== */}
      {monthlyReportOpen && (
        <div
          className="fixed inset-0 z-[100] bg-slate-900/55 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-5"
          onClick={() =>
            setMonthlyReportOpen(false)
          }
        >
          <div
            className="relative w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-3xl bg-white shadow-2xl"
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            {/* MODAL HEADER */}
            <div className="px-5 pt-5 sm:px-7 sm:pt-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                    ⚠️ Low Collection Month
                  </h2>

                  <p className="mt-1 text-sm text-slate-400">
                    {monthLabel(
                      reportMonth
                    )}{" "}
                    — Monthly Report
                  </p>
                </div>

                <button
                  onClick={() =>
                    setMonthlyReportOpen(
                      false
                    )
                  }
                  className="h-10 w-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 shrink-0"
                  aria-label="Close monthly report"
                >
                  <X size={18} />
                </button>
              </div>

              {/* REPORT MONTH SELECTOR */}
              <div className="mt-4 rounded-2xl border-2 border-slate-100 p-1.5 flex items-center justify-between">
                <button
                  onClick={() =>
                    setReportMonth(
                      shiftMonth(
                        reportMonth,
                        -1
                      )
                    )
                  }
                  className="h-10 w-10 rounded-xl bg-slate-50 hover:bg-slate-100 flex items-center justify-center"
                  aria-label="Previous report month"
                >
                  <ChevronLeft
                    size={19}
                  />
                </button>

                <div className="font-bold text-slate-800 text-base sm:text-lg">
                  {monthLabel(
                    reportMonth
                  )}
                </div>

                <button
                  onClick={() =>
                    setReportMonth(
                      shiftMonth(
                        reportMonth,
                        1
                      )
                    )
                  }
                  className="h-10 w-10 rounded-xl bg-slate-50 hover:bg-slate-100 flex items-center justify-center"
                  aria-label="Next report month"
                >
                  <ChevronRight
                    size={19}
                  />
                </button>
              </div>
            </div>

            {/* SCROLLABLE REPORT CONTENT */}
            <div className="overflow-y-auto max-h-[calc(92vh-150px)] px-5 pb-6 sm:px-7">
              {/* COLLECTION SUMMARY */}
              <div className="mt-5 rounded-2xl bg-indigo-50 px-4 py-6 sm:px-6 text-center">
                <div className="text-5xl sm:text-6xl font-extrabold text-indigo-600">
                  {
                    monthlyReport.collectionRate
                  }
                  %
                </div>

                <div className="mt-1 text-base sm:text-lg font-bold text-slate-600">
                  Collection Rate
                </div>

                <div className="mt-1 text-sm sm:text-base text-slate-400">
                  {inr(
                    monthlyReport.collected
                  )}{" "}
                  collected
                  <span className="mx-2">
                    /
                  </span>
                  {inr(
                    monthlyReport.expected
                  )}{" "}
                  expected
                </div>
              </div>

              {/* MESSAGE */}
              <p className="mt-5 px-1 text-center text-sm sm:text-base leading-6 text-slate-600">
                Only{" "}
                <strong>
                  {
                    monthlyReport.collectionRate
                  }
                  %
                </strong>{" "}
                collected in{" "}
                <strong>
                  {monthLabel(
                    reportMonth
                  )}
                </strong>
                .{" "}
                <strong>
                  {
                    monthlyReport.unpaidCount
                  }
                </strong>{" "}
                students haven't paid at all.
                Send reminders and recover your
                dues.
              </p>

              {/* STATUS PILLS */}
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <div className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-700">
                  ✅{" "}
                  {
                    monthlyReport.paidCount
                  }{" "}
                  Paid
                </div>

                <div className="rounded-full bg-amber-100 px-4 py-2 text-sm font-bold text-amber-700">
                  ⚠️{" "}
                  {
                    monthlyReport.partialCount
                  }{" "}
                  Partial
                </div>

                <div className="rounded-full bg-red-100 px-4 py-2 text-sm font-bold text-red-600">
                  ❌{" "}
                  {
                    monthlyReport.unpaidCount
                  }{" "}
                  Unpaid
                </div>
              </div>

              {/* BATCH-WISE COLLECTION */}
              <div className="mt-5 border-t border-slate-100">
                {monthlyReport.rows.map(
                  (row) => (
                    <div
                      key={String(
                        row.id
                      )}
                      className="py-4 border-b border-slate-100"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="font-bold text-sm text-slate-700">
                          {row.name}
                        </div>

                        <div className="text-sm font-semibold text-slate-600">
                          <span className="mr-3">
                            {row.rate}%
                          </span>
                          {inr(
                            row.collected
                          )}{" "}
                          /{" "}
                          {inr(
                            row.expected
                          )}
                        </div>
                      </div>

                      {/* PROGRESS BAR */}
                      <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-rose-500 transition-all"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(
                                0,
                                row.rate
                              )
                            )}%`,
                          }}
                        />
                      </div>

                      {/* STATUS COUNTS */}
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm">
                        <span className="text-emerald-600">
                          ✅ {row.paid} paid
                        </span>

                        {row.partial >
                          0 && (
                          <span className="text-amber-600">
                            ⚠️{" "}
                            {
                              row.partial
                            }{" "}
                            partial
                          </span>
                        )}

                        <span className="text-red-500">
                          ❌{" "}
                          {
                            row.unpaid
                          }{" "}
                          unpaid
                        </span>
                      </div>
                    </div>
                  )
                )}
              </div>

              {/* FULL OVERVIEW */}
              <button
                onClick={() =>
                  navigate(
                    "/overview"
                  )
                }
                className="w-full pt-5 pb-1 text-center text-indigo-600 font-bold hover:text-indigo-700"
              >
                View Full Monthly Overview
                <span className="ml-2">
                  →
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
