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
  reminderMessage,
  openWhatsApp,
  indexPayments,
  paysFor,
} from "@/lib/calc";
import {
  ChevronLeft,
  ChevronRight,
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
  } = useData();

  const navigate = useNavigate();

  const [month, setMonth] = useState(currentMonth());
  const [mode, setMode] = useState("monthly");

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

  // Remind all unpaid students
  const remindAllUnpaid = () => {
    const unpaid = students.filter((s) => {
      const st = studentMonthStats(
        s,
        paysFor(paymentsIndex, s.id),
        month
      );

      return (
        st.status !== "paid" &&
        s.phone
      );
    });

    if (unpaid.length === 0) {
      return toast.info(
        "No unpaid students with phone numbers"
      );
    }

    unpaid.forEach((s, i) => {
      const st = studentMonthStats(
        s,
        paysFor(paymentsIndex, s.id),
        month
      );

      const amount = Math.max(
        0,
        st.fee - st.paidThisMonth
      );

      setTimeout(
        () =>
          openWhatsApp(
            s.phone,
            reminderMessage(
              s,
              amount,
              month,
              settings?.org_name
            )
          ),
        i * 200
      );
    });

    toast.success(
      `Opening WhatsApp for ${unpaid.length} unpaid students`
    );
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
              data-testid="remind-all"
              onClick={
                remindAllUnpaid
              }
              className="bg-indigo-600 hover:bg-indigo-700 rounded-xl gap-2"
            >
              <Megaphone
                size={16}
              />
              Remind All Unpaid
            </Button>

            <Button
              data-testid="export-json"
              onClick={
                exportJSON
              }
              variant="outline"
              className="rounded-xl gap-2"
            >
              <Download
                size={16}
              />
              Export JSON
            </Button>

            <Button
              data-testid="import-json"
              onClick={() =>
                fileRef.current?.click()
              }
              variant="outline"
              className="rounded-xl gap-2"
            >
              <Upload
                size={16}
              />
              Import JSON
            </Button>

            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="absolute w-px h-px opacity-0 overflow-hidden pointer-events-none"
              onChange={
                onImportPick
              }
              data-testid="import-file-input"
              aria-label="Import JSON backup"
            />
          </div>
        </div>

        {/* MONTHLY / OVERALL */}
        <div className="inline-flex bg-white rounded-2xl border border-slate-200 p-1">
          <button
            data-testid="mode-monthly"
            onClick={() =>
              setMode("monthly")
            }
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
            onClick={() =>
              setMode("overall")
            }
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
          <StatCard
            testid="stat-students"
            emoji="🎓"
            value={stats.students}
            label="Students This Month"
            tint="bg-indigo-100"
            valueCls="text-indigo-700"
          />

          <StatCard
            testid="stat-batches"
            emoji="📚"
            value={stats.batches}
            label="Total Batches"
            tint="bg-violet-100"
            valueCls="text-violet-700"
          />

          <StatCard
            testid="stat-collected"
            emoji="✅"
            value={inr(
              stats.collected
            )}
            label="Collected This Month"
            tint="bg-emerald-100"
            valueCls="text-emerald-600"
          />

          <StatCard
            testid="stat-pending"
            emoji="⌛"
            value={inr(
              stats.pending
            )}
            label="Pending This Month"
            tint="bg-amber-100"
            valueCls="text-amber-600"
          />
        </div>

        {/* TODAY'S COLLECTION */}
        <div
          data-testid="stat-today-collection"
          className="rounded-3xl bg-white border border-slate-100 shadow-sm p-5 sm:p-6"
        >
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-emerald-100 flex items-center justify-center text-3xl shrink-0">
              💰
            </div>

            <div className="min-w-0">
              <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Today's Collection
              </div>

              <div className="mt-1 text-3xl sm:text-4xl font-extrabold text-emerald-600">
                {inr(
                  todaysCollection
                )}
              </div>

              <div className="mt-1 text-sm sm:text-base text-slate-500">
                {todaysPaymentCount}{" "}
                {todaysPaymentCount ===
                1
                  ? "payment"
                  : "payments"}{" "}
                received today
              </div>
            </div>
          </div>
        </div>

        {/* PAYMENT OVERVIEW */}
        <PaymentOverview
          paid={stats.paid}
          partial={stats.partial}
          unpaid={stats.unpaid}
        />

        {/* MONTHLY REVIEW BUTTON */}
        <button
          data-testid="check-monthly-overview"
          onClick={
            openMonthlyReport
          }
          className="btn-press w-full rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 text-base sm:text-lg flex items-center justify-center gap-2 shadow-md"
        >
          📊 Check Monthly Overview
        </button>

        {/* ORGANISATION */}
        <OrganisationCard
          value={settings?.org_name}
          onSave={saveSettings}
        />

        {/* AUTO MONTH ADVANCE */}
        <AutoAdvanceCard
          value={
            settings?.auto_advance_day
          }
          onSave={saveSettings}
          onPreview={() =>
            navigate("/students")
          }
        />

        {/* RECENT ACTIVITY */}
        <RecentActivity
          activities={activities}
        />

        {/* IMPORT CONFIRM */}
        <ConfirmDialog
          open={importOpen}
          onClose={() =>
            setImportOpen(false)
          }
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
