import React, { useMemo } from "react";
import {
  CreditCard,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { useData } from "@/lib/store";
import { inr, monthLabel } from "@/lib/calc";

const isRazorpayPayment = (payment) => {
  const method = String(
    payment?.payment_method || ""
  ).toLowerCase();

  const paymentId = payment?.razorpay_payment_id;
  const note = String(payment?.note || "").toLowerCase();

  return (
    method.startsWith("razorpay") ||
    (typeof paymentId === "string" &&
      paymentId.trim() !== "") ||
    note.includes("razorpay")
  );
};

const displayMonth = (month) => {
  if (!month) return "Month not recorded";

  try {
    if (/^\d{4}-\d{2}$/.test(String(month))) {
      return monthLabel(String(month));
    }
  } catch {}

  return String(month);
};

const displayDate = (payment) => {
  const value =
    payment?.payment_date || payment?.created_at;

  if (!value) return "Date not recorded";

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getClassDetails = (student, batches) => {
  const batch = batches.find(
    (item) =>
      String(item?.id) === String(student?.batch_id) ||
      String(item?._id) === String(student?.batch_id)
  );

  const board =
    student?.board ||
    student?.school_board ||
    batch?.board ||
    "";

  const className =
    student?.class_name ||
    student?.class ||
    student?.class_id ||
    batch?.name ||
    batch?.class_name ||
    "";

  return [
    board,
    className
      ? `Class ${String(className).replace(
          /^class\s*/i,
          ""
        )}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ") || "Class details unavailable";
};

export const RazorpayPayments = () => {
  const {
    students = [],
    payments = [],
    batches = [],
    refresh,
    refreshing,
  } = useData();

  const rows = useMemo(() => {
    const studentById = new Map(
      students.map((student) => [
        String(student.id ?? student._id),
        student,
      ])
    );

    return payments
      .filter(isRazorpayPayment)
      .map((payment) => {
        const student = studentById.get(
          String(payment.student_id)
        );

        return {
          payment,
          studentName:
            student?.name || "Student not matched",
          classDetails: student
            ? getClassDetails(student, batches)
            : "Student details unavailable",
        };
      })
      .sort((a, b) => {
        const dateA = new Date(
          a.payment.payment_date ||
            a.payment.created_at ||
            0
        ).getTime();

        const dateB = new Date(
          b.payment.payment_date ||
            b.payment.created_at ||
            0
        ).getTime();

        return dateB - dateA;
      });
  }, [students, payments, batches]);

  const total = rows.reduce(
    (sum, row) =>
      sum + (Number(row.payment.amount) || 0),
    0
  );

  return (
    <div
      className="space-y-5"
      data-testid="razorpay-payments-page"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="h-12 w-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
          <CreditCard size={24} />
        </div>

        <div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Razorpay Payments
          </h2>

          <p className="mt-1 text-slate-500">
            Student details for payments recorded through Razorpay only
          </p>
        </div>

        <button
          onClick={refresh}
          disabled={refreshing}
          className="ml-auto btn-press inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 h-11 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw
            size={16}
            className={
              refreshing ? "animate-spin" : ""
            }
          />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white p-5 border border-slate-100 soft-shadow">
          <div className="text-sm text-slate-500">
            Razorpay payment entries
          </div>

          <div className="mt-1 text-2xl font-extrabold text-slate-900">
            {rows.length}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 border border-slate-100 soft-shadow sm:col-span-2">
          <div className="text-sm text-slate-500">
            Total of listed payment entries
          </div>

          <div className="mt-1 text-2xl font-extrabold text-slate-900">
            {inr(total)}
          </div>

          <div className="mt-1 text-xs text-slate-500">
            Multi-month payments may have one ledger entry per month.
          </div>
        </div>
      </div>

      <div className="rounded-3xl bg-white border border-slate-100 soft-shadow overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-8 text-center">
            <CreditCard
              size={32}
              className="mx-auto text-slate-300"
            />

            <div className="mt-3 font-bold text-slate-800">
              No recorded Razorpay payments found
            </div>

            <p className="mt-1 text-sm text-slate-500">
              Only existing payment records identified as Razorpay are shown here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map(
              (
                {
                  payment,
                  studentName,
                  classDetails,
                },
                index
              ) => (
                <div
                  key={
                    payment.id ||
                    `${payment.razorpay_payment_id || "razorpay"}-${payment.month || "month"}-${index}`
                  }
                  className="p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="h-10 w-10 shrink-0 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
                      {studentName ===
                      "Student not matched"
                        ? "?"
                        : studentName
                            .trim()
                            .charAt(0)
                            .toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900">
                        {studentName}
                      </div>

                      <div className="mt-0.5 text-sm text-slate-500">
                        {classDetails}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-lg font-extrabold text-slate-900">
                        {inr(
                          Number(payment.amount) || 0
                        )}
                      </div>

                      <div className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 size={13} />
                        Recorded
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                    <span>
                      {displayMonth(payment.month)}
                    </span>

                    <span>
                      {displayDate(payment)}
                    </span>
                  </div>

                  {payment.razorpay_payment_id && (
                    <div className="mt-2 text-xs text-slate-400 break-all">
                      Payment ID:{" "}
                      {payment.razorpay_payment_id}
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500">
        This page displays existing ledger records. It does not independently contact Razorpay to verify payment status.
      </p>
    </div>
  );
};
