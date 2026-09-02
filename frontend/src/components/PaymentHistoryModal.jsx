import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { monthLabel, monthsElapsed, monthStatus, inr, currentMonth } from "@/lib/calc";
import dayjs from "dayjs";

const ROW_ACCENT = {
  paid: "border-l-4 border-l-emerald-400",
  partial: "border-l-4 border-l-amber-400",
  unpaid: "border-l-4 border-l-rose-400",
};

export const PaymentHistoryModal = ({ open, onClose, student, payments, onMarkPaid }) => {
  if (!student) return null;
  const now = currentMonth();
  const totalMonths = monthsElapsed(student.join_month || now, now);
  const fee = student.monthly_fee || 0;
  const studentPayments = payments.filter((p) => p.student_id === student.id);

  // Build month rows from join to now
  const rows = [];
  let m = student.join_month || now;
  for (let i = 0; i < totalMonths; i++) {
    const monthPays = studentPayments.filter((p) => p.month === m);
    const paid = monthPays.reduce((s, p) => s + p.amount, 0);
    rows.push({ month: m, paid, status: monthStatus(fee, paid), pays: monthPays });
    m = dayjs(m + "-01").add(1, "month").format("YYYY-MM");
  }
  rows.reverse();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-2xl max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Payment History — {student.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.month} className={`rounded-xl border border-slate-200 p-3 ${ROW_ACCENT[r.status] || ""}`} data-testid={`history-row-${r.month}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold text-slate-900">{monthLabel(r.month)}</div>
                <StatusBadge status={r.status} size="sm" />
              </div>
              <div className="text-sm text-slate-600 mt-1">Fee: {inr(fee)} · Paid: <span className="font-semibold text-emerald-600">{inr(r.paid)}</span></div>
              {r.pays.length > 0 && (
                <div className="mt-2 space-y-1">
                  {r.pays.map((p) => (
                    <div key={p.id} className="text-xs text-slate-500 flex justify-between">
                      <span>{p.payment_date} · {p.note || "Payment"}</span>
                      <span className="font-semibold text-slate-700">{inr(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              {r.status !== "paid" && onMarkPaid && (
                <button
                  data-testid={`history-mark-paid-${r.month}`}
                  onClick={() => onMarkPaid({ month: r.month, fee, paid: r.paid })}
                  className="btn-press mt-2.5 inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  ✅ Mark Paid
                </button>
              )}
            </div>
          ))}
          {rows.length === 0 && <div className="text-center text-slate-500 py-6">No history yet</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
};
