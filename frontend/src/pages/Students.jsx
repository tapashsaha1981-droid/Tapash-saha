import React, { useMemo, useState, useEffect, useRef } from "react";
import { useData } from "@/lib/store";
import { Plus, Download } from "lucide-react";
import dayjs from "dayjs";
import { StudentCard } from "@/components/StudentCard";
import { StudentsToolbar } from "@/components/StudentsToolbar";
import { StudentModals } from "@/components/StudentModals";
import {
  monthLabel,
  shiftMonth,
  currentMonth,
  studentMonthStats,
  filterStudents,
  paymentConfirmationMessage,
  openWhatsApp,
  indexPayments,
  paysFor,
  inr,
} from "@/lib/calc";
import { toast } from "sonner";

export const Students = () => {
  const {
    batches,
    students,
    payments,
    settings,
    addStudent,
    editStudent,
    removeStudent,
    moveStudent,
    addPayment,
    removePaymentsForMonth,
  } = useData();

  const [month, setMonth] = useState(currentMonth());
  const [batchFilter, setBatchFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [limit, setLimit] = useState(60);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const [moveFor, setMoveFor] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  // Build batch lookup once instead of repeatedly using batches.find().
  const batchById = useMemo(() => {
    const map = new Map();

    for (const batch of batches) {
      map.set(batch.id, batch);
    }

    return map;
  }, [batches]);

  const activeBatch =
    batchFilter === "all"
      ? null
      : batchById.get(batchFilter);

  const baseList = useMemo(
    () =>
      filterStudents(students, batches, {
        batchFilter,
        query,
      }),
    [students, batches, batchFilter, query]
  );

  const paymentsIndex = useMemo(
    () => indexPayments(payments),
    [payments]
  );

  const list = useMemo(() => {
    const withStats = baseList.map((s) => ({
      s,
      st: studentMonthStats(
        s,
        paysFor(paymentsIndex, s.id),
        month
      ),
    }));

    return statusFilter === "all"
      ? withStats
      : withStats.filter(
          ({ st }) => st.status === statusFilter
        );
  }, [
    baseList,
    paymentsIndex,
    month,
    statusFilter,
  ]);

  const visible = list.slice(0, limit);

  useEffect(() => {
    setLimit(60);
  }, [
    batchFilter,
    query,
    statusFilter,
    month,
  ]);

  const advancedRef = useRef(null);

  useEffect(() => {
    const day = settings?.auto_advance_day;
    const m = currentMonth();

    if (
      day &&
      dayjs().date() >= day &&
      advancedRef.current !== m
    ) {
      advancedRef.current = m;

      toast.info(
        `Auto-advanced to ${monthLabel(m)}`
      );
    }
  }, [settings]);

  // Find all pending months from the student's
  // join month up to the currently selected month.
  //
  // extraPayment is used immediately after saving a payment,
  // because React state may not contain the new payment yet.
  const getPendingMonths = (
    student,
    extraPayment = null
  ) => {
    const fee = Number(student.monthly_fee) || 0;

    if (fee <= 0) {
      return [];
    }

    const startMonth =
      student.join_month || month;

    const start = dayjs(
      `${startMonth}-01`
    );

    const end = dayjs(
      `${month}-01`
    );

    if (start.isAfter(end)) {
      return [];
    }

    const studentPayments = [
      ...paysFor(
        paymentsIndex,
        student.id
      ),
    ];

    // Include the payment that was just saved,
    // even if React has not updated the payments state yet.
    if (extraPayment) {
      studentPayments.push(
        extraPayment
      );
    }

    const pending = [];

    let cursor = start;

    while (
      cursor.isBefore(end) ||
      cursor.isSame(end, "month")
    ) {
      const targetMonth =
        cursor.format("YYYY-MM");

      let paid = 0;

      for (const p of studentPayments) {
        if (p.month === targetMonth) {
          paid += Number(p.amount) || 0;
        }
      }

      const remaining = Math.max(
        0,
        fee - paid
      );

      if (remaining > 0) {
        pending.push({
          month: targetMonth,
          label: monthLabel(targetMonth),
          amount: remaining,
        });
      }

      cursor = cursor.add(1, "month");
    }

    return pending;
  };

  // REMINDER:
  // Always send the reminder to the parent's phone number.
  const remind = (student, monthStats) => {
    if (!student.parent_phone) {
      return toast.error(
        "No Parent's Phone Number on file"
      );
    }

    const pendingMonths =
      getPendingMonths(student);

    if (!pendingMonths.length) {
      return toast.error(
        "No pending fee found"
      );
    }

    const totalPending =
      pendingMonths.reduce(
        (sum, item) =>
          sum + item.amount,
        0
      );

    const pendingMonthNames =
      pendingMonths
        .map((item) => item.label)
        .join(", ");

    const message = `প্রিয় অভিভাবক,

আপনার সন্তানের নিচের মাসগুলোর টিউশন ফি এখনও বকেয়া রয়েছে:

বকেয়া মাস: ${pendingMonthNames}
মোট বকেয়া: ₹${Math.round(
      totalPending
    ).toLocaleString("en-IN")}

অনুগ্রহ করে সুবিধামতো বকেয়া ফি দিয়ে দিন।
ধন্যবাদ।

— ${settings?.org_name || "TAPASH SIR"}

Dear Parent,

Your child's tuition fees for the following months are still pending:

Pending months: ${pendingMonthNames}
Total pending: ${inr(totalPending)}

Please clear the pending fees when convenient.
Thank you.

— ${settings?.org_name || "TAPASH SIR"}`;

    openWhatsApp(
      student.parent_phone,
      message
    );
  };

  // MARK PAID:
  // Automatically save the full remaining amount.
  // Do NOT open the Record Payment screen.
  // Do NOT show a WhatsApp popup.
  const markPaidDirectly = async (
    student,
    monthStats
  ) => {
    const amount = Math.max(
      0,
      Number(monthStats.fee) -
        Number(monthStats.paidThisMonth)
    );

    if (amount <= 0) {
      return;
    }

    const newPayment = {
      student_id: student.id,
      month,
      amount,
      fee_snapshot: monthStats.fee,
      note: "",
      payment_date:
        dayjs().format("YYYY-MM-DD"),
    };

    try {
      await addPayment(
        newPayment
      );

      toast.success(
        "Payment saved successfully"
      );
    } catch (error) {
      console.error(
        "Payment failed:",
        error
      );

      toast.error(
        "Could not save payment"
      );
    }
  };

  // Used when marking a payment from History,
  // where the user may still want the payment modal.
  const confirmPayment = async (
    payload
  ) => {
    try {
      await addPayment(
        payload
      );

      setPayFor(null);

      toast.success(
        "Payment saved successfully"
      );
    } catch (error) {
      console.error(
        "Payment failed:",
        error
      );

      toast.error(
        "Could not save payment"
      );
    }
  };

  // Separate Payment Confirmation button
  // Uses the parent's phone number.
  const sendPaymentConfirmation = (
    student,
    monthStats
  ) => {
    if (!student.parent_phone) {
      return toast.error(
        "No Parent's Phone Number on file"
      );
    }

    const amount =
      Number(
        monthStats.paidThisMonth
      ) || 0;

    if (amount <= 0) {
      return toast.error(
        "No payment recorded for this month"
      );
    }

    // Here the payment already exists in state,
    // so getPendingMonths() automatically sees it.
    const pendingMonths =
      getPendingMonths(student);

    const totalPending =
      pendingMonths.reduce(
        (sum, item) =>
          sum + item.amount,
        0
      );

    const pendingMonthNames =
      pendingMonths
        .map((item) => item.label)
        .join(", ");

    let message;

    if (pendingMonths.length > 0) {
      message = `প্রিয় অভিভাবক,

আপনার সন্তানের ${monthLabel(
        month
      )} মাসের টিউশন ফি বাবদ ${inr(
        amount
      )} টাকা আমরা পেয়েছি। ধন্যবাদ।

তবে নিচের মাসগুলোর ফি এখনও বকেয়া রয়েছে:

বকেয়া মাস: ${pendingMonthNames}
মোট বকেয়া: ${inr(
        totalPending
      )}

অনুগ্রহ করে সুবিধামতো বকেয়া ফি দিয়ে দিন।
ধন্যবাদ।

— ${settings?.org_name || "TAPASH SIR"}

Dear Parent,

We have received ${inr(
        amount
      )} for your child's ${monthLabel(
        month
      )} tuition fees. Thank you.

However, the fees for the following months are still pending:

Pending months: ${pendingMonthNames}
Total pending: ${inr(
        totalPending
      )}

Please clear the pending fees when convenient.
Thank you.

— ${settings?.org_name || "TAPASH SIR"}`;
    } else {
      message =
        paymentConfirmationMessage(
          student,
          amount,
          month,
          settings?.org_name
        );
    }

    openWhatsApp(
      student.parent_phone,
      message
    );
  };

  const markUnpaid = async (
    student,
    targetMonth = month
  ) => {
    const targets = payments.filter(
      (p) =>
        p.student_id === student.id &&
        p.month === targetMonth
    );

    if (!targets.length) {
      toast.error(
        `No payment found for ${targetMonth}`
      );
      return;
    }

    if (
      !window.confirm(
        `Mark ${student.name} as Unpaid for ${targetMonth}?`
      )
    ) {
      return;
    }

    await removePaymentsForMonth(
      student.id,
      targetMonth
    );

    toast.success(
      `${student.name} marked Unpaid for ${targetMonth}`
    );
  };

  const exportCSV = () => {
    const rows = [
      [
        "Student Name",
        "Phone",
        "Batch",
        "Monthly Fee",
        "Month",
        "Amount Paid",
        "Amount Due",
        "Status",
      ],
    ];

    list.forEach(({ s, st }) => {
      // Fast Map lookup instead of batches.find().
      const b = batchById.get(s.batch_id);

      rows.push([
        s.name,
        s.phone,
        b?.name || "",
        s.monthly_fee,
        month,
        st.paidThisMonth,
        Math.max(
          0,
          st.fee -
            st.paidThisMonth
        ),
        st.status,
      ]);
    });

    const csv = rows
      .map((r) =>
        r
          .map(
            (v) =>
              `"${String(v).replace(
                /"/g,
                '""'
              )}"`
          )
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv",
    });

    const url =
      URL.createObjectURL(blob);

    const a =
      document.createElement("a");

    a.href = url;
    a.download = `students-${month}.csv`;
    a.click();

    URL.revokeObjectURL(url);

    toast.success("CSV exported");
  };

  return (
    <div
      className="space-y-5"
      data-testid="students-page"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Students
          </h2>

          <p className="text-slate-500 mt-1 truncate">
            {activeBatch
              ? activeBatch.name.toUpperCase()
              : "All batches"}

            {activeBatch?.class_time
              ? ` · ${activeBatch.class_time}`
              : ""}
          </p>
        </div>

        <div className="ml-auto flex gap-2">
          <button
            data-testid="export-csv"
            onClick={exportCSV}
            className="btn-press h-11 px-3 rounded-2xl bg-white border border-slate-200 flex items-center gap-2 text-sm font-semibold hover:bg-slate-50"
          >
            <Download size={16} />
            CSV
          </button>

          <button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            data-testid="add-student-btn"
            className="btn-press h-12 w-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md hover:bg-indigo-700"
            aria-label="Add student"
          >
            <Plus size={22} />
          </button>
        </div>
      </div>

      <StudentsToolbar
        month={month}
        onShiftMonth={(d) =>
          setMonth(
            shiftMonth(month, d)
          )
        }
        batches={batches}
        batchFilter={batchFilter}
        onBatchFilter={
          setBatchFilter
        }
        query={query}
        onQuery={setQuery}
        statusFilter={statusFilter}
        onStatusFilter={
          setStatusFilter
        }
      />

      <div
        className="grid gap-4 md:grid-cols-2"
        data-testid="student-list"
      >
        {visible.map(({ s, st }) => (
          <StudentCard
            key={s.id}
            student={s}
            stats={st}
            batch={batchById.get(
              s.batch_id
            )}

            onEdit={() => {
              setEditing(s);
              setFormOpen(true);
            }}

            // IMPORTANT:
            // Mark Paid now saves directly.
            onMarkPaid={() =>
              markPaidDirectly(s, st)
            }

            onMarkUnpaid={() =>
              markUnpaid(s)
            }

            onRemind={() =>
              remind(s, st)
            }

            // Separate Payment Confirmation button.
            // This sends to the parent's phone.
            onPaymentConfirmation={() =>
              sendPaymentConfirmation(
                s,
                st
              )
            }

            onMove={() =>
              setMoveFor(s)
            }

            onHistory={() =>
              setHistoryFor(s)
            }

            onDelete={() =>
              setToDelete(s)
            }
          />
        ))}

        {visible.length === 0 && (
          <div className="col-span-full rounded-3xl bg-white p-10 text-center text-slate-500 soft-shadow">
            No students match.
          </div>
        )}
      </div>

      {list.length > limit && (
        <button
          data-testid="show-more-students"
          onClick={() =>
            setLimit(
              (l) => l + 60
            )
          }
          className="btn-press w-full rounded-2xl bg-white border border-slate-200 py-3 font-semibold text-slate-700 hover:bg-slate-50"
        >
          Show more (
          {list.length - limit}{" "}
          remaining)
        </button>
      )}

      <StudentModals
        formOpen={formOpen}
        editing={editing}
        batches={batches}
        batchFilter={batchFilter}
        onCloseForm={() =>
          setFormOpen(false)
        }
        onSaveStudent={async (
          data
        ) => {
          if (editing) {
            await editStudent(
              editing.id,
              data
            );
          } else {
            await addStudent(data);
          }
        }}
        payFor={payFor}
        onClosePay={() =>
          setPayFor(null)
        }
        onConfirmPayment={
          confirmPayment
        }
        historyFor={historyFor}
        payments={payments}
        onCloseHistory={() =>
          setHistoryFor(null)
        }
        onHistoryMarkPaid={(
          row
        ) =>
          setPayFor({
            s: historyFor,
            fee: row.fee,
            paidThisMonth:
              row.paid,
            month: row.month,
          })
        }
        moveFor={moveFor}
        onCloseMove={() =>
          setMoveFor(null)
        }
        onMove={moveStudent}
        toDelete={toDelete}
        onCloseDelete={() =>
          setToDelete(null)
        }
        onDelete={async () => {
          await removeStudent(
            toDelete.id
          );
        }}
      />
    </div>
  );
};
