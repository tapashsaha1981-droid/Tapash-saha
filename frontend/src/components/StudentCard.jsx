import React from "react";
import { Phone } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { inr } from "@/lib/calc";
import { cn } from "@/lib/utils";

const ActionBtn = ({ onClick, icon, label, tint, testid }) => (
  <button
    data-testid={testid}
    onClick={onClick}
    className={cn(
      "btn-press inline-flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-semibold",
      tint || "bg-slate-100 text-slate-700 hover:bg-slate-200"
    )}
  >
    <span aria-hidden>{icon}</span> {label}
  </button>
);

const AVATAR_BY_STATUS = {
  paid: "bg-emerald-100 text-emerald-700 ring-2 ring-emerald-200",
  partial: "bg-amber-100 text-amber-700 ring-2 ring-amber-200",
  unpaid: "bg-rose-100 text-rose-600 ring-2 ring-rose-200",
};

const ACCENT_BY_STATUS = {
  paid: "border-t-4 border-t-emerald-400",
  partial: "border-t-4 border-t-amber-400",
  unpaid: "border-t-4 border-t-rose-400",
};

export const StudentCard = ({ student: s, stats: st, batch, onEdit, onMarkPaid, onRemind, onMove, onHistory, onDelete }) => {
  const initial = s.name.charAt(0).toUpperCase();
  const remaining = Math.max(0, st.fee - st.paidThisMonth);
  const unpaid = st.status !== "paid";

  return (
    <div data-testid={`student-card-${s.id}`} className={cn("rounded-3xl bg-white p-5 soft-shadow card-hover", ACCENT_BY_STATUS[st.status])}>
      <div className="flex items-start gap-3">
        <div className={cn("h-12 w-12 rounded-full font-bold flex items-center justify-center shrink-0", AVATAR_BY_STATUS[st.status])}>{initial}</div>
        <div className="min-w-0 flex-1">
          <div className="font-extrabold text-slate-900">{s.name}</div>
          <a href={`tel:${s.phone}`} className="text-sm text-slate-500 inline-flex items-center gap-1 hover:text-indigo-600"><Phone size={12} /> {s.phone || "—"}</a>
          {batch && <div className="text-xs text-slate-400 mt-0.5">{batch.name}</div>}
        </div>
        <StatusBadge status={st.status} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-slate-50 p-2">
          <div className="text-[11px] text-slate-500">Total ({st.elapsed}m)</div>
          <div className="font-bold text-slate-900">{inr(st.totalDue)}</div>
        </div>
        <div className="rounded-xl bg-emerald-50 p-2">
          <div className="text-[11px] text-emerald-700">Already Paid</div>
          <div className="font-bold text-emerald-700">{inr(st.totalPaid)}</div>
        </div>
        <div className="rounded-xl bg-rose-50 p-2">
          <div className="text-[11px] text-rose-700">To Be Paid</div>
          <div className="font-bold text-rose-700">{inr(remaining)}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <ActionBtn testid={`edit-${s.id}`} onClick={onEdit} icon="✏️" label="Edit" />
        {unpaid && <ActionBtn testid={`mark-paid-${s.id}`} onClick={onMarkPaid} icon="✅" label="Mark Paid" tint="bg-emerald-600 text-white hover:bg-emerald-700" />}
        <ActionBtn testid={`remind-${s.id}`} onClick={onRemind} icon="💬" label="Remind" />
        {unpaid && <ActionBtn testid={`move-${s.id}`} onClick={onMove} icon="⇄" label="Move" />}
        <ActionBtn testid={`history-${s.id}`} onClick={onHistory} icon="📄" label="History" />
        <ActionBtn testid={`delete-${s.id}`} onClick={onDelete} icon="🗑️" label="Delete" tint="bg-rose-50 text-rose-600 hover:bg-rose-100" />
      </div>
    </div>
  );
};
