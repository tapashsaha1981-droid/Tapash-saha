import React, { useMemo, useState, useEffect, useRef } from "react";
import { useData } from "@/lib/store";
import { Plus, Search, ChevronLeft, ChevronRight, Download } from "lucide-react";
import dayjs from "dayjs";
import { Input } from "@/components/ui/input";
import { StudentForm } from "@/components/StudentForm";
import { PaymentModal } from "@/components/PaymentModal";
import { PaymentHistoryModal } from "@/components/PaymentHistoryModal";
import { MoveStudentModal } from "@/components/MoveStudentModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { StudentCard } from "@/components/StudentCard";
import { monthLabel, shiftMonth, currentMonth, studentMonthStats, filterStudents, reminderMessage, paymentConfirmationMessage, openWhatsApp, indexPayments, paysFor } from "@/lib/calc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_CHIP_ACTIVE = {
  all: "bg-indigo-600",
  unpaid: "bg-rose-500",
  partial: "bg-amber-500",
  paid: "bg-emerald-600",
};

export const Students = () => {
  const { batches, students, payments, settings, addStudent, editStudent, removeStudent, moveStudent, addPayment } = useData();
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

  const activeBatch = batches.find((b) => b.id === batchFilter);

  const baseList = useMemo(
    () => filterStudents(students, batches, { batchFilter, query }),
    [students, batches, batchFilter, query]
  );

  const paymentsIndex = useMemo(() => indexPayments(payments), [payments]);

  const list = useMemo(() => {
    const withStats = baseList.map((s) => ({ s, st: studentMonthStats(s, paysFor(paymentsIndex, s.id), month) }));
    return statusFilter === "all" ? withStats : withStats.filter(({ st }) => st.status === statusFilter);
  }, [baseList, paymentsIndex, month, statusFilter]);

  const visible = list.slice(0, limit);

  useEffect(() => { setLimit(60); }, [batchFilter, query, statusFilter, month]);

  const advancedRef = useRef(null);
  useEffect(() => {
    const day = settings?.auto_advance_day;
    const m = currentMonth();
    if (day && dayjs().date() >= day && advancedRef.current !== m) {
      advancedRef.current = m;
      toast.info(`Auto-advanced to ${monthLabel(m)}`);
    }
  }, [settings]);

  const remind = (student, monthStats) => {
    if (!student.phone) return toast.error("No phone number on file");
    const amount = Math.max(0, monthStats.fee - monthStats.paidThisMonth);
    openWhatsApp(student.phone, reminderMessage(student, amount, month, settings?.org_name));
  };

  const confirmPayment = async (payload) => {
    const student = payFor?.s;
    await addPayment(payload);
    if (student?.phone) {
      openWhatsApp(student.phone, paymentConfirmationMessage(student, payload.amount, payload.month, settings?.org_name));
    } else {
      toast.info("Payment saved — no phone number on file for WhatsApp confirmation");
    }
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
                "btn-press px-3.5 h-10 rounded-xl text-sm font-semibold capitalize text-white",
                statusFilter === s ? STATUS_CHIP_ACTIVE[s] : "bg-white border border-slate-200 !text-slate-700 hover:bg-slate-50"
              )}
            >{s}</button>
          ))}
        </div>
      </div>

      {/* Student cards */}
      <div className="grid gap-4 md:grid-cols-2" data-testid="student-list">
        {visible.map(({ s, st }) => (
          <StudentCard
            key={s.id}
            student={s}
            stats={st}
            batch={batches.find((b) => b.id === s.batch_id)}
            onEdit={() => { setEditing(s); setFormOpen(true); }}
            onMarkPaid={() => setPayFor({ s, fee: st.fee, paidThisMonth: st.paidThisMonth, month })}
            onRemind={() => remind(s, st)}
            onMove={() => setMoveFor(s)}
            onHistory={() => setHistoryFor(s)}
            onDelete={() => setToDelete(s)}
          />
        ))}
        {visible.length === 0 && (
          <div className="col-span-full rounded-3xl bg-white p-10 text-center text-slate-500 soft-shadow">No students match.</div>
        )}
      </div>

      {list.length > limit && (
        <button
          data-testid="show-more-students"
          onClick={() => setLimit((l) => l + 60)}
          className="btn-press w-full rounded-2xl bg-white border border-slate-200 py-3 font-semibold text-slate-700 hover:bg-slate-50"
        >
          Show more ({list.length - limit} remaining)
        </button>
      )}

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
          month={payFor.month}
          paidThisMonth={payFor.paidThisMonth}
          fee={payFor.fee}
          onSave={confirmPayment}
        />
      )}

      {historyFor && (
        <PaymentHistoryModal
          open={!!historyFor}
          onClose={() => setHistoryFor(null)}
          student={historyFor}
          payments={payments}
          onMarkPaid={(row) => setPayFor({ s: historyFor, fee: row.fee, paidThisMonth: row.paid, month: row.month })}
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

