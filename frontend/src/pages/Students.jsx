import React, { useMemo, useState } from "react";
import { useData } from "@/lib/store";
import { Plus, Pencil, Trash2, MessageCircle, CheckCircle2, ArrowLeftRight, FileText, Search, ChevronLeft, ChevronRight, Download, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StudentForm } from "@/components/StudentForm";
import { PaymentModal } from "@/components/PaymentModal";
import { PaymentHistoryModal } from "@/components/PaymentHistoryModal";
import { MoveStudentModal } from "@/components/MoveStudentModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { monthLabel, shiftMonth, currentMonth, inr, studentMonthStats } from "@/lib/calc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Students = () => {
  const { batches, students, payments, addStudent, editStudent, removeStudent, moveStudent, addPayment } = useData();
  const [month, setMonth] = useState(currentMonth());
  const [batchFilter, setBatchFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const [moveFor, setMoveFor] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  const activeBatch = batches.find((b) => b.id === batchFilter);

  const list = useMemo(() => {
    let filtered = students;
    if (batchFilter !== "all") filtered = filtered.filter((s) => s.batch_id === batchFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      filtered = filtered.filter((s) => {
        const b = batches.find((b) => b.id === s.batch_id);
        return s.name.toLowerCase().includes(q) || (s.phone || "").includes(q) || (b?.name.toLowerCase().includes(q));
      });
    }
    const withStats = filtered.map((s) => ({ s, st: studentMonthStats(s, payments, month) }));
    if (statusFilter !== "all") {
      return withStats.filter(({ st }) => st.status === statusFilter);
    }
    return withStats;
  }, [students, batches, payments, batchFilter, query, statusFilter, month]);

  const remind = (student, monthStats) => {
    if (!student.phone) return toast.error("No phone number on file");
    const amount = Math.max(0, monthStats.fee - monthStats.paidThisMonth);
    const msg = `Hello ${student.name}, this is a reminder regarding the tuition fee of ${inr(amount)} for ${monthLabel(month)}. Please make the payment at your convenience. Thank you.`;
    window.open(`https://wa.me/${student.phone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  };

  const exportCSV = () => {
    const rows = [["Student Name", "Phone", "Batch", "Monthly Fee", "Month", "Amount Paid", "Amount Due", "Status"]];
    list.forEach(({ s, st }) => {
      const b = batches.find((x) => x.id === s.batch_id);
      rows.push([
        s.name, s.phone, b?.name || "", s.monthly_fee,
        month, st.paidThisMonth, Math.max(0, st.fee - st.paidThisMonth), st.status,
      ]);
    });
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `students-${month}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  return (
    <div className="space-y-5" data-testid="students-page">
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">Students</h2>
          <p className="text-slate-500 mt-1 truncate">{activeBatch ? activeBatch.name.toUpperCase() : "All batches"}{activeBatch?.class_time ? ` · ${activeBatch.class_time}` : ""}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button data-testid="export-csv" onClick={exportCSV} className="btn-press h-11 px-3 rounded-2xl bg-white border border-slate-200 flex items-center gap-2 text-sm font-semibold hover:bg-slate-50"><Download size={16} /> CSV</button>
          <button
            onClick={() => { setEditing(null); setFormOpen(true); }}
            data-testid="add-student-btn"
            className="btn-press h-12 w-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md hover:bg-indigo-700"
            aria-label="Add student"
          ><Plus size={22} /></button>
        </div>
      </div>

      {/* Month nav */}
      <div className="inline-flex items-center gap-1 bg-white rounded-2xl border border-slate-200 p-1">
        <button data-testid="stu-month-prev" onClick={() => setMonth(shiftMonth(month, -1))} className="btn-press h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100"><ChevronLeft size={18} /></button>
        <div className="px-3 font-semibold text-slate-900 min-w-[140px] text-center">{monthLabel(month)}</div>
        <button data-testid="stu-month-next" onClick={() => setMonth(shiftMonth(month, 1))} className="btn-press h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100"><ChevronRight size={18} /></button>
      </div>

      {/* Batch filters */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        <FilterChip active={batchFilter === "all"} onClick={() => setBatchFilter("all")} label="All Batches" testid="batch-filter-all" />
        {batches.map((b) => (
          <FilterChip key={b.id} active={batchFilter === b.id} onClick={() => setBatchFilter(b.id)} label={b.name} testid={`batch-filter-${b.id}`} />
        ))}
      </div>

      {/* Search + status */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input data-testid="student-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search students..." className="pl-9 rounded-xl" />
        </div>
        <div className="flex gap-2">
          {["all", "unpaid", "partial", "paid"].map((s) => (
            <button
              key={s}
              data-testid={`status-filter-${s}`}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "btn-press px-3.5 h-10 rounded-xl text-sm font-semibold capitalize",
                statusFilter === s ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
              )}
            >{s}</button>
          ))}
        </div>
      </div>

      {/* Student cards */}
      <div className="grid gap-4 md:grid-cols-2" data-testid="student-list">
        {list.map(({ s, st }) => {
          const batch = batches.find((b) => b.id === s.batch_id);
          const initial = s.name.charAt(0).toUpperCase();
          const remaining = Math.max(0, st.fee - st.paidThisMonth);
          return (
            <div key={s.id} data-testid={`student-card-${s.id}`} className="rounded-3xl bg-white p-5 soft-shadow card-hover">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center shrink-0">{initial}</div>
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
                {st.status !== "paid" && (
                  <>
                    <ActionBtn testid={`edit-${s.id}`} onClick={() => { setEditing(s); setFormOpen(true); }} icon="✏️" label="Edit" />
                    <ActionBtn testid={`mark-paid-${s.id}`} onClick={() => setPayFor({ s, st })} icon="✅" label="Mark Paid" tint="bg-emerald-600 text-white hover:bg-emerald-700" />
                    <ActionBtn testid={`remind-${s.id}`} onClick={() => remind(s, st)} icon="💬" label="Remind" />
                    <ActionBtn testid={`move-${s.id}`} onClick={() => setMoveFor(s)} icon="⇄" label="Move" />
                    <ActionBtn testid={`history-${s.id}`} onClick={() => setHistoryFor(s)} icon="📄" label="History" />
                    <ActionBtn testid={`delete-${s.id}`} onClick={() => setToDelete(s)} icon="🗑️" label="Delete" tint="bg-rose-50 text-rose-600 hover:bg-rose-100" />
                  </>
                )}
                {st.status === "paid" && (
                  <>
                    <ActionBtn testid={`edit-${s.id}`} onClick={() => { setEditing(s); setFormOpen(true); }} icon="✏️" label="Edit" />
                    <ActionBtn testid={`remind-${s.id}`} onClick={() => remind(s, st)} icon="💬" label="Remind" />
                    <ActionBtn testid={`history-${s.id}`} onClick={() => setHistoryFor(s)} icon="📄" label="History" />
                    <ActionBtn testid={`delete-${s.id}`} onClick={() => setToDelete(s)} icon="🗑️" label="Delete" tint="bg-rose-50 text-rose-600 hover:bg-rose-100" />
                  </>
                )}
              </div>
            </div>
          );
        })}
        {list.length === 0 && (
          <div className="col-span-full rounded-3xl bg-white p-10 text-center text-slate-500 soft-shadow">No students match.</div>
        )}
      </div>

      <StudentForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        initial={editing}
        batches={batches}
        defaultBatchId={batchFilter !== "all" ? batchFilter : undefined}
        onSave={async (data) => {
          if (editing) await editStudent(editing.id, data);
          else await addStudent(data);
        }}
      />

      {payFor && (
        <PaymentModal
          open={!!payFor}
          onClose={() => setPayFor(null)}
          student={payFor.s}
          month={month}
          paidThisMonth={payFor.st.paidThisMonth}
          fee={payFor.st.fee}
          onSave={addPayment}
        />
      )}

      {historyFor && (
        <PaymentHistoryModal
          open={!!historyFor}
          onClose={() => setHistoryFor(null)}
          student={historyFor}
          payments={payments}
        />
      )}

      {moveFor && (
        <MoveStudentModal
          open={!!moveFor}
          onClose={() => setMoveFor(null)}
          student={moveFor}
          batches={batches}
          onMove={moveStudent}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Delete this student?"
        description="This student and their associated payment records will be removed. This can be undone."
        confirmLabel="Delete"
        danger
        onConfirm={async () => { await removeStudent(toDelete.id); }}
      />
    </div>
  );
};

const FilterChip = ({ active, onClick, label, testid }) => (
  <button
    data-testid={testid}
    onClick={onClick}
    className={cn(
      "btn-press whitespace-nowrap px-4 h-10 rounded-full text-sm font-semibold",
      active ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
    )}
  >{label}</button>
);

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
