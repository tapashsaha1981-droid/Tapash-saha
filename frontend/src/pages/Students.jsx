import React, { useMemo, useState, useEffect, useRef } from "react";
import { useData } from "@/lib/store";
import { Plus, Download } from "lucide-react";
import dayjs from "dayjs";
import { StudentCard } from "@/components/StudentCard";
import { StudentsToolbar } from "@/components/StudentsToolbar";
import { StudentModals } from "@/components/StudentModals";
import { monthLabel, shiftMonth, currentMonth, studentMonthStats, filterStudents, reminderMessage, paymentConfirmationMessage, openWhatsApp, indexPayments, paysFor } from "@/lib/calc";
import { toast } from "sonner";

export const Students = () => {
  const { batches, students, payments, settings, addStudent, editStudent, removeStudent, moveStudent, addPayment, removePaymentsForMonth } = useData();
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
    [students, batches, batchFilter, query, filterStudents]
  );

  const paymentsIndex = useMemo(() => indexPayments(payments), [payments, indexPayments]);

  const list = useMemo(() => {
    const withStats = baseList.map((s) => ({ s, st: studentMonthStats(s, paysFor(paymentsIndex, s.id), month) }));
    return statusFilter === "all" ? withStats : withStats.filter(({ st }) => st.status === statusFilter);
  }, [baseList, paymentsIndex, month, statusFilter, studentMonthStats, paysFor]);

  const visible = list.slice(0, limit);

  useEffect(() => { setLimit(60); }, [batchFilter, query, statusFilter, month, setLimit]);

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
    const sendWhatsApp = window.confirm(
      `Mark Paid: ${student.name}\n\nSend a "Thank you" WhatsApp message to ${student.name}?`
    );

    if (sendWhatsApp) {
      openWhatsApp(
        student.phone,
        paymentConfirmationMessage(
          student,
          payload.amount,
          payload.month,
          settings?.org_name
        )
      );
    }
  } else {
    toast.info("Payment saved — no phone number on file for WhatsApp confirmation");
  }
};
  };
const markUnpaid = async (student, targetMonth = month) => {
  const targets = payments.filter(
    (p) => p.student_id === student.id && p.month === targetMonth
  );

  if (!targets.length) {
    toast.error(`No payment found for ${targetMonth}`);
    return;
  }

  if (!window.confirm(`Mark ${student.name} as Unpaid for ${targetMonth}?`)) {
    return;
  }

  await removePaymentsForMonth(student.id, targetMonth);
  toast.success(`${student.name} marked Unpaid for ${targetMonth}`);
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

      <StudentsToolbar
        month={month}
        onShiftMonth={(d) => setMonth(shiftMonth(month, d))}
        batches={batches}
        batchFilter={batchFilter}
        onBatchFilter={setBatchFilter}
        query={query}
        onQuery={setQuery}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
      />

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
            onMarkUnpaid={() => markUnpaid(s)}
    
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

      <StudentModals
        formOpen={formOpen}
        editing={editing}
        batches={batches}
        batchFilter={batchFilter}
        onCloseForm={() => setFormOpen(false)}
        onSaveStudent={async (data) => {
          if (editing) await editStudent(editing.id, data);
          else await addStudent(data);
        }}
        payFor={payFor}
        onClosePay={() => setPayFor(null)}
        onConfirmPayment={confirmPayment}
        historyFor={historyFor}
        payments={payments}
        onCloseHistory={() => setHistoryFor(null)}
        onHistoryMarkPaid={(row) => setPayFor({ s: historyFor, fee: row.fee, paidThisMonth: row.paid, month: row.month })}
        moveFor={moveFor}
        onCloseMove={() => setMoveFor(null)}
        onMove={moveStudent}
        toDelete={toDelete}
        onCloseDelete={() => setToDelete(null)}
        onDelete={async () => { await removeStudent(toDelete.id); }}
      />
    </div>
  );
};


