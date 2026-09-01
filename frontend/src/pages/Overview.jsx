import React, { useMemo, useState } from "react";
import { useData } from "@/lib/store";
import { lifetimeOverdue, inr, currentMonth, monthLabel } from "@/lib/calc";
import { Megaphone, Phone } from "lucide-react";
import { PaymentHistoryModal } from "@/components/PaymentHistoryModal";
import { toast } from "sonner";

export const Overview = () => {
  const { students, payments } = useData();
  const [historyFor, setHistoryFor] = useState(null);
  const month = currentMonth();

  const rows = useMemo(() => lifetimeOverdue(students, payments, month).filter((r) => r.overdue > 0), [students, payments, month]);
  const total = rows.reduce((s, r) => s + r.overdue, 0);

  const remindAll = () => {
    if (rows.length === 0) return toast.info("No overdue students");
    rows.forEach((r, i) => {
      const s = r.student;
      if (!s.phone) return;
      const msg = `Hello ${s.name}, this is a reminder regarding your outstanding tuition fee of ${inr(r.overdue)}. Please make the payment at your convenience. Thank you.`;
      const url = `https://wa.me/${s.phone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
      setTimeout(() => window.open(url, "_blank", "noopener"), i * 200);
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

      <div className="rounded-3xl bg-white soft-shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 bg-slate-50">
                <th className="px-5 py-3 font-semibold">Student Name</th>
                <th className="px-5 py-3 font-semibold">Phone</th>
                <th className="px-5 py-3 font-semibold text-right">Overdue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.student.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setHistoryFor(r.student)} data-testid={`overdue-row-${r.student.id}`}>
                  <td className="px-5 py-3 font-semibold text-slate-900">{r.student.name}</td>
                  <td className="px-5 py-3 text-slate-600">
                    <a href={`tel:${r.student.phone}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 hover:text-indigo-600"><Phone size={12} /> {r.student.phone || "—"}</a>
                  </td>
                  <td className="px-5 py-3 text-right font-extrabold text-rose-600">{inr(r.overdue)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={3} className="text-center py-8 text-slate-500">Nothing overdue. Excellent!</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {historyFor && (
        <PaymentHistoryModal open={!!historyFor} onClose={() => setHistoryFor(null)} student={historyFor} payments={payments} />
      )}
    </div>
  );
};
