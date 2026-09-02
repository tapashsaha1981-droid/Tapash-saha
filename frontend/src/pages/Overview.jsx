import React, { useMemo, useState } from "react";
import { useData } from "@/lib/store";
import { lifetimeOverdue, inr, currentMonth, monthLabel, indexPayments, openWhatsApp, paymentConfirmationMessage } from "@/lib/calc";
import { Megaphone } from "lucide-react";
import { PaymentHistoryModal } from "@/components/PaymentHistoryModal";
import { PaymentModal } from "@/components/PaymentModal";
import { OverdueTable } from "@/components/OverdueTable";
import { toast } from "sonner";

export const Overview = () => {
  const { students, payments, settings, addPayment } = useData();
  const [historyFor, setHistoryFor] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const [limit, setLimit] = useState(100);
  const month = currentMonth();

  const confirmPayment = async (payload) => {
    const student = payFor?.s;
    await addPayment(payload);
    if (student?.phone) {
      openWhatsApp(student.phone, paymentConfirmationMessage(student, payload.amount, payload.month, settings?.org_name));
    } else {
      toast.info("Payment saved — no phone number on file for WhatsApp confirmation");
    }
  };

  const paymentsIndex = useMemo(() => indexPayments(payments), [payments, indexPayments]);
  const rows = useMemo(() => lifetimeOverdue(students, paymentsIndex, month).filter((r) => r.overdue > 0), [students, paymentsIndex, month, lifetimeOverdue]);
  const visibleRows = rows.slice(0, limit);
  const total = rows.reduce((s, r) => s + r.overdue, 0);

  const remindAll = () => {
    if (rows.length === 0) return toast.info("No overdue students");
    const orgName = settings?.org_name || "TAPASH SIR";
    rows.forEach((r, i) => {
      const s = r.student;
      if (!s.phone) return;
      const msg = `Hello ${s.name}, this is a reminder from ${orgName} regarding your outstanding tuition fee of ${inr(r.overdue)}. Please make the payment at your convenience. Thank you.`;
      setTimeout(() => openWhatsApp(s.phone, msg), i * 200);
    });
    toast.success(`Opening WhatsApp for ${rows.length} students`);
  };

  return (
    <div className="space-y-5" data-testid="overview-page">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">Overview</h2>
          <p className="text-slate-500 mt-1">All students with outstanding fees</p>
        </div>
        <button
          data-testid="remind-all-overdue"
          onClick={remindAll}
          className="ml-auto btn-press inline-flex items-center gap-2 rounded-2xl bg-indigo-600 text-white px-4 h-11 font-semibold hover:bg-indigo-700"
        >
          <Megaphone size={16} /> Remind All Overdue ({rows.length})
        </button>
      </div>

      <div className="rounded-3xl bg-white p-6 soft-shadow">
        <div className="text-xs font-bold text-slate-500 tracking-wider">LIFETIME OVERVIEW</div>
        <div className="mt-2 text-xl sm:text-2xl font-extrabold text-slate-900">{rows.length} students with outstanding fees</div>
        <div className="mt-1 text-slate-500">As of {monthLabel(month)}</div>
        <div className="mt-4">
          <div className="text-xs font-bold text-slate-500 tracking-wider">TOTAL OVERDUE</div>
          <div className="text-3xl sm:text-4xl font-extrabold text-rose-600" data-testid="total-overdue">{inr(total)}</div>
        </div>
      </div>

      <OverdueTable
        rows={rows}
        visibleRows={visibleRows}
        limit={limit}
        onShowMore={() => setLimit((l) => l + 100)}
        onRowClick={setHistoryFor}
      />

      {historyFor && (
        <PaymentHistoryModal
          open={!!historyFor}
          onClose={() => setHistoryFor(null)}
          student={historyFor}
          payments={payments}
          onMarkPaid={(row) => setPayFor({ s: historyFor, fee: row.fee, paidThisMonth: row.paid, month: row.month })}
        />
      )}

      {payFor && (
        <PaymentModal
          open={!!payFor}
          onClose={() => setPayFor(null)}
          student={payFor.s}
          month={payFor.month}
          paidThisMonth={payFor.paidThisMonth}
          fee={payFor.fee}
          onSave={confirmPayment}
        />
      )}
    </div>
  );
};
